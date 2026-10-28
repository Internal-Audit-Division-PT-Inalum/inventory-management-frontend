import { api } from "@/lib/api";
import type { AssetLoan, LoansApiResponse, LoansQueryParams } from "../types";

/**
 * Mengambil daftar pinjaman aset milik pegawai saat ini dari backend API.
 * Mendukung filter status:
 * - 'open' (default): hanya pinjaman yang belum lunas (whereNull fully_returned_at)
 * - 'all': seluruh pinjaman termasuk yang sudah dikembalikan penuh
 */
export async function getMyLoansApi(
	params: LoansQueryParams = {},
): Promise<AssetLoan[]> {
	const queryParams: Record<string, string | number> = {};

	if (params.status === "all") {
		queryParams.status = "all";
	}
	if (params.per_page) {
		queryParams.per_page = params.per_page;
	}
	if (params.page) {
		queryParams.page = params.page;
	}

	const response = await api.get<LoansApiResponse>("/inventory/loans/mine", {
		params: queryParams,
	});

	const rawData = response.data.data ?? [];

	// Normalisasi dan kalkulasi defensif untuk data pinjaman
	return rawData.map((loan) => {
		const qty = Number(loan.quantity) || 0;
		const retQty = Number(loan.returned_quantity) || 0;
		const outstanding =
			typeof loan.outstanding_quantity === "number"
				? loan.outstanding_quantity
				: Math.max(0, qty - retQty);

		return {
			...loan,
			quantity: qty,
			returned_quantity: retQty,
			outstanding_quantity: outstanding,
			status: loan.status || (outstanding === 0 ? "returned" : "borrowed"),
		};
	});
}
