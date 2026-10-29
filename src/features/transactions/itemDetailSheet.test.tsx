import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Item } from "@/types/api";
import { ItemDetailSheet } from "./components/ItemDetailSheet";

const mockConsumableItem: Item = {
	id: "01JITEM001CONSUMABLE",
	sku: "ATK-PPR-A4",
	name: "Kertas HVS A4 80gr Sinar Dunia",
	type: "consumable",
	unit: "rim",
	current_stock: 45,
	minimum_stock: 10,
	location_id: "01JLOC001GUDANGA",
	location: {
		id: "01JLOC001GUDANGA",
		code: "LM-01",
		name: "Lemari ATK Lantai 2",
		description: "Penyimpanan kertas dan dokumen",
	},
	description: "Kertas fotokopi putih untuk kebutuhan laporan audit.",
	is_active: true,
	image_url: null,
	updated_at: "2026-10-27T08:00:00Z",
};

const mockLowStockConsumableItem: Item = {
	...mockConsumableItem,
	id: "01JITEM001LOWSTOCK",
	current_stock: 5,
	minimum_stock: 10,
};

const mockOutOfStockConsumableItem: Item = {
	...mockConsumableItem,
	id: "01JITEM001OUTOFSTOCK",
	current_stock: 0,
	minimum_stock: 10,
};

const mockAssetItem: Item = {
	id: "01JITEM002ASSET",
	sku: "AST-TL-FLUK87",
	name: "Digital Multimeter Fluke 87V",
	type: "asset",
	unit: "unit",
	current_stock: 3,
	minimum_stock: 1,
	borrowed_quantity: 2,
	location_id: "01JLOC002GUDANGB",
	location: {
		id: "01JLOC002GUDANGB",
		code: "STO-02",
		name: "Lemari Alat Ukur STO",
		description: "Peralatan uji kelistrikan",
	},
	description: "Multimeter akurasi tinggi untuk audit kelistrikan smelter.",
	is_active: true,
	image_url: null,
	updated_at: "2026-10-27T08:00:00Z",
};

const mockOutOfStockAssetItem: Item = {
	...mockAssetItem,
	id: "01JITEM002ASSETOUT",
	current_stock: 0,
	borrowed_quantity: 5,
};

