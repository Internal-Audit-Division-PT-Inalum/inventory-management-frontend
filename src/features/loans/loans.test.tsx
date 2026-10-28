import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	act,
	fireEvent,
	render,
	renderHook,
	screen,
	waitFor,
} from "@testing-library/react";
import type * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TRANSACTION_COMMITTED_EVENT } from "@/features/transactions/lib/outboxQueue";
import { api } from "@/lib/api";
import { getMyLoansApi } from "./api/getLoans";
import { LoanCard } from "./components/LoanCard";
import { LoanList } from "./components/LoanList";
import { useMyLoans } from "./hooks/useMyLoans";
import type { AssetLoan } from "./types";

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

describe("Task P4.1: Asset Loans Feature Suite", () => {
	const mockOpenLoan: AssetLoan = {
		id: "loan-01",
		item_id: "item-asset-01",
		item_name: "Laser Distance Meter Bosch GLM 50",
		item_sku: "AST-BOSCH-001",
		image_thumb_url: "https://example.com/bosch.jpg",
		quantity: 2,
		returned_quantity: 0,
		outstanding_quantity: 2,
		borrowed_at: "2026-10-26T08:00:00Z",
		fully_returned_at: null,
		status: "borrowed",
	};

	const mockPartialLoan: AssetLoan = {
		id: "loan-02",
		item_id: "item-asset-02",
		item_name: "Multimeter Digital Fluke 179",
		item_sku: "AST-FLUKE-002",
		image_thumb_url: null,
		quantity: 5,
		returned_quantity: 2,
		outstanding_quantity: 3,
		borrowed_at: "2026-10-25T09:00:00Z",
		fully_returned_at: null,
		status: "borrowed",
	};

	const mockReturnedLoan: AssetLoan = {
		id: "loan-03",
		item_id: "item-asset-03",
		item_name: "Proyektor Epson EB-E01",
		item_sku: "AST-EPSON-003",
		image_thumb_url: null,
		quantity: 1,
		returned_quantity: 1,
		outstanding_quantity: 0,
		borrowed_at: "2026-10-20T10:00:00Z",
		fully_returned_at: "2026-10-22T15:00:00Z",
		status: "returned",
	};

	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("1. getMyLoansApi", () => {
		it("calls /inventory/loans/mine without status param for open loans by default", async () => {
			const apiGetSpy = vi.spyOn(api, "get").mockResolvedValueOnce({
				data: {
					success: true,
					data: [mockOpenLoan, mockPartialLoan],
				},
			});

			const loans = await getMyLoansApi();

			expect(apiGetSpy).toHaveBeenCalledWith("/inventory/loans/mine", {
				params: {},
			});
			expect(loans).toHaveLength(2);
			expect(loans[0].id).toBe("loan-01");
			expect(loans[0].outstanding_quantity).toBe(2);
		});

		it("passes status=all when requesting complete loan history", async () => {
			const apiGetSpy = vi.spyOn(api, "get").mockResolvedValueOnce({
				data: {
					success: true,
					data: [mockOpenLoan, mockReturnedLoan],
				},
			});

			const loans = await getMyLoansApi({ status: "all" });

			expect(apiGetSpy).toHaveBeenCalledWith("/inventory/loans/mine", {
				params: { status: "all" },
			});
			expect(loans).toHaveLength(2);
			expect(loans[1].status).toBe("returned");
		});

		it("defensively calculates outstanding_quantity if missing from response", async () => {
			vi.spyOn(api, "get").mockResolvedValueOnce({
				data: {
					success: true,
					data: [
						{
							id: "loan-raw",
							item_id: "raw-01",
							quantity: 4,
							returned_quantity: 1,
							borrowed_at: "2026-10-25T10:00:00Z",
						},
					],
				},
			});

			const loans = await getMyLoansApi();
			expect(loans[0].outstanding_quantity).toBe(3);
			expect(loans[0].status).toBe("borrowed");
		});
	});

	describe("2. useMyLoans Hook", () => {
		it("fetches loans and computes statistics accurately", async () => {
			vi.spyOn(api, "get").mockResolvedValueOnce({
				data: {
					success: true,
					data: [mockOpenLoan, mockPartialLoan],
				},
			});

			const testClient = createTestQueryClient();
			const wrapper = ({ children }: { children: React.ReactNode }) => (
				<QueryClientProvider client={testClient}>
					{children}
				</QueryClientProvider>
			);

			const { result } = renderHook(() => useMyLoans(), { wrapper });

			await waitFor(() => expect(result.current.isLoading).toBe(false));

			expect(result.current.loans).toHaveLength(2);
			expect(result.current.stats.totalOpenLoans).toBe(2);
			expect(result.current.stats.totalOutstandingItems).toBe(5); // 2 + 3
			expect(result.current.stats.totalReturnedItems).toBe(2); // 0 + 2
		});

		it("refetches loans when TRANSACTION_COMMITTED_EVENT is broadcasted", async () => {
			const apiGetSpy = vi
				.spyOn(api, "get")
				.mockResolvedValueOnce({
					data: {
						success: true,
						data: [mockOpenLoan],
					},
				})
				.mockResolvedValueOnce({
					data: {
						success: true,
						data: [mockOpenLoan, mockPartialLoan],
					},
				});

			const testClient = createTestQueryClient();
			const wrapper = ({ children }: { children: React.ReactNode }) => (
				<QueryClientProvider client={testClient}>
					{children}
				</QueryClientProvider>
			);

			const { result } = renderHook(() => useMyLoans(), { wrapper });

			await waitFor(() => expect(result.current.loans).toHaveLength(1));

			act(() => {
				window.dispatchEvent(
					new CustomEvent(TRANSACTION_COMMITTED_EVENT, {
						detail: { clientUuid: "test-uuid" },
					}),
				);
			});

			await waitFor(() => expect(apiGetSpy).toHaveBeenCalledTimes(2));
		});
	});

	describe("3. LoanCard Component", () => {
		it("renders active loan details with SKU, title, date, and return button", () => {
			const onReturnMock = vi.fn();

			render(<LoanCard loan={mockOpenLoan} onReturnClick={onReturnMock} />);

			expect(screen.getByText("AST-BOSCH-001")).toBeDefined();
			expect(
				screen.getByText("Laser Distance Meter Bosch GLM 50"),
			).toBeDefined();
			expect(screen.getByText("2 Unit")).toBeDefined();
			expect(screen.getByText("Harus Kembali:")).toBeDefined();

			const returnButton = screen.getByRole("button", {
				name: /kembalikan/i,
			});
			expect(returnButton).toBeDefined();
			fireEvent.click(returnButton);
			expect(onReturnMock).toHaveBeenCalledWith(mockOpenLoan);
		});

		it("renders partial loan with progress bar and remaining items badge", () => {
			render(<LoanCard loan={mockPartialLoan} />);

			expect(screen.getByText("Sisa 3 Unit")).toBeDefined();
			expect(screen.getByText("Progres Pengembalian:")).toBeDefined();
			expect(screen.getByText("2 dari 5 unit (40%)")).toBeDefined();
		});

		it("renders fully returned loan with Lunas badge and no return button", () => {
			const onReturnMock = vi.fn();
			render(<LoanCard loan={mockReturnedLoan} onReturnClick={onReturnMock} />);

			expect(screen.getByText("Lunas")).toBeDefined();
			expect(screen.queryByRole("button", { name: /kembalikan/i })).toBeNull();
		});

		it("handles image error and falls back to icon gracefully", () => {
			render(<LoanCard loan={mockOpenLoan} />);

			const image = screen.getByAltText(
				"Laser Distance Meter Bosch GLM 50",
			) as HTMLImageElement;
			fireEvent.error(image);

			expect(
				screen.queryByAltText("Laser Distance Meter Bosch GLM 50"),
			).toBeNull();
		});
	});

	describe("4. LoanList Component", () => {
		it("renders skeletons when isLoading is true", () => {
			const { container } = render(<LoanList loans={[]} isLoading={true} />);
			const skeletons = container.querySelectorAll(".animate-pulse");
			expect(skeletons.length).toBeGreaterThan(0);
		});

		it("renders empty state card when loans list is empty", () => {
			render(
				<LoanList
					loans={[]}
					isLoading={false}
					emptyMessage="Tidak ada pinjaman."
				/>,
			);

			expect(screen.getByText("Semua Pinjaman Beres")).toBeDefined();
			expect(screen.getByText("Tidak ada pinjaman.")).toBeDefined();
		});

		it("renders error banner with retry button on error", () => {
			const onRefreshMock = vi.fn();
			render(
				<LoanList
					loans={[]}
					isLoading={false}
					error={new Error("Jaringan terputus")}
					onRefresh={onRefreshMock}
				/>,
			);

			expect(screen.getByText("Gagal Memuat Daftar Pinjaman")).toBeDefined();
			expect(screen.getByText("Jaringan terputus")).toBeDefined();

			const retryButton = screen.getByRole("button", {
				name: /coba lagi/i,
			});
			fireEvent.click(retryButton);
			expect(onRefreshMock).toHaveBeenCalledTimes(1);
		});

		it("renders multiple LoanCard items successfully", () => {
			render(
				<LoanList loans={[mockOpenLoan, mockPartialLoan]} isLoading={false} />,
			);

			expect(
				screen.getByText("Laser Distance Meter Bosch GLM 50"),
			).toBeDefined();
			expect(screen.getByText("Multimeter Digital Fluke 179")).toBeDefined();
		});
	});
});
