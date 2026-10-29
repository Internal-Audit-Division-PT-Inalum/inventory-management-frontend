import type { InventoryItemType, Item, Location } from "@/types/api";

/**
 * Kategori status kesehatan stok berdasarkan rasio stok terhadap kuota minimum
 */
export type StockHealthCategory =
	| "out_of_stock" // Stok <= 0
	| "critical" // 0 < Stok <= minimum_stock * 0.5
	| "low" // minimum_stock * 0.5 < Stok <= minimum_stock
	| "healthy"; // Stok > minimum_stock

/**
 * Representasi evaluasi kesehatan stok untuk satu item
 */
export interface ItemStockHealth {
	item: Item;
	location?: Location | null;
	effectiveStock: number;
	confirmedStock: number;
	minimumStock: number;
	status: StockHealthCategory;
	deficit: number;
	isEstimated: boolean;
	hasPendingTransactions: boolean;
	pendingTransactionsCount: number;
}

/**
 * Ringkasan agregasi metrik stok untuk dashboard monitoring lokal
 */
export interface StockMetricsSummary {
	/** Total seluruh barang aktif di katalog */
	totalActiveItems: number;
	/** Jumlah barang berjenis habis pakai (consumable) */
	consumablesCount: number;
	/** Jumlah barang berjenis aset/peralatan (asset) */
	assetsCount: number;
	/** Jumlah barang yang habis (stok <= 0) */
	outOfStockCount: number;
	/** Jumlah barang dengan stok kritis (0 < stok <= 50% min_stock) */
	criticalCount: number;
	/** Jumlah barang dengan stok menipis (50% < stok <= min_stock) */
	lowStockCount: number;
	/** Jumlah barang dengan stok aman / sehat (stok > min_stock) */
	healthyCount: number;
	/** Total barang yang membutuhkan atensi restock (out_of_stock + critical + low) */
	attentionNeededCount: number;
	/** Indeks persentase kesehatan inventaris (0 - 100)% */
	healthRatioPercent: number;
	/** Daftar barang yang membutuhkan perhatian urgen (diurutkan berdasarkan keparahan) */
	urgentItems: ItemStockHealth[];
}

/**
 * Opsi penyaringan untuk kalkulasi metrik stok
 */
export interface StockMetricsFilterOptions {
	locationId?: string;
	type?: InventoryItemType | "all";
}

// ============================================================================
// TASK P6.2: PINJAMAN SAYA & FEED AKTIVITAS TERAKHIR
// ============================================================================

/**
 * Ringkasan satu pinjaman aset auditor
 */
export interface AuditorLoanItemSummary {
	id: string;
	itemId: string;
	itemName: string;
	itemSku: string;
	itemUnit: string;
	borrowedAt: string;
	borrowedQuantity: number;
	returnedQuantity: number;
	effectiveOutstandingQuantity: number;
	agingDays: number;
	isOverdue: boolean; // true jika >= 7 hari
	hasPendingReturn: boolean;
}

/**
 * Agregasi ringkasan seluruh pinjaman terbuka auditor aktif
 */
export interface AuditorLoansSummary {
	totalOpenLoans: number;
	totalOutstandingUnits: number;
	overdueCount: number;
	pendingReturnsCount: number;
	loans: AuditorLoanItemSummary[];
}

/**
 * Entitas aktivitas transaksi terbaru untuk feed riwayat beranda
 */
export interface RecentActivityItem {
	id: string;
	clientUuid: string;
	operation: "take" | "add" | "borrow" | "return";
	operationLabel: string;
	itemId: string;
	itemName: string;
	itemSku: string;
	itemUnit: string;
	quantity: number;
	status: "pending" | "syncing" | "synced" | "rejected" | "failed";
	statusLabel: string;
	occurredAt: string;
	relativeTime: string;
	notes?: string | null;
	errorMessage?: string | null;
}

// ============================================================================
// TASK P6.3: VERIFIKASI ANGKA VS /reports/low-stock (REKONSILIASI)
// ============================================================================

/**
 * Status keselarasan rekonsiliasi antara kalkulasi stok lokal dengan laporan server
 */
export type ReconciliationStatus =
	| "reconciled" // 100% cocok antara lokal dan server
	| "divergent_pending_mutations" // Berbeda karena mutasi transaksi offline di outbox
	| "divergent_outdated_cache" // Berbeda karena katalog lokal perlu disinkronkan dari server
	| "offline_fallback"; // Mode offline / tanpa koneksi jaringan

/**
 * Hasil komparasi rekonsiliasi stok rendah lokal vs endpoint /reports/low-stock
 */
export interface LowStockReconciliationResult {
	status: ReconciliationStatus;
	statusLabel: string;
	localCount: number;
	serverCount: number | null;
	matchingCount: number;
	discrepancyCount: number;
	localOnlyItemIds: string[];
	serverOnlyItemIds: string[];
	isMatching: boolean;
	message: string;
	canRefreshCatalog: boolean;
	verifiedAt: string;
}
