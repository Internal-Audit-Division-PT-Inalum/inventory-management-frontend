import type { OutboxItem } from "@/lib/db";
import type {
	AssetLoan,
	ProjectedAssetLoan,
	ProjectedLoanStats,
} from "../types";

/**
 * Menghitung proyeksi sisa pinjaman secara proaktif/optimistik (Task P4.4)
 * dengan memperhitungkan transaksi pengembalian yang masih berada di antrean outbox (pending / syncing).
 *
 * Mengeliminasi race condition over-return saat offline, membatasi input pengembalian maksimal
 * pada sisa efektif, serta menyajikan transparansi audit status antrean perangkat.
 *
 * @param loans Daftar pinjaman otoritatif dari server
 * @param pendingOutboxItems Daftar transaksi antrean outbox dari IndexedDB
 * @returns Array pinjaman terproyeksi dengan angka sisa efektif dan indikator antrean
 */
export function calculateProjectedLoans(
	loans: AssetLoan[],
	pendingOutboxItems: OutboxItem[],
): ProjectedAssetLoan[] {
	// Filter transaksi pengembalian (return) yang masih menunggu pengiriman atau sedang disinkronkan
	const pendingReturns = pendingOutboxItems.filter(
		(item) =>
			item.operation === "return" &&
			(item.status === "pending" || item.status === "syncing") &&
			item.quantity > 0,
	);

	if (pendingReturns.length === 0) {
		return loans.map((loan) => {
			const serverOutstanding =
				loan.outstanding_quantity ??
				Math.max(0, loan.quantity - (loan.returned_quantity ?? 0));
			return {
				...loan,
				outstanding_quantity: serverOutstanding,
				server_outstanding_quantity: serverOutstanding,
				server_returned_quantity: loan.returned_quantity ?? 0,
				pending_return_quantity: 0,
				effective_outstanding_quantity: serverOutstanding,
				effective_status: loan.status,
				has_pending_return: false,
			};
		});
	}

	// Buat pool alokasi kuantitas pengembalian yang belum terdistribusi
	const remainingAllocations = pendingReturns.map((item) => ({
		...item,
		unallocatedQty: item.quantity,
	}));

	// 1. Alokasi Pengembalian Spesifik (jika ada loanId yang cocok persis)
	const specificAllocations = new Map<string, number>();
	for (const ret of remainingAllocations) {
		if (ret.loanId) {
			const current = specificAllocations.get(ret.loanId) ?? 0;
			specificAllocations.set(ret.loanId, current + ret.unallocatedQty);
			ret.unallocatedQty = 0;
		}
	}

	// 2. Alokasi FIFO untuk pengembalian tanpa loanId berdasarkan itemId (pola identik backend Laravel)
	// Pinjaman diurutkan dari waktu peminjaman tertua (borrowed_at ASC)
	const sortedLoanIndices = loans
		.map((loan, originalIndex) => ({ loan, originalIndex }))
		.sort(
			(a, b) =>
				new Date(a.loan.borrowed_at).getTime() -
				new Date(b.loan.borrowed_at).getTime(),
		);

	const fifoAllocations = new Map<string, number>();

	for (const { loan } of sortedLoanIndices) {
		const serverOutstanding =
			loan.outstanding_quantity ??
			Math.max(0, loan.quantity - (loan.returned_quantity ?? 0));
		const alreadyAllocated = specificAllocations.get(loan.id) ?? 0;
		let remainingCapacity = Math.max(0, serverOutstanding - alreadyAllocated);

		if (remainingCapacity > 0) {
			for (const ret of remainingAllocations) {
				if (ret.unallocatedQty <= 0) continue;
				if (ret.itemId === loan.item_id) {
					const take = Math.min(remainingCapacity, ret.unallocatedQty);
					const currentFifo = fifoAllocations.get(loan.id) ?? 0;
					fifoAllocations.set(loan.id, currentFifo + take);
					ret.unallocatedQty -= take;
					remainingCapacity -= take;

					if (remainingCapacity <= 0) break;
				}
			}
		}
	}

	// 3. Bangun objek ProjectedAssetLoan dengan nilai sisa efektif
	return loans.map((loan) => {
		const serverOutstanding =
			loan.outstanding_quantity ??
			Math.max(0, loan.quantity - (loan.returned_quantity ?? 0));
		const serverReturned = loan.returned_quantity ?? 0;

		const specificPending = specificAllocations.get(loan.id) ?? 0;
		const fifoPending = fifoAllocations.get(loan.id) ?? 0;
		const totalPending = specificPending + fifoPending;

		const effectiveOutstanding = Math.max(0, serverOutstanding - totalPending);
		const effectiveReturned = serverReturned + totalPending;
		const hasPendingReturn = totalPending > 0;

		let effectiveStatus: "borrowed" | "returned" | "pending_sync" = loan.status;
		if (effectiveOutstanding === 0) {
			effectiveStatus = hasPendingReturn ? "pending_sync" : "returned";
		}

		return {
			...loan,
			// Override nilai kuantitas agar komponen turunan otomatis aman
			outstanding_quantity: effectiveOutstanding,
			returned_quantity: effectiveReturned,
			server_outstanding_quantity: serverOutstanding,
			server_returned_quantity: serverReturned,
			pending_return_quantity: totalPending,
			effective_outstanding_quantity: effectiveOutstanding,
			effective_status: effectiveStatus,
			has_pending_return: hasPendingReturn,
		};
	});
}

/**
 * Menghitung ringkasan statistik terproyeksi dari daftar pinjaman
 */
export function calculateProjectedLoanStats(
	projectedLoans: ProjectedAssetLoan[],
): ProjectedLoanStats {
	const totalOpenLoans = projectedLoans.filter(
		(l) => l.effective_outstanding_quantity > 0,
	).length;

	const totalOutstandingItems = projectedLoans.reduce(
		(acc, l) => acc + l.effective_outstanding_quantity,
		0,
	);

	const totalReturnedItems = projectedLoans.reduce(
		(acc, l) => acc + l.returned_quantity,
		0,
	);

	const totalPendingReturns = projectedLoans.reduce(
		(acc, l) => acc + l.pending_return_quantity,
		0,
	);

	return {
		totalOpenLoans,
		totalOutstandingItems,
		totalReturnedItems,
		totalPendingReturns,
	};
}
