import { useCallback, useEffect, useMemo, useState } from "react";
import { CATALOG_SYNC_EVENT } from "@/features/catalog/api/syncCatalog";
import { SYNC_ENGINE_EVENT } from "@/features/sync";
import { TRANSACTION_COMMITTED_EVENT } from "@/features/transactions/lib/outboxEvents";
import { db, type OutboxItem } from "@/lib/db";
import type { Item, Location } from "@/types/api";
import { calculateStockMetrics } from "../lib/stockCalculators";
import type {
	ItemStockHealth,
	StockMetricsFilterOptions,
	StockMetricsSummary,
} from "../types";

export interface UseStockMetricsOptions extends StockMetricsFilterOptions {
	autoRefresh?: boolean;
}

export interface UseStockMetricsResult {
	metrics: StockMetricsSummary;
	urgentItems: ItemStockHealth[];
	locations: Location[];
	locationMap: Map<string, Location>;
	isLoading: boolean;
	refetch: () => Promise<void>;
}

const DEFAULT_METRICS: StockMetricsSummary = {
	totalActiveItems: 0,
	consumablesCount: 0,
	assetsCount: 0,
	outOfStockCount: 0,
	criticalCount: 0,
	lowStockCount: 0,
	healthyCount: 0,
	attentionNeededCount: 0,
	healthRatioPercent: 100,
	urgentItems: [],
};

/**
 * Hook reaktif offline-first untuk memuat dan menghitung metrik kesehatan stok dari IndexedDB.
 *
 * Keunggulan Enterprise:
 * 1. 100% Offline-First: Berjalan mulus di IndexedDB tanpa dependensi jaringan.
 * 2. Proyeksi Real-Time: Langsung memperhitungkan mutasi pending outbox lokal saat auditor mengambil/menambah stok.
 * 3. Reaktif: Mengupdate metrik seketika saat event transaksi baru, sinkronisasi katalog, atau sync engine terpicu.
 */
export function useStockMetrics(
	options: UseStockMetricsOptions = {},
): UseStockMetricsResult {
	const { locationId, type, autoRefresh = true } = options;

	const [items, setItems] = useState<Item[]>([]);
	const [locations, setLocations] = useState<Location[]>([]);
	const [pendingOutbox, setPendingOutbox] = useState<OutboxItem[]>([]);
	const [isLoading, setIsLoading] = useState<boolean>(true);

	const loadData = useCallback(async () => {
		try {
			const [loadedItems, loadedLocations, loadedOutbox] = await Promise.all([
				db.items.filter((i) => i.is_active !== false).toArray(),
				db.locations.toArray(),
				db.outbox.where("status").anyOf(["pending", "syncing"]).toArray(),
			]);

			setItems(loadedItems);
			setLocations(loadedLocations);
			setPendingOutbox(loadedOutbox);
		} catch (error) {
			console.warn("Gagal memuat data metrik stok dari IndexedDB:", error);
		} finally {
			setIsLoading(false);
		}
	}, []);

	useEffect(() => {
		let isMounted = true;

		loadData();

		if (!autoRefresh) {
			return;
		}

		const handleDataInvalidation = () => {
			if (isMounted) {
				loadData();
			}
		};

		if (typeof window !== "undefined") {
			window.addEventListener(CATALOG_SYNC_EVENT, handleDataInvalidation);
			window.addEventListener(
				TRANSACTION_COMMITTED_EVENT,
				handleDataInvalidation,
			);
			window.addEventListener(SYNC_ENGINE_EVENT, handleDataInvalidation);
		}

		return () => {
			isMounted = false;
			if (typeof window !== "undefined") {
				window.removeEventListener(CATALOG_SYNC_EVENT, handleDataInvalidation);
				window.removeEventListener(
					TRANSACTION_COMMITTED_EVENT,
					handleDataInvalidation,
				);
				window.removeEventListener(SYNC_ENGINE_EVENT, handleDataInvalidation);
			}
		};
	}, [loadData, autoRefresh]);

	const locationMap = useMemo(() => {
		return new Map(locations.map((loc) => [loc.id, loc]));
	}, [locations]);

	const metrics = useMemo(() => {
		if (items.length === 0 && pendingOutbox.length === 0) {
			return DEFAULT_METRICS;
		}

		return calculateStockMetrics(items, pendingOutbox, locationMap, {
			locationId,
			type,
		});
	}, [items, pendingOutbox, locationMap, locationId, type]);

	return {
		metrics,
		urgentItems: metrics.urgentItems,
		locations,
		locationMap,
		isLoading,
		refetch: loadData,
	};
}
