import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Item, Location } from "@/types/api";
import { db } from "./db";

describe("IndexedDB Dexie Schema & Repository (P2.1)", () => {
	const mockLocations: Location[] = [
		{
			id: "loc-1",
			code: "RAK-01",
			name: "Lemari ATK Utama",
			description: "Penyimpanan kertas dan alat tulis",
		},
		{
			id: "loc-2",
			code: "RAK-02",
			name: "Gudang Elektronik & IT",
			description: "Penyimpanan proyektor dan kabel",
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
			sku: "ATK-PUL-BLK",
			name: "Pulpen Gel Hitam 0.5mm",
			type: "consumable",
			unit: "buah",
			location_id: "loc-1",
			current_stock: 2,
			minimum_stock: 5, // Low stock (current <= min)
			image_url: null,
			updated_at: "2026-10-26T10:00:00Z",
		},
		{
			id: "item-3",
			sku: "AST-PRJ-EPS",
			name: "Proyektor Epson EB-X400",
			type: "asset",
			unit: "unit",
			location_id: "loc-2",
			current_stock: 3,
			minimum_stock: 1,
			borrowed_quantity: 1,
			image_url: null,
			updated_at: "2026-10-26T10:00:00Z",
		},
		{
			id: "item-4",
			sku: "AST-KBL-HDMI",
			name: "Kabel HDMI 10 Meter",
			type: "asset",
			unit: "unit",
			location_id: "loc-2",
			current_stock: 0, // Empty stock
			minimum_stock: 2,
			borrowed_quantity: 4,
			image_url: null,
			updated_at: "2026-10-26T10:00:00Z",
		},
	];

	beforeEach(async () => {
		await db.items.clear();
		await db.locations.clear();
		await db.meta.clear();
		await db.outbox.clear();
		await db.diagnostic_logs.clear();
	});

	afterEach(async () => {
		await db.items.clear();
		await db.locations.clear();
		await db.meta.clear();
		await db.outbox.clear();
		await db.diagnostic_logs.clear();
	});

	it("initializes stores and schema tables correctly", () => {
		expect(db.items).toBeDefined();
		expect(db.locations).toBeDefined();
		expect(db.meta).toBeDefined();
		expect(db.outbox).toBeDefined();
		expect(db.diagnostic_logs).toBeDefined();
		expect(db.name).toBe("inventory_iia_pwa");
	});

	it("stores, retrieves, and deletes sync metadata accurately", async () => {
		await db.setMeta("test_key", "test_value_123");
		const retrieved = await db.getMeta("test_key");
		expect(retrieved).toBe("test_value_123");

		const nonExistent = await db.getMeta("unknown_key");
		expect(nonExistent).toBeUndefined();

		await db.deleteMeta("test_key");
		const afterDelete = await db.getMeta("test_key");
		expect(afterDelete).toBeUndefined();
	});

	it("performs atomic bulkUpsertCatalog and updates ETag and timestamps", async () => {
		await db.bulkUpsertCatalog({
			items: mockItems,
			locations: mockLocations,
			etag: "etag-hash-v1",
			syncedAt: "2026-10-26T10:30:00Z",
		});

		const itemsCount = await db.items.count();
		const locationsCount = await db.locations.count();
		const savedEtag = await db.getMeta("catalog_etag");
		const lastSynced = await db.getMeta("catalog_last_synced_at");

		expect(itemsCount).toBe(4);
		expect(locationsCount).toBe(2);
		expect(savedEtag).toBe("etag-hash-v1");
		expect(lastSynced).toBe("2026-10-26T10:30:00Z");
	});

	it("prunes obsolete items when new catalog payload excludes them", async () => {
		// Initial sync with 4 items
		await db.bulkUpsertCatalog({
			items: mockItems,
			locations: mockLocations,
		});
		expect(await db.items.count()).toBe(4);

		// Second sync with only 2 items (item-3 and item-4 were deleted on server)
		const updatedItems = [mockItems[0], mockItems[1]];
		await db.bulkUpsertCatalog({
			items: updatedItems,
			etag: "etag-v2",
		});

		expect(await db.items.count()).toBe(2);
		const remainingIds = (await db.items.toArray()).map((i) => i.id);
		expect(remainingIds).toContain("item-1");
		expect(remainingIds).toContain("item-2");
		expect(remainingIds).not.toContain("item-3");
		expect(remainingIds).not.toContain("item-4");
	});

	describe("Multi-Dimensional Filtering & Search", () => {
		beforeEach(async () => {
			await db.bulkUpsertCatalog({
				items: mockItems,
				locations: mockLocations,
			});
		});

		it("returns all items when no options provided", async () => {
			const items = await db.getCatalogItems();
			expect(items.length).toBe(4);
		});

		it("filters items by locationId", async () => {
			const loc1Items = await db.getCatalogItems({ locationId: "loc-1" });
			expect(loc1Items.length).toBe(2);
			expect(loc1Items.every((i) => i.location_id === "loc-1")).toBe(true);

			const loc2Items = await db.getCatalogItems({ locationId: "loc-2" });
			expect(loc2Items.length).toBe(2);
			expect(loc2Items.every((i) => i.location_id === "loc-2")).toBe(true);
		});

		it("filters items by type (consumable vs asset)", async () => {
			const consumables = await db.getCatalogItems({ type: "consumable" });
			expect(consumables.length).toBe(2);
			expect(consumables.every((i) => i.type === "consumable")).toBe(true);

			const assets = await db.getCatalogItems({ type: "asset" });
			expect(assets.length).toBe(2);
			expect(assets.every((i) => i.type === "asset")).toBe(true);
		});

		it("utilizes compound index for location and type filtering", async () => {
			const compoundResult = await db.getCatalogItems({
				locationId: "loc-2",
				type: "asset",
			});
			expect(compoundResult.length).toBe(2);
			expect(compoundResult.map((i) => i.id)).toEqual(["item-3", "item-4"]);

			const emptyResult = await db.getCatalogItems({
				locationId: "loc-1",
				type: "asset",
			});
			expect(emptyResult.length).toBe(0);
		});

		it("filters items by free-text search on name or SKU (case-insensitive)", async () => {
			// Search by name lowercase
			const paperSearch = await db.getCatalogItems({ searchTerm: "kertas" });
			expect(paperSearch.length).toBe(1);
			expect(paperSearch[0].id).toBe("item-1");

			// Search by SKU uppercase
			const skuSearch = await db.getCatalogItems({ searchTerm: "HDMI" });
			expect(skuSearch.length).toBe(1);
			expect(skuSearch[0].id).toBe("item-4");

			// Search with leading/trailing spaces
			const trimmedSearch = await db.getCatalogItems({
				searchTerm: "  epson  ",
			});
			expect(trimmedSearch.length).toBe(1);
			expect(trimmedSearch[0].id).toBe("item-3");
		});

		it("filters items by stockStatus (low_or_empty vs available)", async () => {
			// low_or_empty: item-2 (stock 2 <= min 5), item-4 (stock 0 <= min 2)
			const lowStock = await db.getCatalogItems({
				stockStatus: "low_or_empty",
			});
			expect(lowStock.length).toBe(2);
			const lowIds = lowStock.map((i) => i.id);
			expect(lowIds).toContain("item-2");
			expect(lowIds).toContain("item-4");

			// available: current_stock > 0 (item-1, item-2, item-3)
			const available = await db.getCatalogItems({ stockStatus: "available" });
			expect(available.length).toBe(3);
			const availIds = available.map((i) => i.id);
			expect(availIds).not.toContain("item-4");
		});
	});

	it("clears catalog cache while strictly preserving outbox queue (zero data loss)", async () => {
		// Populate catalog
		await db.bulkUpsertCatalog({
			items: mockItems,
			locations: mockLocations,
			etag: "etag-v1",
		});

		// Populate critical offline outbox transaction
		await db.outbox.add({
			clientUuid: "uuid-offline-tx-1",
			employeeId: "emp-rdt",
			operation: "take",
			itemId: "item-1",
			quantity: 2,
			notes: "Pengambilan mendesak saat offline",
			occurredAt: "2026-10-26T10:35:00Z",
			status: "pending",
			attempts: 0,
			createdAt: "2026-10-26T10:35:00Z",
		});

		// Clear catalog cache
		await db.clearCatalog();

		// Items and locations must be cleared
		expect(await db.items.count()).toBe(0);
		expect(await db.locations.count()).toBe(0);
		expect(await db.getMeta("catalog_etag")).toBeUndefined();
		expect(await db.getMeta("catalog_last_synced_at")).toBeUndefined();

		// Outbox MUST be 100% intact!
		const outboxCount = await db.outbox.count();
		expect(outboxCount).toBe(1);
		const pendingItem = await db.outbox.get("uuid-offline-tx-1");
		expect(pendingItem?.clientUuid).toBe("uuid-offline-tx-1");
		expect(pendingItem?.status).toBe("pending");
	});

	it("accurately counts pending and syncing outbox items", async () => {
		await db.outbox.bulkAdd([
			{
				clientUuid: "tx-1",
				employeeId: "emp-1",
				operation: "take",
				itemId: "item-1",
				quantity: 1,
				occurredAt: "2026-10-26T10:00:00Z",
				status: "pending",
				attempts: 0,
				createdAt: "2026-10-26T10:00:00Z",
			},
			{
				clientUuid: "tx-2",
				employeeId: "emp-1",
				operation: "borrow",
				itemId: "item-2",
				quantity: 1,
				occurredAt: "2026-10-26T10:00:00Z",
				status: "syncing",
				attempts: 1,
				createdAt: "2026-10-26T10:00:00Z",
			},
			{
				clientUuid: "tx-3",
				employeeId: "emp-1",
				operation: "return",
				itemId: "item-3",
				quantity: 1,
				occurredAt: "2026-10-26T10:00:00Z",
				status: "synced", // already synced
				attempts: 1,
				createdAt: "2026-10-26T10:00:00Z",
			},
			{
				clientUuid: "tx-4",
				employeeId: "emp-1",
				operation: "add",
				itemId: "item-4",
				quantity: 5,
				occurredAt: "2026-10-26T10:00:00Z",
				status: "rejected", // rejected
				attempts: 1,
				createdAt: "2026-10-26T10:00:00Z",
			},
		]);

		const pendingCount = await db.getPendingOutboxCount();
		// tx-1 (pending) and tx-2 (syncing) = 2
		expect(pendingCount).toBe(2);
	});

	describe("Task P5.1: Dexie Versioned Outbox Schema & Ring-Buffer Diagnostics", () => {
		it("supports querying outbox using compound indices [employeeId+status], [itemId+status], and [status+createdAt]", async () => {
			await db.outbox.bulkAdd([
				{
					clientUuid: "p5-tx-1",
					employeeId: "emp-alice",
					operation: "take",
					itemId: "item-1",
					quantity: 2,
					occurredAt: "2026-10-28T09:00:00Z",
					status: "pending",
					attempts: 0,
					createdAt: "2026-10-28T09:00:00Z",
				},
				{
					clientUuid: "p5-tx-2",
					employeeId: "emp-alice",
					operation: "borrow",
					itemId: "item-2",
					quantity: 1,
					occurredAt: "2026-10-28T09:05:00Z",
					status: "failed",
					attempts: 2,
					nextAttemptAt: "2026-10-28T09:10:00Z",
					createdAt: "2026-10-28T09:05:00Z",
				},
				{
					clientUuid: "p5-tx-3",
					employeeId: "emp-bob",
					operation: "add",
					itemId: "item-1",
					quantity: 10,
					occurredAt: "2026-10-28T09:02:00Z",
					status: "pending",
					attempts: 0,
					createdAt: "2026-10-28T09:02:00Z",
				},
			]);

			// 1. Query by employeeId isolation
			const alicePending = await db.getPendingOutboxItems({
				employeeId: "emp-alice",
				includeFailed: true,
			});
			expect(alicePending.length).toBe(2);
			expect(alicePending.map((t) => t.clientUuid)).toEqual([
				"p5-tx-1",
				"p5-tx-2",
			]);

			const bobCount = await db.getPendingOutboxCount({
				employeeId: "emp-bob",
			});
			expect(bobCount).toBe(1);

			// 2. Query by itemId and status
			const item1Pending = await db.getOutboxItemsByItem("item-1", "pending");
			expect(item1Pending.length).toBe(2);
			expect(item1Pending.map((t) => t.clientUuid)).toEqual([
				"p5-tx-1",
				"p5-tx-3",
			]);
		});

		it("recovers abandoned 'syncing' items back to 'pending' state", async () => {
			await db.outbox.bulkAdd([
				{
					clientUuid: "crash-tx-1",
					employeeId: "emp-1",
					operation: "take",
					itemId: "item-1",
					quantity: 1,
					occurredAt: "2026-10-28T09:00:00Z",
					status: "syncing", // abandoned in-flight due to crash
					attempts: 1,
					createdAt: "2026-10-28T09:00:00Z",
				},
				{
					clientUuid: "stable-tx-2",
					employeeId: "emp-1",
					operation: "add",
					itemId: "item-2",
					quantity: 2,
					occurredAt: "2026-10-28T09:01:00Z",
					status: "pending",
					attempts: 0,
					createdAt: "2026-10-28T09:01:00Z",
				},
			]);

			const resetCount = await db.resetAbandonedSyncingItems();
			expect(resetCount).toBe(1);

			const recovered = await db.getOutboxItemByUuid("crash-tx-1");
			expect(recovered?.status).toBe("pending");
		});

		it("records diagnostic logs with ring buffer cap enforcement and text export", async () => {
			// Add 4 logs with maxEntries cap of 3
			await db.addDiagnosticLog(
				{
					timestamp: "2026-10-28T09:00:00Z",
					level: "info",
					category: "SYNC",
					message: "Sync engine initialized",
				},
				3,
			);
			await db.addDiagnosticLog(
				{
					timestamp: "2026-10-28T09:01:00Z",
					level: "warn",
					category: "NETWORK",
					message: "Network jitter detected",
				},
				3,
			);
			await db.addDiagnosticLog(
				{
					timestamp: "2026-10-28T09:02:00Z",
					level: "error",
					category: "TRANSACTION",
					message: "Payload rejected by server",
					details: { code: "INSUFFICIENT_STOCK" },
				},
				3,
			);
			await db.addDiagnosticLog(
				{
					timestamp: "2026-10-28T09:03:00Z",
					level: "info",
					category: "RETRY",
					message: "Retrying pending queue",
				},
				3,
			);

			// Count must be capped at 3 (oldest 'Sync engine initialized' evicted)
			const logsCount = await db.diagnostic_logs.count();
			expect(logsCount).toBe(3);

			const logs = await db.getDiagnosticLogs();
			expect(logs.length).toBe(3);
			expect(logs[0].message).toBe("Retrying pending queue"); // latest first

			const textExport = await db.exportDiagnosticLogsAsText();
			expect(textExport).toContain("[INFO] [RETRY] Retrying pending queue");
			expect(textExport).toContain("INSUFFICIENT_STOCK");
			expect(textExport).not.toContain("Sync engine initialized");

			// Clear logs
			await db.clearDiagnosticLogs();
			expect(await db.diagnostic_logs.count()).toBe(0);
		});

		it("executes version 3 upgrade handler to backfill default attributes on legacy outbox records", async () => {
			const MIGRATION_TEST_DB = "test_migration_p5_db";
			await Dexie.delete(MIGRATION_TEST_DB);

			// Step 1: Inisialisasi DB versi 1 dengan data lama tanpa kolom P5
			const v1Db = new Dexie(MIGRATION_TEST_DB);
			v1Db.version(1).stores({
				outbox: "clientUuid, employeeId, operation, itemId, status, createdAt",
			});
			await v1Db.open();

			await v1Db.table("outbox").add({
				clientUuid: "legacy-tx-1",
				employeeId: "emp-legacy",
				operation: "take",
				itemId: "item-1",
				quantity: 3,
				occurredAt: "2026-10-25T10:00:00Z",
				status: "pending",
				createdAt: "2026-10-25T10:00:00Z",
			});
			v1Db.close();

			// Step 2: Buka kembali DB dengan migrasi versi 3
			const v3Db = new Dexie(MIGRATION_TEST_DB);
			v3Db.version(1).stores({
				outbox: "clientUuid, employeeId, operation, itemId, status, createdAt",
			});
			v3Db.version(2).stores({
				items: "id",
			});
			v3Db
				.version(3)
				.stores({
					outbox:
						"clientUuid, employeeId, operation, itemId, status, createdAt, nextAttemptAt, [status+createdAt], [itemId+status], [employeeId+status]",
					diagnostic_logs: "++id, timestamp, level, category, createdAt",
				})
				.upgrade(async (tx) => {
					await tx
						.table("outbox")
						.toCollection()
						.modify((item: Record<string, unknown>) => {
							if (typeof item.attempts !== "number") {
								item.attempts = 0;
							}
							if (item.nextAttemptAt === undefined) {
								item.nextAttemptAt = null;
							}
							if (item.lastError === undefined) {
								item.lastError = null;
							}
						});
				});

			await v3Db.open();
			const upgradedRecord = await v3Db.table("outbox").get("legacy-tx-1");

			expect(upgradedRecord).toBeDefined();
			expect(upgradedRecord.attempts).toBe(0);
			expect(upgradedRecord.nextAttemptAt).toBeNull();
			expect(upgradedRecord.lastError).toBeNull();

			v3Db.close();
			await Dexie.delete(MIGRATION_TEST_DB);
		});
	});
});
