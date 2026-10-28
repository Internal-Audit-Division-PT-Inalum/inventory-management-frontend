import { describe, expect, it } from "vitest";
import type { OutboxItem } from "@/lib/db";
import {
	calculateProjectedLoanStats,
	calculateProjectedLoans,
} from "./lib/projectedLoans";
import type { AssetLoan } from "./types";

describe("Task P4.4: calculateProjectedLoans Pure Engine Suite", () => {
	const mockBaseLoans: AssetLoan[] = [
		{
			id: "loan-1",
			item_id: "item-multimeter",
			item_name: "Multimeter Digital Fluke 179",
			item_sku: "AST-FLUKE-001",
			quantity: 5,
			returned_quantity: 1,
			outstanding_quantity: 4,
			borrowed_at: "2026-10-20T08:00:00Z",
			status: "borrowed",
		},
		{
			id: "loan-2",
			item_id: "item-caliper",
			item_name: "Digital Caliper Mitutoyo 150mm",
			item_sku: "AST-MITU-002",
			quantity: 2,
			returned_quantity: 0,
			outstanding_quantity: 2,
			borrowed_at: "2026-10-22T09:00:00Z",
			status: "borrowed",
		},
	];

	it("1. returns 1:1 server values when outbox has no pending returns", () => {
		const emptyOutbox: OutboxItem[] = [];
		const result = calculateProjectedLoans(mockBaseLoans, emptyOutbox);

		expect(result).toHaveLength(2);
		expect(result[0].outstanding_quantity).toBe(4);
		expect(result[0].server_outstanding_quantity).toBe(4);
		expect(result[0].pending_return_quantity).toBe(0);
		expect(result[0].has_pending_return).toBe(false);
		expect(result[0].effective_status).toBe("borrowed");

		expect(result[1].outstanding_quantity).toBe(2);
		expect(result[1].pending_return_quantity).toBe(0);
		expect(result[1].has_pending_return).toBe(false);
	});

	it("2. subtracts pending partial return from effective outstanding quantity", () => {
		const outboxWithPartialReturn: OutboxItem[] = [
			{
				clientUuid: "uuid-ret-1",
				employeeId: "emp-1",
				operation: "return",
				itemId: "item-multimeter",
				loanId: "loan-1",
				quantity: 2,
				occurredAt: "2026-10-27T10:00:00Z",
				status: "pending",
				attempts: 0,
				createdAt: "2026-10-27T10:00:00Z",
			},
		];

		const result = calculateProjectedLoans(
			mockBaseLoans,
			outboxWithPartialReturn,
		);

		// Loan 1: sisa awal 4, return pending 2 -> sisa efektif 2
		expect(result[0].server_outstanding_quantity).toBe(4);
		expect(result[0].pending_return_quantity).toBe(2);
		expect(result[0].effective_outstanding_quantity).toBe(2);
		expect(result[0].outstanding_quantity).toBe(2);
		expect(result[0].returned_quantity).toBe(3); // 1 server + 2 pending
		expect(result[0].has_pending_return).toBe(true);
		expect(result[0].effective_status).toBe("borrowed");

		// Loan 2 tidak terdampak
		expect(result[1].outstanding_quantity).toBe(2);
		expect(result[1].has_pending_return).toBe(false);
	});

	it("3. projects status to pending_sync when pending returns match full outstanding", () => {
		const outboxWithFullReturn: OutboxItem[] = [
			{
				clientUuid: "uuid-ret-full",
				employeeId: "emp-1",
				operation: "return",
				itemId: "item-caliper",
				loanId: "loan-2",
				quantity: 2,
				occurredAt: "2026-10-27T10:00:00Z",
				status: "pending",
				attempts: 0,
				createdAt: "2026-10-27T10:00:00Z",
			},
		];

		const result = calculateProjectedLoans(mockBaseLoans, outboxWithFullReturn);

		// Loan 2: sisa awal 2, return pending 2 -> sisa efektif 0, pending_sync
		expect(result[1].server_outstanding_quantity).toBe(2);
		expect(result[1].pending_return_quantity).toBe(2);
		expect(result[1].effective_outstanding_quantity).toBe(0);
		expect(result[1].outstanding_quantity).toBe(0);
		expect(result[1].returned_quantity).toBe(2);
		expect(result[1].has_pending_return).toBe(true);
		expect(result[1].effective_status).toBe("pending_sync");
	});

	it("4. protects against negative effective outstanding if outbox quantity exceeds server outstanding", () => {
		const outboxExcessive: OutboxItem[] = [
			{
				clientUuid: "uuid-excessive",
				employeeId: "emp-1",
				operation: "return",
				itemId: "item-caliper",
				loanId: "loan-2",
				quantity: 10, // Melebihi sisa 2
				occurredAt: "2026-10-27T10:00:00Z",
				status: "pending",
				attempts: 0,
				createdAt: "2026-10-27T10:00:00Z",
			},
		];

		const result = calculateProjectedLoans(mockBaseLoans, outboxExcessive);

		expect(result[1].effective_outstanding_quantity).toBe(0);
		expect(result[1].outstanding_quantity).toBe(0);
		expect(result[1].effective_status).toBe("pending_sync");
	});

	it("5. allocates returns via FIFO when outbox item has no loanId for same item", () => {
		const multiLoansSameItem: AssetLoan[] = [
			{
				id: "loan-old",
				item_id: "item-fluke",
				quantity: 3,
				returned_quantity: 0,
				outstanding_quantity: 3,
				borrowed_at: "2026-10-01T10:00:00Z", // Tertua
				status: "borrowed",
			},
			{
				id: "loan-new",
				item_id: "item-fluke",
				quantity: 4,
				returned_quantity: 0,
				outstanding_quantity: 4,
				borrowed_at: "2026-10-05T10:00:00Z", // Lebih baru
				status: "borrowed",
			},
		];

		// Return 4 unit umum (tanpa loanId)
		const generalReturn: OutboxItem[] = [
			{
				clientUuid: "uuid-fifo",
				employeeId: "emp-1",
				operation: "return",
				itemId: "item-fluke",
				quantity: 4,
				occurredAt: "2026-10-27T10:00:00Z",
				status: "pending",
				attempts: 0,
				createdAt: "2026-10-27T10:00:00Z",
			},
		];

		const result = calculateProjectedLoans(multiLoansSameItem, generalReturn);

		// Loan Old menerima 3 unit -> sisa 0 (pending_sync)
		const loanOld = result.find((l) => l.id === "loan-old");
		expect(loanOld?.effective_outstanding_quantity).toBe(0);
		expect(loanOld?.pending_return_quantity).toBe(3);
		expect(loanOld?.effective_status).toBe("pending_sync");

		// Loan New menerima sisa 1 unit -> sisa 3 (borrowed)
		const loanNew = result.find((l) => l.id === "loan-new");
		expect(loanNew?.effective_outstanding_quantity).toBe(3);
		expect(loanNew?.pending_return_quantity).toBe(1);
		expect(loanNew?.effective_status).toBe("borrowed");
	});

	it("6. ignores synced, rejected, failed, or non-return outbox items", () => {
		const mixedOutbox: OutboxItem[] = [
			{
				clientUuid: "uuid-synced",
				employeeId: "emp-1",
				operation: "return",
				itemId: "item-multimeter",
				loanId: "loan-1",
				quantity: 2,
				occurredAt: "2026-10-27T10:00:00Z",
				status: "synced", // Sudah disinkronkan, jangan kurangi lagi
				attempts: 1,
				createdAt: "2026-10-27T10:00:00Z",
			},
			{
				clientUuid: "uuid-rejected",
				employeeId: "emp-1",
				operation: "return",
				itemId: "item-multimeter",
				loanId: "loan-1",
				quantity: 1,
				occurredAt: "2026-10-27T10:00:00Z",
				status: "rejected", // Ditolak server
				attempts: 1,
				createdAt: "2026-10-27T10:00:00Z",
			},
			{
				clientUuid: "uuid-borrow",
				employeeId: "emp-1",
				operation: "borrow",
				itemId: "item-multimeter",
				quantity: 1,
				occurredAt: "2026-10-27T10:00:00Z",
				status: "pending",
				attempts: 0,
				createdAt: "2026-10-27T10:00:00Z",
			},
		];

		const result = calculateProjectedLoans(mockBaseLoans, mixedOutbox);

		// Loan 1 tidak boleh terpengaruh
		expect(result[0].effective_outstanding_quantity).toBe(4);
		expect(result[0].pending_return_quantity).toBe(0);
		expect(result[0].has_pending_return).toBe(false);
	});

	it("7. correctly computes projected loan statistics", () => {
		const projectedLoans = calculateProjectedLoans(mockBaseLoans, [
			{
				clientUuid: "uuid-stats-1",
				employeeId: "emp-1",
				operation: "return",
				itemId: "item-caliper",
				loanId: "loan-2",
				quantity: 2, // Lunas pinjaman 2
				occurredAt: "2026-10-27T10:00:00Z",
				status: "pending",
				attempts: 0,
				createdAt: "2026-10-27T10:00:00Z",
			},
		]);

		const stats = calculateProjectedLoanStats(projectedLoans);

		// Hanya loan 1 yang masih open (sisa 4). Loan 2 sisa efektif 0.
		expect(stats.totalOpenLoans).toBe(1);
		expect(stats.totalOutstandingItems).toBe(4);
		expect(stats.totalPendingReturns).toBe(2);
		expect(stats.totalReturnedItems).toBe(3); // loan 1: 1 + loan 2: 2
	});
});
