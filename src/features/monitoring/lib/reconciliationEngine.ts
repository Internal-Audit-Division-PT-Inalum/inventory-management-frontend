import type { OutboxItem } from "@/lib/db";
import type { Item } from "@/types/api";
import type { ItemStockHealth, LowStockReconciliationResult } from "../types";

export interface ReconcileLowStockParams {
	localUrgentItems: ItemStockHealth[];
	serverItems: Item[] | null;
	pendingOutboxItems?: OutboxItem[];
	isOnline?: boolean;
	verifiedAt?: string;
}

/**
 * Mesin Rekonsiliasi Stok Rendah Murni (Task P6.3):
 * - Membandingkan daftar item berstatus stok rendah/kritis lokal ($S_{\text{effective}} \le S_{\min}$)
 *   terhadap endpoint backend `/api/v1/inventory/reports/low-stock`.
 * - Membedakan secara presisi antara status Reconciled (100% cocok),
 *   Divergensi akibat mutasi offline pending di outbox,
 *   Divergensi akibat cache katalog lokal usang (butuh sync),
 *   atau Offline Fallback.
 */
export function reconcileLowStockReports({
	localUrgentItems,
	serverItems,
	pendingOutboxItems = [],
	isOnline = true,
	verifiedAt = new Date().toISOString(),
}: ReconcileLowStockParams): LowStockReconciliationResult {
	const localCount = localUrgentItems.length;

	// 1. Penanganan Mode Offline / Tanpa Koneksi
	if (!isOnline || serverItems === null) {
		return {
			status: "offline_fallback",
			statusLabel: "Perhitungan Lokal (Offline)",
			localCount,
			serverCount: null,
			matchingCount: 0,
			discrepancyCount: 0,
			localOnlyItemIds: [],
			serverOnlyItemIds: [],
			isMatching: false,
			message:
				"Aplikasi beroperasi dalam mode offline. Angka stok rendah dihitung mandiri dari cache IndexedDB lokal.",
			canRefreshCatalog: false,
			verifiedAt,
		};
	}

	const serverCount = serverItems.length;
	const localIds = new Set(localUrgentItems.map((i) => i.item.id));
	const serverIds = new Set(serverItems.map((i) => i.id));

	const localOnlyItemIds = Array.from(localIds).filter(
		(id) => !serverIds.has(id),
	);
	const serverOnlyItemIds = Array.from(serverIds).filter(
		(id) => !localIds.has(id),
	);
	const matchingCount = Array.from(localIds).filter((id) =>
		serverIds.has(id),
	).length;
	const discrepancyCount = localOnlyItemIds.length + serverOnlyItemIds.length;

	// 2. Jika 100% Cocok (Perfect Reconciliation)
	if (discrepancyCount === 0) {
		return {
			status: "reconciled",
			statusLabel: "Sinkron Terverifikasi (100% Cocok)",
			localCount,
			serverCount,
			matchingCount,
			discrepancyCount: 0,
			localOnlyItemIds: [],
			serverOnlyItemIds: [],
			isMatching: true,
			message: `Angka stok rendah lokal (${localCount} barang) diverifikasi cocok persis dengan laporan server.`,
			canRefreshCatalog: false,
			verifiedAt,
		};
	}

	// 3. Evaluasi apakah perbedaan disebabkan oleh antrean mutasi outbox lokal
	const pendingItemIds = new Set(
		pendingOutboxItems
			.filter((o) => o.status === "pending" || o.status === "syncing")
			.map((o) => o.itemId),
	);

	// Seluruh item discrepant harus memiliki jejak di pending outbox
	const allDiscrepanciesCoveredByOutbox =
		localOnlyItemIds.every((id) => pendingItemIds.has(id)) &&
		serverOnlyItemIds.every((id) => pendingItemIds.has(id));

	if (allDiscrepanciesCoveredByOutbox && pendingItemIds.size > 0) {
		return {
			status: "divergent_pending_mutations",
			statusLabel: "Divergensi Terkendali (Mutasi Antre)",
			localCount,
			serverCount,
			matchingCount,
			discrepancyCount,
			localOnlyItemIds,
			serverOnlyItemIds,
			isMatching: false,
			message: `Terdapat selisih ${discrepancyCount} barang akibat mutasi transaksi offline yang masih mengantre di outbox.`,
			canRefreshCatalog: false,
			verifiedAt,
		};
	}

	// 4. Perbedaan bukan karena outbox -> katalog lokal usang dan perlu disinkronkan
	return {
		status: "divergent_outdated_cache",
		statusLabel: "Perlu Sinkronisasi Katalog",
		localCount,
		serverCount,
		matchingCount,
		discrepancyCount,
		localOnlyItemIds,
		serverOnlyItemIds,
		isMatching: false,
		message: `Daftar stok rendah lokal berbeda dengan data server terkini (selisih ${discrepancyCount} barang). Silakan perbarui katalog.`,
		canRefreshCatalog: true,
		verifiedAt,
	};
}
