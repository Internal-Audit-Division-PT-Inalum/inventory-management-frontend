import { CATALOG_SYNC_EVENT } from "@/features/catalog/api/syncCatalog";
import { db, type OutboxItem } from "@/lib/db";
import { isAuthError, isFatalError, mapApiError } from "@/lib/errors";
import type { Item } from "@/types/api";
import { transactItemApi } from "../api/transactItem";
import type {
	EnqueueTransactionParams,
	TransactionAction,
	TransactSubmitResult,
} from "../types";
import { buildOutboxItem } from "./transactionIdentity";

/**
 * Event nama global saat transaksi dimasukkan ke outbox atau status sinkronisasinya berubah.
 */
export const TRANSACTION_COMMITTED_EVENT = "inventory:transaction-committed";

export interface AppliedStockDelta {
	deltaStock: number;
	deltaBorrowed: number;
}

/**
 * Menerapkan mutasi stok lokal secara optimistik di IndexedDB agar UI langsung responsif.
 */
export async function applyOptimisticStock(
	item: Item,
	action: TransactionAction,
	quantity: number,
): Promise<AppliedStockDelta> {
	try {
		const currentRecord = await db.items.get(item.id);
		const currentStock =
			currentRecord?.current_stock ?? item.current_stock ?? 0;
		const borrowedQty =
			currentRecord?.borrowed_quantity ?? item.borrowed_quantity ?? 0;
		let newStock = currentStock;
		let newBorrowed = borrowedQty;

		if (action === "take") {
			newStock = Math.max(0, currentStock - quantity);
		} else if (action === "borrow") {
			const actualBorrow = Math.min(currentStock, quantity);
			newStock = currentStock - actualBorrow;
			if (item.type === "asset") {
				newBorrowed = borrowedQty + actualBorrow;
			}
		} else if (action === "add") {
			newStock = currentStock + quantity;
		} else if (action === "return") {
			if (item.type === "asset") {
				const actualReturn = Math.min(borrowedQty, quantity);
				newBorrowed = borrowedQty - actualReturn;
				newStock = currentStock + actualReturn;
			} else {
				newStock = currentStock + quantity;
			}
		}

		await db.items.update(item.id, {
			current_stock: newStock,
			...(item.type === "asset" ? { borrowed_quantity: newBorrowed } : {}),
			updated_at: new Date().toISOString(),
		});

		return {
			deltaStock: newStock - currentStock,
			deltaBorrowed: newBorrowed - borrowedQty,
		};
	} catch (err) {
		console.warn("Gagal menerapkan mutasi stok optimistik lokal:", err);
		return { deltaStock: 0, deltaBorrowed: 0 };
	}
}

/**
 * Membatalkan (revert) mutasi stok optimistik jika server menolak transaksi secara fatal.
 */
export async function revertOptimisticStock(
	item: Item,
	action: TransactionAction,
	quantity: number,
	appliedDeltas?: AppliedStockDelta,
): Promise<void> {
	try {
		const currentRecord = await db.items.get(item.id);
		const baselineStock = currentRecord?.current_stock ?? item.current_stock;
		const baselineBorrowed =
			currentRecord?.borrowed_quantity ?? item.borrowed_quantity ?? 0;

		let revertedStock = baselineStock;
		let revertedBorrowed = baselineBorrowed;

		if (appliedDeltas) {
			revertedStock = baselineStock - appliedDeltas.deltaStock;
			revertedBorrowed = baselineBorrowed - appliedDeltas.deltaBorrowed;
		} else {
			if (action === "take" || action === "borrow") {
				revertedStock = baselineStock + quantity;
				if (item.type === "asset" && action === "borrow") {
					revertedBorrowed = Math.max(0, baselineBorrowed - quantity);
				}
			} else if (action === "add" || action === "return") {
				revertedStock = Math.max(0, baselineStock - quantity);
				if (item.type === "asset" && action === "return") {
					revertedBorrowed = baselineBorrowed + quantity;
				}
			}
		}

		await db.items.update(item.id, {
			current_stock: Math.max(0, revertedStock),
			...(item.type === "asset"
				? { borrowed_quantity: Math.max(0, revertedBorrowed) }
				: {}),
			updated_at: new Date().toISOString(),
		});
	} catch (err) {
		console.warn("Gagal membatalkan mutasi stok optimistik:", err);
	}
}

