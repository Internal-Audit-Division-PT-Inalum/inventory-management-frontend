import { useAuthStore } from "@/features/auth/store/authStore";
import {
	CATALOG_SYNC_EVENT,
	type CatalogSyncResult,
	syncCatalog,
} from "@/features/catalog/api/syncCatalog";
import { processPendingOutboxEntry } from "@/features/transactions/lib/outboxQueue";
import type { TransactSubmitResult } from "@/features/transactions/types";
import { db, type OutboxItem } from "@/lib/db";
import { syncPauseController } from "./syncPauseController";
import { SYNC_TAB_LOCK_NAME, withTabLock } from "./tabLock";

/**
 * Batas konkurensi default pemrosesan item paralel (enterprise-safe).
 * Membatasi konkurensi kecil (2 worker) menjaga koneksi jaringan seluler stabil
 * dan mencegah lonjakan beban HTTP berlebih di backend.
 */
export const DEFAULT_SYNC_CONCURRENCY = 2;

/**
 * Nama event global saat siklus sync engine outbox selesai.
 */
export const SYNC_ENGINE_EVENT = "inventory:sync-engine-cycle";

export interface SyncEngineOptions {
	/**
	 * Batas konkurensi paralel pemrosesan antrean antar-item yang berbeda (default: 2).
	 * Transaksi pada item yang SAMA selalu dieksekusi secara strictly serial (FIFO).
	 */
	concurrencyLimit?: number;

	/**
	 * Membatasi sinkronisasi hanya untuk karyawan tertentu (opsional).
	 */
	employeeId?: string;

	/**
	 * Memperhitungkan item yang berstatus 'failed' untuk dicoba ulang secara otomatis.
	 * Default: true.
	 */
	includeFailed?: boolean;

	/**
	 * AbortSignal untuk pembatalan aman jika proses dihentikan.
	 */
	signal?: AbortSignal;

	/**
	 * Melewati penguncian antar-tab (khusus keperluan pengujian terisolasi).
	 * Default: false.
	 */
	bypassTabLock?: boolean;

	/**
	 * Otomatis menyelaraskan cache katalog IndexedDB dengan server setelah transaksi berhasil diunggah (Task P5.12).
	 * Default: true.
	 */
	syncCatalogOnSuccess?: boolean;
}

export interface ItemQueueResult {
	itemId: string;
	total: number;
	synced: number;
	failed: number;
	rejected: number;
	skipped: number;
	haltedReason?: "rejected" | "failed" | "auth_error" | "aborted";
}

export interface SyncEngineResult {
	totalProcessed: number;
	syncedCount: number;
	failedCount: number;
	rejectedCount: number;
	skippedCount: number;
	itemsProcessed: string[];
	itemResults: Record<string, ItemQueueResult>;
	durationMs: number;
	haltedByAuth?: boolean;
	skippedDueToTabLock?: boolean;
	/**
	 * Hasil sinkronisasi katalog pasca-sync jika dieksekusi (Task P5.12).
	 */
	catalogSyncResult?: CatalogSyncResult | null;
}

/**
 * Memeriksa apakah entri outbox memenuhi syarat waktu untuk dieksekusi sekarang.
 * Entri dengan 'nextAttemptAt' di masa depan ditangguhkan hingga waktunya tiba.
 */
export function isEligibleForSync(
	item: OutboxItem,
	now: Date = new Date(),
): boolean {
	if (item.status !== "pending" && item.status !== "failed") {
		return false;
	}

	if (item.nextAttemptAt) {
		const attemptTime = new Date(item.nextAttemptAt).getTime();
		if (attemptTime > now.getTime()) {
			return false;
		}
	}

	return true;
}

/**
 * Mengelompokkan array OutboxItem berdasarkan itemId.
 * Karena data input sudah terurut berdasarkan createdAt asc,
 * urutan di dalam tiap grup itemId dijamin Strictly FIFO.
 */
export function groupOutboxItemsByItem(
	items: OutboxItem[],
): Map<string, OutboxItem[]> {
	const map = new Map<string, OutboxItem[]>();
	for (const item of items) {
		const queue = map.get(item.itemId);
		if (queue) {
			queue.push(item);
		} else {
			map.set(item.itemId, [item]);
		}
	}
	return map;
}

