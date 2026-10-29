import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { AuditorLoansSummary } from "../types";
import { LoanSummaryWidget } from "./LoanSummaryWidget";

describe("LoanSummaryWidget Component (Task P6.2)", () => {
	const mockSummary: AuditorLoansSummary = {
		totalOpenLoans: 2,
		totalOutstandingUnits: 3,
		overdueCount: 1,
		pendingReturnsCount: 1,
		loans: [
			{
				id: "loan-1",
				itemId: "item-1",
				itemName: "Multimeter Fluke 87V",
				itemSku: "AST-FLK-087",
				itemUnit: "unit",
				borrowedAt: "2026-10-20T10:00:00.000Z",
				borrowedQuantity: 2,
				returnedQuantity: 0,
				effectiveOutstandingQuantity: 2,
				agingDays: 9,
				isOverdue: true,
				hasPendingReturn: false,
			},
			{
				id: "loan-2",
				itemId: "item-2",
				itemName: "Torque Wrench 1/2 Inch",
				itemSku: "AST-TRQ-001",
				itemUnit: "unit",
				borrowedAt: "2026-10-27T10:00:00.000Z",
				borrowedQuantity: 1,
				returnedQuantity: 0,
				effectiveOutstandingQuantity: 1,
				agingDays: 2,
				isOverdue: false,
				hasPendingReturn: true,
			},
		],
	};

	it("merender daftar pinjaman terbuka dengan indikator overdue dan status pengembalian antre", () => {
		render(
			<MemoryRouter>
				<LoanSummaryWidget summary={mockSummary} />
			</MemoryRouter>,
		);

		expect(screen.getByText("Pinjaman Aset Saya")).toBeDefined();
		expect(screen.getByText("1 Perlu Dikembalikan")).toBeDefined();

		// Loan 1
		expect(screen.getByText("Multimeter Fluke 87V")).toBeDefined();
		expect(screen.getByText("(AST-FLK-087)")).toBeDefined();
		expect(screen.getByText("> 7 Hari")).toBeDefined();

		// Loan 2
		expect(screen.getByText("Torque Wrench 1/2 Inch")).toBeDefined();
		expect(screen.getByText("(AST-TRQ-001)")).toBeDefined();
		expect(screen.getByText("Pengembalian Antre")).toBeDefined();
	});

	it("merender empty state positif saat tidak ada pinjaman aktif", () => {
		const emptySummary: AuditorLoansSummary = {
			totalOpenLoans: 0,
			totalOutstandingUnits: 0,
			overdueCount: 0,
			pendingReturnsCount: 0,
			loans: [],
		};

		render(
			<MemoryRouter>
				<LoanSummaryWidget summary={emptySummary} />
			</MemoryRouter>,
		);

		expect(screen.getByText("Bebas Tanggungan")).toBeDefined();
		expect(screen.getByText("Tidak Ada Tanggungan Peralatan")).toBeDefined();
	});

	it("memicu onManageLoansClick saat tombol aksi diklik", () => {
		const handleManage = vi.fn();
		render(
			<MemoryRouter>
				<LoanSummaryWidget
					summary={mockSummary}
					onManageLoansClick={handleManage}
				/>
			</MemoryRouter>,
		);

		const button = screen.getByText("Kelola Pinjaman Saya di Tab Pinjaman");
		fireEvent.click(button);
		expect(handleManage).toHaveBeenCalledTimes(1);
	});
});
