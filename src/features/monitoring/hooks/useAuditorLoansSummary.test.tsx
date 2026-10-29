import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as loansApi from "@/features/loans/api/getLoans";
import type { AssetLoan } from "@/features/loans/types";
import { useAuditorLoansSummary } from "./useAuditorLoansSummary";

vi.mock("@/features/loans/api/getLoans", () => ({
	getMyLoansApi: vi.fn(),
}));

describe("useAuditorLoansSummary Hook (Task P6.2)", () => {
	let queryClient: QueryClient;

	beforeEach(() => {
		vi.clearAllMocks();
		queryClient = new QueryClient({
			defaultOptions: {
				queries: {
					retry: false,
				},
			},
		});
	});

	const wrapper = ({ children }: { children: React.ReactNode }) => (
		<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
	);

	it("merangkum pinjaman terbuka auditor dari API getMyLoansApi", async () => {
		const mockLoans: AssetLoan[] = [
			{
				id: "loan-1",
				item_id: "item-1",
				item_name: "Multimeter Fluke 87V",
				item_sku: "AST-FLK-087",
				quantity: 2,
				returned_quantity: 0,
				outstanding_quantity: 2,
				borrowed_at: "2026-10-20T10:00:00.000Z",
				status: "borrowed",
			},
		];

		vi.mocked(loansApi.getMyLoansApi).mockResolvedValueOnce(mockLoans);

		const { result } = renderHook(() => useAuditorLoansSummary(), {
			wrapper,
		});

		await waitFor(() => {
			expect(result.current.isLoading).toBe(false);
		});

		expect(result.current.summary.totalOpenLoans).toBe(1);
		expect(result.current.summary.totalOutstandingUnits).toBe(2);
		expect(result.current.summary.loans[0].itemName).toBe(
			"Multimeter Fluke 87V",
		);
		expect(result.current.summary.loans[0].isOverdue).toBe(true);
	});
});
