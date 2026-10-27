import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import { db } from "@/lib/db";
import type { Item, Location } from "@/types/api";
import { getCatalog } from "./api/getCatalog";
import { getLocations } from "./api/getLocations";
import { CATALOG_SYNC_EVENT, syncCatalog } from "./api/syncCatalog";
import { useCatalogSync } from "./hooks/useCatalogSync";

describe("Catalog Synchronization & ETag Engine (P2.2)", () => {
	const mockLocations: Location[] = [
		{
			id: "loc-1",
			code: "RAK-01",
			name: "Lemari ATK Utama",
			description: "Penyimpanan kertas dan alat tulis",
		},
	];

	const mockItems: Item[] = [
		{
			id: "item-1",
			sku: "ATK-KTS-A4",
			name: "Kertas HVS A4 80gr",
			type: "consumable",
			unit: "rim",
			location_id: "loc-1",
			current_stock: 20,
			minimum_stock: 5,
			image_url: null,
			updated_at: "2026-10-26T10:00:00Z",
		},
		{
			id: "item-2",
			sku: "AST-PRJ-EPS",
			name: "Proyektor Epson EB-X400",
			type: "asset",
			unit: "unit",
			location_id: "loc-1",
			current_stock: 3,
			minimum_stock: 1,
			borrowed_quantity: 1,
			image_url: null,
			updated_at: "2026-10-26T10:00:00Z",
		},
	];

	beforeEach(async () => {
		await db.items.clear();
		await db.locations.clear();
		await db.meta.clear();
		vi.restoreAllMocks();
	});

	afterEach(async () => {
		await db.items.clear();
		await db.locations.clear();
		await db.meta.clear();
		vi.restoreAllMocks();
	});

	describe("getCatalog API Client", () => {
		it("sends If-None-Match header when etag is provided", async () => {
			const apiSpy = vi.spyOn(api, "get").mockResolvedValueOnce({
				status: 304,
				data: null,
				headers: { etag: '"etag-304-test"' },
			});

			const result = await getCatalog({ etag: "etag-304-test" });

			expect(apiSpy).toHaveBeenCalledWith(
				"/inventory/catalog",
				expect.objectContaining({
					headers: { "If-None-Match": '"etag-304-test"' },
				}),
			);
			expect(result.notModified).toBe(true);
			if (result.notModified) {
				expect(result.etag).toBe("etag-304-test");
			}
		});

		it("returns items and new etag on HTTP 200 response", async () => {
			vi.spyOn(api, "get").mockResolvedValueOnce({
				status: 200,
				data: {
					success: true,
					data: mockItems,
					meta: { generated_at: "2026-10-26T10:00:00Z" },
				},
				headers: { etag: '"etag-new-200"' },
			});

			const result = await getCatalog();

			expect(result.notModified).toBe(false);
			if (!result.notModified) {
				expect(result.items.length).toBe(2);
				expect(result.etag).toBe("etag-new-200");
				expect(result.generatedAt).toBe("2026-10-26T10:00:00Z");
			}
		});
	});

	describe("getLocations API Client", () => {
		it("fetches locations and returns data array", async () => {
			vi.spyOn(api, "get").mockResolvedValueOnce({
				status: 200,
				data: {
					success: true,
					data: mockLocations,
				},
				headers: {},
			});

			const locations = await getLocations();
			expect(locations.length).toBe(1);
			expect(locations[0].code).toBe("RAK-01");
		});
	});

	describe("syncCatalog Engine", () => {
		it("handles 200 OK: saves items, locations, and etag into Dexie", async () => {
			vi.spyOn(api, "get").mockImplementation((url: string) => {
				if (url.includes("/inventory/catalog")) {
					return Promise.resolve({
						status: 200,
						data: {
							success: true,
							data: mockItems,
							meta: { generated_at: "2026-10-26T10:30:00Z" },
						},
						headers: { etag: '"hash-catalog-v1"' },
					});
				}
				if (url.includes("/inventory/locations")) {
					return Promise.resolve({
						status: 200,
						data: {
							success: true,
							data: mockLocations,
						},
						headers: {},
					});
				}
				return Promise.reject(new Error("Unknown URL"));
			});

			const eventListener = vi.fn();
			window.addEventListener(CATALOG_SYNC_EVENT, eventListener);

			const syncResult = await syncCatalog({ forceLocations: true });

			expect(syncResult.success).toBe(true);
			expect(syncResult.notModified).toBe(false);
			expect(syncResult.itemsCount).toBe(2);
			expect(syncResult.locationsCount).toBe(1);
			expect(syncResult.etag).toBe("hash-catalog-v1");

			// Verify in Dexie
			expect(await db.items.count()).toBe(2);
			expect(await db.locations.count()).toBe(1);
			expect(await db.getMeta("catalog_etag")).toBe("hash-catalog-v1");
			expect(await db.getMeta("catalog_last_synced_at")).toBeDefined();
			expect(eventListener).toHaveBeenCalledTimes(1);

			window.removeEventListener(CATALOG_SYNC_EVENT, eventListener);
		});

		it("handles 304 Not Modified: preserves items and updates timestamp without write churn", async () => {
			// Populate initial items
			await db.bulkUpsertCatalog({
				items: mockItems,
				locations: mockLocations,
				etag: "hash-catalog-v1",
				syncedAt: "2026-10-26T10:00:00Z",
			});

			vi.spyOn(api, "get").mockImplementation((url: string) => {
				if (url.includes("/inventory/catalog")) {
					return Promise.resolve({
						status: 304,
						data: null,
						headers: { etag: '"hash-catalog-v1"' },
					});
				}
				return Promise.resolve({ status: 200, data: { data: [] } });
			});

			const syncResult = await syncCatalog();

			expect(syncResult.success).toBe(true);
			expect(syncResult.notModified).toBe(true);
			expect(syncResult.itemsCount).toBe(2);
			expect(syncResult.etag).toBe("hash-catalog-v1");

			// Items should remain 2
			expect(await db.items.count()).toBe(2);
		});

		it("handles offline state gracefully without network call", async () => {
			// Populate existing cache
			await db.bulkUpsertCatalog({
				items: mockItems,
				locations: mockLocations,
				etag: "hash-offline",
			});

			// Set offline
			vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
			const apiSpy = vi.spyOn(api, "get");

			const result = await syncCatalog();

			expect(apiSpy).not.toHaveBeenCalled();
			expect(result.isOffline).toBe(true);
			expect(result.itemsCount).toBe(2);
			expect(result.etag).toBe("hash-offline");
		});

		it("catches network failure safely and returns fallback state", async () => {
			vi.spyOn(api, "get").mockRejectedValueOnce(new Error("Network Timeout"));

			const result = await syncCatalog();

			expect(result.success).toBe(false);
			expect(result.isOffline).toBe(true);
			expect(result.error).toBe("Network Timeout");
		});
	});

	describe("useCatalogSync React Hook", () => {
		it("initializes with stored metadata and allows manual syncNow", async () => {
			await db.setMeta("catalog_etag", "initial-etag");
			await db.setMeta("catalog_last_synced_at", "2026-10-26T09:00:00Z");

			vi.spyOn(api, "get").mockResolvedValue({
				status: 304,
				data: null,
				headers: { etag: '"initial-etag"' },
			});

			const { result } = renderHook(() =>
				useCatalogSync({ autoSync: false, syncOnMount: false }),
			);

			// Initial state
			expect(result.current.isSyncing).toBe(false);

			// Trigger manual syncNow
			await act(async () => {
				await result.current.syncNow();
			});

			expect(result.current.isSyncing).toBe(false);
			expect(result.current.lastSyncedAt).toBeDefined();
		});

		it("prevents overlapping concurrent sync calls", async () => {
			await db.locations.add({
				id: "loc-1",
				code: "RAK-01",
				name: "Lemari ATK",
			});

			let resolveCall: (val: unknown) => void = () => {};
			const slowPromise = new Promise((resolve) => {
				resolveCall = resolve;
			});

			const apiSpy = vi
				.spyOn(api, "get")
				.mockImplementation(
					() => slowPromise as unknown as ReturnType<typeof api.get>,
				);

			const { result } = renderHook(() =>
				useCatalogSync({ autoSync: false, syncOnMount: false }),
			);

			// Call sync twice simultaneously
			let firstCall: Promise<unknown>;
			let secondCall: Promise<unknown>;

			act(() => {
				firstCall = result.current.syncNow();
				secondCall = result.current.syncNow();
			});

			// Wait microtasks so syncCatalog reaches api.get
			await vi.waitFor(() => {
				expect(apiSpy).toHaveBeenCalledTimes(1);
			});

			// Resolve the slow promise
			await act(async () => {
				resolveCall({
					status: 304,
					data: null,
					headers: { etag: '"etag"' },
				});
				await Promise.all([firstCall, secondCall]);
			});

			expect(apiSpy).toHaveBeenCalledTimes(1);
		});
	});
});
