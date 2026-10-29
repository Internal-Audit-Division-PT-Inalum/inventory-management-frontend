import { useMemo } from "react";
import { useMyLoans } from "@/features/loans";
import {
	DEFAULT_LOAN_OVERDUE_DAYS,
	summarizeAuditorLoans,
} from "../lib/loanSummary";
import type { AuditorLoansSummary } from "../types";

export interface UseAuditorLoansSummaryOptions {
	overdueThresholdDays?: number;
	enabled?: boolean;
}

export interface UseAuditorLoansSummaryResult {
	summary: AuditorLoansSummary;
	isLoading: boolean;
	isFetching: boolean;
	isError: boolean;
	error: Error | null;
	refetch: () => Promise<unknown>;
}

const DEFAULT_SUMMARY: AuditorLoansSummary = {
	totalOpenLoans: 0,
	totalOutstandingUnits: 0,
	overdueCount: 0,
	pendingReturnsCount: 0,
	loans: [],
};

/**
 * Hook untuk memuat dan mengkalkulasi ringkasan pinjaman auditor aktif (Task P6.2).
 * Memanfaatkan useMyLoans dengan proyeksi mutasi antrean outbox lokal.
 */
export function useAuditorLoansSummary(
	options: UseAuditorLoansSummaryOptions = {},
): UseAuditorLoansSummaryResult {
	const { overdueThresholdDays = DEFAULT_LOAN_OVERDUE_DAYS, enabled = true } =
		options;

	const { loans, isLoading, isFetching, isError, error, refetch } = useMyLoans({
		status: "open",
		enabled,
	});

	const summary = useMemo(() => {
		if (loans.length === 0) {
			return DEFAULT_SUMMARY;
		}
		return summarizeAuditorLoans(loans, overdueThresholdDays);
	}, [loans, overdueThresholdDays]);

	return {
		summary,
		isLoading,
		isFetching,
		isError,
		error,
		refetch,
	};
}
