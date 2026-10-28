import type { Item } from "@/types/api";
import type { TransactionFormData } from "./lib/transactionSchema";

export * from "./lib/transactionSchema";

export type TransactionAction = "take" | "add" | "borrow" | "return";

export interface ItemDetailSheetProps {
	item: Item | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onActionSelect?: (item: Item, action: TransactionAction) => void;
	onTransactSubmit?: (
		item: Item,
		action: TransactionAction,
		data: TransactionFormData,
	) => Promise<void> | void;
	enableInternalForm?: boolean;
	isSubmitting?: boolean;
	className?: string;
}

export interface TransactionFormProps {
	item: Item;
	action: TransactionAction;
	onSubmit: (data: TransactionFormData) => Promise<void> | void;
	onCancel?: () => void;
	isSubmitting?: boolean;
	className?: string;
}

export interface TransactItemPayload {
	client_uuid: string;
	quantity: number;
	occurred_at?: string;
	notes?: string;
	reference_number?: string;
}

export interface LedgerUserEmployee {
	namecode: string;
	department?: string;
}

export interface LedgerUser {
	id: string;
	name: string;
	employee?: LedgerUserEmployee;
}

export interface LedgerItemResource {
	id: string;
	item_id?: string;
	user_id?: string;
	type: "in" | "out" | "borrow" | "return" | "adjustment";
	quantity: number;
	stock_before: number;
	stock_after: number;
	notes?: string | null;
	reference_number?: string | null;
	client_uuid?: string;
	occurred_at: string;
	created_at: string;
	user?: LedgerUser & { employee_name?: string };
	item?: {
		id: string;
		name?: string;
		sku?: string;
		current_stock: number;
		unit?: string;
		updated_at?: string;
	};
}

export interface TransactApiResponse {
	success: boolean;
	message: string;
	data: LedgerItemResource;
	meta?: {
		replayed?: boolean;
		code?: string;
	};
}

export interface TransactSubmitResult {
	success: boolean;
	synced: boolean;
	queued: boolean;
	rejected?: boolean;
	authError?: boolean;
	outboxItem: import("@/lib/db").OutboxItem;
	error?: import("@/lib/errors").AppError;
	replayed?: boolean;
	message: string;
	response?: TransactApiResponse;
}

export interface EnqueueTransactionParams {
	item: Item;
	action: TransactionAction;
	formData: TransactionFormData;
	loanId?: string;
	employeeId?: string;
	customClientUuid?: string;
	customOccurredAt?: string;
}
