import { useCallback, useEffect, useState } from "react";
import { CATALOG_SYNC_EVENT } from "@/features/catalog/api/syncCatalog";
import { SYNC_ENGINE_EVENT } from "@/features/sync";
import { db } from "@/lib/db";
import type { Item } from "@/types/api";
import { TRANSACTION_COMMITTED_EVENT } from "../lib/outboxEvents";
import {
	calculateProjectedStock,
	type ProjectedItemStock,
} from "../lib/projectedStock";

/**
 * Hook reaktif untuk memantau status proyeksi stok satu item barang secara real-time.
 * Otomatis memperbarui nilai saat ada transaksi outbox baru atau pasca siklus sinkronisasi.
 */
export function useProjectedStock(
	item: Item | null | undefined,
): ProjectedItemStock | null {
	const [projected, setProjected] = useState<ProjectedItemStock | null>(() => {
		if (!item) return null;
		return calculateProjectedStock(item, []);
	});

	const refresh = useCallback(async () => {
		if (!item?.id) {
			setProjected(null);
			return;
		}

		try {
			// Ambil semua transaksi antrean outbox untuk item ini
			const pendingItems = await db.outbox
				.where("itemId")
				.equals(item.id)
				.and(
					(entry) => entry.status === "pending" || entry.status === "syncing",
				)
				.toArray();

			// Ambil data item terkini dari database jika ada, prioritaskan atribut proyeksi dari props
			const latestRecord = await db.items.get(item.id);
			const effectiveItem = latestRecord ? { ...latestRecord, ...item } : item;

			setProjected(calculateProjectedStock(effectiveItem, pendingItems));
		} catch (err) {
			console.warn("Gagal memuat status proyeksi stok:", err);
			if (item) {
				setProjected(calculateProjectedStock(item, []));
			}
		}
	}, [item]);

	useEffect(() => {
		let isMounted = true;

		refresh();

		const handleUpdate = () => {
			if (isMounted) {
				refresh();
			}
		};

		if (typeof window !== "undefined") {
			window.addEventListener(TRANSACTION_COMMITTED_EVENT, handleUpdate);
			window.addEventListener(CATALOG_SYNC_EVENT, handleUpdate);
			window.addEventListener(SYNC_ENGINE_EVENT, handleUpdate);
		}

		return () => {
			isMounted = false;
			if (typeof window !== "undefined") {
				window.removeEventListener(TRANSACTION_COMMITTED_EVENT, handleUpdate);
				window.removeEventListener(CATALOG_SYNC_EVENT, handleUpdate);
				window.removeEventListener(SYNC_ENGINE_EVENT, handleUpdate);
			}
		};
	}, [refresh]);

	return projected;
}
