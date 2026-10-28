import { api } from "@/lib/api";
import type { OutboxItem } from "@/lib/db";
import type { TransactApiResponse, TransactItemPayload } from "../types";

/**
 * Mengirim transaksi item tunggal langsung ke backend API Laravel.
 * Mendukung 4 endpoint: take, add, borrow, return.
 * Membawa client_uuid untuk idempotency dan occurred_at terkoreksi.
 */
export async function transactItemApi(
	outboxItem: OutboxItem,
): Promise<TransactApiResponse> {
	const payload: TransactItemPayload = {
		client_uuid: outboxItem.clientUuid,
		quantity: outboxItem.quantity,
		occurred_at: outboxItem.occurredAt,
		notes: outboxItem.notes || undefined,
		reference_number: outboxItem.referenceNumber || undefined,
	};

	const endpoint = `/inventory/items/${outboxItem.itemId}/${outboxItem.operation}`;
	const response = await api.post<TransactApiResponse>(endpoint, payload);

	return response.data;
}
