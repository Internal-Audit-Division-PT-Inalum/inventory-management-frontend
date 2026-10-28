import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Item } from "@/types/api";
import { ItemDetailSheet } from "./components/ItemDetailSheet";
import { TransactionForm } from "./components/TransactionForm";
import {
	createTransactionSchema,
	isLargeQuantityTransaction,
	MAX_TRANSACTION_QUANTITY,
} from "./lib/transactionSchema";

const mockConsumableItem: Item = {
	id: "01JITEM001CONSUMABLE",
	sku: "ATK-PPR-A4",
	name: "Kertas HVS A4 80gr Sinar Dunia",
	type: "consumable",
	unit: "rim",
	current_stock: 40,
	minimum_stock: 10,
	location_id: "01JLOC001GUDANGA",
	image_url: null,
	location: {
		id: "01JLOC001GUDANGA",
		code: "LM-01",
		name: "Lemari ATK Lantai 2",
	},
	updated_at: "2026-10-27T08:00:00Z",
};

const mockAssetItem: Item = {
	id: "01JITEM002ASSET",
	sku: "AST-TL-FLUK87",
	name: "Digital Multimeter Fluke 87V",
	type: "asset",
	unit: "unit",
	current_stock: 8,
	minimum_stock: 2,
	borrowed_quantity: 2,
	location_id: "01JLOC002GUDANGB",
	image_url: null,
	location: {
		id: "01JLOC002GUDANGB",
		code: "STO-02",
		name: "Lemari Alat Ukur STO",
	},
	updated_at: "2026-10-27T08:00:00Z",
};

describe("Transaction Schema & Utilities (Task P3.2)", () => {
	it("validates quantity bounds and types with createTransactionSchema", () => {
		const takeSchema = createTransactionSchema(40, "take");

		// Valid payload
		const validResult = takeSchema.safeParse({
			quantity: 5,
			notes: "Kebutuhan audit lapangan",
			reference_number: "AUD/2026/01",
		});
		expect(validResult.success).toBe(true);

		// Rejects 0 or negative
		const zeroResult = takeSchema.safeParse({ quantity: 0 });
		expect(zeroResult.success).toBe(false);

		// Rejects decimal
		const decimalResult = takeSchema.safeParse({ quantity: 2.5 });
		expect(decimalResult.success).toBe(false);

		// Rejects exceeding current stock for take
		const excessResult = takeSchema.safeParse({ quantity: 41 });
		expect(excessResult.success).toBe(false);

		// Rejects > MAX_TRANSACTION_QUANTITY (500)
		const maxAddSchema = createTransactionSchema(10, "add");
		const tooHighResult = maxAddSchema.safeParse({
			quantity: MAX_TRANSACTION_QUANTITY + 1,
		});
		expect(tooHighResult.success).toBe(false);
	});

	it("detects large quantity transactions accurately", () => {
		// Quantity >= 10 is large
		expect(
			isLargeQuantityTransaction({
				quantity: 10,
				currentStock: 100,
				action: "take",
			}),
		).toBe(true);

		// Quantity >= 50% of currentStock (e.g. 5 of 8) is large
		expect(
			isLargeQuantityTransaction({
				quantity: 5,
				currentStock: 8,
				action: "borrow",
			}),
		).toBe(true);

		// Small quantity (2 of 40) is not large
		expect(
			isLargeQuantityTransaction({
				quantity: 2,
				currentStock: 40,
				action: "take",
			}),
		).toBe(false);

		// Restock ('add') does not trigger take warning
		expect(
			isLargeQuantityTransaction({
				quantity: 50,
				currentStock: 10,
				action: "add",
			}),
		).toBe(false);
	});
});

