import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import type { Item, Location } from "@/types/api";
import { CATALOG_SYNC_EVENT } from "./api/syncCatalog";
import { useCatalogItems } from "./hooks/useCatalogItems";
import { useCatalogLocations } from "./hooks/useCatalogLocations";

describe("Catalog Local Query & Filter Hooks (P2.3)", () => {
	const mockLocations: Location[] = [
		{
			id: "loc-b",
			code: "RAK-02",
			name: "Gudang Elektronik",
			description: "Penyimpanan aset dan kabel",
		},
		{
			id: "loc-a",
			code: "RAK-01",
			name: "Lemari ATK Utama",
			description: "Penyimpanan alat tulis kantor",
		},
	];

	const mockItems: Item[] = [
		{
			id: "item-1",
			sku: "ATK-KTS-A4",
			name: "Kertas HVS A4 80gr",
			type: "consumable",
			unit: "rim",
			location_id: "loc-a",
			current_stock: 50,
			minimum_stock: 10,
			image_url: null,
			updated_at: "2026-10-26T08:00:00Z",
		},
		{
			id: "item-2",
			sku: "ATK-PUL-BLK",
			name: "Pulpen Gel Hitam",
			type: "consumable",
			unit: "buah",
			location_id: "loc-a",
			current_stock: 5, // low stock (5 <= 10)
			minimum_stock: 10,
			image_url: null,
			updated_at: "2026-10-26T09:00:00Z",
		},
		{
			id: "item-3",
			sku: "AST-PRJ-EPS",
			name: "Proyektor Epson EB-X400",
			type: "asset",
			unit: "unit",
			location_id: "loc-b",
			current_stock: 2,
			minimum_stock: 1,
			borrowed_quantity: 3,
			image_url: null,
			updated_at: "2026-10-26T10:00:00Z",
		},
		{
			id: "item-4",
			sku: "AST-KBL-HDMI",
			name: "Kabel HDMI 15 Meter",
			type: "asset",
			unit: "unit",
			location_id: "loc-b",
			current_stock: 0, // out of stock
			minimum_stock: 2,
			borrowed_quantity: 5,
			image_url: null,
			updated_at: "2026-10-26T11:00:00Z",
		},
	];

	beforeEach(async () => {
		await db.items.clear();
		await db.locations.clear();
		await db.meta.clear();

		await db.locations.bulkPut(mockLocations);
		await db.items.bulkPut(mockItems);
	});

	afterEach(async () => {
		await db.items.clear();
		await db.locations.clear();
		await db.meta.clear();
		vi.restoreAllMocks();
	});

	describe("useCatalogLocations Hook", () => {
		it("loads and sorts locations alphabetically by name", async () => {
			const { result } = renderHook(() => useCatalogLocations());

			await waitFor(() => {
				expect(result.current.isLoading).toBe(false);
			});

			expect(result.current.locations.length).toBe(2);
			// Sorted by name: "Gudang Elektronik" then "Lemari ATK Utama"
			expect(result.current.locations[0].name).toBe("Gudang Elektronik");
			expect(result.current.locations[1].name).toBe("Lemari ATK Utama");

			// Check locationMap lookup
			expect(result.current.locationMap.get("loc-a")?.code).toBe("RAK-01");
			expect(result.current.locationMap.get("loc-b")?.code).toBe("RAK-02");
		});
	});

	describe("useCatalogItems Hook", () => {
		it("returns all items sorted alphabetically by name by default", async () => {
			const { result } = renderHook(() => useCatalogItems());

			await waitFor(() => {
				expect(result.current.isLoading).toBe(false);
			});

			expect(result.current.items.length).toBe(4);
			// Default sort: "Kabel HDMI 15 Meter", "Kertas HVS A4 80gr", "Proyektor Epson...", "Pulpen Gel Hitam"
			expect(result.current.items[0].name).toBe("Kabel HDMI 15 Meter");
			expect(result.current.items[1].name).toBe("Kertas HVS A4 80gr");
			expect(result.current.items[2].name).toBe("Proyektor Epson EB-X400");
			expect(result.current.items[3].name).toBe("Pulpen Gel Hitam");
		});

		it("enriches items with location entity from locationMap", async () => {
			const { result } = renderHook(() => useCatalogItems());

			await waitFor(() => {
				expect(result.current.isLoading).toBe(false);
			});

			const paper = result.current.items.find((i) => i.id === "item-1");
			expect(paper?.location).toBeDefined();
			expect(paper?.location?.name).toBe("Lemari ATK Utama");
			expect(paper?.location?.code).toBe("RAK-01");

			const projector = result.current.items.find((i) => i.id === "item-3");
			expect(projector?.location).toBeDefined();
			expect(projector?.location?.name).toBe("Gudang Elektronik");
		});

		it("filters items by searchTerm on name or SKU", async () => {
			const { result: nameSearch } = renderHook(() =>
				useCatalogItems({ searchTerm: "proyektor" }),
			);

			await waitFor(() => {
				expect(nameSearch.current.isLoading).toBe(false);
			});
			expect(nameSearch.current.items.length).toBe(1);
			expect(nameSearch.current.items[0].id).toBe("item-3");

			const { result: skuSearch } = renderHook(() =>
				useCatalogItems({ searchTerm: "ATK-PUL" }),
			);

			await waitFor(() => {
				expect(skuSearch.current.isLoading).toBe(false);
			});
			expect(skuSearch.current.items.length).toBe(1);
			expect(skuSearch.current.items[0].id).toBe("item-2");
		});

		it("filters items by locationId", async () => {
			const { result } = renderHook(() =>
				useCatalogItems({ locationId: "loc-a" }),
			);

			await waitFor(() => {
				expect(result.current.isLoading).toBe(false);
			});

			expect(result.current.items.length).toBe(2);
			expect(result.current.items.every((i) => i.location_id === "loc-a")).toBe(
				true,
			);
		});

		it("filters items by type (consumable vs asset)", async () => {
			const { result: consumables } = renderHook(() =>
				useCatalogItems({ type: "consumable" }),
			);

			await waitFor(() => {
				expect(consumables.current.isLoading).toBe(false);
			});
			expect(consumables.current.items.length).toBe(2);
			expect(
				consumables.current.items.every((i) => i.type === "consumable"),
			).toBe(true);

			const { result: assets } = renderHook(() =>
				useCatalogItems({ type: "asset" }),
			);

			await waitFor(() => {
				expect(assets.current.isLoading).toBe(false);
			});
			expect(assets.current.items.length).toBe(2);
			expect(assets.current.items.every((i) => i.type === "asset")).toBe(true);
		});

		it("filters items by stockStatus (low_or_empty vs available)", async () => {
			// low_or_empty: item-2 (stock 5 <= min 10), item-4 (stock 0 <= min 2)
			const { result: lowStock } = renderHook(() =>
				useCatalogItems({ stockStatus: "low_or_empty" }),
			);

			await waitFor(() => {
				expect(lowStock.current.isLoading).toBe(false);
			});
			expect(lowStock.current.items.length).toBe(2);
			const lowIds = lowStock.current.items.map((i) => i.id);
			expect(lowIds).toContain("item-2");
			expect(lowIds).toContain("item-4");

			// available: current_stock > 0 (item-1, item-2, item-3)
			const { result: available } = renderHook(() =>
				useCatalogItems({ stockStatus: "available" }),
			);

			await waitFor(() => {
				expect(available.current.isLoading).toBe(false);
			});
			expect(available.current.items.length).toBe(3);
			expect(available.current.items.map((i) => i.id)).not.toContain("item-4");
		});

		it("supports custom sorting options (stock_asc, stock_desc, sku, updated_at)", async () => {
			const { result: stockAsc } = renderHook(() =>
				useCatalogItems({ sortBy: "stock_asc" }),
			);
			await waitFor(() => {
				expect(stockAsc.current.isLoading).toBe(false);
			});
			// Stocks: 0, 5, 2, 50 -> item-4 (0), item-3 (2), item-2 (5), item-1 (50)
			expect(stockAsc.current.items[0].current_stock).toBe(0);
			expect(stockAsc.current.items[3].current_stock).toBe(50);

			const { result: stockDesc } = renderHook(() =>
				useCatalogItems({ sortBy: "stock_desc" }),
			);
			await waitFor(() => {
				expect(stockDesc.current.isLoading).toBe(false);
			});
			expect(stockDesc.current.items[0].current_stock).toBe(50);
			expect(stockDesc.current.items[3].current_stock).toBe(0);

			const { result: skuSort } = renderHook(() =>
				useCatalogItems({ sortBy: "sku" }),
			);
			await waitFor(() => {
				expect(skuSort.current.isLoading).toBe(false);
			});
			// AST-KBL-HDMI, AST-PRJ-EPS, ATK-KTS-A4, ATK-PUL-BLK
			expect(skuSort.current.items[0].sku).toBe("AST-KBL-HDMI");
		});

		it("calculates real-time catalog statistics correctly", async () => {
			const { result } = renderHook(() => useCatalogItems());

			await waitFor(() => {
				expect(result.current.isLoading).toBe(false);
			});

			const { stats } = result.current;
			expect(stats.totalItems).toBe(4);
			expect(stats.consumablesCount).toBe(2);
			expect(stats.assetsCount).toBe(2);
			expect(stats.lowStockCount).toBe(1); // item-2 (stock 5 <= min 10)
			expect(stats.outOfStockCount).toBe(1); // item-4 (stock 0)
			expect(stats.totalBorrowedAssets).toBe(8); // item-3 (3) + item-4 (5) = 8
		});

		it("evaluates hasActiveFilters boolean correctly", async () => {
			const { result: defaultHook } = renderHook(() => useCatalogItems());
			await waitFor(() => {
				expect(defaultHook.current.isLoading).toBe(false);
			});
			expect(defaultHook.current.hasActiveFilters).toBe(false);

			const { result: filteredHook } = renderHook(() =>
				useCatalogItems({ searchTerm: "kertas" }),
			);
			await waitFor(() => {
				expect(filteredHook.current.isLoading).toBe(false);
			});
			expect(filteredHook.current.hasActiveFilters).toBe(true);
		});

		it("re-queries automatically when CATALOG_SYNC_EVENT is dispatched", async () => {
			const { result } = renderHook(() => useCatalogItems());
			await waitFor(() => {
				expect(result.current.items.length).toBe(4);
			});

			// Add 1 new item to database directly
			await db.items.add({
				id: "item-5",
				sku: "ATK-STR-01",
				name: "Stapler Joyko HD-10",
				type: "consumable",
				unit: "buah",
				location_id: "loc-a",
				current_stock: 12,
				minimum_stock: 2,
				image_url: null,
				updated_at: "2026-10-26T12:00:00Z",
			});

			// Dispatch sync event
			act(() => {
				window.dispatchEvent(
					new CustomEvent(CATALOG_SYNC_EVENT, { detail: {} }),
				);
			});

			await waitFor(() => {
				expect(result.current.items.length).toBe(5);
			});
		});
	});
});
