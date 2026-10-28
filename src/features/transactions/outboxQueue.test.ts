import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import { db, type OutboxItem } from "@/lib/db";
import type { Item } from "@/types/api";
import { transactItemApi } from "./api/transactItem";
import { useTransactionSubmit } from "./hooks/useTransactionSubmit";
import {
	enqueueAndProcessTransaction,
	processPendingOutboxEntry,
} from "./lib/outboxQueue";
import type { TransactionFormData, TransactSubmitResult } from "./types";

describe("Outbox Queue & Transaction Execution Engine (P3.3)", () => {
	const mockItem: Item = {
		id: "item-p3-1",
		sku: "ATK-P3-001",
		name: "Spidol Whiteboard Hitam",
		type: "consumable",
		unit: "pcs",
		location_id: "loc-p3",
		current_stock: 25,
		minimum_stock: 5,
		image_url: null,
		updated_at: "2026-10-26T10:00:00Z",
	};

	const mockAssetItem: Item = {
		id: "item-p3-2",
		sku: "AST-P3-002",
		name: "Laser Distance Meter Bosch",
		type: "asset",
		unit: "unit",
		location_id: "loc-p3",
		current_stock: 3,
		minimum_stock: 0,
		borrowed_quantity: 2,
		image_url: null,
		updated_at: "2026-10-26T10:00:00Z",
	};

	beforeEach(async () => {
		await db.items.clear();
		await db.outbox.clear();
		await db.locations.clear();
		await db.meta.clear();

		await db.items.bulkAdd([mockItem, mockAssetItem]);
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("transactItemApi", () => {
		it("sends POST request to /inventory/items/:id/:operation with client_uuid idempotency", async () => {
			const apiPostSpy = vi.spyOn(api, "post").mockResolvedValueOnce({
				data: {
					success: true,
					data: {
						id: "tx-srv-1",
						item_id: mockItem.id,
						user_id: "emp-p3",
						type: "out",
						quantity: 5,
						stock_before: 25,
						stock_after: 20,
						occurred_at: "2026-10-27T10:00:00Z",
						created_at: "2026-10-27T10:00:00Z",
						item: { ...mockItem, current_stock: 20 },
					},
					message: "Barang berhasil diambil",
				},
			});

			const outboxItem: OutboxItem = {
				clientUuid: "uuid-client-123",
				employeeId: "emp-p3",
				operation: "take",
				itemId: mockItem.id,
				quantity: 5,
				notes: "Keperluan meeting audit",
				occurredAt: "2026-10-27T10:00:00Z",
				status: "pending",
				attempts: 0,
				createdAt: "2026-10-27T10:00:00Z",
			};

			const result = await transactItemApi(outboxItem);

			expect(apiPostSpy).toHaveBeenCalledWith(
				`/inventory/items/${mockItem.id}/take`,
				{
					client_uuid: "uuid-client-123",
					quantity: 5,
					occurred_at: "2026-10-27T10:00:00Z",
					notes: "Keperluan meeting audit",
					reference_number: undefined,
				},
			);
			expect(result.success).toBe(true);
			expect(result.data.item?.current_stock).toBe(20);
		});
	});

	describe("enqueueAndProcessTransaction", () => {
		it("processes online transaction synchronously and marks outbox synced", async () => {
			vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);

			const updatedItemFromServer: Item = {
				...mockItem,
				current_stock: 20,
				updated_at: "2026-10-27T12:00:00Z",
			};

			vi.spyOn(api, "post").mockResolvedValueOnce({
				data: {
					success: true,
					data: {
						id: "tx-online-1",
						item_id: mockItem.id,
						user_id: "emp-inalum-01",
						type: "out",
						quantity: 5,
						stock_before: 25,
						stock_after: 20,
						occurred_at: "2026-10-27T12:00:00Z",
						created_at: "2026-10-27T12:00:00Z",
						item: updatedItemFromServer,
					},
					message: "Pengambilan berhasil",
				},
			});

			const formData: TransactionFormData = {
				quantity: 5,
				notes: "Penggunaan rutin audit internal",
			};

			const result = await enqueueAndProcessTransaction({
				item: mockItem,
				action: "take",
				formData,
				employeeId: "emp-inalum-01",
			});

			expect(result.success).toBe(true);
			expect(result.synced).toBe(true);
			expect(result.queued).toBe(false);

			// Periksa rekaman outbox di Dexie
			const outboxEntries = await db.outbox.toArray();
			expect(outboxEntries).toHaveLength(1);
			expect(outboxEntries[0].status).toBe("synced");
			expect(outboxEntries[0].quantity).toBe(5);

			// Periksa bahwa stok di tabel items Dexie diperbarui sesuai respon otoritatif server
			const savedItem = await db.items.get(mockItem.id);
			expect(savedItem?.current_stock).toBe(20);
			expect(savedItem?.updated_at).toBe("2026-10-27T12:00:00Z");
		});

		it("enqueues transaction into outbox and updates Dexie optimistically when offline", async () => {
			vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);

			const formData: TransactionFormData = {
				quantity: 7,
				notes: "Pengambilan offline di gudang basement",
			};

			const result = await enqueueAndProcessTransaction({
				item: mockItem,
				action: "take",
				formData,
				employeeId: "emp-inalum-01",
			});

			expect(result.success).toBe(true);
			expect(result.synced).toBe(false);
			expect(result.queued).toBe(true);
			expect(result.message).toContain("Tersimpan di antrean perangkat");

			// Outbox berstatus pending
			const outboxEntries = await db.outbox.toArray();
			expect(outboxEntries).toHaveLength(1);
			expect(outboxEntries[0].status).toBe("pending");
			expect(outboxEntries[0].attempts).toBe(0);

			// Stok item di Dexie ter-update secara optimis (25 - 7 = 18)
			const savedItem = await db.items.get(mockItem.id);
			expect(savedItem?.current_stock).toBe(18);
		});

		it("optimistically updates asset borrowing in Dexie when offline", async () => {
			vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);

			const formData: TransactionFormData = {
				quantity: 1,
				notes: "Inspeksi proyek dermaga",
			};

			const result = await enqueueAndProcessTransaction({
				item: mockAssetItem,
				action: "borrow",
				formData,
				employeeId: "emp-inalum-01",
			});

			expect(result.success).toBe(true);
			expect(result.queued).toBe(true);

			// Tersedia: 3 - 1 = 2; Dipinjam: 2 + 1 = 3
			const savedAsset = await db.items.get(mockAssetItem.id);
			expect(savedAsset?.current_stock).toBe(2);
			expect(savedAsset?.borrowed_quantity).toBe(3);
		});

		it("optimistically updates asset return in Dexie when offline", async () => {
			vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);

			const formData: TransactionFormData = {
				quantity: 2,
				notes: "Pengembalian laser distance meter setelah inspeksi",
			};

			const result = await enqueueAndProcessTransaction({
				item: mockAssetItem,
				action: "return",
				formData,
				employeeId: "emp-inalum-01",
			});

			expect(result.success).toBe(true);
			expect(result.queued).toBe(true);

			// Tersedia: 3 + 2 = 5; Dipinjam: 2 - 2 = 0
			const savedAsset = await db.items.get(mockAssetItem.id);
			expect(savedAsset?.current_stock).toBe(5);
			expect(savedAsset?.borrowed_quantity).toBe(0);
		});

		it("handles network failure gracefully: keeps pending status in outbox and increments attempts", async () => {
			vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);

			// Simulasi API gagal koneksi jaringan (Network Error)
			vi.spyOn(api, "post").mockRejectedValueOnce(
				new Error("Network Error: Failed to fetch"),
			);

			const formData: TransactionFormData = {
				quantity: 3,
				notes: "Coba transaksi saat sinyal lemah",
			};

			const result = await enqueueAndProcessTransaction({
				item: mockItem,
				action: "take",
				formData,
				employeeId: "emp-inalum-01",
			});

			// Tetap dianggap sukses di UI karena telah di-buffer di outbox!
			expect(result.success).toBe(true);
			expect(result.synced).toBe(false);
			expect(result.queued).toBe(true);

			// Outbox tetap pending dengan attempts tercatat
			const outboxEntries = await db.outbox.toArray();
			expect(outboxEntries).toHaveLength(1);
			expect(outboxEntries[0].status).toBe("pending");
			expect(outboxEntries[0].attempts).toBe(1);
			expect(outboxEntries[0].lastError?.message).toContain("Network Error");

			// Stok optimis di Dexie tetap aktif (25 - 3 = 22)
			const savedItem = await db.items.get(mockItem.id);
			expect(savedItem?.current_stock).toBe(22);
		});

		it("reverts optimistic mutation and marks rejected on fatal 422 business rejection", async () => {
			vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);

			// Simulasi backend menolak 422 karena stok tidak mencukupi
			const error422 = {
				response: {
					status: 422,
					data: {
						success: false,
						message: "Stok fisik barang tidak mencukupi untuk transaksi ini",
						code: "INSUFFICIENT_STOCK",
					},
				},
				isAxiosError: true,
			};
			vi.spyOn(api, "post").mockRejectedValueOnce(error422);

			const formData: TransactionFormData = {
				quantity: 10,
				notes: "Pengambilan melebihi stok real",
			};

			const result = await enqueueAndProcessTransaction({
				item: mockItem,
				action: "take",
				formData,
				employeeId: "emp-inalum-01",
			});

			expect(result.success).toBe(false);
			expect(result.rejected).toBe(true);
			expect(result.message).toContain("Stok fisik barang tidak mencukupi");

			// Outbox ditandai rejected
			const outboxEntries = await db.outbox.toArray();
			expect(outboxEntries).toHaveLength(1);
			expect(outboxEntries[0].status).toBe("rejected");

			// Mutasi optimis DIBATALKAN (kembali ke snapshot 25)
			const savedItem = await db.items.get(mockItem.id);
			expect(savedItem?.current_stock).toBe(25);
		});

		it("processPendingOutboxEntry successfully syncs an existing pending entry", async () => {
			// Masukkan pending outbox secara manual
			const pendingEntry: OutboxItem = {
				clientUuid: "manual-pending-01",
				employeeId: "emp-01",
				operation: "take",
				itemId: mockItem.id,
				quantity: 4,
				notes: "Pending take",
				occurredAt: new Date().toISOString(),
				status: "pending",
				attempts: 0,
				createdAt: new Date().toISOString(),
			};
			await db.enqueueOutboxItem(pendingEntry);

			const updatedItemFromServer: Item = {
				...mockItem,
				current_stock: 21,
			};

			vi.spyOn(api, "post").mockResolvedValueOnce({
				data: {
					success: true,
					data: {
						id: "tx-srv-sync",
						item_id: mockItem.id,
						user_id: "emp-01",
						type: "out",
						quantity: 4,
						stock_before: 25,
						stock_after: 21,
						occurred_at: pendingEntry.occurredAt,
						created_at: new Date().toISOString(),
						item: updatedItemFromServer,
					},
					message: "Sinkronisasi berhasil",
				},
			});

			const processResult = await processPendingOutboxEntry(pendingEntry);
			expect(processResult.success).toBe(true);
			expect(processResult.synced).toBe(true);

			const updatedEntry = await db.outbox.get(pendingEntry.clientUuid);
			expect(updatedEntry?.status).toBe("synced");
			expect(updatedEntry?.attempts).toBe(1);
		});
	});

	describe("useTransactionSubmit Hook", () => {
		it("provides submitTransaction function and manages loading state", async () => {
			vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);

			vi.spyOn(api, "post").mockResolvedValueOnce({
				data: {
					success: true,
					data: {
						id: "tx-hook-1",
						item_id: mockItem.id,
						user_id: "emp-test",
						type: "out",
						quantity: 2,
						stock_before: 25,
						stock_after: 23,
						occurred_at: new Date().toISOString(),
						created_at: new Date().toISOString(),
						item: { ...mockItem, current_stock: 23 },
					},
					message: "Aksi sukses",
				},
			});

			const { result } = renderHook(() => useTransactionSubmit());

			expect(result.current.isSubmitting).toBe(false);
			expect(result.current.lastResult).toBeNull();

			let res: TransactSubmitResult | undefined;
			await act(async () => {
				res = await result.current.submitTransaction(mockItem, "take", {
					quantity: 2,
				});
			});

			expect(res).toBeDefined();
			expect(res?.success).toBe(true);
			expect(result.current.isSubmitting).toBe(false);
			expect(result.current.lastResult?.synced).toBe(true);
		});
	});
});
