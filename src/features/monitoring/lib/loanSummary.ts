import type { ProjectedAssetLoan } from "@/features/loans";
import type { AuditorLoanItemSummary, AuditorLoansSummary } from "../types";

export const DEFAULT_LOAN_OVERDUE_DAYS = 7;

/**
 * Menghitung umur pinjaman dalam satuan hari dari tanggal peminjaman
 */
export function calculateLoanAgingDays(
	borrowedAt: string,
	nowMs = Date.now(),
): number {
	try {
		const borrowedMs = new Date(borrowedAt).getTime();
		if (Number.isNaN(borrowedMs)) return 0;
		const diffMs = nowMs - borrowedMs;
		return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
	} catch {
		return 0;
	}
}

/**
 * Menentukan apakah suatu pinjaman telah melewati ambang batas waktu (overdue/jatuh tempo)
 */
export function isLoanOverdue(
	borrowedAt: string,
	thresholdDays = DEFAULT_LOAN_OVERDUE_DAYS,
	nowMs = Date.now(),
): boolean {
	return calculateLoanAgingDays(borrowedAt, nowMs) >= thresholdDays;
}

/**
 * Mengkalkulasi ringkasan pinjaman auditor aktif berdasarkan data pinjaman terproyeksi
 */
export function summarizeAuditorLoans(
	projectedLoans: ProjectedAssetLoan[],
	thresholdDays = DEFAULT_LOAN_OVERDUE_DAYS,
	nowMs = Date.now(),
): AuditorLoansSummary {
	// Saring hanya pinjaman terbuka (memiliki sisa unit atau memiliki pengembalian yang masih pending di outbox)
	const openLoans = projectedLoans.filter((l) => {
		const effectiveOutstanding =
			l.effective_outstanding_quantity ?? l.outstanding_quantity ?? 0;
		return effectiveOutstanding > 0 || l.has_pending_return;
	});

	let totalOutstandingUnits = 0;
	let overdueCount = 0;
	let pendingReturnsCount = 0;

	const loanSummaries: AuditorLoanItemSummary[] = openLoans.map((l) => {
		const effectiveOutstanding =
			l.effective_outstanding_quantity ?? l.outstanding_quantity ?? 0;
		const agingDays = calculateLoanAgingDays(l.borrowed_at, nowMs);
		const overdue = agingDays >= thresholdDays;

		totalOutstandingUnits += effectiveOutstanding;
		if (overdue) overdueCount++;
		if (l.has_pending_return) pendingReturnsCount++;

		return {
			id: l.id,
			itemId: l.item_id,
			itemName: l.item_name || l.item?.name || "Aset Inventaris",
			itemSku: l.item_sku || l.item?.sku || "SKU-UNKNOWN",
			itemUnit: l.item?.unit || "unit",
			borrowedAt: l.borrowed_at,
			borrowedQuantity: l.quantity,
			returnedQuantity: l.server_returned_quantity ?? l.returned_quantity ?? 0,
			effectiveOutstandingQuantity: effectiveOutstanding,
			agingDays,
			isOverdue: overdue,
			hasPendingReturn: l.has_pending_return,
		};
	});

	// Urutkan: pinjaman overdue / aging paling tua di posisi pertama
	loanSummaries.sort((a, b) => {
		if (a.isOverdue !== b.isOverdue) {
			return a.isOverdue ? -1 : 1;
		}
		if (a.agingDays !== b.agingDays) {
			return b.agingDays - a.agingDays;
		}
		return a.itemName.localeCompare(b.itemName, "id");
	});

	return {
		totalOpenLoans: loanSummaries.length,
		totalOutstandingUnits,
		overdueCount,
		pendingReturnsCount,
		loans: loanSummaries,
	};
}
