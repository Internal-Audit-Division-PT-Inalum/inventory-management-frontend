import { describe, expect, it } from "vitest";
import type { OutboxItem } from "@/lib/db";
import type { Item } from "@/types/api";
import type { ItemStockHealth } from "../types";
import { reconcileLowStockReports } from "./reconciliationEngine";

describe("reconciliationEngine - Pure Logic Engine (Task P6.3)", () => {
	const createMockHealth = (id: string, name: string): ItemStockHealth => ({
		item: {
			id,
			name,
			sku: `SKU-${id}`,
			type: "consumable",
			unit: "buah",
			location_id: "loc-1",
			current_stock: 2,
			minimum_stock: 5,
			image_url: null,
			updated_at: "2026-10-29T00:00:00.000Z",
		},
		effectiveStock: 2,
		confirmedStock: 2,
		minimumStock: 5,
		status: "critical",
		deficit: 3,
		isEstimated: false,
		hasPendingTransactions: false,
		pendingTransactionsCount: 0,
	});

	const createMockServerItem = (id: string, name: string): Item => ({
		id,
		name,
		sku: `SKU-${id}`,
		type: "consumable",
		unit: "buah",
		location_id: "loc-1",
		current_stock: 2,
		minimum_stock: 5,
		image_url: null,
		updated_at: "2026-10-29T00:00:00.000Z",
	});

	it("menghasilkan status offline_fallback saat isOnline bernilai false atau serverItems bernilai null", () => {
		const localItems = [createMockHealth("item-1", "Barang 1")];

		const resultOffline = reconcileLowStockReports({
			localUrgentItems: localItems,
			serverItems: null,
			isOnline: false,
		});

		expect(resultOffline.status).toBe("offline_fallback");
		expect(resultOffline.isMatching).toBe(false);
		expect(resultOffline.localCount).toBe(1);
		expect(resultOffline.serverCount).toBeNull();
		expect(resultOffline.canRefreshCatalog).toBe(false);
	});

	it("menghasilkan status reconciled saat data lokal dan server 100% cocok", () => {
		const localItems = [
			createMockHealth("item-1", "Kertas A4"),
			createMockHealth("item-2", "Sarung Tangan Las"),
		];
		const serverItems = [
			createMockServerItem("item-1", "Kertas A4"),
			createMockServerItem("item-2", "Sarung Tangan Las"),
		];

		const result = reconcileLowStockReports({
			localUrgentItems: localItems,
			serverItems,
			isOnline: true,
		});

		expect(result.status).toBe("reconciled");
		expect(result.isMatching).toBe(true);
		expect(result.localCount).toBe(2);
		expect(result.serverCount).toBe(2);
		expect(result.matchingCount).toBe(2);
		expect(result.discrepancyCount).toBe(0);
		expect(result.canRefreshCatalog).toBe(false);
	});

	it("menghasilkan status reconciled saat kedua belah pihak sama-sama kosong (0 stok rendah)", () => {
		const result = reconcileLowStockReports({
			localUrgentItems: [],
			serverItems: [],
			isOnline: true,
		});

		expect(result.status).toBe("reconciled");
		expect(result.isMatching).toBe(true);
		expect(result.localCount).toBe(0);
		expect(result.serverCount).toBe(0);
		expect(result.discrepancyCount).toBe(0);
	});

	it("menghasilkan divergent_pending_mutations jika perbedaan disebabkan oleh antrean mutasi outbox lokal", () => {
		// item-1 ada di lokal & server
		// item-2 ada di lokal karena ada transaksi take offline di outbox yang menurunkan stoknya di bawah minimum
		const localItems = [
			createMockHealth("item-1", "Kertas A4"),
			createMockHealth("item-2", "Sarung Tangan"),
		];
		const serverItems = [createMockServerItem("item-1", "Kertas A4")];

		const pendingOutbox: OutboxItem[] = [
			{
				clientUuid: "outbox-1",
				employeeId: "emp-1",
				operation: "take",
				itemId: "item-2",
				quantity: 5,
				occurredAt: new Date().toISOString(),
				status: "pending",
				attempts: 0,
				createdAt: new Date().toISOString(),
			},
		];

		const result = reconcileLowStockReports({
			localUrgentItems: localItems,
			serverItems,
			pendingOutboxItems: pendingOutbox,
			isOnline: true,
		});

		expect(result.status).toBe("divergent_pending_mutations");
		expect(result.isMatching).toBe(false);
		expect(result.localCount).toBe(2);
		expect(result.serverCount).toBe(1);
		expect(result.matchingCount).toBe(1);
		expect(result.localOnlyItemIds).toEqual(["item-2"]);
		expect(result.canRefreshCatalog).toBe(false);
	});

	it("menghasilkan divergent_outdated_cache jika perbedaan BUKAN dari outbox (perlu sync katalog)", () => {
		// Server mendeteksi item-3 stok rendah dari mutasi web admin lain, tetapi lokal belum sync
		const localItems = [createMockHealth("item-1", "Kertas A4")];
		const serverItems = [
			createMockServerItem("item-1", "Kertas A4"),
			createMockServerItem("item-3", "Bor Baterai"),
		];

		const result = reconcileLowStockReports({
			localUrgentItems: localItems,
			serverItems,
			pendingOutboxItems: [], // Tidak ada outbox untuk item-3
			isOnline: true,
		});

		expect(result.status).toBe("divergent_outdated_cache");
		expect(result.isMatching).toBe(false);
		expect(result.serverOnlyItemIds).toEqual(["item-3"]);
		expect(result.canRefreshCatalog).toBe(true);
	});
});
