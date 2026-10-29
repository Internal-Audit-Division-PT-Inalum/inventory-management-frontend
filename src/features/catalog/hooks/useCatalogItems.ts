import { useCallback, useEffect, useMemo, useState } from "react";
import { SYNC_ENGINE_EVENT } from "@/features/sync";
import { TRANSACTION_COMMITTED_EVENT } from "@/features/transactions/lib/outboxEvents";
import { calculateProjectedStocksBatch } from "@/features/transactions/lib/projectedStock";
import { db } from "@/lib/db";
import type { InventoryItemType, Item, Location } from "@/types/api";
import { CATALOG_SYNC_EVENT } from "../api/syncCatalog";
import { useCatalogLocations } from "./useCatalogLocations";

export interface UseCatalogItemsOptions {
	searchTerm?: string;
	locationId?: string;
	type?: InventoryItemType | "all";
	stockStatus?: "all" | "low_or_empty" | "available";
	sortBy?: "name" | "sku" | "stock_asc" | "stock_desc" | "updated_at";
}

export interface CatalogStats {
	totalItems: number;
	consumablesCount: number;
	assetsCount: number;
	lowStockCount: number;
	outOfStockCount: number;
	totalBorrowedAssets: number;
}

export interface UseCatalogItemsResult {
	items: Item[];
	locations: Location[];
	locationMap: Map<string, Location>;
	isLoading: boolean;
	stats: CatalogStats;
	hasActiveFilters: boolean;
	refetch: () => Promise<void>;
}

/**
 * Hook reaktif untuk memuat, mencari, memfilter, dan mengurutkan barang katalog dari IndexedDB lokal.
 * Waktu respons kilat (<100ms) berkat indeks Dexie dan in-memory memoization.
 */
export function useCatalogItems(
	options: UseCatalogItemsOptions = {},
): UseCatalogItemsResult {
	const {
		searchTerm = "",
		locationId = "all",
		type = "all",
		stockStatus = "all",
		sortBy = "name",
	} = options;

	const {
		locations,
		locationMap,
		isLoading: isLocationsLoading,
	} = useCatalogLocations();
	const [rawItems, setRawItems] = useState<Item[]>([]);
	const [isItemsLoading, setIsItemsLoading] = useState(true);

	const loadItems = useCallback(async () => {
		try {
			const queryOptions = {
				searchTerm: searchTerm.trim() || undefined,
				locationId: locationId && locationId !== "all" ? locationId : undefined,
				type: type && type !== "all" ? type : undefined,
				stockStatus:
					stockStatus && stockStatus !== "all" ? stockStatus : undefined,
			};

			const data = await db.getCatalogItems(queryOptions);

			// Ambil transaksi antrean outbox yang belum tersinkronkan (pending / syncing)
			const pendingOutbox = await db.outbox
				.where("status")
				.anyOf(["pending", "syncing"])
				.toArray();

			// Hitung proyeksi stok lokal untuk seluruh barang katalog (Task P5.8)
			const projectedMap = calculateProjectedStocksBatch(data, pendingOutbox);

			const enrichedWithProjections = data.map((item) => {
				const proj = projectedMap.get(item.id);
				return {
					...item,
					projected_stock: proj ? proj.projectedStock : item.current_stock,
					projected_borrowed: proj
						? proj.projectedBorrowed
						: (item.borrowed_quantity ?? 0),
					has_pending_transactions: proj ? proj.hasPendingTransactions : false,
					pending_transactions_count: proj ? proj.pendingCount : 0,
				};
			});

			setRawItems(enrichedWithProjections);
		} catch (err) {
			console.error("Gagal memuat barang katalog:", err);
		} finally {
			setIsItemsLoading(false);
		}
	}, [searchTerm, locationId, type, stockStatus]);

	useEffect(() => {
		let isMounted = true;

		loadItems();

		const handleCatalogSynced = () => {
			if (isMounted) {
				loadItems();
			}
		};

		if (typeof window !== "undefined") {
			window.addEventListener(CATALOG_SYNC_EVENT, handleCatalogSynced);
			window.addEventListener(TRANSACTION_COMMITTED_EVENT, handleCatalogSynced);
			window.addEventListener(SYNC_ENGINE_EVENT, handleCatalogSynced);
		}

		return () => {
			isMounted = false;
			if (typeof window !== "undefined") {
				window.removeEventListener(CATALOG_SYNC_EVENT, handleCatalogSynced);
				window.removeEventListener(
					TRANSACTION_COMMITTED_EVENT,
					handleCatalogSynced,
				);
				window.removeEventListener(SYNC_ENGINE_EVENT, handleCatalogSynced);
			}
		};
	}, [loadItems]);

	// Perkaya item dengan entitas Location dan terapkan pengurutan
	const items = useMemo(() => {
		const enriched = rawItems.map((item) => ({
			...item,
			location: item.location || locationMap.get(item.location_id),
		}));

		return enriched.sort((a, b) => {
			switch (sortBy) {
				case "sku":
					return a.sku.localeCompare(b.sku, "id");
				case "stock_asc":
					return a.current_stock - b.current_stock;
				case "stock_desc":
					return b.current_stock - a.current_stock;
				case "updated_at":
					return (
						new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
					);
				default:
					return a.name.localeCompare(b.name, "id");
			}
		});
	}, [rawItems, locationMap, sortBy]);

	// Hitung ringkasan statistik katalog secara real-time
	const stats = useMemo<CatalogStats>(() => {
		let consumables = 0;
		let assets = 0;
		let lowStock = 0;
		let outOfStock = 0;
		let borrowedAssets = 0;

		for (const item of rawItems) {
			if (item.type === "consumable") {
				consumables++;
			} else if (item.type === "asset") {
				assets++;
				if (item.borrowed_quantity) {
					borrowedAssets += item.borrowed_quantity;
				}
			}

			if (item.current_stock === 0) {
				outOfStock++;
			} else if (item.current_stock <= item.minimum_stock) {
				lowStock++;
			}
		}

		return {
			totalItems: rawItems.length,
			consumablesCount: consumables,
			assetsCount: assets,
			lowStockCount: lowStock,
			outOfStockCount: outOfStock,
			totalBorrowedAssets: borrowedAssets,
		};
	}, [rawItems]);

	const hasActiveFilters = Boolean(
		(searchTerm && searchTerm.trim() !== "") ||
			(locationId && locationId !== "all") ||
			(type && type !== "all") ||
			(stockStatus && stockStatus !== "all"),
	);

	return {
		items,
		locations,
		locationMap,
		isLoading: isItemsLoading || isLocationsLoading,
		stats,
		hasActiveFilters,
		refetch: loadItems,
	};
}
