import { useAuthStore } from "@/features/auth/store/authStore";
import { db } from "@/lib/db";
import {
	isSyncEngineRunning,
	runSyncEngine,
	type SyncEngineResult,
} from "./syncEngine";
import { syncPauseController } from "./syncPauseController";

export type SyncTriggerReason =
	| "app_mount"
	| "online"
	| "visibility_change"
	| "interval"
	| "manual";

export const SYNC_TRIGGERED_EVENT = "inventory:sync-triggered";

export interface SyncSchedulerOptions {
	/**
	 * Interval waktu background polling dalam milidetik saat aplikasi aktif (default: 30000ms / 30s).
	 * Setel <= 0 untuk menonaktifkan periodic interval.
	 */
	intervalMs?: number;

	/**
	 * Jeda debounce dalam milidetik untuk mencegah pemicu ganda beruntun (misal flapping network) (default: 1000ms).
	 */
	debounceMs?: number;

	/**
	 * Picu sinkronisasi saat scheduler diinisialisasi / aplikasi dibuka (default: true).
	 */
	syncOnMount?: boolean;

	/**
	 * Picu sinkronisasi saat perangkat kembali online (default: true).
	 */
	syncOnOnline?: boolean;

	/**
	 * Picu sinkronisasi saat tab aplikasi kembali menjadi visible (default: true).
	 */
	syncOnVisibility?: boolean;

	/**
	 * Batasi pemicu otomatis hanya jika ada item pending/failed di outbox (default: true).
	 * Pemicu 'manual' akan tetap dieksekusi terlepas dari jumlah antrean.
	 */
	requirePendingItems?: boolean;
}

export const DEFAULT_SCHEDULER_OPTIONS: Required<SyncSchedulerOptions> = {
	intervalMs: 30_000,
	debounceMs: 1_000,
	syncOnMount: true,
	syncOnOnline: true,
	syncOnVisibility: true,
	requirePendingItems: true,
};

/**
 * Orkestrator terpusat untuk pemicu sinkronisasi outbox:
 * 1. app_mount: saat aplikasi dibuka
 * 2. online: saat perangkat kembali terhubung ke internet
 * 3. visibility_change: saat user membuka kembali tab/layar aplikasi
 * 4. interval: background polling berkala hemat daya
 * 5. manual: pemicu eksplisit dari tombol UI
 */
export class SyncScheduler {
	private active = false;
	private options: Required<SyncSchedulerOptions> = DEFAULT_SCHEDULER_OPTIONS;
	private debounceTimer: ReturnType<typeof setTimeout> | null = null;
	private intervalTimer: ReturnType<typeof setInterval> | null = null;
	private lastTriggerReason: SyncTriggerReason | null = null;

	// Listener references untuk cleanup sempurna
	private handleOnlineBound: (() => void) | null = null;
	private handleVisibilityChangeBound: (() => void) | null = null;

	/**
	 * Memulai orkestrator penjadwal sinkronisasi.
	 */
	start(options: SyncSchedulerOptions = {}): void {
		if (this.active) {
			this.options = { ...this.options, ...options };
			return;
		}

		this.active = true;
		this.options = { ...DEFAULT_SCHEDULER_OPTIONS, ...options };

		if (typeof window === "undefined") {
			return;
		}

		// 1. Pemicu 'online'
		if (this.options.syncOnOnline) {
			this.handleOnlineBound = () => {
				this.scheduleSync("online");
			};
			window.addEventListener("online", this.handleOnlineBound);
		}

		// 2. Pemicu 'visibility_change'
		if (this.options.syncOnVisibility && typeof document !== "undefined") {
			this.handleVisibilityChangeBound = () => {
				if (document.visibilityState === "visible") {
					this.scheduleSync("visibility_change");
				}
			};
			document.addEventListener(
				"visibilitychange",
				this.handleVisibilityChangeBound,
			);
		}

		// 3. Pemicu 'interval' berkala
		if (this.options.intervalMs > 0) {
			this.intervalTimer = setInterval(() => {
				// Hemat baterai: lewati interval jika tab sedang tersembunyi
				if (
					typeof document !== "undefined" &&
					document.visibilityState === "hidden"
				) {
					return;
				}
				this.scheduleSync("interval");
			}, this.options.intervalMs);
		}

		// 4. Pemicu 'app_mount' (buka app)
		if (this.options.syncOnMount) {
			this.scheduleSync("app_mount");
		}
	}