/**
 * Menyiarkan event transaksi lokal ke window agar katalog dan komponen UI reaktif.
 */
function broadcastTransactionCommitted(outboxItem: OutboxItem) {
	if (typeof window !== "undefined") {
		window.dispatchEvent(
			new CustomEvent(TRANSACTION_COMMITTED_EVENT, { detail: outboxItem }),
		);
		window.dispatchEvent(new CustomEvent(CATALOG_SYNC_EVENT));
	}
}

/**
 * Zero-Data-Loss Transaction Submission Engine.
 *
 * 1. Simpan ke IndexedDB (tabel outbox) DAHULU sebelum aksi jaringan.
 * 2. Terapkan perubahan stok optimistik pada katalog lokal.
 * 3. Jika offline -> tandai 'pending', kembalikan sukses antrean.
 * 4. Jika online -> coba kirim langsung ke server:
 *    - 200/201 -> tandai 'synced', perbarui stok otoritatif server.
 *    - Retryable (offline drop, 5xx, timeout, 429) -> biarkan 'pending' di outbox.
 *    - Fatal (422 stok kurang, pinjaman lebih, 409) -> tandai 'rejected', revert stok lokal.
 *    - Auth (401) -> biarkan 'pending', tunggu login ulang.
 */
export async function enqueueAndProcessTransaction(
	params: EnqueueTransactionParams,
): Promise<TransactSubmitResult> {
	const {
		item,
		action,
		formData,
		loanId,
		employeeId = "current-employee",
		customClientUuid,
		customOccurredAt,
	} = params;

	// 1. Bangun entri OutboxItem yang immutable dan memiliki client_uuid unik RFC 4122
	const outboxItem = buildOutboxItem({
		employeeId,
		operation: action,
		itemId: item.id,
		loanId,
		quantity: formData.quantity,
		notes: formData.notes,
		referenceNumber: formData.reference_number,
		clientUuid: customClientUuid,
		occurredAt: customOccurredAt,
	});

	// 2. Simpan ke Dexie IndexedDB TERLEBIH DAHULU (Zero Data Loss)
	await db.enqueueOutboxItem(outboxItem);

	// 3. Terapkan stok optimistik pada cache lokal IndexedDB dan simpan delta
	const deltas = await applyOptimisticStock(item, action, formData.quantity);
	outboxItem.appliedDeltaStock = deltas.deltaStock;
	outboxItem.appliedDeltaBorrowed = deltas.deltaBorrowed;
	await db.updateOutboxItem(outboxItem.clientUuid, {
		appliedDeltaStock: deltas.deltaStock,
		appliedDeltaBorrowed: deltas.deltaBorrowed,
	});

	// Siarkan event awal bahwa transaksi sudah masuk antrean lokal
	broadcastTransactionCommitted(outboxItem);

	// 4. Periksa ketersediaan jaringan
	const isOnline =
		typeof navigator !== "undefined" ? navigator.onLine !== false : true;

	if (!isOnline) {
		return {
			success: true,
			synced: false,
			queued: true,
			outboxItem,
			message:
				"Tersimpan di antrean perangkat (offline). Akan otomatis disinkronkan saat terhubung kembali.",
		};
	}

	// 5. Jika online, langsung proses pengiriman antrean ini
	return processPendingOutboxEntry(outboxItem);
}

/**
 * Memproses satu entri OutboxItem yang berstatus 'pending':
 * Mengirim ke server, memperbarui status di Dexie, menerapkan stok otoritatif,
 * atau me-revert stok optimistik jika ditolak (422/409).
 */
