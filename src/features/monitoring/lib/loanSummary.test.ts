import { describe, expect, it } from "vitest";
import type { ProjectedAssetLoan } from "@/features/loans";
import {
	calculateLoanAgingDays,
	isLoanOverdue,
	summarizeAuditorLoans,
} from "./loanSummary";

describe("loanSummary - Pure Logic Engine (Task P6.2)", () => {
	const fixedNow = new Date("2026-10-29T10:00:00.000Z").getTime();

	describe("calculateLoanAgingDays & isLoanOverdue", () => {
		it("menghitung umur pinjaman secara presisi", () => {
			// 3 hari lalu
			const date3DaysAgo = new Date("2026-10-26T10:00:00.000Z").toISOString();
			expect(calculateLoanAgingDays(date3DaysAgo, fixedNow)).toBe(3);
			expect(isLoanOverdue(date3DaysAgo, 7, fixedNow)).toBe(false);

			// 7 hari lalu (tepat batas overdue)
			const date7DaysAgo = new Date("2026-10-22T10:00:00.000Z").toISOString();
			expect(calculateLoanAgingDays(date7DaysAgo, fixedNow)).toBe(7);
			expect(isLoanOverdue(date7DaysAgo, 7, fixedNow)).toBe(true);

			// 10 hari lalu (pasti overdue)
			const date10DaysAgo = new Date("2026-10-19T10:00:00.000Z").toISOString();
			expect(calculateLoanAgingDays(date10DaysAgo, fixedNow)).toBe(10);
			expect(isLoanOverdue(date10DaysAgo, 7, fixedNow)).toBe(true);
		});

		it("menangani tanggal masa depan atau string tidak valid secara aman", () => {
			expect(calculateLoanAgingDays("invalid-date", fixedNow)).toBe(0);
			const futureDate = new Date("2026-10-30T10:00:00.000Z").toISOString();
			expect(calculateLoanAgingDays(futureDate, fixedNow)).toBe(0);
		});
	});

	describe("summarizeAuditorLoans", () => {
		const mockProjectedLoans: ProjectedAssetLoan[] = [
			{
				id: "loan-1",
				item_id: "item-1",
				item_name: "Multimeter Fluke 87V",
				item_sku: "AST-FLK-087",
				quantity: 2,
				returned_quantity: 0,
				outstanding_quantity: 2,
				server_outstanding_quantity: 2,
				server_returned_quantity: 0,
				pending_return_quantity: 0,
				effective_outstanding_quantity: 2,
				borrowed_at: "2026-10-20T10:00:00.000Z", // 9 hari lalu (overdue)
				status: "borrowed",
				effective_status: "borrowed",
				has_pending_return: false,
			},
			{
				id: "loan-2",
				item_id: "item-2",
				item_name: "Torque Wrench 1/2 Inch",
				item_sku: "AST-TRQ-001",
				quantity: 1,
				returned_quantity: 0,
				outstanding_quantity: 1,
				server_outstanding_quantity: 1,
				server_returned_quantity: 0,
				pending_return_quantity: 1,
				effective_outstanding_quantity: 0, // sedang dikembalikan di outbox
				borrowed_at: "2026-10-27T10:00:00.000Z", // 2 hari lalu
				status: "borrowed",
				effective_status: "pending_sync",
				has_pending_return: true,
			},
			{
				id: "loan-3",
				item_id: "item-3",
				item_name: "Bor Baterai Bosch",
				item_sku: "AST-BOR-002",
				quantity: 1,
				returned_quantity: 1,
				outstanding_quantity: 0,
				server_outstanding_quantity: 0,
				server_returned_quantity: 1,
				pending_return_quantity: 0,
				effective_outstanding_quantity: 0,
				borrowed_at: "2026-10-15T10:00:00.000Z",
				status: "returned", // Pinjaman SUDAH SELESAI, harus diabaikan dari open loans
				effective_status: "returned",
				has_pending_return: false,
			},
		];

		it("mengkalkulasi agregasi pinjaman terbuka secara akurat", () => {
			const summary = summarizeAuditorLoans(mockProjectedLoans, 7, fixedNow);

			// loan-1 (aktif 2 unit) + loan-2 (pending return 0 unit sisa tapi has_pending_return: true)
			// loan-3 diabaikan karena sudah selesai penuh
			expect(summary.totalOpenLoans).toBe(2);
			expect(summary.totalOutstandingUnits).toBe(2); // 2 + 0
			expect(summary.overdueCount).toBe(1); // loan-1 umur 9 hari
			expect(summary.pendingReturnsCount).toBe(1); // loan-2

			// Memastikan pinjaman overdue diurutkan di posisi pertama
			expect(summary.loans[0].id).toBe("loan-1");
			expect(summary.loans[0].isOverdue).toBe(true);
			expect(summary.loans[0].agingDays).toBe(9);

			expect(summary.loans[1].id).toBe("loan-2");
			expect(summary.loans[1].isOverdue).toBe(false);
			expect(summary.loans[1].hasPendingReturn).toBe(true);
		});

		it("menangani daftar pinjaman kosong secara aman", () => {
			const emptySummary = summarizeAuditorLoans([]);
			expect(emptySummary.totalOpenLoans).toBe(0);
			expect(emptySummary.totalOutstandingUnits).toBe(0);
			expect(emptySummary.overdueCount).toBe(0);
			expect(emptySummary.loans).toHaveLength(0);
		});
	});
});