	/**
	 * Menghentikan scheduler dan membersihkan seluruh timer dan event listener.
	 */
	stop(): void {
		this.active = false;

		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer);
			this.debounceTimer = null;
		}

		if (this.intervalTimer) {
			clearInterval(this.intervalTimer);
			this.intervalTimer = null;
		}

		if (typeof window !== "undefined") {
			if (this.handleOnlineBound) {
				window.removeEventListener("online", this.handleOnlineBound);
				this.handleOnlineBound = null;
			}
			if (this.handleVisibilityChangeBound && typeof document !== "undefined") {
				document.removeEventListener(
					"visibilitychange",
					this.handleVisibilityChangeBound,
				);
				this.handleVisibilityChangeBound = null;
			}
		}
	}

	/**
	 * Mengetahui apakah scheduler saat ini sedang aktif.
	 */
	isActive(): boolean {
		return this.active;
	}

	/**
	 * Mengambil alasan pemicu sinkronisasi terakhir.
	 */
	getLastTriggerReason(): SyncTriggerReason | null {
		return this.lastTriggerReason;
	}

	/**
	 * Menjadwalkan sinkronisasi otomatis dengan mekanisme debounce.
	 */
	scheduleSync(reason: SyncTriggerReason): void {
		if (!this.active) {
			return;
		}

		this.lastTriggerReason = reason;

		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer);
		}

		this.debounceTimer = setTimeout(() => {
			this.debounceTimer = null;
			void this.executeSync(reason);
		}, this.options.debounceMs);
	}

	/**
	 * Memicu sinkronisasi secara manual (bypassing debounce).
	 */
	async triggerManualSync(): Promise<SyncEngineResult | null> {
		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer);
			this.debounceTimer = null;
		}
		this.lastTriggerReason = "manual";
		return await this.executeSync("manual", true);
	}

	/**
	 * Memeriksa prasyarat apakah saat ini aman dan relevan untuk mengeksekusi sinkronisasi.
	 */
	async canSyncNow(reason: SyncTriggerReason, force = false): Promise<boolean> {
		// 1. Periksa ketersediaan jaringan
		if (typeof navigator !== "undefined" && navigator.onLine === false) {
			return false;
		}

		// 2. Periksa apakah antrean sedang di-pause oleh autentikasi (401)
		if (syncPauseController.isPaused()) {
			return false;
		}

		// 3. Penegakan isolasi akun: periksa antrean yang relevan (Task P5.11)
		const currentEmployeeId = useAuthStore.getState().employee?.id;

		// 4. Periksa apakah ada transaksi outbox yang pending milik akun ini (atau semua akun jika tidak ada sesi aktif)
		if (this.options.requirePendingItems && !force && reason !== "manual") {
			try {
				const pendingCount = await db.getPendingOutboxCount({
					employeeId: currentEmployeeId,
					includeFailed: true,
				});
				if (pendingCount === 0) {
					return false;
				}
			} catch {
				return false;
			}
		}

		return true;
	}

	/**
	 * Eksekusi inti sinkronisasi outbox dengan proteksi prasyarat.
	 */
	private async executeSync(
		reason: SyncTriggerReason,
		force = false,
	): Promise<SyncEngineResult | null> {
		const canRun = await this.canSyncNow(reason, force);
		if (!canRun) {
			return null;
		}

		const currentEmployeeId = useAuthStore.getState().employee?.id;

		// Catat log diagnostik pemicu sinkronisasi
		try {
			await db.addDiagnosticLog({
				timestamp: new Date().toISOString(),
				level: "info",
				category: "SYNC_SCHEDULER",
				message: `Sync execution triggered by '${reason}' for employee '${currentEmployeeId ?? "all"}'`,
				details: {
					reason,
					employeeId: currentEmployeeId,
					isEngineRunning: isSyncEngineRunning(),
				},
			});
		} catch {
			// Abaikan kegagalan logging jika DB terkunci
		}

		// Siarkan event ke window
		if (typeof window !== "undefined") {
			window.dispatchEvent(
				new CustomEvent(SYNC_TRIGGERED_EVENT, {
					detail: {
						reason,
						employeeId: currentEmployeeId,
						timestamp: new Date().toISOString(),
					},
				}),
			);
		}

		return await runSyncEngine({
			employeeId: currentEmployeeId,
			includeFailed: true,
		});
	}
}

/**
 * Singleton instance SyncScheduler global.
 */
export const syncScheduler = new SyncScheduler();
