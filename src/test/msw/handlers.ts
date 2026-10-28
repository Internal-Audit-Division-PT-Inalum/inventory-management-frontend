import { HttpResponse, http } from "msw";
import type {
	LedgerItemResource,
	TransactItemPayload,
} from "@/features/transactions/types";

export interface MockStoreItem {
	id: string;
	sku: string;
	name: string;
	type: "consumable" | "asset";
	current_stock: number;
	minimum_stock: number;
	borrowed_quantity: number;
	unit: string;
}

// In-memory stateful store untuk simulasi backend Laravel
export const mockItemStore: Record<string, MockStoreItem> = {
	"item-consumable-1": {
		id: "item-consumable-1",
		sku: "SKU-KRT-A4",
		name: "Kertas HVS A4",
		type: "consumable",
		current_stock: 20,
		minimum_stock: 5,
		borrowed_quantity: 0,
		unit: "rim",
	},
	"item-asset-1": {
		id: "item-asset-1",
		sku: "SKU-PROJ-01",
		name: "Proyektor Epson",
		type: "asset",
		current_stock: 10,
		minimum_stock: 1,
		borrowed_quantity: 2,
		unit: "unit",
	},
};

// Penyimpanan transaksi untuk pengujian replay idempotency (client_uuid)
export const processedTransactions = new Map<
	string,
	{
		payload: TransactItemPayload;
		response: LedgerItemResource;
		userId: string;
	}
>();

// Control flags untuk pengujian skenario galat
export const mswControl = {
	simulateNetworkError: false,
	simulateServerError: false,
	simulateAuthExpired: false,
	simulateLockout: false,
	idempotencyUserConflict: false,
};

export function resetMswStore(): void {
	mockItemStore["item-consumable-1"] = {
		id: "item-consumable-1",
		sku: "SKU-KRT-A4",
		name: "Kertas HVS A4",
		type: "consumable",
		current_stock: 20,
		minimum_stock: 5,
		borrowed_quantity: 0,
		unit: "rim",
	};

	mockItemStore["item-asset-1"] = {
		id: "item-asset-1",
		sku: "SKU-PROJ-01",
		name: "Proyektor Epson",
		type: "asset",
		current_stock: 10,
		minimum_stock: 1,
		borrowed_quantity: 2,
		unit: "unit",
	};

	processedTransactions.clear();
	mswControl.simulateNetworkError = false;
	mswControl.simulateServerError = false;
	mswControl.simulateAuthExpired = false;
	mswControl.simulateLockout = false;
	mswControl.idempotencyUserConflict = false;
}

