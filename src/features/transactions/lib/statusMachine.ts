import { db, type OutboxItem, type OutboxStatus } from "@/lib/db";
import { revertOptimisticStock } from "./optimisticStock";
import { broadcastTransactionCommitted } from "./outboxEvents";

export class InvalidStatusTransitionError extends Error {
	readonly clientUuid: string;
	readonly fromStatus: OutboxStatus;
	readonly toStatus: OutboxStatus;

	constructor(
		clientUuid: string,
		fromStatus: OutboxStatus,
		toStatus: OutboxStatus,
	) {
		super(
			`Invalid outbox status transition for '${clientUuid}': '${fromStatus}' -> '${toStatus}'`,
		);
		this.name = "InvalidStatusTransitionError";
		this.clientUuid = clientUuid;
		this.fromStatus = fromStatus;
		this.toStatus = toStatus;
	}
}

/**
 * Peta transisi status yang sah (Finite State Machine).
 * Terminal state: 'synced' tidak boleh berpindah ke status apa pun lagi.
 */
export const VALID_STATUS_TRANSITIONS: Record<
	OutboxStatus,
	readonly OutboxStatus[]
> = {
	pending: ["syncing"],
	syncing: ["synced", "failed", "rejected", "pending"],
	failed: ["pending", "rejected"],
	rejected: ["pending"],
	synced: [],
};

/**
 * Memeriksa apakah transisi status dari -> to diperbolehkan oleh state machine.
 */
export function isValidStatusTransition(
	from: OutboxStatus,
	to: OutboxStatus,
): boolean {
	return VALID_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Memastikan transisi status sah. Melemparkan InvalidStatusTransitionError jika tidak sah.
 */
export function assertValidStatusTransition(
	clientUuid: string,
	from: OutboxStatus,
	to: OutboxStatus,
): void {
	if (!isValidStatusTransition(from, to)) {
		throw new InvalidStatusTransitionError(clientUuid, from, to);
	}
}

export interface TransitionOptions {
	attempts?: number;
	nextAttemptAt?: string | null;
	lastError?: {
		code?: string;
		message: string;
	} | null;
}

/**
 * Mengubah status entri outbox secara aman dan atomik melalui status machine.
 */
export async function transitionOutboxStatus(
	clientUuid: string,
	targetStatus: OutboxStatus,
	options: TransitionOptions = {},
): Promise<OutboxItem> {
	const currentItem = await db.getOutboxItemByUuid(clientUuid);
	if (!currentItem) {
		throw new Error(
			`Entri outbox dengan clientUuid '${clientUuid}' tidak ditemukan di IndexedDB.`,
		);
	}

	assertValidStatusTransition(clientUuid, currentItem.status, targetStatus);

	const updatedItem: OutboxItem = {
		...currentItem,
		status: targetStatus,
		attempts: options.attempts ?? currentItem.attempts,
		nextAttemptAt:
			options.nextAttemptAt !== undefined
				? options.nextAttemptAt
				: currentItem.nextAttemptAt,
		lastError:
			options.lastError !== undefined
				? options.lastError
				: currentItem.lastError,
	};

	await db.updateOutboxItem(clientUuid, updatedItem);

	// Catat log transisi ke ring-buffer diagnostik
	await db.addDiagnosticLog({
		timestamp: new Date().toISOString(),
		level: targetStatus === "rejected" ? "warn" : "info",
		category: "STATE_MACHINE",
		message: `Outbox ${clientUuid} transitioned: ${currentItem.status} -> ${targetStatus}`,
		details: {
			operation: currentItem.operation,
			itemId: currentItem.itemId,
			attempts: updatedItem.attempts,
			errorCode: updatedItem.lastError?.code,
		},
	});

	broadcastTransactionCommitted(updatedItem);
	return updatedItem;
}

/**
 * Membatalkan dan menghapus entri outbox yang ditolak (rejected) atau pending.
 * Menghapus entri outbox yang sedang 'syncing' DILARANG untuk mencegah inkonsistensi.
 */
export async function discardOutboxItem(clientUuid: string): Promise<void> {
	const item = await db.getOutboxItemByUuid(clientUuid);
	if (!item) {
		throw new Error(`Entri outbox '${clientUuid}' tidak ditemukan.`);
	}

	if (item.status === "syncing") {
		throw new Error(
			`Tidak dapat membatalkan entri outbox '${clientUuid}' yang sedang dalam proses pengiriman (syncing).`,
		);
	}

	if (item.status === "synced") {
		throw new Error(
			`Tidak dapat membatalkan entri outbox '${clientUuid}' yang sudah berhasil disinkronkan ke server.`,
		);
	}

	// Revert stok optimistik lokal jika item ada
	const localItem = await db.items.get(item.itemId);
	if (localItem) {
		await revertOptimisticStock(
			localItem,
			item.operation,
			item.quantity,
			item.appliedDeltaStock !== undefined
				? {
						deltaStock: item.appliedDeltaStock,
						deltaBorrowed: item.appliedDeltaBorrowed ?? 0,
					}
				: undefined,
		);
	}

	await db.outbox.delete(clientUuid);

	await db.addDiagnosticLog({
		timestamp: new Date().toISOString(),
		level: "info",
		category: "OUTBOX",
		message: `Outbox item ${clientUuid} discarded (status sebelumnya: ${item.status})`,
		details: { itemId: item.itemId, operation: item.operation },
	});

	broadcastTransactionCommitted(item);
}

/**
 * Mencoba ulang entri outbox yang sebelumnya gagal (failed) atau ditolak (rejected).
 * Mengembalikan status ke 'pending' dan membersihkan nextAttemptAt.
 */
export async function retryOutboxItem(clientUuid: string): Promise<OutboxItem> {
	const item = await db.getOutboxItemByUuid(clientUuid);
	if (!item) {
		throw new Error(`Entri outbox '${clientUuid}' tidak ditemukan.`);
	}

	if (item.status !== "failed" && item.status !== "rejected") {
		throw new Error(
			`Hanya entri outbox berstatus 'failed' atau 'rejected' yang dapat dicoba ulang secara manual. Status saat ini: '${item.status}'`,
		);
	}

	return await transitionOutboxStatus(clientUuid, "pending", {
		nextAttemptAt: null,
		lastError: null,
	});
}
