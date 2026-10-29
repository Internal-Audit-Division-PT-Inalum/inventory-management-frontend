import { CATALOG_SYNC_EVENT } from "@/features/catalog/api/syncCatalog";
import type { OutboxItem } from "@/lib/db";

/**
 * Event nama global saat transaksi dimasukkan ke outbox atau status sinkronisasinya berubah.
 */
export const TRANSACTION_COMMITTED_EVENT = "inventory:transaction-committed";

/**
 * Menyiarkan event transaksi lokal ke window agar katalog dan komponen UI reaktif.
 */
export function broadcastTransactionCommitted(outboxItem: OutboxItem): void {
	if (typeof window !== "undefined") {
		window.dispatchEvent(
			new CustomEvent(TRANSACTION_COMMITTED_EVENT, { detail: outboxItem }),
		);
		window.dispatchEvent(new CustomEvent(CATALOG_SYNC_EVENT));
	}
}
