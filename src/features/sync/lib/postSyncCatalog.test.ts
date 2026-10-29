import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as catalogSyncModule from "@/features/catalog/api/syncCatalog";
import { useCatalogSync } from "@/features/catalog/hooks/useCatalogSync";
import * as outboxQueueModule from "@/features/transactions/lib/outboxQueue";
import { api } from "@/lib/api";
import { db, type OutboxItem } from "@/lib/db";
import type { Item } from "@/types/api";
import { runSyncEngine } from "./syncEngine";
import { syncPauseController } from "./syncPauseController";

describe("Post-Sync Catalog Refresh Suite (Task P5.12)", () => {
	const mockItem: Item = {
		id: "item-p512-1",
		sku: "SKU-POST-SYNC",
		name: "Buku Catatan Auditor",
		type: "consumable",
		unit: "buah",
		location_id: "loc-1",
		current_stock: 20,
		minimum_stock: 5,
		image_url: null,
		updated_at: "2026-10-29T00:00:00Z",
	};

	const mockOutboxItem: OutboxItem = {
		clientUuid: "uuid-p512-tx-1",
		employeeId: "emp-p512",
		operation: "take",
		itemId: mockItem.id,
		quantity: 2,
		occurredAt: "2026-10-29T08:00:00Z",
		status: "pending",
		attempts: 0,
		createdAt: "2026-10-29T08:00:00Z",
	};

	beforeEach(async () => {
		localStorage.clear();
		await db.items.clear();
		await db.locations.clear();
		await db.outbox.clear();
		await db.diagnostic_logs.clear();
		await db.meta.clear();

		await db.items.add(mockItem);
		syncPauseController.resume();
		vi.restoreAllMocks();
	});

	afterEach(async () => {
		vi.restoreAllMocks();
		localStorage.clear();
		await db.items.clear();
		await db.outbox.clear();
		await db.meta.clear();
	});

	it("automatically invokes syncCatalog after transactions are successfully synced", async () => {
		await db.outbox.add(mockOutboxItem);

		// 1. Mock processPendingOutboxEntry agar sukses sinkron
		vi.spyOn(outboxQueueModule, "processPendingOutboxEntry").mockResolvedValue({
			success: true,
			synced: true,
			queued: false,
			outboxItem: { ...mockOutboxItem, status: "synced" },
			message: "Transaksi sukses",
		});

		// 2. Mock API get catalog agar mengembalikan data stok server terbaru (20 - 2 = 18)
		const updatedServerItem: Item = {
			...mockItem,
			current_stock: 18,
			updated_at: "2026-10-29T08:05:00Z",
		};

		vi.spyOn(api, "get").mockImplementation((url) => {
			if (typeof url === "string" && url.includes("/inventory/catalog")) {
				return Promise.resolve({
					status: 200,
					data: {
						success: true,
						data: [updatedServerItem],
					},
					headers: { etag: '"etag-server-v2"' },
				});
			}
			return Promise.resolve({ status: 200, data: [] });
		});

		const syncCatalogSpy = vi.spyOn(catalogSyncModule, "syncCatalog");

		// 3. Jalankan syncEngine
		const result = await runSyncEngine({ bypassTabLock: true });

		// 4. Verifikasi hasil syncEngine
		expect(result.syncedCount).toBe(1);
		expect(syncCatalogSpy).toHaveBeenCalledTimes(1);
		expect(result.catalogSyncResult).toBeDefined();
		expect(result.catalogSyncResult?.notModified).toBe(false);
		expect(result.catalogSyncResult?.etag).toBe("etag-server-v2");

		// 5. Verifikasi stok lokal di IndexedDB telah diselaraskan ke 18
		const localItem = await db.items.get(mockItem.id);
		expect(localItem?.current_stock).toBe(18);

		// 6. Verifikasi log diagnostik mencatat post-sync catalog refresh
		const logs = await db.diagnostic_logs
			.where({ category: "SYNC_ENGINE" })
			.toArray();
		const refreshLog = logs.find((l) =>
			l.message.includes("Post-sync catalog refreshed"),
		);
		expect(refreshLog).toBeDefined();
		expect(refreshLog?.message).toContain("1 items updated");
	});

	it("does NOT invoke syncCatalog when no transactions were synced (syncedCount === 0)", async () => {
		// Antrean outbox kosong
		const syncCatalogSpy = vi.spyOn(catalogSyncModule, "syncCatalog");

		const result = await runSyncEngine({ bypassTabLock: true });

		expect(result.syncedCount).toBe(0);
		expect(syncCatalogSpy).not.toHaveBeenCalled();
		expect(result.catalogSyncResult).toBeUndefined();
	});

	it("does NOT invoke syncCatalog when transactions failed or were rejected", async () => {
		await db.outbox.add(mockOutboxItem);

		// Mock processPendingOutboxEntry agar transaksi ditolak (rejected 422)
		vi.spyOn(outboxQueueModule, "processPendingOutboxEntry").mockResolvedValue({
			success: false,
			synced: false,
			queued: false,
			rejected: true,
			outboxItem: { ...mockOutboxItem, status: "rejected" },
			message: "Stok tidak mencukupi",
		});

		const syncCatalogSpy = vi.spyOn(catalogSyncModule, "syncCatalog");

		const result = await runSyncEngine({ bypassTabLock: true });

		expect(result.syncedCount).toBe(0);
		expect(result.rejectedCount).toBe(1);
		expect(syncCatalogSpy).not.toHaveBeenCalled();
	});

	it("bypasses syncCatalog when options.syncCatalogOnSuccess is explicitly false", async () => {
		await db.outbox.add(mockOutboxItem);

		vi.spyOn(outboxQueueModule, "processPendingOutboxEntry").mockResolvedValue({
			success: true,
			synced: true,
			queued: false,
			outboxItem: { ...mockOutboxItem, status: "synced" },
			message: "Transaksi sukses",
		});

		const syncCatalogSpy = vi.spyOn(catalogSyncModule, "syncCatalog");
		const dispatchSpy = vi.spyOn(window, "dispatchEvent");

		const result = await runSyncEngine({
			bypassTabLock: true,
			syncCatalogOnSuccess: false,
		});

		expect(result.syncedCount).toBe(1);
		expect(syncCatalogSpy).not.toHaveBeenCalled();
		expect(result.catalogSyncResult).toBeNull();

		// Fallback CATALOG_SYNC_EVENT tetap dipancarkan
		expect(dispatchSpy).toHaveBeenCalledWith(
			expect.objectContaining({ type: catalogSyncModule.CATALOG_SYNC_EVENT }),
		);
	});

	it("gracefully tolerates network errors during syncCatalog without breaking syncEngine result", async () => {
		await db.outbox.add(mockOutboxItem);

		vi.spyOn(outboxQueueModule, "processPendingOutboxEntry").mockResolvedValue({
			success: true,
			synced: true,
			queued: false,
			outboxItem: { ...mockOutboxItem, status: "synced" },
			message: "Transaksi sukses",
		});

		// Simulasikan syncCatalog melempar galat jaringan tak terduga
		vi.spyOn(catalogSyncModule, "syncCatalog").mockRejectedValueOnce(
			new Error("503 Service Unavailable"),
		);

		const dispatchSpy = vi.spyOn(window, "dispatchEvent");

		const result = await runSyncEngine({ bypassTabLock: true });

		// syncEngine tetap mengembalikan status sukses untuk transaksi outbox
		expect(result.syncedCount).toBe(1);
		expect(result.catalogSyncResult).toBeNull();

		// Fallback CATALOG_SYNC_EVENT dipancarkan
		expect(dispatchSpy).toHaveBeenCalledWith(
			expect.objectContaining({ type: catalogSyncModule.CATALOG_SYNC_EVENT }),
		);

		// Log diagnostik tingkat warn dicatat
		const logs = await db.diagnostic_logs
			.where({ category: "SYNC_ENGINE" })
			.toArray();
		const warnLog = logs.find(
			(l) =>
				l.level === "warn" &&
				l.message.includes("Post-sync catalog refresh encountered error"),
		);
		expect(warnLog).toBeDefined();
		expect(warnLog?.message).toContain("503 Service Unavailable");
	});

	it("reactively updates useCatalogSync hook state when CATALOG_SYNC_EVENT is dispatched post-sync", async () => {
		// Pasang hook useCatalogSync
		const { result } = renderHook(() =>
			useCatalogSync({ autoSync: false, syncOnMount: false }),
		);

		await vi.waitFor(() => {
			expect(result.current.isSyncing).toBe(false);
		});

		// Simulasikan emisi event CATALOG_SYNC_EVENT yang membawa detail hasil sinkronisasi
		const mockSyncDetail: catalogSyncModule.CatalogSyncResult = {
			success: true,
			notModified: false,
			itemsCount: 15,
			locationsCount: 2,
			etag: "etag-reactive-test",
			lastSyncedAt: "2026-10-29T08:10:00Z",
		};

		await act(async () => {
			window.dispatchEvent(
				new CustomEvent(catalogSyncModule.CATALOG_SYNC_EVENT, {
					detail: mockSyncDetail,
				}),
			);
		});

		// Verifikasi state hook useCatalogSync ter-update secara reaktif
		expect(result.current.lastSyncedAt).toBe("2026-10-29T08:10:00Z");
		expect(result.current.etag).toBe("etag-reactive-test");
		expect(result.current.isOffline).toBe(false);
	});
});