export async function processPendingOutboxEntry(
	outboxItem: OutboxItem,
): Promise<TransactSubmitResult> {
	const currentAttempts = (outboxItem.attempts ?? 0) + 1;
	await db.updateOutboxItem(outboxItem.clientUuid, {
		status: "syncing",
		attempts: currentAttempts,
	});

	try {
		const response = await transactItemApi(outboxItem);

		// Sukses (200 / 201)
		const syncedItem: OutboxItem = {
			...outboxItem,
			status: "synced",
			attempts: currentAttempts,
			lastError: null,
		};
		await db.updateOutboxItem(outboxItem.clientUuid, syncedItem);

		// Perbarui stok lokal dengan data otoritatif dari server jika tersedia
		if (response.data) {
			const updatePayload: Partial<Item> = {
				updated_at:
					response.data.item?.updated_at ||
					response.data.occurred_at ||
					new Date().toISOString(),
			};

			const serverStock =
				response.data.item?.current_stock ?? response.data.stock_after;
			if (typeof serverStock === "number") {
				updatePayload.current_stock = serverStock;
			}

			if (response.data.item?.name) {
				updatePayload.name = response.data.item.name;
			}
			if (response.data.item?.sku) {
				updatePayload.sku = response.data.item.sku;
			}
			if (response.data.item?.unit) {
				updatePayload.unit = response.data.item.unit;
			}

			await db.items.update(outboxItem.itemId, updatePayload);
		}

		broadcastTransactionCommitted(syncedItem);

		return {
			success: true,
			synced: true,
			queued: false,
			outboxItem: syncedItem,
			response,
			replayed: Boolean(response.meta?.replayed),
			message: response.message || "Transaksi berhasil dikirim ke server.",
		};
	} catch (error) {
		const appError = mapApiError(error);

		if (isFatalError(appError)) {
			// Penolakan permanen aturan bisnis (422 Insufficient Stock, 409 Conflict, dll.)
			const rejectedItem: OutboxItem = {
				...outboxItem,
				status: "rejected",
				attempts: currentAttempts,
				lastError: {
					code: appError.code,
					message: appError.message,
				},
			};
			await db.updateOutboxItem(outboxItem.clientUuid, rejectedItem);

			// Kembalikan (revert) stok lokal optimistik jika item ditemukan
			const localItem = await db.items.get(outboxItem.itemId);
			if (localItem) {
				await revertOptimisticStock(
					localItem,
					outboxItem.operation,
					outboxItem.quantity,
					outboxItem.appliedDeltaStock !== undefined
						? {
								deltaStock: outboxItem.appliedDeltaStock,
								deltaBorrowed: outboxItem.appliedDeltaBorrowed ?? 0,
							}
						: undefined,
				);
			}
			broadcastTransactionCommitted(rejectedItem);

			return {
				success: false,
				synced: false,
				queued: false,
				rejected: true,
				outboxItem: rejectedItem,
				error: appError,
				message: appError.message,
			};
		}

		if (isAuthError(appError)) {
			// Sesi kedaluwarsa: outbox tetap disimpan sebagai 'pending'
			const pendingAuthItem: OutboxItem = {
				...outboxItem,
				status: "pending",
				attempts: currentAttempts,
				lastError: {
					code: appError.code,
					message: appError.message,
				},
			};
			await db.updateOutboxItem(outboxItem.clientUuid, pendingAuthItem);
			broadcastTransactionCommitted(pendingAuthItem);

			return {
				success: false,
				synced: false,
				queued: true,
				authError: true,
				outboxItem: pendingAuthItem,
				error: appError,
				message:
					"Sesi login berakhir. Transaksi tersimpan dan akan dikirim setelah login ulang.",
			};
		}

		// Galat sementara / retryable (jaringan putus saat request, 5xx server error, timeout, 429)
		const pendingRetryItem: OutboxItem = {
			...outboxItem,
			status: "pending",
			attempts: currentAttempts,
			lastError: {
				code: appError.code,
				message: appError.message,
			},
		};
		await db.updateOutboxItem(outboxItem.clientUuid, pendingRetryItem);
		broadcastTransactionCommitted(pendingRetryItem);

		return {
			success: true,
			synced: false,
			queued: true,
			outboxItem: pendingRetryItem,
			error: appError,
			message:
				"Jaringan tidak stabil. Transaksi disimpan di antrean perangkat dan akan dicoba kembali secara otomatis.",
		};
	}
}
