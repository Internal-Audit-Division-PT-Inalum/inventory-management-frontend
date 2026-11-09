import type { OutboxItem, OutboxOperation, OutboxStatus } from "@/lib/db";
import type { Item } from "@/types/api";
import type { RecentActivityItem } from "../types";

/**
 * Maps inventory transaction operations to localized Indonesian user-facing labels.
 */
export function getOperationLabel(operation: OutboxOperation): string {
	switch (operation) {
		case "take":
			return "Pengambilan Barang";
		case "add":
			return "Penerimaan / Restok";
		case "borrow":
			return "Peminjaman Aset";
		case "return":
			return "Pengembalian Aset";
		default:
			return "Transaksi Inventaris";
	}
}

/**
 * Maps outbox synchronization status to localized Indonesian labels.
 */
export function getStatusLabel(status: OutboxStatus): string {
	switch (status) {
		case "pending":
			return "Menunggu Sinkron";
		case "syncing":
			return "Sedang Dikirim";
		case "synced":
			return "Tersinkron";
		case "rejected":
			return "Ditolak Server";
		case "failed":
			return "Gagal Sementara";
		default:
			return status;
	}
}

/**
 * Formats timestamps into localized Indonesian relative time representations.
 */
export function formatRelativeTime(
	dateString: string,
	nowMs = Date.now(),
): string {
	try {
		const then = new Date(dateString).getTime();
		if (Number.isNaN(then)) return dateString;

		const diffMs = nowMs - then;
		if (diffMs < 0) return "Baru saja";

		const diffSeconds = Math.floor(diffMs / 1000);
		if (diffSeconds < 60) return "Baru saja";

		const diffMinutes = Math.floor(diffSeconds / 60);
		if (diffMinutes < 60) return `${diffMinutes} menit lalu`;

		const diffHours = Math.floor(diffMinutes / 60);
		if (diffHours < 24) return `${diffHours} jam lalu`;

		const diffDays = Math.floor(diffHours / 24);
		if (diffDays === 1) return "Kemarin";
		if (diffDays < 7) return `${diffDays} hari lalu`;

		return new Intl.DateTimeFormat("id-ID", {
			day: "numeric",
			month: "short",
			hour: "2-digit",
			minute: "2-digit",
			timeZone: "Asia/Jakarta",
		}).format(new Date(dateString));
	} catch {
		return dateString;
	}
}

/**
 * Transforms raw outbox items into enriched activity feed representations.
 */
export function transformOutboxToActivities(
	outboxItems: OutboxItem[],
	itemMap: Map<string, Item>,
	nowMs = Date.now(),
): RecentActivityItem[] {
	return outboxItems.map((outbox) => {
		const item = itemMap.get(outbox.itemId);

		return {
			id: outbox.clientUuid,
			clientUuid: outbox.clientUuid,
			operation: outbox.operation,
			operationLabel: getOperationLabel(outbox.operation),
			itemId: outbox.itemId,
			itemName: item?.name || "Barang Inventaris",
			itemSku: item?.sku || "SKU-UNKNOWN",
			itemUnit: item?.unit || "unit",
			quantity: outbox.quantity,
			status: outbox.status,
			statusLabel: getStatusLabel(outbox.status),
			occurredAt: outbox.occurredAt,
			relativeTime: formatRelativeTime(outbox.occurredAt, nowMs),
			notes: outbox.notes,
			errorMessage: outbox.lastError?.message || null,
		};
	});
}
