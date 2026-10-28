import { api } from "@/lib/api";
import type { ApiResponse, InventoryLedger } from "@/types/api";

export interface GetItemLedgerParams {
	page?: number;
	perPage?: number;
}

/**
 * Mengambil riwayat transaksi (audit trail ledger) untuk item tertentu dari backend.
 * Mendukung pagination (page & per_page).
 */
export async function getItemLedgerApi(
	itemId: string,
	params?: GetItemLedgerParams,
): Promise<ApiResponse<InventoryLedger[]>> {
	const page = params?.page ?? 1;
	const perPage = params?.perPage ?? 15;

	const response = await api.get<ApiResponse<InventoryLedger[]>>(
		`/inventory/items/${itemId}/ledger`,
		{
			params: {
				page,
				per_page: perPage,
			},
		},
	);

	return response.data;
}
