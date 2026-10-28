import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TRANSACTION_COMMITTED_EVENT } from "@/features/transactions/lib/outboxQueue";
import { db } from "@/lib/db";
import { LoansPage } from "@/pages/LoansPage";
import { LoanList } from "./components/LoanList";
import type { AssetLoan } from "./types";

describe("Task P4.5: Full Asset Loans Lifecycle & Empty State Integration Suite", () => {
	let queryClient: QueryClient;

	beforeEach(async () => {
		queryClient = new QueryClient({
			defaultOptions: {
				queries: { retry: false, gcTime: 0 },
			},
		});
		await db.outbox.clear();
		await db.items.clear();
		vi.restoreAllMocks();
	});

	const renderWithProviders = (ui: React.ReactElement) => {
		return render(
			<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
		);
	};

	describe("1. Empty States & Error Resilience", () => {
		it("renders contextual empty state with CTA button on active tab when there are no loans", async () => {
			vi.spyOn(
				await import("./api/getLoans"),
				"getMyLoansApi",
			).mockResolvedValue([]);

			renderWithProviders(<LoansPage />);

			await waitFor(() => {
				expect(screen.getByText("Tidak Ada Pinjaman Aktif")).toBeDefined();
			});

			expect(
				screen.getByText("Tidak ada pinjaman aset yang sedang aktif saat ini."),
			).toBeDefined();

			expect(
				screen.getByText(
					"Peralatan atau aset yang Anda pinjam dari inventaris akan tercatat dan ditampilkan di sini.",
				),
			).toBeDefined();

			const ctaButton = screen.getByRole("button", {
				name: /Buka Katalog & Pinjam Aset/i,
			});
			expect(ctaButton).toBeDefined();

			// Klik CTA mengarahkan ke rute katalog
			fireEvent.click(ctaButton);
			expect(window.location.hash).toBe("#/");
		});

		it("renders contextual empty state on history tab when no loans are completed", async () => {
			vi.spyOn(
				await import("./api/getLoans"),
				"getMyLoansApi",
			).mockResolvedValue([
				{
					id: "loan-active-only",
					item_id: "item-1",
					item_name: "Theodolite Digital",
					item_sku: "AST-THEO-01",
					quantity: 1,
					returned_quantity: 0,
					outstanding_quantity: 1,
					borrowed_at: "2026-10-25T08:00:00Z",
					status: "borrowed",
				},
			]);

			renderWithProviders(<LoansPage />);

			await waitFor(() => {
				expect(screen.getByText("Theodolite Digital")).toBeDefined();
			});

			// Pindah ke tab Riwayat Selesai
			const historyTab = screen.getByRole("button", {
				name: /Riwayat Selesai/i,
			});
			fireEvent.click(historyTab);

			await waitFor(() => {
				expect(screen.getByText("Belum Ada Riwayat Pinjaman")).toBeDefined();
			});

			expect(
				screen.getByText(
					"Belum ada riwayat pinjaman aset yang telah selesai dikembalikan.",
				),
			).toBeDefined();

			// Tab riwayat tidak boleh menampilkan CTA pinjam aset
			expect(
				screen.queryByRole("button", { name: /Buka Katalog & Pinjam Aset/i }),
			).toBeNull();
		});

		it("renders error state with retry action in LoanList and triggers onRetry callback", () => {
			const onRetryMock = vi.fn();
			render(
				<LoanList
					loans={[]}
					isLoading={false}
					error={new Error("Koneksi gateway terputus")}
					onRetry={onRetryMock}
				/>,
			);

			expect(screen.getByText("Gagal Memuat Daftar Pinjaman")).toBeDefined();
			expect(screen.getByText("Koneksi gateway terputus")).toBeDefined();

			const retryBtn = screen.getByRole("button", { name: /Coba Lagi/i });
			expect(retryBtn).toBeDefined();
			fireEvent.click(retryBtn);
			expect(onRetryMock).toHaveBeenCalledTimes(1);
		});

		it("renders skeleton loader during loading state", () => {
			render(<LoanList loans={[]} isLoading={true} />);

			// Memverifikasi keberadaan skeleton loader
			const skeletons = document.querySelectorAll(".animate-pulse");
			expect(skeletons.length).toBeGreaterThan(0);
		});
	});

	describe("2. Full Asset Loan & Return Lifecycle Integration", () => {
		it("executes complete lifecycle: active loan -> partial offline return with projection -> bounded second return -> full settlement and transition to history tab", async () => {
			const activeLoanInitial: AssetLoan = {
				id: "loan-e2e-1",
				item_id: "item-e2e-fluke",
				item_name: "Multimeter Fluke 179 True-RMS",
				item_sku: "AST-FLUKE-99",
				quantity: 4,
				returned_quantity: 0,
				outstanding_quantity: 4,
				borrowed_at: "2026-10-20T08:00:00Z",
				status: "borrowed",
			};

			const getLoansApiMock = vi.spyOn(
				await import("./api/getLoans"),
				"getMyLoansApi",
			);
			getLoansApiMock.mockResolvedValue([activeLoanInitial]);

			// Simpan data item aset ke IndexedDB untuk form transaksi
			await db.items.put({
				id: "item-e2e-fluke",
				name: "Multimeter Fluke 179 True-RMS",
				sku: "AST-FLUKE-99",
				type: "asset",
				unit: "unit",
				location_id: "loc-1",
				current_stock: 6,
				minimum_stock: 2,
				borrowed_quantity: 4,
				image_url: null,
				updated_at: "2026-10-20T08:00:00Z",
			});

			renderWithProviders(<LoansPage />);

			// --- FASE 1: Verifikasi Pinjaman Aktif Awal ---
			await waitFor(() => {
				expect(screen.getByText("Multimeter Fluke 179 True-RMS")).toBeDefined();
			});

			expect(screen.getByText("AST-FLUKE-99")).toBeDefined();
			expect(screen.getAllByText("4 Unit").length).toBeGreaterThanOrEqual(1);
			expect(screen.getByText("4 unit")).toBeDefined(); // Harus kembali 4 unit

			// --- FASE 2: Pengembalian Parsial Pertama (2 unit) ke Outbox ---
			// Buka dialog pengembalian
			const returnFirstBtn = screen.getByRole("button", {
				name: /Kembalikan/i,
			});
			fireEvent.click(returnFirstBtn);

			await waitFor(() => {
				expect(screen.getByText("Sisa: 4 Unit")).toBeDefined();
			});

			// Tambah kuantitas menjadi 2
			const plusBtn = screen.getByLabelText("Tambah jumlah pengembalian");
			fireEvent.click(plusBtn);

			// Submit pengembalian 2 unit
			const submitReturnBtn = screen.getByRole("button", {
				name: /Kembalikan 2 Unit/i,
			});
			fireEvent.click(submitReturnBtn);

			// Tunggu transaksi masuk ke antrean dan banner feedback muncul
			await waitFor(() => {
				expect(screen.getByTestId("transaction-feedback-banner")).toBeDefined();
				expect(
					screen.getAllByText(/Tercatat — Menunggu Sinkron/i).length,
				).toBeGreaterThanOrEqual(1);
			});

			// --- FASE 3: Verifikasi Proyeksi Lokal Sisa Berkurang ---
			// Sisa efektif harus langsung terpotong 2 unit (4 - 2 = 2 unit)
			await waitFor(() => {
				expect(screen.getByText("Sisa 2 Unit")).toBeDefined();
			});

			// Notice antrean perangkat tampil di kartu
			expect(
				screen.getByTestId("pending-return-notice-loan-e2e-1"),
			).toBeDefined();
			expect(screen.getByText(/2 unit pengembalian/)).toBeDefined();

			// --- FASE 4: Pengembalian Kedua Dibatasi Sisa Efektif 2 Unit ---
			const returnSecondBtn = screen.getByRole("button", {
				name: /Kembalikan/i,
			});
			fireEvent.click(returnSecondBtn);

			await waitFor(() => {
				// Header dialog sekarang harus merefleksikan sisa efektif 2
				expect(screen.getByText("Sisa: 2 Unit")).toBeDefined();
				// Tombol cepat harus "Semua (2)" bukan 4
				expect(screen.getByText("Semua (2)")).toBeDefined();
			});

			// Klik tombol "Semua (2)" untuk melunasi
			fireEvent.click(screen.getByText("Semua (2)"));

			// Keterangan pelunasan LUNAS (0 unit) muncul
			expect(screen.getByText(/LUNAS \(0 unit\)/)).toBeDefined();

			// Konfirmasi pelunasan
			const confirmFinalBtn = screen.getByRole("button", {
				name: /Kembalikan 2 Unit/i,
			});
			fireEvent.click(confirmFinalBtn);

			// --- FASE 5: Status Lunas (Menunggu Sinkron) di Tab Aktif ---
			await waitFor(() => {
				expect(screen.getByText("Lunas (Menunggu Sinkron)")).toBeDefined();
			});

			expect(
				screen.getByText("Pengembalian lunas dalam antrean sinkronisasi"),
			).toBeDefined();

			// --- FASE 6: Simulasi Sinkronisasi Server Berhasil & Transisi Tab ---
			// Update mock server menjadi fully returned dengan audit trail
			getLoansApiMock.mockResolvedValue([
				{
					id: "loan-e2e-1",
					item_id: "item-e2e-fluke",
					item_name: "Multimeter Fluke 179 True-RMS",
					item_sku: "AST-FLUKE-99",
					quantity: 4,
					returned_quantity: 4,
					outstanding_quantity: 0,
					borrowed_at: "2026-10-20T08:00:00Z",
					fully_returned_at: "2026-10-27T14:00:00Z",
					status: "returned",
					returns: [
						{
							id: "ret-1",
							asset_loan_id: "loan-e2e-1",
							quantity: 2,
							returned_at: "2026-10-27T10:00:00Z",
						},
						{
							id: "ret-2",
							asset_loan_id: "loan-e2e-1",
							quantity: 2,
							returned_at: "2026-10-27T14:00:00Z",
						},
					],
				},
			]);

			// Hapus item pending di IndexedDB (simulasi outbox selesai tersinkronisasi)
			await db.outbox.clear();

			// Pancarkan event transaksi komited ke window untuk memicu re-fetch otomatis
			window.dispatchEvent(
				new CustomEvent(TRANSACTION_COMMITTED_EVENT, { detail: {} }),
			);

			// Verifikasi tab aktif sekarang kosong (Semua Pinjaman Beres)
			await waitFor(() => {
				expect(screen.getByText("Tidak Ada Pinjaman Aktif")).toBeDefined();
			});

			// Pindah ke tab "Riwayat Selesai"
			const historyTab = screen.getByRole("button", {
				name: /Riwayat Selesai/i,
			});
			fireEvent.click(historyTab);

			// Kartu pinjaman lunas tampil di tab riwayat
			await waitFor(() => {
				expect(screen.getByText("Multimeter Fluke 179 True-RMS")).toBeDefined();
			});

			expect(screen.getByText("Lunas")).toBeDefined();
			expect(screen.getByText("Selesai & Lunas:")).toBeDefined();

			// Buka accordion riwayat pengembalian
			const historyAccordionBtn = screen.getByRole("button", {
				name: /Riwayat Pengembalian \(2 Tahap\)/i,
			});
			fireEvent.click(historyAccordionBtn);

			// Linimasa vertikal audit trail tahapan pengembalian tampil
			await waitFor(() => {
				expect(screen.getByText("Tahap 1: Kembalikan 2 Unit")).toBeDefined();
				expect(screen.getByText("Tahap 2: Kembalikan 2 Unit")).toBeDefined();
				expect(screen.getByText("Pelunasan")).toBeDefined();
			});
		});
	});
});
