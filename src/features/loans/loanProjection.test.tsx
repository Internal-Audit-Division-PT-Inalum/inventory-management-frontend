import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { LoanCard } from "./components/LoanCard";
import { ReturnLoanDialog } from "./components/ReturnLoanDialog";
import { useMyLoans } from "./hooks/useMyLoans";
import type { ProjectedAssetLoan } from "./types";

function TestHookComponent() {
	const { loans, stats, pendingOutboxCount } = useMyLoans({
		status: "all",
	});
	return (
		<div>
			<div data-testid="outbox-count">{pendingOutboxCount}</div>
			<div data-testid="open-loans">{stats.totalOpenLoans}</div>
			<div data-testid="outstanding-items">{stats.totalOutstandingItems}</div>
			<div data-testid="pending-returns">{stats.totalPendingReturns}</div>
			<ul data-testid="loans-list">
				{loans.map((l) => (
					<li key={l.id} data-testid={`item-${l.id}`}>
						{l.item_sku} - sisa:{l.outstanding_quantity} - status:
						{l.effective_status}
					</li>
				))}
			</ul>
		</div>
	);
}

describe("Task P4.4: Loan Projection UI & Integration Suite", () => {
	const queryClient = new QueryClient({
		defaultOptions: {
			queries: { retry: false, gcTime: 0 },
		},
	});

	beforeEach(async () => {
		queryClient.clear();
		await db.outbox.clear();
	});

	const mockPartialProjectedLoan: ProjectedAssetLoan = {
		id: "loan-proj-1",
		item_id: "item-fluke-1",
		item_name: "Multimeter Fluke 179 True-RMS",
		item_sku: "AST-FLUKE-001",
		quantity: 5,
		returned_quantity: 3, // 1 server + 2 pending outbox
		outstanding_quantity: 2, // Sisa efektif 2
		server_outstanding_quantity: 4,
		server_returned_quantity: 1,
		pending_return_quantity: 2,
		effective_outstanding_quantity: 2,
		effective_status: "borrowed",
		has_pending_return: true,
		borrowed_at: "2026-10-20T10:00:00Z",
		status: "borrowed",
	};

	const mockPendingSyncLoan: ProjectedAssetLoan = {
		id: "loan-proj-2",
		item_id: "item-caliper-2",
		item_name: "Digital Caliper Mitutoyo 150mm",
		item_sku: "AST-MITU-002",
		quantity: 2,
		returned_quantity: 2,
		outstanding_quantity: 0,
		server_outstanding_quantity: 2,
		server_returned_quantity: 0,
		pending_return_quantity: 2,
		effective_outstanding_quantity: 0,
		effective_status: "pending_sync",
		has_pending_return: true,
		borrowed_at: "2026-10-22T10:00:00Z",
		status: "borrowed",
	};

	describe("1. LoanCard with Projected State", () => {
		it("renders pending return notice and projected remaining badge", () => {
			const onReturnMock = vi.fn();
			render(
				<LoanCard
					loan={mockPartialProjectedLoan}
					onReturnClick={onReturnMock}
				/>,
			);

			// Memverifikasi badge sisa efektif (2 unit, bukan 4 unit server)
			expect(screen.getByText("Sisa 2 Unit")).toBeDefined();
			expect(screen.getByText("2 unit")).toBeDefined();

			// Notice antrean perangkat
			expect(
				screen.getByTestId("pending-return-notice-loan-proj-1"),
			).toBeDefined();
			expect(screen.getByText(/2 unit pengembalian/)).toBeDefined();
			expect(
				screen.getByText(
					/sedang dalam antrean perangkat dan menunggu sinkronisasi\./,
				),
			).toBeDefined();

			// Tombol kembalikan tetap ada untuk sisa 2 unit
			const returnBtn = screen.getByRole("button", { name: /Kembalikan/i });
			expect(returnBtn).toBeDefined();
			fireEvent.click(returnBtn);
			expect(onReturnMock).toHaveBeenCalledWith(mockPartialProjectedLoan);
		});

		it("renders Lunas (Menunggu Sinkron) badge and replaces action button when pending_sync", () => {
			render(<LoanCard loan={mockPendingSyncLoan} />);

			// Badge status berubah menjadi Lunas (Menunggu Sinkron)
			expect(screen.getByText("Lunas (Menunggu Sinkron)")).toBeDefined();

			// Tombol Kembalikan diganti dengan keterangan informatif
			expect(
				screen.queryByRole("button", { name: /^Kembalikan$/i }),
			).toBeNull();
			expect(
				screen.getByText("Pengembalian lunas dalam antrean sinkronisasi"),
			).toBeDefined();
		});
	});

	describe("2. ReturnLoanDialog Bounds Guard", () => {
		it("restricts max return quantity to projected effective outstanding", () => {
			const onSubmitMock = vi.fn();
			render(
				<ReturnLoanDialog
					open={true}
					onOpenChange={vi.fn()}
					loan={mockPartialProjectedLoan}
					onSubmit={onSubmitMock}
				/>,
			);

			// Tombol cepat harus 'Semua (2)', bukan sisa server 4
			expect(screen.getByText("Semua (2)")).toBeDefined();

			// Keterangan sisa di header dialog
			expect(screen.getByText(/Sisa:\s*2\s*Unit/)).toBeDefined();

			// Tombol tambah (+) harus disabled jika mencapai nilai efektif 2
			const plusBtn = screen.getByLabelText("Tambah jumlah pengembalian");
			expect((plusBtn as HTMLButtonElement).disabled).toBe(false);

			// Klik tambah 1x -> quantity jadi 2 (maksimal)
			fireEvent.click(plusBtn);
			const input = screen.getByLabelText(
				/Jumlah Pengembalian/,
			) as HTMLInputElement;
			expect(input.value).toBe("2");

			// Sekarang plusBtn harus disabled
			expect((plusBtn as HTMLButtonElement).disabled).toBe(true);

			// Indikator bahwa pengembalian ini akan melunasi pinjaman
			expect(screen.getByText(/LUNAS \(0 unit\)/)).toBeDefined();
		});
	});

	describe("3. useMyLoans Hook Reactive Projection", () => {
		it("projects loan reduction when pending return is enqueued in Dexie outbox", async () => {
			// Mock API server loans
			vi.spyOn(
				await import("./api/getLoans"),
				"getMyLoansApi",
			).mockResolvedValue([
				{
					id: "loan-server-1",
					item_id: "item-123",
					item_sku: "AST-BOSCH-01",
					quantity: 4,
					returned_quantity: 0,
					outstanding_quantity: 4,
					borrowed_at: "2026-10-20T10:00:00Z",
					status: "borrowed",
				},
			]);

			// Masukkan pending return 3 unit ke Dexie outbox
			await db.enqueueOutboxItem({
				clientUuid: "uuid-hook-test",
				employeeId: "emp-test",
				operation: "return",
				itemId: "item-123",
				loanId: "loan-server-1",
				quantity: 3,
				occurredAt: "2026-10-27T10:00:00Z",
				status: "pending",
				attempts: 0,
				createdAt: "2026-10-27T10:00:00Z",
			});

			render(
				<QueryClientProvider client={queryClient}>
					<TestHookComponent />
				</QueryClientProvider>,
			);

			// Tunggu data diproyeksikan
			await waitFor(() => {
				// Sisa efektif terproyeksi harus 1 (4 - 3)
				expect(screen.getByTestId("item-loan-server-1").textContent).toContain(
					"sisa:1",
				);
			});

			expect(screen.getByTestId("outstanding-items").textContent).toBe("1");
			expect(screen.getByTestId("pending-returns").textContent).toBe("3");
			expect(screen.getByTestId("outbox-count").textContent).toBe("1");
		});
	});
});
