import {
	calculateProjectedStocksBatch,
	type ProjectedItemStock,
} from "@/features/transactions/lib/projectedStock";
import type { OutboxItem } from "@/lib/db";
import type { Item, Location } from "@/types/api";
import type {
	ItemStockHealth,
	StockHealthCategory,
	StockMetricsFilterOptions,
	StockMetricsSummary,
} from "../types";

/**
 * Menentukan klasifikasi status kesehatan stok berdasarkan stok efektif dan batas minimum.
 *
 * Aturan Bisnis:
 * 1. Habis (out_of_stock): Stok <= 0
 * 2. Kritis (critical): 0 < Stok <= floor(minimum_stock * 0.5)
 * 3. Menipis (low): floor(minimum_stock * 0.5) < Stok <= minimum_stock
 * 4. Aman (healthy): Stok > minimum_stock
 */
export function classifyStockHealth(
	effectiveStock: number,
	minimumStock: number,
): StockHealthCategory {
	if (effectiveStock <= 0) {
		return "out_of_stock";
	}

	if (minimumStock <= 0) {
		return "healthy";
	}

	const criticalThreshold = Math.floor(minimumStock * 0.5);

	if (effectiveStock <= criticalThreshold) {
		return "critical";
	}

	if (effectiveStock <= minimumStock) {
		return "low";
	}

	return "healthy";
}

/**
 * Memetakan bobot urgensi untuk pengurutan daftar barang kritis/menipis
 */
const STATUS_SEVERITY_WEIGHT: Record<StockHealthCategory, number> = {
	out_of_stock: 0,
	critical: 1,
	low: 2,
	healthy: 3,
};

/**
 * Mengkalkulasi kesehatan stok untuk satu item individual
 */
export function calculateItemStockHealth(
	item: Item,
	projected?: ProjectedItemStock,
	location?: Location | null,
): ItemStockHealth {
	const effectiveStock = projected
		? projected.projectedStock
		: (item.projected_stock ?? item.current_stock ?? 0);

	const confirmedStock = projected
		? projected.confirmedStock
		: (item.current_stock ?? 0);

	const minimumStock = Math.max(0, item.minimum_stock ?? 0);
	const status = classifyStockHealth(effectiveStock, minimumStock);
	const deficit = Math.max(0, minimumStock - effectiveStock);

	const isEstimated = projected
		? projected.isEstimated
		: Boolean(item.has_pending_transactions);

	const hasPendingTransactions = projected
		? projected.hasPendingTransactions
		: Boolean(item.has_pending_transactions);

	const pendingTransactionsCount = projected
		? projected.pendingCount
		: (item.pending_transactions_count ?? 0);

	return {
		item,
		location: location ?? item.location ?? null,
		effectiveStock,
		confirmedStock,
		minimumStock,
		status,
		deficit,
		isEstimated,
		hasPendingTransactions,
		pendingTransactionsCount,
	};
}

/**
 * Mengkalkulasi agregasi metrik stok secara menyeluruh dalam satu lintasan (single pass O(N))
 * dengan memperhitungkan mutasi pending outbox lokal untuk jaminan akurasi offline-first.
 */
export function calculateStockMetrics(
	items: Item[],
	pendingOutboxItems: OutboxItem[] = [],
	locationMap?: Map<string, Location>,
	options?: StockMetricsFilterOptions,
): StockMetricsSummary {
	// 1. Saring item aktif (is_active !== false) dan terapkan filter opsional
	const filteredItems = items.filter((item) => {
		if (item.is_active === false) {
			return false;
		}

		if (options?.locationId && options.locationId !== "all") {
			if (item.location_id !== options.locationId) {
				return false;
			}
		}

		if (options?.type && options.type !== "all") {
			if (item.type !== options.type) {
				return false;
			}
		}

		return true;
	});

	// 2. Hitung proyeksi mutasi pending secara batch
	const projectionMap = calculateProjectedStocksBatch(
		filteredItems,
		pendingOutboxItems,
	);

	let consumablesCount = 0;
	let assetsCount = 0;
	let outOfStockCount = 0;
	let criticalCount = 0;
	let lowStockCount = 0;
	let healthyCount = 0;

	const urgentItems: ItemStockHealth[] = [];

	// 3. Single-pass aggregation
	for (const item of filteredItems) {
		if (item.type === "consumable") {
			consumablesCount++;
		} else if (item.type === "asset") {
			assetsCount++;
		}

		const projection = projectionMap.get(item.id);
		const location =
			locationMap?.get(item.location_id) ?? item.location ?? null;
		const health = calculateItemStockHealth(item, projection, location);

		switch (health.status) {
			case "out_of_stock":
				outOfStockCount++;
				urgentItems.push(health);
				break;
			case "critical":
				criticalCount++;
				urgentItems.push(health);
				break;
			case "low":
				lowStockCount++;
				urgentItems.push(health);
				break;
			case "healthy":
				healthyCount++;
				break;
		}
	}

	// 4. Urutkan urgentItems berdasarkan keparahan (out_of_stock -> critical -> low -> lowest stock)
	urgentItems.sort((a, b) => {
		const weightA = STATUS_SEVERITY_WEIGHT[a.status];
		const weightB = STATUS_SEVERITY_WEIGHT[b.status];
		if (weightA !== weightB) {
			return weightA - weightB;
		}

		// Jika tingkat urgensi sama, prioritaskan stok efektif terkecil
		if (a.effectiveStock !== b.effectiveStock) {
			return a.effectiveStock - b.effectiveStock;
		}

		// Jika masih sama, prioritaskan defisit terbesar
		if (a.deficit !== b.deficit) {
			return b.deficit - a.deficit;
		}

		// Terakhir, urutkan nama item alfabetis
		return a.item.name.localeCompare(b.item.name, "id");
	});

	const totalActiveItems = filteredItems.length;
	const attentionNeededCount = outOfStockCount + criticalCount + lowStockCount;

	// Hitung persentase kesehatan stok
	const healthRatioPercent =
		totalActiveItems > 0
			? Math.round((healthyCount / totalActiveItems) * 1000) / 10
			: 100;

	return {
		totalActiveItems,
		consumablesCount,
		assetsCount,
		outOfStockCount,
		criticalCount,
		lowStockCount,
		healthyCount,
		attentionNeededCount,
		healthRatioPercent,
		urgentItems,
	};
}
