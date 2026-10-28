import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { OutboxItem } from "@/lib/db";
import type { Item } from "@/types/api";
import { TransactionFeedbackBanner } from "./components/TransactionFeedbackBanner";
import { TransactionFeedbackDialog } from "./components/TransactionFeedbackDialog";
import { formatTransactionFeedback } from "./lib/feedbackHelper";
import type { TransactSubmitResult } from "./types";

const mockItem: Item = {
	id: "item-001",
	sku: "SKU-KRT-A4",
	name: "Kertas HVS A4",
	type: "consumable",
	unit: "rim",
	location_id: "loc-01",
	current_stock: 50,
	minimum_stock: 10,
	image_url: null,
	updated_at: "2026-10-27T10:00:00Z",
};

const mockOutboxItem: OutboxItem = {
	clientUuid: "550e8400-e29b-41d4-a716-446655440000",
	employeeId: "emp-001",
	operation: "take",
	itemId: "item-001",
	quantity: 3,
	notes: "Untuk kebutuhan audit",
	referenceNumber: "REF-001",
	occurredAt: "2026-10-27T10:30:00.000Z",
	createdAt: "2026-10-27T10:30:00.000Z",
	status: "synced",
	attempts: 1,
	lastError: null,
};

const mockSyncedResult: TransactSubmitResult = {
	success: true,
	synced: true,
	queued: false,
	outboxItem: mockOutboxItem,
	message: "Barang berhasil diambil.",
};

const mockQueuedResult: TransactSubmitResult = {
	success: true,
	synced: false,
	queued: true,
	outboxItem: {
		...mockOutboxItem,
		status: "pending",
	},
	message:
		"Tersimpan di antrean perangkat (offline). Akan otomatis disinkronkan saat terhubung kembali.",
};

const mockRejectedResult: TransactSubmitResult = {
	success: false,
	synced: false,
	queued: false,
	rejected: true,
	outboxItem: {
		...mockOutboxItem,
		status: "rejected",
	},
	message: "Stok barang tidak mencukupi untuk jumlah yang diminta.",
};

describe("Task P3.7: Umpan Balik 'Tercatat' vs 'Tersinkron' Suite", () => {
	describe("formatTransactionFeedback Helper", () => {
		it("classifies synced transaction as 'Tersinkron'", () => {
			const feedback = formatTransactionFeedback(mockSyncedResult);

			expect(feedback.kind).toBe("synced");
			expect(feedback.badgeLabel).toBe("Tersinkron");
			expect(feedback.title).toBe("Transaksi Tersinkron");
			expect(feedback.actionLabel).toBe("Ambil Barang");
			expect(feedback.colorScheme.badgeText).toContain("text-emerald-800");
		});

		it("classifies queued/offline transaction as 'Tercatat — Menunggu Sinkron'", () => {
			const feedback = formatTransactionFeedback(mockQueuedResult);

			expect(feedback.kind).toBe("recorded_pending");
			expect(feedback.badgeLabel).toBe("Tercatat — Menunggu Sinkron");
			expect(feedback.title).toBe("Tercatat — Menunggu Sinkron");
			expect(feedback.colorScheme.badgeText).toContain("text-amber-800");
		});

		it("classifies rejected transaction with proper error message and red scheme", () => {
			const feedback = formatTransactionFeedback(mockRejectedResult);

			expect(feedback.kind).toBe("rejected");
			expect(feedback.badgeLabel).toBe("Ditolak");
			expect(feedback.title).toBe("Transaksi Ditolak");
			expect(feedback.message).toBe(
				"Stok barang tidak mencukupi untuk jumlah yang diminta.",
			);
			expect(feedback.colorScheme.badgeText).toContain("text-rose-800");
		});
	});

	describe("TransactionFeedbackDialog Component", () => {
		it("renders synced transaction details with green badge and close button", () => {
			const onOpenChange = vi.fn();

			render(
				<MemoryRouter>
					<TransactionFeedbackDialog
						result={mockSyncedResult}
						item={mockItem}
						open={true}
						onOpenChange={onOpenChange}
					/>
				</MemoryRouter>,
			);

			expect(screen.getByTestId("transaction-feedback-dialog")).toBeDefined();
			expect(screen.getByTestId("feedback-badge")).toBeDefined();
			expect(screen.getByText("Tersinkron")).toBeDefined();
			expect(screen.getByText("Transaksi Tersinkron")).toBeDefined();
			expect(screen.getByText("Kertas HVS A4")).toBeDefined();
			expect(screen.getByText("3 rim")).toBeDefined();
			expect(screen.getByText("Ambil Barang")).toBeDefined();
			expect(screen.getByText(/REF-001/)).toBeDefined();

			const closeBtn = screen.getByTestId("btn-close-feedback");
			fireEvent.click(closeBtn);
			expect(onOpenChange).toHaveBeenCalledWith(false);
		});

		it("renders recorded_pending feedback with 'Lihat Antrean Outbox' navigation button", () => {
			const onOpenChange = vi.fn();

			render(
				<MemoryRouter>
					<TransactionFeedbackDialog
						result={mockQueuedResult}
						item={mockItem}
						open={true}
						onOpenChange={onOpenChange}
					/>
				</MemoryRouter>,
			);

			expect(
				screen.getAllByText("Tercatat — Menunggu Sinkron")[0],
			).toBeDefined();
			const outboxBtn = screen.getByTestId("btn-view-outbox");
			expect(outboxBtn).toBeDefined();

			fireEvent.click(outboxBtn);
			expect(onOpenChange).toHaveBeenCalledWith(false);
		});
	});

	describe("TransactionFeedbackBanner Component", () => {
		it("renders floating/inline banner with appropriate status badge and message", () => {
			const onDismiss = vi.fn();

			render(
				<TransactionFeedbackBanner
					result={mockSyncedResult}
					onDismiss={onDismiss}
				/>,
			);

			expect(screen.getByTestId("transaction-feedback-banner")).toBeDefined();
			expect(screen.getByText("Tersinkron")).toBeDefined();
			expect(screen.getByText("Barang berhasil diambil.")).toBeDefined();

			const dismissBtn = screen.getByRole("button", {
				name: /Tutup notifikasi/i,
			});
			fireEvent.click(dismissBtn);
			expect(onDismiss).toHaveBeenCalledTimes(1);
		});

		it("renders queued offline banner message properly", () => {
			render(
				<TransactionFeedbackBanner
					result={mockQueuedResult}
					onDismiss={vi.fn()}
				/>,
			);

			expect(
				screen.getAllByText("Tercatat — Menunggu Sinkron")[0],
			).toBeDefined();
			expect(
				screen.getByText(/Tersimpan di antrean perangkat \(offline\)/),
			).toBeDefined();
		});
	});
});
