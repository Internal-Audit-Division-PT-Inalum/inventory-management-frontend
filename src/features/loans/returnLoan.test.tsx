import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as outboxQueueModule from "@/features/transactions/lib/outboxQueue";
import { db } from "@/lib/db";
import { LoansPage } from "@/pages/LoansPage";
import { ReturnLoanDialog } from "./components/ReturnLoanDialog";
import { createReturnLoanSchema } from "./lib/returnLoanSchema";
import type { AssetLoan } from "./types";

function createTestQueryClient() {
	return new QueryClient({
		defaultOptions: {
			queries: {
				retry: false,
				gcTime: 0,
			},
		},
	});
}

function renderWithQueryClient(ui: React.ReactElement) {
	const testClient = createTestQueryClient();
	return render(
		<QueryClientProvider client={testClient}>{ui}</QueryClientProvider>,
	);
}

describe("Task P4.2: Partial & Full Loan Return Engine Suite", () => {
	const mockLoan: AssetLoan = {
		id: "loan-active-1",
		item_id: "item-asset-01",
		item_name: "Laser Distance Meter Bosch GLM 50",
		item_sku: "AST-BOSCH-001",
		image_thumb_url: null,
		quantity: 5,
		returned_quantity: 2,
		outstanding_quantity: 3,
		borrowed_at: "2026-10-25T08:00:00Z",
		fully_returned_at: null,
		status: "borrowed",
	};

	beforeEach(async () => {
		await db.items.clear();
		await db.outbox.clear();
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("1. Zod Schema: createReturnLoanSchema", () => {
		it("validates successful submission with valid partial quantity", () => {
			const schema = createReturnLoanSchema({ maxOutstanding: 3 });
			const result = schema.safeParse({
				quantity: 2,
				notes: "Pengembalian 2 unit proyek A",
				reference_number: "BA-001",
			});

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.quantity).toBe(2);
				expect(result.data.notes).toBe("Pengembalian 2 unit proyek A");
				expect(result.data.reference_number).toBe("BA-001");
			}
		});

		it("rejects quantity <= 0", () => {
			const schema = createReturnLoanSchema({ maxOutstanding: 3 });
			const result = schema.safeParse({ quantity: 0 });

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.issues[0].message).toContain(
					"Minimal jumlah pengembalian adalah 1 unit",
				);
			}
		});

		it("rejects non-integer / decimal quantity", () => {
			const schema = createReturnLoanSchema({ maxOutstanding: 3 });
			const result = schema.safeParse({ quantity: 1.5 });

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.issues[0].message).toContain(
					"harus berupa bilangan bulat",
				);
			}
		});

		it("rejects quantity exceeding max outstanding loan", () => {
			const schema = createReturnLoanSchema({ maxOutstanding: 3 });
			const result = schema.safeParse({ quantity: 4 });

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.issues[0].message).toContain(
					"tidak boleh melebihi sisa pinjaman (3 unit)",
				);
			}
		});

		it("allows full return equal to max outstanding", () => {
			const schema = createReturnLoanSchema({ maxOutstanding: 3 });
			const result = schema.safeParse({ quantity: 3 });

			expect(result.success).toBe(true);
		});

		it("trims whitespace from optional notes and reference number", () => {
			const schema = createReturnLoanSchema({ maxOutstanding: 3 });
			const result = schema.safeParse({
				quantity: 1,
				notes: "   catatan dengan spasi   ",
				reference_number: "   REF-99   ",
			});

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.notes).toBe("catatan dengan spasi");
				expect(result.data.reference_number).toBe("REF-99");
			}
		});
	});

	describe("2. ReturnLoanDialog Component", () => {
		it("renders loan details, SKU, and remaining badge correctly", () => {
			render(
				<ReturnLoanDialog
					loan={mockLoan}
					open={true}
					onOpenChange={vi.fn()}
					onSubmit={vi.fn()}
				/>,
			);

			expect(screen.getByText("AST-BOSCH-001")).toBeDefined();
			expect(
				screen.getByText("Kembalikan Laser Distance Meter Bosch GLM 50"),
			).toBeDefined();
			expect(screen.getByText("Sisa: 3 Unit")).toBeDefined();
			expect(screen.getByText("Maks. 3 unit")).toBeDefined();
		});

		it("stepper increments and decrements within bounds [1, maxOutstanding]", () => {
			render(
				<ReturnLoanDialog
					loan={mockLoan}
					open={true}
					onOpenChange={vi.fn()}
					onSubmit={vi.fn()}
				/>,
			);

			const minusBtn = screen.getByRole("button", {
				name: /kurangi jumlah/i,
			});
			const plusBtn = screen.getByRole("button", {
				name: /tambah jumlah/i,
			});

			// Default adalah 1, sehingga minus button disabled
			expect((minusBtn as HTMLButtonElement).disabled).toBe(true);
			expect((plusBtn as HTMLButtonElement).disabled).toBe(false);

			// Klik tambah 1 -> quantity = 2
			fireEvent.click(plusBtn);
			expect((minusBtn as HTMLButtonElement).disabled).toBe(false);
			expect(screen.getByText("2 unit")).toBeDefined();

			// Klik tambah lagi -> quantity = 3 (mencapai maxOutstanding)
			fireEvent.click(plusBtn);
			expect((plusBtn as HTMLButtonElement).disabled).toBe(true);
			expect(screen.getByText("LUNAS (0 unit)")).toBeDefined();
		});

		it("sets all button fills max outstanding quantity immediately", () => {
			render(
				<ReturnLoanDialog
					loan={mockLoan}
					open={true}
					onOpenChange={vi.fn()}
					onSubmit={vi.fn()}
				/>,
			);

			const setAllBtn = screen.getByRole("button", {
				name: /semua \(3\)/i,
			});
			fireEvent.click(setAllBtn);

			expect(screen.getByText("LUNAS (0 unit)")).toBeDefined();
			expect((setAllBtn as HTMLButtonElement).disabled).toBe(true);
		});

		it("calls onSubmit with valid form data and closes dialog", async () => {
			const onSubmitMock = vi.fn().mockResolvedValueOnce(undefined);
			const onOpenChangeMock = vi.fn();

			render(
				<ReturnLoanDialog
					loan={mockLoan}
					open={true}
					onOpenChange={onOpenChangeMock}
					onSubmit={onSubmitMock}
				/>,
			);

			// Tambah kuantitas menjadi 2
			const plusBtn = screen.getByRole("button", {
				name: /tambah jumlah/i,
			});
			fireEvent.click(plusBtn);

			// Isi catatan
			const notesInput = screen.getByPlaceholderText(
				/kondisi barang, lokasi penyimpanan/i,
			);
			fireEvent.change(notesInput, {
				target: { value: "Dikembalikan dalam kondisi baik" },
			});

			// Isi nomor referensi
			const refInput = screen.getByPlaceholderText(/contoh: ba-ret/i);
			fireEvent.change(refInput, { target: { value: "BA-RET-001" } });

			// Submit
			const submitBtn = screen.getByRole("button", {
				name: /kembalikan 2 unit/i,
			});
			fireEvent.click(submitBtn);

			await waitFor(() => {
				expect(onSubmitMock).toHaveBeenCalledWith({
					quantity: 2,
					notes: "Dikembalikan dalam kondisi baik",
					reference_number: "BA-RET-001",
				});
			});
		});

		it("displays error message if onSubmit throws an error", async () => {
			const onSubmitMock = vi
				.fn()
				.mockRejectedValueOnce(
					new Error("Gagal mengembalikan aset: server error"),
				);

			render(
				<ReturnLoanDialog
					loan={mockLoan}
					open={true}
					onOpenChange={vi.fn()}
					onSubmit={onSubmitMock}
				/>,
			);

			const submitBtn = screen.getByRole("button", {
				name: /kembalikan 1 unit/i,
			});
			fireEvent.click(submitBtn);

			await waitFor(() => {
				expect(
					screen.getByText("Gagal mengembalikan aset: server error"),
				).toBeDefined();
			});
		});
	});

	describe("3. LoansPage Integration with Return Flow", () => {
		it("opens return dialog on return click, enqueues return transaction, and shows feedback banner", async () => {
			const enqueueSpy = vi
				.spyOn(outboxQueueModule, "enqueueAndProcessTransaction")
				.mockResolvedValueOnce({
					success: true,
					synced: true,
					queued: false,
					message: "Barang aset berhasil dikembalikan.",
					outboxItem: {
						clientUuid: "return-uuid-001",
						employeeId: "emp-test",
						operation: "return",
						itemId: "item-asset-01",
						quantity: 1,
						status: "synced",
						attempts: 1,
						occurredAt: "2026-10-27T08:00:00Z",
						createdAt: "2026-10-27T08:00:00Z",
					},
				});

			// Mock getLoans API
			vi.spyOn(
				await import("./api/getLoans"),
				"getMyLoansApi",
			).mockResolvedValueOnce([mockLoan]);

			renderWithQueryClient(<LoansPage />);

			// Tunggu kartu pinjaman tampil
			await waitFor(() => {
				expect(
					screen.getByText("Laser Distance Meter Bosch GLM 50"),
				).toBeDefined();
			});

			// Klik tombol "Kembalikan" pada kartu
			const cardReturnBtn = screen.getByRole("button", {
				name: /kembalikan/i,
			});
			fireEvent.click(cardReturnBtn);

			// Dialog pengembalian terbuka
			expect(
				screen.getByText("Kembalikan Laser Distance Meter Bosch GLM 50"),
			).toBeDefined();

			// Klik tombol submit di dialog
			const dialogSubmitBtn = screen.getByRole("button", {
				name: /kembalikan 1 unit/i,
			});
			fireEvent.click(dialogSubmitBtn);

			// Verifikasi pemanggilan enqueueAndProcessTransaction
			await waitFor(() => {
				expect(enqueueSpy).toHaveBeenCalledWith(
					expect.objectContaining({
						action: "return",
						formData: expect.objectContaining({
							quantity: 1,
						}),
					}),
				);
			});

			// Verifikasi banner feedback muncul
			await waitFor(() => {
				expect(
					screen.getByText("Barang aset berhasil dikembalikan."),
				).toBeDefined();
			});
		});
	});
});
