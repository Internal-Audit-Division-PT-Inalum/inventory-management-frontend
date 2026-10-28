import { useQuery } from "@tanstack/react-query";
import type { ApiResponse, InventoryLedger } from "@/types/api";
import { getItemLedgerApi } from "../api/getItemLedger";

export interface UseItemLedgerOptions {
	page?: number;
	perPage?: number;
	enabled?: boolean;
	retry?: boolean | number;
}

export function useItemLedger(
	itemId: string | undefined,
	options: UseItemLedgerOptions = {},
) {
	const { page = 1, perPage = 15, enabled = true, retry } = options;

	const query = useQuery<ApiResponse<InventoryLedger[]>>({
		queryKey: ["item-ledger", itemId, page, perPage],
		queryFn: () => getItemLedgerApi(itemId as string, { page, perPage }),
		enabled: Boolean(itemId) && enabled,
		staleTime: 30 * 1000,
		retry:
			retry !== undefined
				? retry
				: (failureCount) => {
						if (failureCount >= 2) return false;
						return true;
					},
	});

	return {
		ledgers: query.data?.data ?? [],
		meta: query.data?.meta,
		isLoading: query.isLoading,
		isFetching: query.isFetching,
		isError: query.isError,
		error: query.error,
		refetch: query.refetch,
	};
}
