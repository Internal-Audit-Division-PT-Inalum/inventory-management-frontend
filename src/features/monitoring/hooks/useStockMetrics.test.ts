import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CATALOG_SYNC_EVENT } from "@/features/catalog/api/syncCatalog";
import { TRANSACTION_COMMITTED_EVENT } from "@/features/transactions/lib/outboxEvents";
import { db } from "@/lib/db";
import type { Item, Location } from "@/types/api";
import { useStockMetrics } from "./useStockMetrics";

describe("useStockMetrics Hook (Task P6.1)", () => {
	const mockLocations: Location[] = [
		{
			id: "loc-1",
			code: "RAK-01",
			name: "Gudang Utama - Rak A1",
			description: "Penyimpanan alat pelindung diri",
		},
		{
			id: "loc-2",
			code: "RAK-02",
			name: "Gudang Peralatan - Rak B2",
			description: "Penyimpanan instrumen uji",
		},
	];

	const mockItems: Item[] = [
		{
			id: "item-1",
			sku: "PPE-GLV-001",
			name: "Sarung Tangan Las",
			type: "consumable",
			unit: "pasang",
			location_id: "loc-1",
			current_stock: 0, // out of stock
			minimum_stock: 10,
			image_url: null,
			is_active: true,
			updated_at: "2026-10-29T00:00:00.000Z",
		},
		{
			id: "item-2",
			sku: "PPE-MSK-001",
			name: "Masker N95",
			type: "consumable",
			unit: "box",
			location_id: "loc-1",
			current_stock: 4, // critical (4 <= 5)
			minimum_stock: 10,
			image_url: null,
			is_active: true,
			updated_at: "2026-10-29T00:00:00.000Z",
		},
		{
			id: "item-3",
			sku: "ATK-KTS-A4",
			name: "Kertas A4 70gsm",
			type: "consumable",
			unit: "rim",
			location_id: "loc-1",
			current_stock: 8, // low (8 <= 10)
			minimum_stock: 10,
			image_url: null,
			is_active: true,
			updated_at: "2026-10-29T00:00:00.000Z",
		},
		{
			id: "item-4",
			sku: "AST-FLK-087",
			name: "Multimeter Fluke 87V",
			type: "asset",
			unit: "unit",
			location_id: "loc-2",
			current_stock: 5, // healthy (5 > 2)
			minimum_stock: 2,
			image_url: null,
			is_active: true,
			updated_at: "2026-10-29T00:00:00.000Z",
		},
	];

	beforeEach(async () => {
		await db.items.clear();
		await db.locations.clear();
		await db.outbox.clear();

		await db.locations.bulkPut(mockLocations);
		await db.items.bulkPut(mockItems);
	});

	afterEach(async () => {
		await db.items.clear();
		await db.locations.clear();
		await db.outbox.clear();
	});

	it("memuat dan mengkalkulasi metrik kesehatan stok dari IndexedDB", async () => {
		const { result } = renderHook(() => useStockMetrics());

		await waitFor(() => {
			expect(result.current.isLoading).toBe(false);
		});

		expect(result.current.metrics.totalActiveItems).toBe(4);
		expect(result.current.metrics.outOfStockCount).toBe(1);
		expect(result.current.metrics.criticalCount).toBe(1);
		expect(result.current.metrics.lowStockCount).toBe(1);
		expect(result.current.metrics.healthyCount).toBe(1);
		expect(result.current.metrics.attentionNeededCount).toBe(3);
		expect(result.current.metrics.healthRatioPercent).toBe(25.0);

		// Memverifikasi daftar urgentItems
		expect(result.current.urgentItems).toHaveLength(3);
		expect(result.current.urgentItems[0].status).toBe("out_of_stock");
		expect(result.current.urgentItems[0].item.sku).toBe("PPE-GLV-001");
		expect(result.current.urgentItems[1].status).toBe("critical");
		expect(result.current.urgentItems[1].item.sku).toBe("PPE-MSK-001");
		expect(result.current.urgentItems[2].status).toBe("low");
		expect(result.current.urgentItems[2].item.sku).toBe("ATK-KTS-A4");
	});

	it("memperbarui metrik secara reaktif saat TRANSACTION_COMMITTED_EVENT dipicu", async () => {
		const { result } = renderHook(() => useStockMetrics());

		await waitFor(() => {
			expect(result.current.isLoading).toBe(false);
		});

		expect(result.current.metrics.outOfStockCount).toBe(1);

		// Simulasikan restok offline: item-1 bertambah dari 0 menjadi 20
		await db.items.update("item-1", { current_stock: 20 });

		act(() => {
			window.dispatchEvent(new CustomEvent(TRANSACTION_COMMITTED_EVENT));
		});

		await waitFor(() => {
			expect(result.current.metrics.outOfStockCount).toBe(0);
			expect(result.current.metrics.healthyCount).toBe(2);
		});
	});

	it("memperbarui metrik saat CATALOG_SYNC_EVENT dipicu", async () => {
		const { result } = renderHook(() => useStockMetrics());

		await waitFor(() => {
			expect(result.current.isLoading).toBe(false);
		});

		// Tambahkan item baru ke IndexedDB
		await db.items.add({
			id: "item-5",
			sku: "PPE-HLM-001",
			name: "Helm Safety Putih",
			type: "consumable",
			unit: "buah",
			location_id: "loc-1",
			current_stock: 1, // critical (1 <= 5)
			minimum_stock: 10,
			image_url: null,
			is_active: true,
			updated_at: "2026-10-29T00:00:00.000Z",
		});

		act(() => {
			window.dispatchEvent(new CustomEvent(CATALOG_SYNC_EVENT));
		});

		await waitFor(() => {
			expect(result.current.metrics.totalActiveItems).toBe(5);
			expect(result.current.metrics.criticalCount).toBe(2);
		});
	});

	it("mendukung filter lokasi pada hook", async () => {
		const { result } = renderHook(() =>
			useStockMetrics({ locationId: "loc-2" }),
		);

		await waitFor(() => {
			expect(result.current.isLoading).toBe(false);
		});

		expect(result.current.metrics.totalActiveItems).toBe(1);
		expect(result.current.metrics.healthyCount).toBe(1);
		expect(result.current.urgentItems).toHaveLength(0);
	});
});
