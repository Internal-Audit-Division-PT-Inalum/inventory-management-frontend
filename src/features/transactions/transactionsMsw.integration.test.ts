import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
} from "vitest";
import { db } from "@/lib/db";
import { mockItemStore, mswControl, resetMswStore } from "@/test/msw/handlers";
import { server } from "@/test/msw/server";
import type { Item } from "@/types/api";
import { enqueueAndProcessTransaction } from "./lib/outboxQueue";

beforeAll(() => {
	server.listen();
});

afterEach(() => {
	server.resetHandlers();
	resetMswStore();
});

afterAll(() => {
	server.close();
});

describe("Task P3.8: MSW Transaction Integration, Replay & Error Mapping Suite", () => {
	const consumableItem: Item = {
		id: "item-consumable-1",
		sku: "SKU-KRT-A4",
		name: "Kertas HVS A4",
		type: "consumable",
		unit: "rim",
		location_id: "loc-01",
		current_stock: 20,
		minimum_stock: 5,
		image_url: null,
		updated_at: "2026-10-27T08:00:00Z",
	};

	const assetItem: Item = {
		id: "item-asset-1",
		sku: "SKU-PROJ-01",
		name: "Proyektor Epson",
		type: "asset",
		unit: "unit",
		location_id: "loc-02",
		current_stock: 10,
		minimum_stock: 1,
		borrowed_quantity: 2,
		image_url: null,
		updated_at: "2026-10-27T08:00:00Z",
	};

	beforeEach(async () => {
		await db.items.clear();
		await db.outbox.clear();
		await db.locations.clear();
		await db.meta.clear();
		await db.items.bulkPut([consumableItem, assetItem]);
	});

	describe("1. Empat Operasi Transaksi Inti (take, add, borrow, return)", () => {
		it("executes 'take' transaction: reduces consumable stock and records synced outbox", async () => {
			const result = await enqueueAndProcessTransaction({
				item: consumableItem,
				action: "take",
				formData: {
					quantity: 3,
					notes: "Kebutuhan audit lapangan",
					reference_number: "REQ-TAKE-001",
				},
				employeeId: "emp-budi",
			});

			expect(result.success).toBe(true);
			expect(result.synced).toBe(true);
			expect(result.queued).toBe(false);
			expect(result.replayed).toBe(false);
			expect(result.message).toContain("berhasil");

			// Verifikasi stok backend MSW berkurang (20 -> 17)
			expect(mockItemStore["item-consumable-1"].current_stock).toBe(17);

			// Verifikasi entri Dexie outbox berstatus 'synced'
			const outboxInDb = await db.outbox.get(result.outboxItem.clientUuid);
			expect(outboxInDb?.status).toBe("synced");
			expect(outboxInDb?.quantity).toBe(3);

			// Verifikasi stok lokal Dexie terbarui sesuai server
			const localItem = await db.items.get("item-consumable-1");
			expect(localItem?.current_stock).toBe(17);
		});

		it("executes 'add' transaction: increases consumable stock and records synced outbox", async () => {
			const result = await enqueueAndProcessTransaction({
				item: consumableItem,
				action: "add",
				formData: {
					quantity: 10,
					notes: "Restock dari vendor",
					reference_number: "PO-RESTOCK-99",
				},
				employeeId: "emp-siti",
			});

			expect(result.success).toBe(true);
			expect(result.synced).toBe(true);
			expect(result.queued).toBe(false);

			// Verifikasi stok backend MSW bertambah (20 -> 30)
			expect(mockItemStore["item-consumable-1"].current_stock).toBe(30);

			// Verifikasi stok lokal Dexie terbarui
			const localItem = await db.items.get("item-consumable-1");
			expect(localItem?.current_stock).toBe(30);
		});

		it("executes 'borrow' transaction: reduces available asset stock and increases borrowed_quantity", async () => {
			const result = await enqueueAndProcessTransaction({
				item: assetItem,
				action: "borrow",
				formData: {
					quantity: 4,
					notes: "Dipinjam untuk presentasi direksi",
				},
				employeeId: "emp-budi",
			});

			expect(result.success).toBe(true);
			expect(result.synced).toBe(true);

			// Verifikasi stok backend MSW (10 -> 6 tersedia, 2 -> 6 dipinjam)
			expect(mockItemStore["item-asset-1"].current_stock).toBe(6);
			expect(mockItemStore["item-asset-1"].borrowed_quantity).toBe(6);

			// Verifikasi stok lokal Dexie
			const localItem = await db.items.get("item-asset-1");
			expect(localItem?.current_stock).toBe(6);
		});

		it("executes 'return' transaction: increases available asset stock and decreases borrowed_quantity", async () => {
			const result = await enqueueAndProcessTransaction({
				item: assetItem,
				action: "return",
				formData: {
					quantity: 2,
					notes: "Pengembalian proyektor selesai acara",
				},
				employeeId: "emp-budi",
			});

			expect(result.success).toBe(true);
			expect(result.synced).toBe(true);

			// Verifikasi stok backend MSW (10 -> 12 tersedia, 2 -> 0 dipinjam)
			expect(mockItemStore["item-asset-1"].current_stock).toBe(12);
			expect(mockItemStore["item-asset-1"].borrowed_quantity).toBe(0);

			// Verifikasi stok lokal Dexie
			const localItem = await db.items.get("item-asset-1");
			expect(localItem?.current_stock).toBe(12);
		});
	});

	describe("2. Idempotency & Replay Protection", () => {
		it("protects against double submission: replayed client_uuid does not duplicate stock mutation", async () => {
			const sharedClientUuid = "b2447990-252a-4db5-b82b-09e451fb264f";

			// Pengiriman pertama
			const firstResult = await enqueueAndProcessTransaction({
				item: consumableItem,
				action: "take",
				formData: {
					quantity: 5,
					notes: "Ambil pertama",
				},
				customClientUuid: sharedClientUuid,
				employeeId: "emp-budi",
			});

			expect(firstResult.success).toBe(true);
			expect(firstResult.replayed).toBe(false);
			expect(mockItemStore["item-consumable-1"].current_stock).toBe(15);

			// Pengiriman kedua (misal: klik ganda atau antrean terkirim ulang)
			const replayResult = await enqueueAndProcessTransaction({
				item: consumableItem,
				action: "take",
				formData: {
					quantity: 5,
					notes: "Ambil kedua (klik ganda)",
				},
				customClientUuid: sharedClientUuid,
				employeeId: "emp-budi",
			});

			expect(replayResult.success).toBe(true);
			expect(replayResult.replayed).toBe(true);

			// KRITIS: Stok backend MSW TETAP 15 (TIDAK menjadi 10)
			expect(mockItemStore["item-consumable-1"].current_stock).toBe(15);
		});
	});

	describe("3. Pemetaan Galat & Penanganan Kasus Ekstrem", () => {
		it("handles INSUFFICIENT_STOCK (422): marks outbox rejected and reverts optimistic stock", async () => {
			const result = await enqueueAndProcessTransaction({
				item: consumableItem,
				action: "take",
				formData: {
					quantity: 50, // Melebihi stok yang ada (20)
				},
				employeeId: "emp-budi",
			});

			expect(result.success).toBe(false);
			expect(result.rejected).toBe(true);
			expect(result.error?.code).toBe("INSUFFICIENT_STOCK");
			expect(result.message).toContain("Stok barang tidak mencukupi");

			// Outbox status tersimpan sebagai 'rejected'
			const outboxInDb = await db.outbox.get(result.outboxItem.clientUuid);
			expect(outboxInDb?.status).toBe("rejected");
			expect(outboxInDb?.lastError?.code).toBe("INSUFFICIENT_STOCK");

			// KRITIS: Stok lokal Dexie kembali utuh ke 20 (revert optimistik)
			const localItem = await db.items.get("item-consumable-1");
			expect(localItem?.current_stock).toBe(20);
		});

		it("handles LOAN_EXCEEDS_OUTSTANDING (422): rejects return exceeding borrowed count", async () => {
			const result = await enqueueAndProcessTransaction({
				item: assetItem,
				action: "return",
				formData: {
					quantity: 10, // Melebihi yang dipinjam (2)
				},
				employeeId: "emp-budi",
			});

			expect(result.success).toBe(false);
			expect(result.rejected).toBe(true);
			expect(result.error?.code).toBe("LOAN_EXCEEDS_OUTSTANDING");
			expect(result.message).toContain("Jumlah pengembalian melebihi");

			// Stok lokal kembali utuh ke 10
			const localItem = await db.items.get("item-asset-1");
			expect(localItem?.current_stock).toBe(10);
		});

		it("handles IDEMPOTENCY_CONFLICT (409): rejects conflicting user submission", async () => {
			const conflictUuid = "c182fa20-4050-4820-8020-567890abcdef";

			// Daftarkan transaksi pertama
			await enqueueAndProcessTransaction({
				item: consumableItem,
				action: "take",
				formData: { quantity: 2 },
				customClientUuid: conflictUuid,
			});

			// Aktifkan simulasi konflik pengguna di server
			mswControl.idempotencyUserConflict = true;

			// Coba submit ulang dengan UUID yang sama dari pengguna lain
			const conflictResult = await enqueueAndProcessTransaction({
				item: consumableItem,
				action: "take",
				formData: { quantity: 2 },
				customClientUuid: conflictUuid,
			});

			expect(conflictResult.success).toBe(false);
			expect(conflictResult.rejected).toBe(true);
			expect(conflictResult.error?.code).toBe("IDEMPOTENCY_CONFLICT");
		});

		it("handles UNAUTHENTICATED (401): keeps outbox pending without dropping queue", async () => {
			mswControl.simulateAuthExpired = true;

			const result = await enqueueAndProcessTransaction({
				item: consumableItem,
				action: "take",
				formData: { quantity: 2 },
			});

			expect(result.success).toBe(false);
			expect(result.authError).toBe(true);
			expect(result.queued).toBe(true);
			expect(result.error?.code).toBe("UNAUTHENTICATED");

			// Antrean TIDAK dihapus, status tetap 'pending' menunggu login ulang
			const outboxInDb = await db.outbox.get(result.outboxItem.clientUuid);
			expect(outboxInDb?.status).toBe("pending");
		});

		it("handles temporary server error (500) & network failure: keeps outbox pending for auto-retry", async () => {
			mswControl.simulateServerError = true;

			const result = await enqueueAndProcessTransaction({
				item: consumableItem,
				action: "take",
				formData: { quantity: 2 },
			});

			// Sifat retryable: success dianggap true (karena tersimpan di antrean perangkat)
			expect(result.queued).toBe(true);
			expect(result.synced).toBe(false);
			expect(result.error?.code).toBe("SERVER_ERROR");

			// Antrean berstatus 'pending' siap dikirim ulang oleh sync engine
			const outboxInDb = await db.outbox.get(result.outboxItem.clientUuid);
			expect(outboxInDb?.status).toBe("pending");
		});
	});
});
