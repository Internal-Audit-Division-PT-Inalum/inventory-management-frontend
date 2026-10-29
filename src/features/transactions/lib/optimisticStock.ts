import { db } from "@/lib/db";
import type { Item } from "@/types/api";
import type { TransactionAction } from "../types";

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
 * Membatalkan (revert) mutasi stok optimistik jika server menolak transaksi secara fatal
 * atau ketika pengguna membatalkan transaksi yang ditolak/antre.
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
