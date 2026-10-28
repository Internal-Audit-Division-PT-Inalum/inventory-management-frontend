import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { TRANSACTION_COMMITTED_EVENT } from "@/features/transactions/lib/outboxQueue";
import { db, type OutboxItem } from "@/lib/db";
import { getMyLoansApi } from "../api/getLoans";
import {
	calculateProjectedLoanStats,
	calculateProjectedLoans,
} from "../lib/projectedLoans";
import type {
	AssetLoan,
	LoansQueryParams,
	ProjectedAssetLoan,
	ProjectedLoanStats,
} from "../types";

export interface UseMyLoansOptions extends LoansQueryParams {
	enabled?: boolean;
	retry?: boolean | number;
}

export interface UseMyLoansResult {
	loans: ProjectedAssetLoan[];
	rawLoans: AssetLoan[];
	isLoading: boolean;
	isFetching: boolean;
	isError: boolean;
	error: Error | null;
	refetch: () => Promise<unknown>;
	stats: ProjectedLoanStats;
	pendingOutboxCount: number;
}

export function useMyLoans(options: UseMyLoansOptions = {}): UseMyLoansResult {
	const { status = "open", enabled = true, retry = 2 } = options;
	const queryClient = useQueryClient();

	const [pendingOutboxItems, setPendingOutboxItems] = React.useState<
		OutboxItem[]
	>([]);

	// 1. Muat antrean outbox pengembalian yang masih pending dari Dexie
	const refreshPendingOutbox = React.useCallback(async () => {
		try {
			const items = await db.getPendingOutboxItems();
			setPendingOutboxItems(items);
		} catch (err) {
			console.warn("Gagal memuat antrean pending outbox pinjaman:", err);
		}
	}, []);

	React.useEffect(() => {
		refreshPendingOutbox();
	}, [refreshPendingOutbox]);

	const queryKey = React.useMemo(() => ["loans", "mine", status], [status]);

	const query = useQuery<AssetLoan[], Error>({
		queryKey,
		queryFn: () => getMyLoansApi({ status }),
		enabled,
		staleTime: 30_000,
		gcTime: 5 * 60 * 1000,
		retry,
	});

	// 2. Sinkronisasi reaktif: bila ada transaksi baru atau outbox berubah, perbarui outbox dan refetch query
	React.useEffect(() => {
		function handleTransactionCommitted() {
			refreshPendingOutbox();
			queryClient.invalidateQueries({ queryKey: ["loans", "mine"] });
		}

		if (typeof window !== "undefined") {
			window.addEventListener(
				TRANSACTION_COMMITTED_EVENT,
				handleTransactionCommitted,
			);
			return () => {
				window.removeEventListener(
					TRANSACTION_COMMITTED_EVENT,
					handleTransactionCommitted,
				);
			};
		}
	}, [queryClient, refreshPendingOutbox]);

	const rawLoans = query.data ?? [];

	// 3. Proyeksikan sisa pinjaman secara proaktif terhadap antrean outbox (Task P4.4)
	const loans = React.useMemo(
		() => calculateProjectedLoans(rawLoans, pendingOutboxItems),
		[rawLoans, pendingOutboxItems],
	);

	// 4. Kalkulasi ringkasan statistik terproyeksi
	const stats = React.useMemo(
		() => calculateProjectedLoanStats(loans),
		[loans],
	);

	return {
		loans,
		rawLoans,
		isLoading: query.isLoading,
		isFetching: query.isFetching,
		isError: query.isError,
		error: query.error,
		refetch: query.refetch,
		stats,
		pendingOutboxCount: pendingOutboxItems.length,
	};
}