/**
 * Memproses seluruh antrean outbox untuk SATU item secara strictly serial (FIFO).
 * Jika ada satu transaksi yang ditolak permanen (rejected) atau error fatal,
 * transaksi berikutnya untuk item yang sama dihentikan demi menjaga integritas stok.
 */
export async function processItemOutboxQueue(
	itemId: string,
	items: OutboxItem[],
	signal?: AbortSignal,
	onAuthError?: () => void,
): Promise<ItemQueueResult> {
	const summary: ItemQueueResult = {
		itemId,
		total: items.length,
		synced: 0,
		failed: 0,
		rejected: 0,
		skipped: 0,
	};

	for (let i = 0; i < items.length; i++) {
		if (signal?.aborted) {
			summary.haltedReason = "aborted";
			summary.skipped += items.length - i;
			break;
		}

		const item = items[i];

		// Verifikasi status terbaru langsung dari IndexedDB
		const currentRecord = await db.getOutboxItemByUuid(item.clientUuid);
		if (!currentRecord) {
			summary.skipped++;
			continue;
		}

		if (currentRecord.status === "synced") {
			summary.synced++;
			continue;
		}

		if (
			currentRecord.status !== "pending" &&
			currentRecord.status !== "failed"
		) {
			summary.skipped++;
			continue;
		}

		const result: TransactSubmitResult =
			await processPendingOutboxEntry(currentRecord);

		if (result.synced) {
			summary.synced++;
		} else if (result.rejected) {
			summary.rejected++;
			// ATURAN FIFO KETAT:
			// Jika transaksi pada item ini ditolak permanen (422/409), transaksi berikutnya
			// untuk item yang sama WAJIB DIHENTIKAN agar tidak terjadi cascading error stok.
			summary.haltedReason = "rejected";
			summary.skipped += items.length - (i + 1);
			break;
		} else if (result.authError) {
			summary.failed++;
			summary.haltedReason = "auth_error";
			summary.skipped += items.length - (i + 1);
			onAuthError?.();
			break;
		} else {
			// Galat jaringan / 5xx sementara: hentikan sisa antrean item ini agar urutan FIFO terjaga
			summary.failed++;
			summary.haltedReason = "failed";
			summary.skipped += items.length - (i + 1);
			break;
		}
	}

	return summary;
}

// In-memory active sync promise untuk proteksi anti-overlap
let activeSyncPromise: Promise<SyncEngineResult> | null = null;

/**
 * Mengetahui apakah sync engine saat ini sedang aktif memproses antrean.
 */
export function isSyncEngineRunning(): boolean {
	return activeSyncPromise !== null;
}

/**
 * Menjalankan siklus sinkronisasi antrean outbox dengan aturan FIFO per item,
 * konkurensi kecil terkontrol (Worker Pool), dan proteksi kunci antar-tab (Web Locks API + fallback).
 */
export async function runSyncEngine(
	options: SyncEngineOptions = {},
): Promise<SyncEngineResult> {
	if (activeSyncPromise) {
		// Anti-overlap: jika siklus sync sudah berjalan di tab ini, gunakan promise yang aktif
		return activeSyncPromise;
	}

	const syncPromise = (async () => {
		// Jika opsi bypassTabLock aktif, langsung eksekusi tanpa Web Locks / fallback
		if (options.bypassTabLock) {
			return await executeSyncCycle(options);
		}

		// Bungkus eksekusi dengan mutual exclusion antar-tab
		const lockResult = await withTabLock(() => executeSyncCycle(options), {
			lockName: SYNC_TAB_LOCK_NAME,
		});

		if (!lockResult.acquired || !lockResult.result) {
			await db.addDiagnosticLog({
				timestamp: new Date().toISOString(),
				level: "info",
				category: "SYNC_ENGINE",
				message:
					"Sync cycle skipped: another browser tab is currently running sync engine",
				details: {
					reason: lockResult.reason,
					lockType: lockResult.lockType,
				},
			});

			return {
				totalProcessed: 0,
				syncedCount: 0,
				failedCount: 0,
				rejectedCount: 0,
				skippedCount: 0,
				itemsProcessed: [],
				itemResults: {},
				durationMs: 0,
				skippedDueToTabLock: true,
			};
		}

		return lockResult.result;
	})();

	activeSyncPromise = syncPromise;

	try {
		return await syncPromise;
	} finally {
		activeSyncPromise = null;
	}
}

