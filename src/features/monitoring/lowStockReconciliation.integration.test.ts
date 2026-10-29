import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
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
import type { Item, Location } from "@/types/api";
import { getLowStockReportApi } from "./api/getLowStockReport";
import { reconcileLowStockReports } from "./lib/reconciliationEngine";
import { calculateStockMetrics } from "./lib/stockCalculators";

describe("Gate P6 Integration Test: Verifikasi Angka vs /reports/low-stock (DoD P6)", () => {
	const mockLocations: Location[] = [
		{ id: "loc-1", name: "Gudang Utama - Rak A1", code: "WH-A1" },
	];

	// Backend server database simulation
	const serverLowStockItems: Item[] = [
		{
			id: "item-1",
			sku: "ATK-PPR-001",
			name: "Kertas A4 70gsm",
			type: "consumable",
			unit: "rim",
			location_id: "loc-1",
			current_stock: 0, // out of stock
			minimum_stock: 20,
			image_url: null,
			is_active: true,
			updated_at: "2026-10-29T00:00:00.000Z",
		},
		{
			id: "item-2",
			sku: "PPE-GLV-001",
			name: "Sarung Tangan Las",
			type: "consumable",
			unit: "pasang",
			location_id: "loc-1",
			current_stock: 3, // critical (3 <= 5)
			minimum_stock: 10,
			image_url: null,
			is_active: true,
			updated_at: "2026-10-29T00:00:00.000Z",
		},
	];

	// Full catalog in local IndexedDB (termasuk item healthy)
	const localCatalogItems: Item[] = [
		...serverLowStockItems,
		{
			id: "item-3",
			sku: "AST-FLK-087",
			name: "Multimeter Fluke 87V",
			type: "asset",
			unit: "unit",
			location_id: "loc-1",
			current_stock: 10, // healthy (10 > 2)
			minimum_stock: 2,
			image_url: null,
			is_active: true,
			updated_at: "2026-10-29T00:00:00.000Z",
		},
	];

	const server = setupServer(
		http.get("*/api/v1/inventory/reports/low-stock", () => {
			return HttpResponse.json({
				success: true,
				data: serverLowStockItems,
				message: "Berhasil memuat daftar barang stok rendah.",
			});
		}),
	);

	beforeAll(() => server.listen());
	afterEach(() => server.resetHandlers());
	afterAll(() => server.close());

	beforeEach(async () => {
		await db.items.clear();
		await db.locations.clear();
		await db.outbox.clear();

		await db.locations.bulkPut(mockLocations);
		await db.items.bulkPut(localCatalogItems);
	});

	it("DoD Gate P6.3: Angka dashboard stok rendah di frontend cocok 100% dengan endpoint server /reports/low-stock", async () => {
		// 1. Ambil data katalog lokal dan hitung metrik monitoring
		const localItems = await db.items.toArray();
		const localLocations = await db.locations.toArray();
		const locationMap = new Map(localLocations.map((l) => [l.id, l]));

		const localMetrics = calculateStockMetrics(localItems, [], locationMap);

		// 2. Panggil endpoint server /reports/low-stock
		const serverItems = await getLowStockReportApi();

		// 3. Jalankan rekonsiliasi
		const reconciliation = reconcileLowStockReports({
			localUrgentItems: localMetrics.urgentItems,
			serverItems,
			isOnline: true,
		});

		// Verifikasi DoD Gate P6:
		// Angka frontend harus cocok persis dengan server
		expect(reconciliation.status).toBe("reconciled");
		expect(reconciliation.isMatching).toBe(true);
		expect(reconciliation.localCount).toBe(2);
		expect(reconciliation.serverCount).toBe(2);
		expect(reconciliation.discrepancyCount).toBe(0);

		// Verifikasi ID item yang tergolong stok rendah identik
		const localIds = localMetrics.urgentItems.map((u) => u.item.id).sort();
		const remoteIds = serverItems.map((s) => s.id).sort();
		expect(localIds).toEqual(remoteIds);
	});

	it("DoD Gate P6: Mampu beroperasi 100% saat offline (mode pesawat) dengan graceful degradation", async () => {
		const localItems = await db.items.toArray();
		const localLocations = await db.locations.toArray();
		const locationMap = new Map(localLocations.map((l) => [l.id, l]));

		// Simulasikan mode offline
		const localMetrics = calculateStockMetrics(localItems, [], locationMap);

		const reconciliation = reconcileLowStockReports({
			localUrgentItems: localMetrics.urgentItems,
			serverItems: null,
			isOnline: false,
		});

		expect(reconciliation.status).toBe("offline_fallback");
		expect(reconciliation.localCount).toBe(2);
		expect(reconciliation.serverCount).toBeNull();
		// Dashboard tetap memiliki data metrik valid dari IndexedDB
		expect(localMetrics.totalActiveItems).toBe(3);
		expect(localMetrics.healthyCount).toBe(1);
		expect(localMetrics.outOfStockCount).toBe(1);
		expect(localMetrics.criticalCount).toBe(1);
	});

	it("Divergensi terkendali: mutasi offline outbox diakui secara transparan tanpa merusak rekonsiliasi", async () => {
		// Auditor mengambil 10 Multimeter (item-3) secara offline sehingga stoknya menjadi 0 (habis)
		await db.items.update("item-3", { current_stock: 0 });
		await db.outbox.put({
			clientUuid: "outbox-take-multimeter",
			employeeId: "emp-auditor-1",
			operation: "take",
			itemId: "item-3",
			quantity: 10,
			status: "pending",
			occurredAt: new Date().toISOString(),
			createdAt: new Date().toISOString(),
			attempts: 0,
		});

		const localItems = await db.items.toArray();
		const pendingOutbox = await db.outbox.toArray();
		const localLocations = await db.locations.toArray();
		const locationMap = new Map(localLocations.map((l) => [l.id, l]));

		const localMetrics = calculateStockMetrics(
			localItems,
			pendingOutbox,
			locationMap,
		);
		const serverItems = await getLowStockReportApi();

		const reconciliation = reconcileLowStockReports({
			localUrgentItems: localMetrics.urgentItems,
			serverItems,
			pendingOutboxItems: pendingOutbox,
			isOnline: true,
		});

		// Lokal mendeteksi 3 item stok rendah (item-1, item-2, item-3), sedangkan server baru tahu 2
		expect(reconciliation.status).toBe("divergent_pending_mutations");
		expect(reconciliation.localCount).toBe(3);
		expect(reconciliation.serverCount).toBe(2);
		expect(reconciliation.localOnlyItemIds).toEqual(["item-3"]);
		expect(reconciliation.canRefreshCatalog).toBe(false);
	});
});
