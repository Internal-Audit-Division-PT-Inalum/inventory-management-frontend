import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LoansPage } from "@/pages/LoansPage";
import { LoanCard } from "./components/LoanCard";
import { LoanReturnTimeline } from "./components/LoanReturnTimeline";
import type { AssetLoan, AssetLoanReturn } from "./types";

function createTestQueryClient() {
	return new QueryClient({
		defaultOptions: {
			queries: {
				retry: false,
				gcTime: 0,
			},
		},
	});
}

function renderWithQueryClient(ui: React.ReactElement) {
	const testClient = createTestQueryClient();
	return render(
		<QueryClientProvider client={testClient}>{ui}</QueryClientProvider>,
	);
}

describe("Task P4.3: Loan History & Return Timeline Feature Suite", () => {
	const mockReturns: AssetLoanReturn[] = [
		{
			id: "ret-1",
			asset_loan_id: "loan-active-1",
			quantity: 2,
			returned_at: "2026-10-25T10:00:00Z",
		},
		{
			id: "ret-2",
			asset_loan_id: "loan-active-1",
			quantity: 3,
			returned_at: "2026-10-26T14:30:00Z",
		},
	];

	const mockActiveLoanWithHistory: AssetLoan = {
		id: "loan-active-1",
		item_id: "item-asset-01",
		item_name: "Laser Distance Meter Bosch GLM 50",
		item_sku: "AST-BOSCH-001",
		quantity: 6,
		returned_quantity: 2,
		outstanding_quantity: 4,
		borrowed_at: "2026-10-24T08:00:00Z",
		fully_returned_at: null,
		status: "borrowed",
		returns: [mockReturns[0]],
	};

	const mockFullyReturnedLoan: AssetLoan = {
		id: "loan-history-1",
		item_id: "item-asset-02",
		item_name: "Multimeter Digital Fluke 179",
		item_sku: "AST-FLUKE-002",
		quantity: 5,
		returned_quantity: 5,
		outstanding_quantity: 0,
		borrowed_at: "2026-10-20T08:00:00Z",
		fully_returned_at: "2026-10-26T14:30:00Z",
		status: "returned",
		returns: mockReturns,
	};

	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("1. LoanReturnTimeline Component", () => {
		it("renders timeline stages, quantities, and WIB dates accurately", () => {
			render(
				<LoanReturnTimeline returns={mockReturns} totalBorrowedQuantity={5} />,
			);

			expect(screen.getByText("Tahap 1: Kembalikan 2 Unit")).toBeDefined();
			expect(screen.getByText("Parsial")).toBeDefined();
			expect(
				screen.getAllByText(/Total dikembalikan hingga tahap ini:/)[0],
			).toBeDefined();
			expect(screen.getByText("2 dari 5 unit")).toBeDefined();

			expect(screen.getByText("Tahap 2: Kembalikan 3 Unit")).toBeDefined();
			expect(screen.getByText("Pelunasan")).toBeDefined();
			expect(screen.getByText("5 dari 5 unit")).toBeDefined();
		});

		it("renders fallback message when returns list is empty", () => {
			render(<LoanReturnTimeline returns={[]} />);
			expect(
				screen.getByText("Belum ada riwayat pengembalian untuk pinjaman ini."),
			).toBeDefined();
		});
	});

	describe("2. LoanCard Timeline Integration", () => {
		it("renders toggle button for return history and expands timeline on click", () => {
			render(<LoanCard loan={mockActiveLoanWithHistory} />);

			const toggleButton = screen.getByRole("button", {
				name: /riwayat pengembalian \(1 tahap\)/i,
			});
			expect(toggleButton).toBeDefined();

			// Awalnya linimasa tertutup
			expect(screen.queryByText("Tahap 1: Kembalikan 2 Unit")).toBeNull();

			// Klik untuk membuka
			fireEvent.click(toggleButton);
			expect(screen.getByText("Tahap 1: Kembalikan 2 Unit")).toBeDefined();

			// Klik lagi untuk menutup
			fireEvent.click(toggleButton);
			expect(screen.queryByText("Tahap 1: Kembalikan 2 Unit")).toBeNull();
		});

		it("displays fully returned date timestamp on returned loan card", () => {
			render(<LoanCard loan={mockFullyReturnedLoan} />);

			expect(screen.getByText("Selesai & Lunas:")).toBeDefined();
			expect(screen.getByText(/26 Okt 2026, 21\.30/)).toBeDefined();
			expect(screen.getByText("Lunas")).toBeDefined();
		});
	});

	describe("3. Segmented Tab Navigation in LoansPage", () => {
		it("switches cleanly between Pinjaman Aktif and Riwayat Selesai tabs", async () => {
			vi.spyOn(
				await import("./api/getLoans"),
				"getMyLoansApi",
			).mockResolvedValueOnce([
				mockActiveLoanWithHistory,
				mockFullyReturnedLoan,
			]);

			renderWithQueryClient(<LoansPage />);

			// Tunggu data ter-render penuh
			await waitFor(() => {
				expect(
					screen.getByText("Laser Distance Meter Bosch GLM 50"),
				).toBeDefined();
			});
			expect(screen.queryByText("Multimeter Digital Fluke 179")).toBeNull();

			// Klik tab "Riwayat Selesai"
			const historyTabBtn = screen.getByRole("button", {
				name: /riwayat selesai/i,
			});
			fireEvent.click(historyTabBtn);

			// Tab riwayat selesai menampilkan mockFullyReturnedLoan, bukan mockActiveLoanWithHistory
			expect(screen.getByText("Multimeter Digital Fluke 179")).toBeDefined();
			expect(
				screen.queryByText("Laser Distance Meter Bosch GLM 50"),
			).toBeNull();

			// Klik kembali ke tab "Pinjaman Aktif"
			const activeTabBtn = screen.getByRole("button", {
				name: /pinjaman aktif/i,
			});
			fireEvent.click(activeTabBtn);
			expect(
				screen.getByText("Laser Distance Meter Bosch GLM 50"),
			).toBeDefined();
		});

		it("displays appropriate empty state when active or history tab is empty", async () => {
			// Hanya ada pinjaman aktif, tidak ada riwayat selesai
			vi.spyOn(
				await import("./api/getLoans"),
				"getMyLoansApi",
			).mockResolvedValueOnce([mockActiveLoanWithHistory]);

			renderWithQueryClient(<LoansPage />);

			await waitFor(() => {
				expect(
					screen.getByText("Laser Distance Meter Bosch GLM 50"),
				).toBeDefined();
			});

			// Pindah ke tab riwayat selesai
			const historyTabBtn = screen.getByRole("button", {
				name: /riwayat selesai/i,
			});
			fireEvent.click(historyTabBtn);

			// Muncul empty state riwayat
			expect(
				screen.getByText(
					"Belum ada riwayat pinjaman aset yang telah selesai dikembalikan.",
				),
			).toBeDefined();
		});
	});
});
