import { calculateNextAttemptAt } from "@/features/sync/lib/backoff";
import { classifySyncResponse } from "@/features/sync/lib/responseClassifier";
import { syncPauseController } from "@/features/sync/lib/syncPauseController";
import { db, type OutboxItem } from "@/lib/db";
import { mapApiError } from "@/lib/errors";
import type { Item } from "@/types/api";
import { transactItemApi } from "../api/transactItem";
import type { EnqueueTransactionParams, TransactSubmitResult } from "../types";
import {
	type AppliedStockDelta,
	applyOptimisticStock,
	revertOptimisticStock,
} from "./optimisticStock";
import {
	broadcastTransactionCommitted,
	TRANSACTION_COMMITTED_EVENT,
} from "./outboxEvents";
import {
	assertValidStatusTransition,
	discardOutboxItem,
	InvalidStatusTransitionError,
	isValidStatusTransition,
	retryOutboxItem,
	transitionOutboxStatus,
	VALID_STATUS_TRANSITIONS,
} from "./statusMachine";
import { buildOutboxItem } from "./transactionIdentity";

// Re-export untuk backward compatibility penuh
export {
	type AppliedStockDelta,
	applyOptimisticStock,
	assertValidStatusTransition,
	broadcastTransactionCommitted,
	discardOutboxItem,
	InvalidStatusTransitionError,
	isValidStatusTransition,
	retryOutboxItem,
	revertOptimisticStock,
	TRANSACTION_COMMITTED_EVENT,
	transitionOutboxStatus,
	VALID_STATUS_TRANSITIONS,
};

/**
 * Mendaftarkan transaksi ke antrean outbox Dexie secara murni (Pure Enqueue).
 * Menerapkan mutasi stok optimistik lokal, mencatat log diagnostik, dan menyiarkan event.
 */
export async function enqueueTransaction(
	params: EnqueueTransactionParams,
): Promise<OutboxItem> {
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

	// 4. Catat log diagnostik
	await db.addDiagnosticLog({
		timestamp: new Date().toISOString(),
		level: "info",
		category: "OUTBOX",
		message: `Transaction enqueued: ${outboxItem.clientUuid} (${outboxItem.operation} ${outboxItem.quantity})`,
		details: {
			itemId: item.id,
			employeeId,
			operation: action,
			quantity: formData.quantity,
		},
	});

	// 5. Siarkan event transaksi lokal
	broadcastTransactionCommitted(outboxItem);

	return outboxItem;
}

/**
 * Zero-Data-Loss Transaction Submission Engine.
 *
 * 1. Panggil enqueueTransaction() DAHULU sebelum aksi jaringan.
 * 2. Jika offline -> kembalikan status antrean (queued: true).
 * 3. Jika online -> coba kirim langsung ke server via processPendingOutboxEntry().
 */
export async function enqueueAndProcessTransaction(
	params: EnqueueTransactionParams,
): Promise<TransactSubmitResult> {
	// 1. Enqueue transaksi secara murni
	const outboxItem = await enqueueTransaction(params);

	// 2. Periksa ketersediaan jaringan
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

	// 3. Jika online, langsung proses pengiriman antrean ini
	return processPendingOutboxEntry(outboxItem);
}

/**
 * Memproses satu entri OutboxItem yang berstatus 'pending':
 * Mengirim ke server, mentransisikan status melalui statusMachine, menerapkan stok otoritatif,
 * atau me-revert stok optimistik jika ditolak permanen (422/409).
 */
export async function processPendingOutboxEntry(
	outboxItem: OutboxItem,
): Promise<TransactSubmitResult> {
	const currentAttempts = (outboxItem.attempts ?? 0) + 1;
	await transitionOutboxStatus(outboxItem.clientUuid, "syncing", {
		attempts: currentAttempts,
	});

	try {
		const response = await transactItemApi(outboxItem);

		// Sukses (200 / 201) -> transisi ke 'synced'
		const syncedItem = await transitionOutboxStatus(
			outboxItem.clientUuid,
			"synced",
			{
				attempts: currentAttempts,
				lastError: null,
			},
		);

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
		const classification = classifySyncResponse(error);
		const appError = mapApiError(error);

		if (classification.action === "reject") {
			// Penolakan permanen aturan bisnis (422 Insufficient Stock, 409 Conflict, dll.) -> 'rejected'
			const rejectedItem = await transitionOutboxStatus(
				outboxItem.clientUuid,
				"rejected",
				{
					attempts: currentAttempts,
					nextAttemptAt: null,
					lastError: {
						code: classification.code,
						message: classification.message,
					},
				},
			);

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

			return {
				success: false,
				synced: false,
				queued: false,
				rejected: true,
				outboxItem: rejectedItem,
				error: appError,
				message: classification.message,
			};
		}

		if (classification.action === "pause_auth") {
			// Sesi kedaluwarsa: outbox di-reset kembali ke 'pending' (pause queue)
			syncPauseController.pause(classification.message);

			const pendingAuthItem = await transitionOutboxStatus(
				outboxItem.clientUuid,
				"pending",
				{
					attempts: currentAttempts,
					nextAttemptAt: null,
					lastError: {
						code: classification.code,
						message: classification.message,
					},
				},
			);

			return {
				success: false,
				synced: false,
				queued: true,
				authError: true,
				outboxItem: pendingAuthItem,
				error: appError,
				message: classification.message,
			};
		}

		// Galat sementara / retryable (jaringan putus saat request, 5xx server error, timeout, 429 rate limit)
		const nextAttemptAt =
			typeof classification.retryAfterMs === "number"
				? new Date(Date.now() + classification.retryAfterMs).toISOString()
				: calculateNextAttemptAt(currentAttempts);

		const pendingRetryItem = await transitionOutboxStatus(
			outboxItem.clientUuid,
			"pending",
			{
				attempts: currentAttempts,
				nextAttemptAt,
				lastError: {
					code: classification.code,
					message: classification.message,
				},
			},
		);

		return {
			success: true,
			synced: false,
			queued: true,
			outboxItem: pendingRetryItem,
			error: appError,
			message:
				classification.message ||
				"Jaringan tidak stabil. Transaksi disimpan di antrean perangkat dan akan dicoba kembali secara otomatis.",
		};
	}
}
