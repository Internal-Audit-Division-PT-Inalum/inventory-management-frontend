import { describe, expect, it } from "vitest";
import type { OutboxItem } from "@/lib/db";
import type { Item, Location } from "@/types/api";
import {
	calculateItemStockHealth,
	calculateStockMetrics,
	classifyStockHealth,
} from "./stockCalculators";

describe("stockCalculators - Pure Logic Engine (Task P6.1)", () => {
	describe("classifyStockHealth", () => {
		it("mengklasifikasikan stok <= 0 sebagai out_of_stock", () => {
			expect(classifyStockHealth(0, 10)).toBe("out_of_stock");
			expect(classifyStockHealth(-2, 10)).toBe("out_of_stock");
			expect(classifyStockHealth(0, 0)).toBe("out_of_stock");
		});

		it("mengklasifikasikan stok > 0 tetapi <= 50% min_stock sebagai critical", () => {
			// minimum_stock = 10, threshold = 5
			expect(classifyStockHealth(1, 10)).toBe("critical");
			expect(classifyStockHealth(5, 10)).toBe("critical");

			// minimum_stock = 9, threshold = floor(4.5) = 4
			expect(classifyStockHealth(4, 9)).toBe("critical");
		});

		it("mengklasifikasikan stok > 50% min_stock dan <= min_stock sebagai low", () => {
			// minimum_stock = 10, threshold = 5
			expect(classifyStockHealth(6, 10)).toBe("low");
			expect(classifyStockHealth(10, 10)).toBe("low");

			// minimum_stock = 9, threshold = 4
			expect(classifyStockHealth(5, 9)).toBe("low");
			expect(classifyStockHealth(9, 9)).toBe("low");
		});

		it("mengklasifikasikan stok > min_stock sebagai healthy", () => {
			expect(classifyStockHealth(11, 10)).toBe("healthy");
			expect(classifyStockHealth(50, 10)).toBe("healthy");
		});

		it("menangani kasus batas minimum_stock <= 0 secara aman", () => {
			// Jika minimum_stock = 0 dan stok > 0, dianggap healthy
			expect(classifyStockHealth(5, 0)).toBe("healthy");
			expect(classifyStockHealth(1, -5)).toBe("healthy");
			// Jika stok <= 0, tetap out_of_stock
			expect(classifyStockHealth(0, 0)).toBe("out_of_stock");
		});

		it("menangani batas minimum_stock ganjil dan kecil", () => {
			// minimum_stock = 1, threshold = floor(0.5) = 0
			// 0 < stok <= 0 -> tidak ada nilai integer untuk critical
			// stok = 1 -> low (0 < 1 <= 1)
			expect(classifyStockHealth(1, 1)).toBe("low");
			expect(classifyStockHealth(2, 1)).toBe("healthy");
		});
	});

	describe("calculateItemStockHealth", () => {
		const baseItem: Item = {
			id: "item-1",
			name: "Sarung Tangan Las",
			sku: "PPE-GLV-001",
			type: "consumable",
			unit: "pasang",
			location_id: "loc-1",
			current_stock: 4,
			minimum_stock: 10,
			image_url: null,
			updated_at: "2026-10-29T00:00:00.000Z",
		};

		it("mengkalkulasi kesehatan item berdasarkan data item dasar jika tanpa proyeksi", () => {
			const health = calculateItemStockHealth(baseItem);

			expect(health.item.id).toBe("item-1");
			expect(health.effectiveStock).toBe(4);
			expect(health.confirmedStock).toBe(4);
			expect(health.minimumStock).toBe(10);
			// 4 <= 5 (floor 10 * 0.5) -> critical
			expect(health.status).toBe("critical");
			expect(health.deficit).toBe(6);
			expect(health.isEstimated).toBe(false);
			expect(health.hasPendingTransactions).toBe(false);
		});

		it("memperhitungkan proyeksi mutasi antrean outbox", () => {
			const projectedItem: Item = {
				...baseItem,
				projected_stock: 0,
				has_pending_transactions: true,
				pending_transactions_count: 1,
			};

			const health = calculateItemStockHealth(projectedItem);

			expect(health.effectiveStock).toBe(0);
			expect(health.status).toBe("out_of_stock");
			expect(health.deficit).toBe(10);
			expect(health.isEstimated).toBe(true);
			expect(health.hasPendingTransactions).toBe(true);
			expect(health.pendingTransactionsCount).toBe(1);
		});
	});

	describe("calculateStockMetrics", () => {
		const mockLocations: Location[] = [
			{ id: "loc-1", name: "Gudang Utama - Rak A1", code: "WH-A1" },
			{ id: "loc-2", name: "Gudang Peralatan - Rak B2", code: "WH-B2" },
		];
		const locationMap = new Map(mockLocations.map((l) => [l.id, l]));

		const mockItems: Item[] = [
			{
				id: "item-1",
				name: "Kertas A4 70gsm",
				sku: "ATK-PPR-001",
				type: "consumable",
				unit: "rim",
				location_id: "loc-1",
				current_stock: 0,
				minimum_stock: 20,
				image_url: null,
				is_active: true,
				updated_at: "2026-10-29T00:00:00.000Z",
			},
			{
				id: "item-2",
				name: "Sarung Tangan Las",
				sku: "PPE-GLV-001",
				type: "consumable",
				unit: "pasang",
				location_id: "loc-1",
				current_stock: 3,
				minimum_stock: 10,
				image_url: null,
				is_active: true,
				updated_at: "2026-10-29T00:00:00.000Z",
			},
			{
				id: "item-3",
				name: "Masker N95",
				sku: "PPE-MSK-001",
				type: "consumable",
				unit: "box",
				location_id: "loc-1",
				current_stock: 8,
				minimum_stock: 10,
				image_url: null,
				is_active: true,
				updated_at: "2026-10-29T00:00:00.000Z",
			},
			{
				id: "item-4",
				name: "Multimeter Fluke 87V",
				sku: "AST-TL-001",
				type: "asset",
				unit: "unit",
				location_id: "loc-2",
				current_stock: 5,
				minimum_stock: 2,
				image_url: null,
				is_active: true,
				updated_at: "2026-10-29T00:00:00.000Z",
			},
			{
				id: "item-inactive",
				name: "Item Nonaktif Lama",
				sku: "OLD-001",
				type: "consumable",
				unit: "pcs",
				location_id: "loc-1",
				current_stock: 0,
				minimum_stock: 10,
				image_url: null,
				is_active: false,
				updated_at: "2026-10-29T00:00:00.000Z",
			},
		];

		it("mengkalkulasi agregasi metrik dengan benar tanpa outbox pending", () => {
			const metrics = calculateStockMetrics(mockItems, [], locationMap);

			expect(metrics.totalActiveItems).toBe(4); // item-inactive diabaikan
			expect(metrics.consumablesCount).toBe(3);
			expect(metrics.assetsCount).toBe(1);

			expect(metrics.outOfStockCount).toBe(1); // item-1 (stok 0)
			expect(metrics.criticalCount).toBe(1); // item-2 (stok 3 <= 5)
			expect(metrics.lowStockCount).toBe(1); // item-3 (stok 8 <= 10)
			expect(metrics.healthyCount).toBe(1); // item-4 (stok 5 > 2)

			expect(metrics.attentionNeededCount).toBe(3); // 1 + 1 + 1
			// 1 healthy dari 4 total = 25.0%
			expect(metrics.healthRatioPercent).toBe(25.0);

			// Memastikan urgentItems diurutkan berdasarkan keparahan
			expect(metrics.urgentItems).toHaveLength(3);
			expect(metrics.urgentItems[0].status).toBe("out_of_stock");
			expect(metrics.urgentItems[0].item.id).toBe("item-1");
			expect(metrics.urgentItems[1].status).toBe("critical");
			expect(metrics.urgentItems[1].item.id).toBe("item-2");
			expect(metrics.urgentItems[2].status).toBe("low");
			expect(metrics.urgentItems[2].item.id).toBe("item-3");
		});

		it("memperhitungkan transaksi pending outbox yang mengubah status stok secara dinamis", () => {
			// Simulasikan transaksi outbox offline: take 5 item-4 (Multimeter)
			// Secara optimistik di IndexedDB (applyOptimisticStock), current_stock item-4 telah menjadi 0
			const itemsWithOptimisticDeduction = mockItems.map((item) =>
				item.id === "item-4" ? { ...item, current_stock: 0 } : item,
			);

			const pendingOutbox: OutboxItem[] = [
				{
					clientUuid: "outbox-1",
					employeeId: "emp-1",
					operation: "take",
					itemId: "item-4",
					quantity: 5,
					occurredAt: new Date().toISOString(),
					status: "pending",
					attempts: 0,
					createdAt: new Date().toISOString(),
				},
			];

			const metrics = calculateStockMetrics(
				itemsWithOptimisticDeduction,
				pendingOutbox,
				locationMap,
			);

			// item-4 awalnya healthy, kini menjadi out_of_stock karena sisa stok optimistik lokal = 0
			expect(metrics.outOfStockCount).toBe(2); // item-1 & item-4
			expect(metrics.healthyCount).toBe(0);
			expect(metrics.healthRatioPercent).toBe(0);

			const urgentItem4 = metrics.urgentItems.find(
				(i) => i.item.id === "item-4",
			);
			expect(urgentItem4).toBeDefined();
			expect(urgentItem4?.status).toBe("out_of_stock");
			expect(urgentItem4?.effectiveStock).toBe(0);
			expect(urgentItem4?.confirmedStock).toBe(5); // Server baseline stock adalah 5
			expect(urgentItem4?.hasPendingTransactions).toBe(true);
			expect(urgentItem4?.isEstimated).toBe(true);
		});

		it("mendukung filter lokasi dan tipe barang", () => {
			// Filter hanya tipe consumable
			const consumableMetrics = calculateStockMetrics(
				mockItems,
				[],
				locationMap,
				{ type: "consumable" },
			);
			expect(consumableMetrics.totalActiveItems).toBe(3);
			expect(consumableMetrics.consumablesCount).toBe(3);
			expect(consumableMetrics.assetsCount).toBe(0);

			// Filter hanya lokasi loc-2
			const loc2Metrics = calculateStockMetrics(mockItems, [], locationMap, {
				locationId: "loc-2",
			});
			expect(loc2Metrics.totalActiveItems).toBe(1);
			expect(loc2Metrics.healthyCount).toBe(1);
			expect(loc2Metrics.healthRatioPercent).toBe(100);
		});

		it("menangani katalog kosong secara aman", () => {
			const emptyMetrics = calculateStockMetrics([]);
			expect(emptyMetrics.totalActiveItems).toBe(0);
			expect(emptyMetrics.healthRatioPercent).toBe(100);
			expect(emptyMetrics.urgentItems).toHaveLength(0);
		});
	});
});