describe("TransactionForm Component (Task P3.2)", () => {
	it("renders initial quantity 1 with decrement button disabled", () => {
		render(
			<TransactionForm
				item={mockConsumableItem}
				action="take"
				onSubmit={vi.fn()}
			/>,
		);

		const input = screen.getByTestId(
			"stepper-quantity-input",
		) as HTMLInputElement;
		expect(input.value).toBe("1");

		const decBtn = screen.getByTestId(
			"stepper-decrement-btn",
		) as HTMLButtonElement;
		expect(decBtn.disabled).toBe(true);
	});

	it("increments and decrements quantity via stepper buttons", () => {
		render(
			<TransactionForm
				item={mockConsumableItem}
				action="take"
				onSubmit={vi.fn()}
			/>,
		);

		const incBtn = screen.getByTestId("stepper-increment-btn");
		const decBtn = screen.getByTestId("stepper-decrement-btn");
		const input = screen.getByTestId(
			"stepper-quantity-input",
		) as HTMLInputElement;

		fireEvent.click(incBtn);
		expect(input.value).toBe("2");
		expect((decBtn as HTMLButtonElement).disabled).toBe(false);

		fireEvent.click(incBtn);
		expect(input.value).toBe("3");

		fireEvent.click(decBtn);
		expect(input.value).toBe("2");
	});

	it("applies quick addition chips (+1, +5, +10) and Semua (Max)", () => {
		render(
			<TransactionForm
				item={mockConsumableItem}
				action="take"
				onSubmit={vi.fn()}
			/>,
		);

		const input = screen.getByTestId(
			"stepper-quantity-input",
		) as HTMLInputElement;

		// Click +5 chip
		fireEvent.click(screen.getByText("+5"));
		expect(input.value).toBe("6");

		// Click +10 chip
		fireEvent.click(screen.getByText("+10"));
		expect(input.value).toBe("16");

		// Click Semua chip
		fireEvent.click(screen.getByText("Semua (40)"));
		expect(input.value).toBe("40");
	});

	it("submits directly when quantity is below large threshold", async () => {
		const onSubmit = vi.fn();
		render(
			<TransactionForm
				item={mockConsumableItem}
				action="take"
				onSubmit={onSubmit}
			/>,
		);

		const notesInput = screen.getByTestId("transaction-notes-input");
		const refInput = screen.getByTestId("transaction-reference-input");

		fireEvent.change(notesInput, {
			target: { value: "Untuk cetak kertas kerja" },
		});
		fireEvent.change(refInput, { target: { value: "KK-AUD-01" } });

		const submitBtn = screen.getByTestId("transaction-submit-btn");
		fireEvent.click(submitBtn);

		await waitFor(() => {
			expect(onSubmit).toHaveBeenCalledTimes(1);
			expect(onSubmit).toHaveBeenCalledWith({
				quantity: 1,
				notes: "Untuk cetak kertas kerja",
				reference_number: "KK-AUD-01",
			});
		});

		expect(screen.queryByTestId("large-quantity-warning-modal")).toBeNull();
	});

	it("supports asset borrowing flow with mockAssetItem", async () => {
		const onSubmit = vi.fn();
		render(
			<TransactionForm
				item={mockAssetItem}
				action="borrow"
				onSubmit={onSubmit}
			/>,
		);

		expect(screen.getByText("Pinjam Aset Inventaris")).toBeDefined();
		expect(screen.getByText(/Semua \(8\)/)).toBeDefined();

		const submitBtn = screen.getByTestId("transaction-submit-btn");
		fireEvent.click(submitBtn);

		await waitFor(() => {
			expect(onSubmit).toHaveBeenCalledWith({
				quantity: 1,
				notes: undefined,
				reference_number: undefined,
			});
		});
	});

	it("triggers large quantity warning modal when taking large quantity, and supports cancel", async () => {
		const onSubmit = vi.fn();
		render(
			<TransactionForm
				item={mockConsumableItem}
				action="take"
				onSubmit={onSubmit}
			/>,
		);

		// Set quantity to 15 (>= 10 threshold)
		const input = screen.getByTestId("stepper-quantity-input");
		fireEvent.change(input, { target: { value: "15" } });

		const submitBtn = screen.getByTestId("transaction-submit-btn");
		fireEvent.click(submitBtn);

		// Modal should appear
		expect(
			await screen.findByTestId("large-quantity-warning-modal"),
		).toBeDefined();
		expect(screen.getByText("Konfirmasi Jumlah Besar")).toBeDefined();
		expect(onSubmit).not.toHaveBeenCalled();

		// Click cancel in warning modal
		const cancelBtn = screen.getByTestId("warning-cancel-btn");
		fireEvent.click(cancelBtn);

		expect(screen.queryByTestId("large-quantity-warning-modal")).toBeNull();
		expect(onSubmit).not.toHaveBeenCalled();
	});

	it("submits transaction when large quantity warning is confirmed", async () => {
		const onSubmit = vi.fn();
		render(
			<TransactionForm
				item={mockConsumableItem}
				action="take"
				onSubmit={onSubmit}
			/>,
		);

		// Set quantity to 20
		const input = screen.getByTestId("stepper-quantity-input");
		fireEvent.change(input, { target: { value: "20" } });

		const submitBtn = screen.getByTestId("transaction-submit-btn");
		fireEvent.click(submitBtn);

		expect(
			await screen.findByTestId("large-quantity-warning-modal"),
		).toBeDefined();

		const confirmBtn = screen.getByTestId("warning-confirm-btn");
		fireEvent.click(confirmBtn);

		await waitFor(() => {
			expect(onSubmit).toHaveBeenCalledWith({
				quantity: 20,
				notes: undefined,
				reference_number: undefined,
			});
		});
	});

	it("transitions seamlessly from ItemDetailSheet into TransactionForm and back", async () => {
		const user = userEvent.setup();
		const onTransactSubmit = vi.fn();

		render(
			<ItemDetailSheet
				item={mockConsumableItem}
				open={true}
				onOpenChange={vi.fn()}
				enableInternalForm={true}
				onTransactSubmit={onTransactSubmit}
			/>,
		);

		// Click Ambil Barang in detail view
		const takeActionBtn = screen.getByTestId("action-take-btn");
		await user.click(takeActionBtn);

		// Stepper input should now be visible
		expect(screen.getByTestId("stepper-quantity-input")).toBeDefined();
		expect(screen.getByTestId("back-to-detail-btn")).toBeDefined();

		// Click back to detail
		const backBtn = screen.getByTestId("back-to-detail-btn");
		await user.click(backBtn);

		// Should be back to detail view
		expect(screen.getByTestId("action-take-btn")).toBeDefined();
		expect(screen.queryByTestId("stepper-quantity-input")).toBeNull();
	});
});
