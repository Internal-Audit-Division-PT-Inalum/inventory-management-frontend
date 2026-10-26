// ==============================================================================
// INVENTORY SYSTEM PWA — API CONTRACT TYPES
// Selaras 100% dengan Domain Backend Laravel 11 (Divisi Internal Audit PT INALUM)
// ==============================================================================

export type InventoryItemType = "consumable" | "asset";

export type KioskItemStockStatus = "ok" | "low" | "empty";

export type LedgerTransactionType =
	| "in"
	| "out"
	| "borrow"
	| "return"
	| "adjustment";

// --- Location Entity ---
export interface Location {
	id: string;
	name: string;
	code: string;
	description?: string | null;
	created_at?: string;
	updated_at?: string;
}

// --- Item Entity ---
export interface Item {
	id: string;
	sku: string;
	name: string;
	type: InventoryItemType;
	unit: string;
	location_id: string;
	current_stock: number;
	minimum_stock: number;
	image_url: string | null;
	image_thumb_url?: string | null;
	borrowed_quantity?: number | null;
	stock_status?: KioskItemStockStatus;
	location?: Location;
	created_at?: string;
	updated_at: string;
}

// --- Inventory Ledger (Append-Only Audit Trail) ---
export interface InventoryLedger {
	id: string;
	item_id: string;
	user_id: string;
	type: LedgerTransactionType;
	quantity: number;
	stock_before: number;
	stock_after: number;
	notes?: string | null;
	reference_number?: string | null;
	client_uuid?: string | null;
	occurred_at?: string | null;
	created_at: string;
	user?: {
		id: string;
		name: string;
		email: string;
	};
	item?: {
		id: string;
		name: string;
		sku: string;
		current_stock: number;
	};
	meta?: {
		replayed?: boolean;
	};
}

// --- Asset Loan & Returns ---
export interface AssetLoanReturn {
	id: string;
	asset_loan_id: string;
	ledger_id: string;
	quantity: number;
	returned_at: string;
}

export interface AssetLoan {
	id: string;
	item_id: string;
	employee_id: string;
	quantity: number;
	returned_quantity: number;
	borrowed_at: string;
	fully_returned_at?: string | null;
	item?: Item;
	returns?: AssetLoanReturn[];
}

// --- Employee & Authentication ---
export interface Employee {
	id: string;
	user_id: string;
	namecode: string;
	name: string;
	email: string;
	role?: string;
	is_active: boolean;
	must_change_pin: boolean;
	pin_set_at?: string | null;
}

export interface AuthSession {
	token: string;
	must_change_pin: boolean;
	employee: Employee;
}

// --- Standard API Response Envelope ---
export interface ApiResponse<T> {
	success: boolean;
	data: T;
	message?: string;
	meta?: {
		code?: string;
		generated_at?: string;
		replayed?: boolean;
		current_page?: number;
		last_page?: number;
		per_page?: number;
		total?: number;
	};
}

export interface ApiErrorResponse {
	success: false;
	message: string;
	meta?: {
		code?: string;
	};
	errors?: Record<string, string[]>;
}

// --- Catalog Response (Cached via ETag) ---
export interface CatalogResponse {
	locations: Location[];
	items: Item[];
	meta: {
		generated_at: string;
		etag?: string;
	};
}
