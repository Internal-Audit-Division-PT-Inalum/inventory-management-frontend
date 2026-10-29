/**
 * Event nama global saat status jeda (pause) sync engine berubah.
 */
export const SYNC_PAUSE_EVENT = "inventory:sync-pause-state";

export interface SyncPauseState {
	isPaused: boolean;
	reason: string | null;
	pausedAt: string | null;
}

/**
 * Gatekeeper pengendali jeda (pause) sync engine.
 * Mencegah sync engine terus membombardir server dengan sisa transaksi
 * ketika sesi autentikasi kedaluwarsa (401 Unauthorized) atau saat sistem sedang dihentikan sementara.
 */
export class SyncPauseController {
	private paused = false;
	private pauseReason: string | null = null;
	private pausedTimestamp: string | null = null;
	private listeners = new Set<(state: SyncPauseState) => void>();

	/**
	 * Memeriksa apakah sync engine sedang dalam status di-pause.
	 */
	isPaused(): boolean {
		return this.paused;
	}

	/**
	 * Mengambil alasan mengapa sync engine di-pause (misal '401 Unauthorized').
	 */
	getReason(): string | null {
		return this.pauseReason;
	}

	/**
	 * Mengambil waktu timestamp saat di-pause.
	 */
	getPausedAt(): string | null {
		return this.pausedTimestamp;
	}

	/**
	 * Mengambil snapshot state terkini.
	 */
	getState(): SyncPauseState {
		return {
			isPaused: this.paused,
			reason: this.pauseReason,
			pausedAt: this.pausedTimestamp,
		};
	}

	/**
	 * Menghentikan sementara (pause) sync engine.
	 */
	pause(reason: string): void {
		if (this.paused && this.pauseReason === reason) {
			return;
		}

		this.paused = true;
		this.pauseReason = reason;
		this.pausedTimestamp = new Date().toISOString();

		this.notify();
	}

	/**
	 * Melanjutkan kembali (resume) sync engine setelah user berhasil login ulang.
	 */
	resume(): void {
		if (!this.paused) {
			return;
		}

		this.paused = false;
		this.pauseReason = null;
		this.pausedTimestamp = null;

		this.notify();
	}

	/**
	 * Berlangganan perubahan status jeda sync engine.
	 */
	subscribe(listener: (state: SyncPauseState) => void): () => void {
		this.listeners.add(listener);
		listener(this.getState());

		return () => {
			this.listeners.delete(listener);
		};
	}

	private notify(): void {
		const state = this.getState();

		for (const listener of this.listeners) {
			try {
				listener(state);
			} catch (err) {
				console.warn("Gagal mengeksekusi listener SyncPauseController:", err);
			}
		}

		if (typeof window !== "undefined") {
			window.dispatchEvent(
				new CustomEvent(SYNC_PAUSE_EVENT, { detail: state }),
			);
		}
	}
}

/**
 * Singleton instance SyncPauseController global.
 */
export const syncPauseController = new SyncPauseController();
