import { describe, expect, it } from "vitest";
import type { OutboxItem } from "@/lib/db";
import type { Item } from "@/types/api";
import {
	calculateItemPendingMutations,
	calculateProjectedStock,
	calculateProjectedStocksBatch,
} from "./projectedStock";

describe("Task P5.8: Pure Projected Stock Calculation Engine", () => {
	const mockConsumableItem: Item = {
		id: "item-atk-1",
		sku: "ATK-KTS-A4",
		name: "Kertas A4",
		type: "consumable",
		unit: "rim",
		location_id: "loc-1",
		current_stock: 7, // Diperbarui secara optimistik di lokal
		minimum_stock: 5,
		image_url: null,
		updated_at: "2026-10-28T10:00:00Z",
	};

	const mockAssetItem: Item = {
		id: "item-ast-1",
		sku: "AST-PRJ-01",
		name: "Proyektor Ruang Rapat",
		type: "asset",
		unit: "unit",
		location_id: "loc-2",
		current_stock: 2,
		minimum_stock: 1,
		borrowed_quantity: 3,
		image_url: null,
		updated_at: "2026-10-28T10:00:00Z",
	};

	describe("calculateItemPendingMutations", () => {
		it("menghitung total mutasi kuantitas outbox pending secara presisi", () => {
			const pendingItems: OutboxItem[] = [
				{
					clientUuid: "uuid-1",
					employeeId: "emp-1",
					itemId: "item-atk-1",
					operation: "take",
					quantity: 2,
					status: "pending",
					occurredAt: "2026-10-28T10:00:00Z",
					createdAt: "2026-10-28T10:00:00Z",
					attempts: 0,
				},
				{
					clientUuid: "uuid-2",
					employeeId: "emp-1",
					itemId: "item-atk-1",
					operation: "take",
					quantity: 1,
					status: "syncing", // syncing juga dihitung
					occurredAt: "2026-10-28T10:01:00Z",
					createdAt: "2026-10-28T10:01:00Z",
					attempts: 1,
				},
				{
					clientUuid: "uuid-3",
					employeeId: "emp-1",
					itemId: "item-atk-1",
					operation: "add",
					quantity: 5,
					status: "pending",
					occurredAt: "2026-10-28T10:02:00Z",
					createdAt: "2026-10-28T10:02:00Z",
					attempts: 0,
				},
				{
					clientUuid: "uuid-4",
					employeeId: "emp-1",
					itemId: "item-atk-1",
					operation: "take",
					quantity: 10,
					status: "synced", // SUDAH disinkronkan, JANGAN dihitung
					occurredAt: "2026-10-28T09:00:00Z",
					createdAt: "2026-10-28T09:00:00Z",
					attempts: 1,
				},
				{
					clientUuid: "uuid-5",
					employeeId: "emp-1",
					itemId: "item-atk-2", // Item ID lain
					operation: "take",
					quantity: 4,
					status: "pending",
					occurredAt: "2026-10-28T10:00:00Z",
					createdAt: "2026-10-28T10:00:00Z",
					attempts: 0,
				},
			];

			const mutations = calculateItemPendingMutations(
				"item-atk-1",
				pendingItems,
			);

			expect(mutations.pendingCount).toBe(3);
			expect(mutations.takeQty).toBe(3); // 2 + 1
			expect(mutations.addQty).toBe(5);
			expect(mutations.netStockDelta).toBe(2); // +5 - 3 = +2
			expect(mutations.netBorrowedDelta).toBe(0);
		});

		it("menghitung mutasi pinjam (borrow) dan kembali (return) untuk aset", () => {
			const pendingItems: OutboxItem[] = [
				{
					clientUuid: "uuid-10",
					employeeId: "emp-1",
					itemId: "item-ast-1",
					operation: "borrow",
					quantity: 1,
					status: "pending",
					occurredAt: "2026-10-28T10:00:00Z",
					createdAt: "2026-10-28T10:00:00Z",
					attempts: 0,
				},
				{
					clientUuid: "uuid-11",
					employeeId: "emp-1",
					itemId: "item-ast-1",
					operation: "return",
					quantity: 2,
					status: "pending",
					occurredAt: "2026-10-28T10:05:00Z",
					createdAt: "2026-10-28T10:05:00Z",
					attempts: 0,
				},
			];

			const mutations = calculateItemPendingMutations(
				"item-ast-1",
				pendingItems,
			);

			expect(mutations.borrowQty).toBe(1);
			expect(mutations.returnQty).toBe(2);
			// netStockDelta: +2 return - 1 borrow = +1
			expect(mutations.netStockDelta).toBe(1);
			// netBorrowedDelta: +1 borrow - 2 return = -1
			expect(mutations.netBorrowedDelta).toBe(-1);
		});
	});

	describe("calculateProjectedStock", () => {
		it("menghasilkan status normal tanpa proyeksi ketika antrean kosong", () => {
			const result = calculateProjectedStock(mockConsumableItem, []);

			expect(result.hasPendingTransactions).toBe(false);
			expect(result.isEstimated).toBe(false);
			expect(result.pendingCount).toBe(0);
			expect(result.projectedStock).toBe(7);
			expect(result.confirmedStock).toBe(7);
		});

		it("menghitung confirmedStock dan menandai isEstimated saat ada transaksi take antrean", () => {
			// Pengguna offline mengambil 3 rim. current_stock di lokal = 7.
			const pendingTake: OutboxItem[] = [
				{
					clientUuid: "uuid-take-1",
					employeeId: "emp-1",
					itemId: mockConsumableItem.id,
					operation: "take",
					quantity: 3,
					status: "pending",
					occurredAt: "2026-10-28T10:00:00Z",
					createdAt: "2026-10-28T10:00:00Z",
					attempts: 0,
				},
			];

			const result = calculateProjectedStock(mockConsumableItem, pendingTake);

			expect(result.hasPendingTransactions).toBe(true);
			expect(result.isEstimated).toBe(true);
			expect(result.pendingCount).toBe(1);
			expect(result.projectedStock).toBe(7);
			// Server confirmed stock = 7 - (-3) = 10 rim
			expect(result.confirmedStock).toBe(10);
		});

		it("menghitung confirmedStock dan proyeksi saat ada transaksi add antrean", () => {
			// Pengguna menambah stok 5. current_stock di lokal = 12.
			const itemWithAddedStock: Item = {
				...mockConsumableItem,
				current_stock: 12,
			};
			const pendingAdd: OutboxItem[] = [
				{
					clientUuid: "uuid-add-1",
					employeeId: "emp-1",
					itemId: itemWithAddedStock.id,
					operation: "add",
					quantity: 5,
					status: "pending",
					occurredAt: "2026-10-28T10:00:00Z",
					createdAt: "2026-10-28T10:00:00Z",
					attempts: 0,
				},
			];

			const result = calculateProjectedStock(itemWithAddedStock, pendingAdd);

			expect(result.hasPendingTransactions).toBe(true);
			expect(result.isEstimated).toBe(true);
			expect(result.projectedStock).toBe(12);
			// Server confirmed stock = 12 - (+5) = 7
			expect(result.confirmedStock).toBe(7);
		});

		it("menghitung proyeksi ketersediaan dan peminjaman aset saat ada transaksi borrow antrean", () => {
			// Pengguna meminjam 1 proyektor. Lokal: stock = 2, borrowed = 3.
			const pendingBorrow: OutboxItem[] = [
				{
					clientUuid: "uuid-borrow-1",
					employeeId: "emp-1",
					itemId: mockAssetItem.id,
					operation: "borrow",
					quantity: 1,
					status: "pending",
					occurredAt: "2026-10-28T10:00:00Z",
					createdAt: "2026-10-28T10:00:00Z",
					attempts: 0,
				},
			];

			const result = calculateProjectedStock(mockAssetItem, pendingBorrow);

			expect(result.hasPendingTransactions).toBe(true);
			expect(result.isEstimated).toBe(true);
			expect(result.projectedStock).toBe(2);
			expect(result.projectedBorrowed).toBe(3);
			// Sebelum borrow 1: confirmed stock = 2 - (-1) = 3; confirmed borrowed = 3 - (+1) = 2
			expect(result.confirmedStock).toBe(3);
			expect(result.confirmedBorrowed).toBe(2);
		});
	});

	describe("calculateProjectedStocksBatch", () => {
		it("menghitung Map proyeksi untuk banyak item sekaligus secara efisien", () => {
			const items = [mockConsumableItem, mockAssetItem];
			const pendingItems: OutboxItem[] = [
				{
					clientUuid: "uuid-batch-1",
					employeeId: "emp-1",
					itemId: mockConsumableItem.id,
					operation: "take",
					quantity: 2,
					status: "pending",
					occurredAt: "2026-10-28T10:00:00Z",
					createdAt: "2026-10-28T10:00:00Z",
					attempts: 0,
				},
			];

			const batchMap = calculateProjectedStocksBatch(items, pendingItems);

			expect(batchMap.size).toBe(2);

			const consumableProj = batchMap.get(mockConsumableItem.id);
			expect(consumableProj?.hasPendingTransactions).toBe(true);
			expect(consumableProj?.isEstimated).toBe(true);
			expect(consumableProj?.confirmedStock).toBe(9); // 7 - (-2)

			const assetProj = batchMap.get(mockAssetItem.id);
			expect(assetProj?.hasPendingTransactions).toBe(false);
			expect(assetProj?.isEstimated).toBe(false);
			expect(assetProj?.projectedStock).toBe(2);
		});
	});
});
