import type { Item } from "@/types/api";

export interface AssetLoanReturn {
	id: string;
	asset_loan_id: string;
	ledger_id?: string;
	quantity: number;
	returned_at: string;
}

export interface AssetLoan {
	id: string;
	item_id: string;
	item_name?: string;
	item_sku?: string;
	image_thumb_url?: string | null;
	quantity: number;
	returned_quantity: number;
	outstanding_quantity: number;
	borrowed_at: string;
	fully_returned_at?: string | null;
	status: "borrowed" | "returned";
	item?: Item;
	returns?: AssetLoanReturn[];
}

export interface LoansQueryParams {
	status?: "open" | "all";
	per_page?: number;
	page?: number;
}

export interface LoansApiResponse {
	success: boolean;
	data: AssetLoan[];
	message?: string;
	meta?: {
		current_page?: number;
		last_page?: number;
		per_page?: number;
		total?: number;
	};
}

/**
 * Entitas pinjaman dengan proyeksi sisa lokal (Task P4.4).
 * Mengurangi sisa pinjaman secara proaktif jika terdapat transaksi return di outbox Dexie yang masih pending.
 */
export interface ProjectedAssetLoan extends AssetLoan {
	server_outstanding_quantity: number;
	server_returned_quantity: number;
	pending_return_quantity: number;
	effective_outstanding_quantity: number;
	effective_status: "borrowed" | "returned" | "pending_sync";
	has_pending_return: boolean;
}

export interface ProjectedLoanStats {
	totalOpenLoans: number;
	totalOutstandingItems: number;
	totalReturnedItems: number;
	totalPendingReturns: number;
}