describe("ItemDetailSheet Component (Task P3.1)", () => {
	it("renders nothing when item is null or open is false", () => {
		const { rerender } = render(
			<ItemDetailSheet item={null} open={true} onOpenChange={vi.fn()} />,
		);
		expect(screen.queryByTestId("item-detail-sheet")).toBeNull();

		rerender(
			<ItemDetailSheet
				item={mockConsumableItem}
				open={false}
				onOpenChange={vi.fn()}
			/>,
		);
		expect(screen.queryByTestId("item-detail-sheet")).toBeNull();
	});

	it("renders consumable item details, SKU, and location accurately", () => {
		render(
			<ItemDetailSheet
				item={mockConsumableItem}
				open={true}
				onOpenChange={vi.fn()}
			/>,
		);

		expect(screen.getByTestId("item-detail-sheet")).toBeDefined();
		expect(screen.getByText("Kertas HVS A4 80gr Sinar Dunia")).toBeDefined();
		expect(screen.getByText("ATK-PPR-A4")).toBeDefined();
		expect(screen.getByText("Habis Pakai")).toBeDefined();
		expect(screen.getByText("LM-01")).toBeDefined();
		expect(screen.getByText("Lemari ATK Lantai 2")).toBeDefined();
		expect(
			screen.getByText("Kertas fotokopi putih untuk kebutuhan laporan audit."),
		).toBeDefined();
	});

	it("renders consumable stock breakdown and ok stock badge when stock is safe", () => {
		render(
			<ItemDetailSheet
				item={mockConsumableItem}
				open={true}
				onOpenChange={vi.fn()}
			/>,
		);

		expect(screen.getByText("Tersedia: 45 rim")).toBeDefined();
		expect(screen.getByText("45")).toBeDefined();
		expect(screen.getByText("10")).toBeDefined();
	});

	it("renders warning stock badge when consumable stock is low", () => {
		render(
			<ItemDetailSheet
				item={mockLowStockConsumableItem}
				open={true}
				onOpenChange={vi.fn()}
			/>,
		);

		expect(screen.getByText("Sisa 5 rim (Menipis)")).toBeDefined();
		expect(
			screen.getByText(/Stok telah mencapai atau di bawah batas minimum/i),
		).toBeDefined();
	});

	it("renders critical stock badge and disables take button when consumable stock is 0", () => {
		render(
			<ItemDetailSheet
				item={mockOutOfStockConsumableItem}
				open={true}
				onOpenChange={vi.fn()}
			/>,
		);

		expect(screen.getByText("Habis (0 rim)")).toBeDefined();
		const takeBtn = screen.getByTestId("action-take-btn") as HTMLButtonElement;
		expect(takeBtn.disabled).toBe(true);

		const addBtn = screen.getByTestId("action-add-btn") as HTMLButtonElement;
		expect(addBtn.disabled).toBe(false);
	});

	it("renders adaptive action buttons for consumable and triggers callbacks", async () => {
		const user = userEvent.setup();
		const onActionSelect = vi.fn();

		render(
			<ItemDetailSheet
				item={mockConsumableItem}
				open={true}
				onOpenChange={vi.fn()}
				onActionSelect={onActionSelect}
			/>,
		);

		const takeBtn = screen.getByTestId("action-take-btn") as HTMLButtonElement;
		const addBtn = screen.getByTestId("action-add-btn") as HTMLButtonElement;

		expect(takeBtn.textContent).toContain("Ambil Barang");
		expect(addBtn.textContent).toContain("Tambah Stok");

		await user.click(takeBtn);
		expect(onActionSelect).toHaveBeenCalledWith(mockConsumableItem, "take");

		await user.click(addBtn);
		expect(onActionSelect).toHaveBeenCalledWith(mockConsumableItem, "add");
	});

	it("renders asset item with Decision D8 stock badge (Tersedia X · Dipinjam Y)", () => {
		render(
			<ItemDetailSheet
				item={mockAssetItem}
				open={true}
				onOpenChange={vi.fn()}
			/>,
		);

		expect(screen.getByText("Digital Multimeter Fluke 87V")).toBeDefined();
		expect(screen.getByText("Aset")).toBeDefined();
		expect(screen.getByText("Tersedia 3 · Dipinjam 2 unit")).toBeDefined();
		expect(screen.getByText("Aset Tersedia")).toBeDefined();
		expect(screen.getByText("Sedang Dipinjam")).toBeDefined();
	});

	it("renders adaptive asset action buttons and triggers callbacks", async () => {
		const user = userEvent.setup();
		const onActionSelect = vi.fn();

		render(
			<ItemDetailSheet
				item={mockAssetItem}
				open={true}
				onOpenChange={vi.fn()}
				onActionSelect={onActionSelect}
			/>,
		);

		const borrowBtn = screen.getByTestId(
			"action-borrow-btn",
		) as HTMLButtonElement;
		const returnBtn = screen.getByTestId(
			"action-return-btn",
		) as HTMLButtonElement;

		expect(borrowBtn.textContent).toContain("Pinjam Aset");
		expect(returnBtn.textContent).toContain("Kembalikan");

		await user.click(borrowBtn);
		expect(onActionSelect).toHaveBeenCalledWith(mockAssetItem, "borrow");

		await user.click(returnBtn);
		expect(onActionSelect).toHaveBeenCalledWith(mockAssetItem, "return");
	});

	it("disables borrow button when asset has 0 current stock", () => {
		render(
			<ItemDetailSheet
				item={mockOutOfStockAssetItem}
				open={true}
				onOpenChange={vi.fn()}
			/>,
		);

		expect(screen.getByText("Semua Dipinjam (5 unit)")).toBeDefined();
		const borrowBtn = screen.getByTestId(
			"action-borrow-btn",
		) as HTMLButtonElement;
		expect(borrowBtn.disabled).toBe(true);

		const returnBtn = screen.getByTestId(
			"action-return-btn",
		) as HTMLButtonElement;
		expect(returnBtn.disabled).toBe(false);
	});

	it("calls onOpenChange(false) when close button is clicked", () => {
		const onOpenChange = vi.fn();
		render(
			<ItemDetailSheet
				item={mockConsumableItem}
				open={true}
				onOpenChange={onOpenChange}
			/>,
		);

		const closeBtn = screen.getByLabelText("Tutup Dialog");
		fireEvent.click(closeBtn);
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});

	it("copies SKU to clipboard when copy button is pressed", async () => {
		const writeTextMock = vi.fn().mockResolvedValue(undefined);
		Object.defineProperty(navigator, "clipboard", {
			value: {
				writeText: writeTextMock,
			},
			writable: true,
			configurable: true,
		});

		render(
			<ItemDetailSheet
				item={mockConsumableItem}
				open={true}
				onOpenChange={vi.fn()}
			/>,
		);

		const copyBtn = screen.getByLabelText("Salin SKU");
		fireEvent.click(copyBtn);

		expect(writeTextMock).toHaveBeenCalledWith("ATK-PPR-A4");
	});

	// Task P5.8 Tests: Projected Stock UI
	it("renders projected stock alert banner and estimated indicators when item has pending transactions", () => {
		const itemWithPending: Item = {
			...mockConsumableItem,
			current_stock: 40,
			projected_stock: 40,
			has_pending_transactions: true,
			pending_transactions_count: 1,
		};

		render(
			<ItemDetailSheet
				item={itemWithPending}
				open={true}
				onOpenChange={vi.fn()}
			/>,
		);

		// Harus memunculkan banner alert perkiraan stok
		const alertBanner = screen.getByTestId("projected-stock-alert");
		expect(alertBanner).toBeDefined();
		expect(screen.getByText("Stok Perkiraan Lokal")).toBeDefined();
		expect(screen.getByText(/1 transaksi antrean/i)).toBeDefined();
		expect(screen.getByText("Stok Perkiraan")).toBeDefined();
		expect(screen.getByText(/Perkiraan: 40 rim/i)).toBeDefined();
	});
});
