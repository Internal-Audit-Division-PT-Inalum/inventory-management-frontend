import type { OutboxItem } from "@/lib/db";
import type { Item } from "@/types/api";

export interface PendingItemMutations {
	takeQty: number;
	addQty: number;
	borrowQty: number;
	returnQty: number;
	netStockDelta: number;
	netBorrowedDelta: number;
	pendingCount: number;
	items: OutboxItem[];
}

export interface ProjectedItemStock {
	itemId: string;
	/** Jumlah transaksi antrean lokal (pending / syncing) */
	pendingCount: number;
	/** Bernilai true jika ada setidaknya 1 transaksi antrean outbox */
	hasPendingTransactions: boolean;
	/** Bernilai true jika angka stok ini merupakan estimasi/perkiraan lokal */
	isEstimated: boolean;
	/** Stok ketersediaan terproyeksi lokal (sudah memperhitungkan mutasi antrean) */
	projectedStock: number;
	/** Jumlah barang dipinjam terproyeksi lokal */
	projectedBorrowed: number;
	/** Stok baseline awal dari server sebelum transaksi antrean lokal */
	confirmedStock: number;
	/** Jumlah pinjaman baseline awal dari server sebelum transaksi antrean lokal */
	confirmedBorrowed: number;
	/** Rincian mutasi kuantitas yang sedang antre */
	mutations: PendingItemMutations;
}

/**
 * Menghitung rekapitulasi mutasi kuantitas dari transaksi outbox yang masih pending/syncing.
 */
export function calculateItemPendingMutations(
	itemId: string,
	outboxItems: OutboxItem[],
): PendingItemMutations {
	let takeQty = 0;
	let addQty = 0;
	let borrowQty = 0;
	let returnQty = 0;
	const matchedItems: OutboxItem[] = [];

	for (const item of outboxItems) {
		if (
			item.itemId === itemId &&
			(item.status === "pending" || item.status === "syncing")
		) {
			matchedItems.push(item);
			if (item.operation === "take") {
				takeQty += item.quantity;
			} else if (item.operation === "add") {
				addQty += item.quantity;
			} else if (item.operation === "borrow") {
				borrowQty += item.quantity;
			} else if (item.operation === "return") {
				returnQty += item.quantity;
			}
		}
	}

	const netStockDelta = addQty + returnQty - takeQty - borrowQty;
	const netBorrowedDelta = borrowQty - returnQty;

	return {
		takeQty,
		addQty,
		borrowQty,
		returnQty,
		netStockDelta,
		netBorrowedDelta,
		pendingCount: matchedItems.length,
		items: matchedItems,
	};
}

/**
 * Menghitung proyeksi stok lokal untuk satu item (Task P5.8).
 * Menghubungkan angka stok saat ini dengan transaksi antrean outbox,
 * serta menyajikan transparansi antara angka terkonfirmasi server vs perkiraan lokal.
 */
export function calculateProjectedStock(
	item: Item,
	pendingOutboxItems: OutboxItem[] = [],
): ProjectedItemStock {
	const mutations = calculateItemPendingMutations(item.id, pendingOutboxItems);
	const hasPending =
		mutations.pendingCount > 0 || Boolean(item.has_pending_transactions);
	const pendingCount =
		mutations.pendingCount > 0
			? mutations.pendingCount
			: (item.pending_transactions_count ?? (hasPending ? 1 : 0));

	// Karena applyOptimisticStock telah memperbarui item.current_stock di IndexedDB,
	// item.current_stock merepresentasikan projectedStock lokal saat ini.
	const currentStock = Math.max(
		0,
		item.projected_stock ?? item.current_stock ?? 0,
	);
	const currentBorrowed = Math.max(
		0,
		item.projected_borrowed ?? item.borrowed_quantity ?? 0,
	);

	// confirmedStock adalah stok server sebelum mutasi lokal diterapkan
	const confirmedStock = hasPending
		? Math.max(0, currentStock - mutations.netStockDelta)
		: currentStock;

	const confirmedBorrowed = hasPending
		? Math.max(0, currentBorrowed - mutations.netBorrowedDelta)
		: currentBorrowed;

	return {
		itemId: item.id,
		pendingCount,
		hasPendingTransactions: hasPending,
		isEstimated: hasPending,
		projectedStock: currentStock,
		projectedBorrowed: currentBorrowed,
		confirmedStock,
		confirmedBorrowed,
		mutations,
	};
}

/**
 * Menghitung proyeksi stok secara batch untuk kumpulan barang katalog.
 * Sangat efisien O(N + M) untuk rendering daftar katalog.
 */
export function calculateProjectedStocksBatch(
	items: Item[],
	pendingOutboxItems: OutboxItem[] = [],
): Map<string, ProjectedItemStock> {
	// 1. Kelompokkan pending outbox items berdasarkan itemId
	const outboxByItem = new Map<string, OutboxItem[]>();
	for (const outbox of pendingOutboxItems) {
		if (outbox.status === "pending" || outbox.status === "syncing") {
			const list = outboxByItem.get(outbox.itemId);
			if (list) {
				list.push(outbox);
			} else {
				outboxByItem.set(outbox.itemId, [outbox]);
			}
		}
	}

	// 2. Hitung proyeksi untuk tiap item
	const resultMap = new Map<string, ProjectedItemStock>();
	for (const item of items) {
		const itemOutbox = outboxByItem.get(item.id) ?? [];
		resultMap.set(item.id, calculateProjectedStock(item, itemOutbox));
	}

	return resultMap;
}