/**
 * Eksekusi inti siklus sinkronisasi.
 */
async function executeSyncCycle(
	options: SyncEngineOptions,
): Promise<SyncEngineResult> {
	const startTime = Date.now();

	// 0. Periksa apakah antrean sinkronisasi sedang di-pause (misal karena 401 Unauthorized)
	if (syncPauseController.isPaused()) {
		await db.addDiagnosticLog({
			timestamp: new Date().toISOString(),
			level: "info",
			category: "SYNC_ENGINE",
			message: `Sync cycle skipped: queue is paused due to '${syncPauseController.getReason()}'`,
		});
		return {
			totalProcessed: 0,
			syncedCount: 0,
			failedCount: 0,
			rejectedCount: 0,
			skippedCount: 0,
			itemsProcessed: [],
			itemResults: {},
			durationMs: Date.now() - startTime,
			haltedByAuth: true,
		};
	}

	// 1. Crash recovery: pulihkan transaksi yang tertinggal dalam status 'syncing'
	await db.resetAbandonedSyncingItems();

	// 2. Tentukan target employeeId secara defensif untuk penegakan isolasi antrean multi-akun (Task P5.11)
	// Jika options.employeeId didefinisikan secara eksplisit, gunakan opsi tersebut.
	// Jika tidak dispesifikasikan, gunakan ID akun pegawai aktif jika ada sesi login.
	const authEmployeeId = useAuthStore.getState().employee?.id;
	const resolvedEmployeeId =
		options.employeeId !== undefined ? options.employeeId : authEmployeeId;

	// 3. Ambil semua item pending / failed yang terurut berdasarkan createdAt asc (terisolasi per employeeId)
	const allCandidates = await db.getPendingOutboxItems({
		employeeId: resolvedEmployeeId,
		includeFailed: options.includeFailed ?? true,
	});

	// 4. Filter entri yang sudah eligible (nextAttemptAt <= now atau null)
	const now = new Date();
	const eligibleItems = allCandidates.filter((item) =>
		isEligibleForSync(item, now),
	);

	if (eligibleItems.length === 0) {
		const emptyResult: SyncEngineResult = {
			totalProcessed: 0,
			syncedCount: 0,
			failedCount: 0,
			rejectedCount: 0,
			skippedCount: 0,
			itemsProcessed: [],
			itemResults: {},
			durationMs: Date.now() - startTime,
		};
		return emptyResult;
	}

	// 4. Kelompokkan antrean per itemId untuk menjamin strictly FIFO per barang
	const grouped = groupOutboxItemsByItem(eligibleItems);
	const uniqueItemIds = Array.from(grouped.keys());

	await db.addDiagnosticLog({
		timestamp: new Date().toISOString(),
		level: "info",
		category: "SYNC_ENGINE",
		message: `Sync cycle started: ${eligibleItems.length} candidate(s) across ${uniqueItemIds.length} item(s)`,
		details: {
			totalCandidates: eligibleItems.length,
			uniqueItems: uniqueItemIds.length,
			concurrencyLimit: options.concurrencyLimit ?? DEFAULT_SYNC_CONCURRENCY,
		},
	});

	// 5. Worker pool dengan batas konkurensi terkontrol
	const concurrencyLimit = Math.max(
		1,
		options.concurrencyLimit ?? DEFAULT_SYNC_CONCURRENCY,
	);
	const itemEntries = Array.from(grouped.entries());
	const itemResults: Record<string, ItemQueueResult> = {};
	let isAuthHalted = false;

	let nextEntryIndex = 0;
	const workers: Promise<void>[] = [];

	async function poolWorker() {
		while (nextEntryIndex < itemEntries.length) {
			if (options.signal?.aborted || isAuthHalted) {
				break;
			}
			const currentIndex = nextEntryIndex++;
			const [itemId, queue] = itemEntries[currentIndex];

			const queueResult = await processItemOutboxQueue(
				itemId,
				queue,
				options.signal,
				() => {
					isAuthHalted = true;
					syncPauseController.pause(
						"Sesi autentikasi berakhir (401 Unauthorized)",
					);
				},
			);
			itemResults[itemId] = queueResult;
		}
	}

	const workerCount = Math.min(concurrencyLimit, itemEntries.length);
	for (let w = 0; w < workerCount; w++) {
		workers.push(poolWorker());
	}

	await Promise.all(workers);

	// 6. Hitung rekapitulasi hasil
	let totalProcessed = 0;
	let syncedCount = 0;
	let failedCount = 0;
	let rejectedCount = 0;
	let skippedCount = 0;

	for (const res of Object.values(itemResults)) {
		syncedCount += res.synced;
		failedCount += res.failed;
		rejectedCount += res.rejected;
		skippedCount += res.skipped;
		totalProcessed += res.synced + res.failed + res.rejected;
	}

	const durationMs = Date.now() - startTime;

	// 7. Sinkronisasi katalog pasca-sync (Task P5.12):
	// Jika terdapat transaksi yang berhasil diunggah ke backend (syncedCount > 0),
	// segarkan katalog lokal IndexedDB dari backend agar stok riil dan ETag selalu sinkron.
	let catalogSyncResult: CatalogSyncResult | null = null;
	const shouldSyncCatalog = options.syncCatalogOnSuccess ?? true;

	if (syncedCount > 0 && shouldSyncCatalog) {
		try {
			catalogSyncResult = await syncCatalog({ forceLocations: false });
			await db.addDiagnosticLog({
				timestamp: new Date().toISOString(),
				level: "info",
				category: "SYNC_ENGINE",
				message: `Post-sync catalog refreshed: ${
					catalogSyncResult.notModified
						? "304 Not Modified"
						: `${catalogSyncResult.itemsCount} items updated`
				} (etag: ${catalogSyncResult.etag ?? "none"})`,
				details: {
					notModified: catalogSyncResult.notModified,
					itemsCount: catalogSyncResult.itemsCount,
					locationsCount: catalogSyncResult.locationsCount,
					etag: catalogSyncResult.etag,
					lastSyncedAt: catalogSyncResult.lastSyncedAt,
				},
			});
		} catch (catErr: unknown) {
			const errMsg =
				catErr instanceof Error
					? catErr.message
					: "Gagal menyinkronkan katalog pasca-sync";
			await db.addDiagnosticLog({
				timestamp: new Date().toISOString(),
				level: "warn",
				category: "SYNC_ENGINE",
				message: `Post-sync catalog refresh encountered error: ${errMsg}`,
				details: { error: errMsg },
			});
		}
	}

	// Jaminan emisi event CATALOG_SYNC_EVENT (Task P5.12):
	// Jika syncCatalog tidak dijalankan (opsi false) atau tidak memancarkan event karena offline/error,
	// tetap pancarkan event agar komponen UI lokal dapat merefleksikan perubahan status outbox.
	if (
		syncedCount > 0 &&
		typeof window !== "undefined" &&
		!catalogSyncResult?.success
	) {
		window.dispatchEvent(new CustomEvent(CATALOG_SYNC_EVENT));
	}

	const finalResult: SyncEngineResult = {
		totalProcessed,
		syncedCount,
		failedCount,
		rejectedCount,
		skippedCount,
		itemsProcessed: Object.keys(itemResults),
		itemResults,
		durationMs,
		haltedByAuth: isAuthHalted,
		catalogSyncResult,
	};

	if (typeof window !== "undefined") {
		window.dispatchEvent(
			new CustomEvent(SYNC_ENGINE_EVENT, { detail: finalResult }),
		);
	}

	// 8. Catat log ringkasan akhir siklus ke ring-buffer diagnostik
	await db.addDiagnosticLog({
		timestamp: new Date().toISOString(),
		level: isAuthHalted ? "warn" : "info",
		category: "SYNC_ENGINE",
		message: `Sync cycle finished: ${syncedCount} synced, ${failedCount} failed, ${rejectedCount} rejected (${durationMs}ms)`,
		details: {
			totalProcessed,
			syncedCount,
			failedCount,
			rejectedCount,
			skippedCount,
			durationMs,
			haltedByAuth: isAuthHalted,
		},
	});

	return finalResult;
}
