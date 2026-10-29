import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import type { ApiResponse, InventoryLedger, Item } from "@/types/api";
import { getItemLedgerApi } from "./api/getItemLedger";
import { ItemDetailSheet } from "./components/ItemDetailSheet";
import { ItemLedgerHistory } from "./components/ItemLedgerHistory";

// Mock api axios instance
vi.mock("@/lib/api", () => ({
	api: {
		get: vi.fn(),
		post: vi.fn(),
	},
	setAuthTokenGetter: vi.fn(),
	setUnauthorizedHandler: vi.fn(),
	getActiveAuthToken: vi.fn(() => null),
	AUTH_EXPIRED_EVENT: "inventory:auth-expired",
}));

function renderWithQueryClient(ui: React.ReactElement) {
	const queryClient = new QueryClient({
		defaultOptions: {
			queries: {
				retry: false,
				gcTime: 0,
			},
		},
	});

	return render(
		<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
	);
}

const mockItem: Item = {
	id: "item-01",
	sku: "SKU-PPR-A4",
	name: "Kertas HVS A4 80gr",
	type: "consumable",
	unit: "rim",
	location_id: "loc-01",
	current_stock: 25,
	minimum_stock: 5,
	image_url: null,
	location: {
		id: "loc-01",
		name: "Gudang Utama",
		code: "GDG-01",
	},
	updated_at: "2026-10-27T10:00:00Z",
};

const mockLedgerData: InventoryLedger[] = [
	{
		id: "led-01",
		item_id: "item-01",
		user_id: "usr-01",
		type: "out",
		quantity: 2,
		stock_before: 27,
		stock_after: 25,
		notes: "Untuk laporan audit semester",
		reference_number: "REQ-2026-001",
		occurred_at: "2026-10-27T08:30:00Z",
		created_at: "2026-10-27T08:30:00Z",
		user: {
			id: "usr-01",
			name: "Budi Santoso",
			employee_name: "Budi Santoso",
			email: "budi@inalum.id",
		},
	},
	{
		id: "led-02",
		item_id: "item-01",
		user_id: "usr-02",
		type: "in",
		quantity: 10,
		stock_before: 17,
		stock_after: 27,
		notes: "Restock mingguan logistik",
		reference_number: "PO-7788",
		occurred_at: "2026-10-26T14:00:00Z",
		created_at: "2026-10-26T14:00:00Z",
		user: {
			id: "usr-02",
			name: "Siti Rahma",
			employee_name: "Siti Rahma",
			email: "siti@inalum.id",
		},
	},
	{
		id: "led-03",
		item_id: "item-01",
		user_id: "usr-03",
		type: "adjustment",
		quantity: 3,
		stock_before: 20,
		stock_after: 17,
		notes: "Koreksi stock opname akhir bulan",
		reference_number: "OPNAME-990",
		occurred_at: "2026-10-25T11:00:00Z",
		created_at: "2026-10-25T11:00:00Z",
		user: {
			id: "usr-03",
			name: "Ahmad Fauzi",
			employee_name: "Ahmad Fauzi",
		},
	},
];