export const transactionHandlers = [
	// Transaksi Item (take, add, borrow, return)
	http.post(
		"*/inventory/items/:itemId/:operation",
		async ({ params, request }) => {
			const itemId = params.itemId as string;
			const operation = params.operation as string;
			const payload = (await request.json()) as TransactItemPayload;

			// 1. Simulasi kegagalan jaringan / offline tiba-tiba
			if (mswControl.simulateNetworkError) {
				return HttpResponse.error();
			}

			// 2. Simulasi Server Error 500
			if (mswControl.simulateServerError) {
				return HttpResponse.json(
					{
						success: false,
						message: "Server internal mengalami gangguan.",
						meta: { code: "SERVER_ERROR" },
					},
					{ status: 500 },
				);
			}

			// 3. Simulasi Auth Expired 401
			if (mswControl.simulateAuthExpired) {
				return HttpResponse.json(
					{
						success: false,
						message: "Sesi Anda telah berakhir.",
						meta: { code: "UNAUTHENTICATED" },
					},
					{ status: 401 },
				);
			}

			// 4. Simulasi Akun Terkunci 423
			if (mswControl.simulateLockout) {
				return HttpResponse.json(
					{
						success: false,
						message: "Akun terkunci sementara karena percobaan PIN salah.",
						meta: {
							code: "ACCOUNT_LOCKED",
							seconds_remaining: 300,
						},
					},
					{ status: 423 },
				);
			}

			const item = mockItemStore[itemId];
			if (!item) {
				return HttpResponse.json(
					{
						success: false,
						message: "Barang tidak ditemukan.",
						meta: { code: "ITEM_NOT_FOUND" },
					},
					{ status: 404 },
				);
			}

			// 5. Cek Idempotency Replay via client_uuid
			if (payload.client_uuid) {
				const existing = processedTransactions.get(payload.client_uuid);
				if (existing) {
					if (mswControl.idempotencyUserConflict) {
						return HttpResponse.json(
							{
								success: false,
								message: "UUID idempotensi telah digunakan oleh pengguna lain.",
								meta: { code: "IDEMPOTENCY_CONFLICT" },
							},
							{ status: 409 },
						);
					}

					// Replay yang sah: kembalikan ledger yang sama tanpa mengubah stok
					return HttpResponse.json(
						{
							success: true,
							message: "Transaksi sudah pernah diproses (idempotent replay).",
							data: existing.response,
							meta: { replayed: true, code: "OK" },
						},
						{
							status: 200,
							headers: { Date: new Date().toUTCString() },
						},
					);
				}
			}

			const qty = payload.quantity;
			const stockBefore = item.current_stock;
			let stockAfter = stockBefore;

			// 6. Validasi Aturan Bisnis berdasarkan jenis operasi
			if (operation === "take") {
				if (item.type !== "consumable") {
					return HttpResponse.json(
						{
							success: false,
							message: "Operasi take hanya untuk barang habis pakai.",
							meta: { code: "INVALID_OPERATION" },
						},
						{ status: 422 },
					);
				}
				if (qty > item.current_stock) {
					return HttpResponse.json(
						{
							success: false,
							message: "Stok barang tidak mencukupi untuk jumlah yang diminta.",
							meta: { code: "INSUFFICIENT_STOCK" },
						},
						{ status: 422 },
					);
				}
				item.current_stock -= qty;
				stockAfter = item.current_stock;
			} else if (operation === "add") {
				if (item.type !== "consumable") {
					return HttpResponse.json(
						{
							success: false,
							message: "Operasi add hanya untuk barang habis pakai.",
							meta: { code: "INVALID_OPERATION" },
						},
						{ status: 422 },
					);
				}
				item.current_stock += qty;
				stockAfter = item.current_stock;
			} else if (operation === "borrow") {
				if (item.type !== "asset") {
					return HttpResponse.json(
						{
							success: false,
							message: "Operasi borrow hanya untuk barang aset.",
							meta: { code: "INVALID_OPERATION" },
						},
						{ status: 422 },
					);
				}
				if (qty > item.current_stock) {
					return HttpResponse.json(
						{
							success: false,
							message: "Aset yang tersedia tidak mencukupi untuk dipinjam.",
							meta: { code: "INSUFFICIENT_STOCK" },
						},
						{ status: 422 },
					);
				}
				item.current_stock -= qty;
				item.borrowed_quantity += qty;
				stockAfter = item.current_stock;
			} else if (operation === "return") {
				if (item.type !== "asset") {
					return HttpResponse.json(
						{
							success: false,
							message: "Operasi return hanya untuk barang aset.",
							meta: { code: "INVALID_OPERATION" },
						},
						{ status: 422 },
					);
				}
				if (qty > item.borrowed_quantity) {
					return HttpResponse.json(
						{
							success: false,
							message: "Jumlah pengembalian melebihi sisa pinjaman aktif.",
							meta: { code: "LOAN_EXCEEDS_OUTSTANDING" },
						},
						{ status: 422 },
					);
				}
				item.current_stock += qty;
				item.borrowed_quantity -= qty;
				stockAfter = item.current_stock;
			} else {
				return HttpResponse.json(
					{
						success: false,
						message: "Operasi tidak valid.",
						meta: { code: "INVALID_OPERATION" },
					},
					{ status: 400 },
				);
			}

			// 7. Bentuk entri LedgerItemResource resmi
			const ledgerResponse: LedgerItemResource = {
				id: `led-${Date.now()}`,
				item_id: item.id,
				user_id: "user-123",
				type:
					operation === "take"
						? "out"
						: operation === "add"
							? "in"
							: (operation as "borrow" | "return"),
				quantity: qty,
				stock_before: stockBefore,
				stock_after: stockAfter,
				notes: payload.notes || null,
				reference_number: payload.reference_number || null,
				client_uuid: payload.client_uuid,
				occurred_at: payload.occurred_at || new Date().toISOString(),
				created_at: new Date().toISOString(),
				user: {
					id: "user-123",
					name: "Budi Santoso",
					employee_name: "Budi Santoso",
				},
				item: {
					id: item.id,
					name: item.name,
					sku: item.sku,
					current_stock: stockAfter,
					unit: item.unit,
				},
			};

			// Simpan untuk proteksi replay berikutnya
			if (payload.client_uuid) {
				processedTransactions.set(payload.client_uuid, {
					payload,
					response: ledgerResponse,
					userId: "user-123",
				});
			}

			return HttpResponse.json(
				{
					success: true,
					message: `Transaksi ${operation} berhasil diproses.`,
					data: ledgerResponse,
					meta: { replayed: false, code: "OK" },
				},
				{
					status: 201,
					headers: { Date: new Date().toUTCString() },
				},
			);
		},
	),
];