describe("Task P3.6: Riwayat Ledger Per Item Suite", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.resetAllMocks();
	});

	describe("getItemLedgerApi", () => {
		it("calls backend GET endpoint with proper query parameters", async () => {
			const mockResponse: ApiResponse<InventoryLedger[]> = {
				success: true,
				message: "Berhasil memuat riwayat transaksi.",
				data: mockLedgerData,
				meta: {
					current_page: 1,
					last_page: 1,
					per_page: 15,
					total: 3,
				},
			};

			vi.mocked(api.get).mockResolvedValueOnce({ data: mockResponse });

			const result = await getItemLedgerApi("item-01", {
				page: 1,
				perPage: 15,
			});

			expect(api.get).toHaveBeenCalledWith("/inventory/items/item-01/ledger", {
				params: {
					page: 1,
					per_page: 15,
				},
			});
			expect(result.data).toHaveLength(3);
			expect(result.data[0].notes).toBe("Untuk laporan audit semester");
		});
	});

	describe("ItemLedgerHistory Component", () => {
		it("renders loading skeleton initially and displays ledger cards once loaded", async () => {
			const mockResponse: ApiResponse<InventoryLedger[]> = {
				success: true,
				data: mockLedgerData,
				meta: {
					current_page: 1,
					last_page: 1,
					per_page: 10,
					total: 3,
				},
			};

			vi.mocked(api.get).mockResolvedValueOnce({ data: mockResponse });

			renderWithQueryClient(
				<ItemLedgerHistory itemId="item-01" itemUnit="rim" />,
			);

			expect(screen.getByTestId("item-ledger-history")).toBeDefined();

			await waitFor(() => {
				expect(screen.getByText("Ambil Barang")).toBeDefined();
				expect(screen.getByText("Tambah Stok")).toBeDefined();
				expect(screen.getByText("Koreksi Stok")).toBeDefined();
			});

			// Cek nama pelaku (D8 & §16: Tampilkan nama pelaku, bukan namecode)
			expect(screen.getByText("Budi Santoso")).toBeDefined();
			expect(screen.getByText("Siti Rahma")).toBeDefined();
			expect(screen.getByText("Ahmad Fauzi")).toBeDefined();

			// Cek kuantitas & stok transisi
			expect(screen.getByText("-2 rim")).toBeDefined();
			expect(screen.getByText("Stok: 27 → 25")).toBeDefined();
			expect(screen.getByText("+10 rim")).toBeDefined();
			expect(screen.getByText("Stok: 17 → 27")).toBeDefined();

			// Cek catatan & referensi
			expect(screen.getByText('"Untuk laporan audit semester"')).toBeDefined();
			expect(screen.getByText("Ref: REQ-2026-001")).toBeDefined();
		});

		it("renders empty state cleanly when item has no ledger history", async () => {
			const emptyResponse: ApiResponse<InventoryLedger[]> = {
				success: true,
				data: [],
				meta: {
					current_page: 1,
					last_page: 1,
					per_page: 10,
					total: 0,
				},
			};

			vi.mocked(api.get).mockResolvedValueOnce({ data: emptyResponse });

			renderWithQueryClient(
				<ItemLedgerHistory itemId="item-01" itemUnit="rim" />,
			);

			await waitFor(() => {
				expect(screen.getByTestId("ledger-empty")).toBeDefined();
				expect(screen.getByText("Belum ada riwayat transaksi")).toBeDefined();
			});
		});

		it("renders friendly error state when network/server call fails and allows retry", async () => {
			vi.mocked(api.get).mockRejectedValueOnce(new Error("Network Error"));

			renderWithQueryClient(
				<ItemLedgerHistory itemId="item-01" itemUnit="rim" retry={false} />,
			);

			await waitFor(() => {
				expect(screen.getByTestId("ledger-error")).toBeDefined();
				expect(
					screen.getByText(/Gagal memuat riwayat transaksi dari server/),
				).toBeDefined();
			});

			const retryBtn = screen.getByRole("button", { name: /Coba Lagi/i });
			expect(retryBtn).toBeDefined();

			const successResponse: ApiResponse<InventoryLedger[]> = {
				success: true,
				data: mockLedgerData,
				meta: { total: 3 },
			};
			vi.mocked(api.get).mockResolvedValueOnce({ data: successResponse });

			fireEvent.click(retryBtn);

			await waitFor(() => {
				expect(screen.getByText("Budi Santoso")).toBeDefined();
			});
		});

		it("handles pagination navigation when total pages exceeds 1", async () => {
			const page1Response: ApiResponse<InventoryLedger[]> = {
				success: true,
				data: [mockLedgerData[0]],
				meta: {
					current_page: 1,
					last_page: 2,
					per_page: 1,
					total: 2,
				},
			};

			vi.mocked(api.get).mockResolvedValueOnce({ data: page1Response });

			renderWithQueryClient(
				<ItemLedgerHistory itemId="item-01" itemUnit="rim" />,
			);

			await waitFor(() => {
				expect(screen.getByText("Hal. 1 dari 2")).toBeDefined();
			});

			const page2Response: ApiResponse<InventoryLedger[]> = {
				success: true,
				data: [mockLedgerData[1]],
				meta: {
					current_page: 2,
					last_page: 2,
					per_page: 1,
					total: 2,
				},
			};
			vi.mocked(api.get).mockResolvedValueOnce({ data: page2Response });

			const nextBtn = screen.getByRole("button", {
				name: /Halaman berikutnya/i,
			});
			fireEvent.click(nextBtn);

			await waitFor(() => {
				expect(api.get).toHaveBeenCalledWith(
					"/inventory/items/item-01/ledger",
					expect.objectContaining({
						params: expect.objectContaining({ page: 2 }),
					}),
				);
			});
		});
	});

	describe("ItemDetailSheet Integration with Ledger History", () => {
		it("switches seamlessly between 'Detail Barang' and 'Riwayat Transaksi' tabs", async () => {
			const mockResponse: ApiResponse<InventoryLedger[]> = {
				success: true,
				data: mockLedgerData,
				meta: { total: 3 },
			};

			vi.mocked(api.get).mockResolvedValue({ data: mockResponse });

			renderWithQueryClient(
				<ItemDetailSheet item={mockItem} open={true} onOpenChange={() => {}} />,
			);

			// Awalnya di tab detail
			expect(screen.getByText("Nomor SKU")).toBeDefined();
			expect(screen.getByText("SKU-PPR-A4")).toBeDefined();
			expect(screen.getByText("Informasi Ketersediaan")).toBeDefined();

			// Klik tab 'Riwayat Transaksi'
			const historyTabBtn = screen.getByTestId("tab-history-btn");
			fireEvent.click(historyTabBtn);

			// Tampilan beralih ke Riwayat Transaksi
			await waitFor(() => {
				expect(screen.getByTestId("item-ledger-history")).toBeDefined();
				expect(screen.getByText("Budi Santoso")).toBeDefined();
			});

			// Klik kembali ke tab 'Detail Barang'
			const detailTabBtn = screen.getByTestId("tab-detail-btn");
			fireEvent.click(detailTabBtn);

			expect(screen.getByText("Nomor SKU")).toBeDefined();
			expect(screen.getByText("SKU-PPR-A4")).toBeDefined();
		});
	});
});
