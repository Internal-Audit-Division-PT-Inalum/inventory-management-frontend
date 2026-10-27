import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Item } from "@/types/api";
import { ItemCard, ItemCardSkeleton } from "./components/ItemCard";

describe("ItemCard Component (Task P2.4)", () => {
	const mockConsumable: Item = {
		id: "item-c1",
		sku: "ATK-KTS-A4",
		name: "Kertas HVS A4 80gr",
		type: "consumable",
		unit: "rim",
		location_id: "loc-1",
		current_stock: 25,
		minimum_stock: 5,
		image_url: "http://localhost:8000/storage/item_images/1/image.jpg",
		image_thumb_url:
			"http://localhost:8000/storage/item_images/1/conversions/thumb.webp",
		location: {
			id: "loc-1",
			code: "RAK-01",
			name: "Lemari ATK Utama",
		},
		updated_at: "2026-10-26T10:00:00Z",
	};

	const mockAsset: Item = {
		id: "item-a1",
		sku: "AST-PRJ-EPS",
		name: "Proyektor Epson EB-X400",
		type: "asset",
		unit: "unit",
		location_id: "loc-2",
		current_stock: 3,
		minimum_stock: 1,
		borrowed_quantity: 2,
		image_url: null,
		location: {
			id: "loc-2",
			code: "RAK-02",
			name: "Gudang Elektronik",
		},
		updated_at: "2026-10-26T10:00:00Z",
	};

	it("renders consumable item card with normal stock correctly", () => {
		render(<ItemCard item={mockConsumable} />);

		expect(screen.getByText("Kertas HVS A4 80gr")).toBeDefined();
		expect(screen.getByText("ATK-KTS-A4")).toBeDefined();
		expect(screen.getByText("Habis Pakai")).toBeDefined();
		expect(screen.getByText("RAK-01 • Lemari ATK Utama")).toBeDefined();
		expect(screen.getByText("Tersedia: 25 rim")).toBeDefined();
	});

	it("renders warning badge when consumable stock is low (current <= min)", () => {
		const lowStockItem: Item = {
			...mockConsumable,
			current_stock: 4,
			minimum_stock: 5,
		};
		render(<ItemCard item={lowStockItem} />);

		expect(screen.getByText("Sisa 4 rim (Menipis)")).toBeDefined();
	});

	it("renders critical badge when consumable stock is 0", () => {
		const outOfStockItem: Item = {
			...mockConsumable,
			current_stock: 0,
		};
		render(<ItemCard item={outOfStockItem} />);

		expect(screen.getByText("Habis (0 rim)")).toBeDefined();
	});

	it("renders asset item with Tersedia X · Dipinjam Y badge (Decision D8)", () => {
		render(<ItemCard item={mockAsset} />);

		expect(screen.getByText("Proyektor Epson EB-X400")).toBeDefined();
		expect(screen.getByText("AST-PRJ-EPS")).toBeDefined();
		expect(screen.getByText("Peralatan")).toBeDefined();
		expect(screen.getByText("Tersedia 3 · Dipinjam 2 unit")).toBeDefined();
	});

	it("renders Semuanya Dipinjam when asset stock is 0 but borrowed > 0", () => {
		const allBorrowedAsset: Item = {
			...mockAsset,
			current_stock: 0,
			borrowed_quantity: 4,
		};
		render(<ItemCard item={allBorrowedAsset} />);

		expect(screen.getByText("Semua Dipinjam (4 unit)")).toBeDefined();
	});

	it("renders Stok Kosong when asset stock and borrowed are both 0", () => {
		const emptyAsset: Item = {
			...mockAsset,
			current_stock: 0,
			borrowed_quantity: 0,
		};
		render(<ItemCard item={emptyAsset} />);

		expect(screen.getByText("Stok Kosong (0 unit)")).toBeDefined();
	});

	it("renders resolved relative thumbnail image and handles error fallback", () => {
		render(<ItemCard item={mockConsumable} />);

		const img = screen.getByRole("img", { name: "Kertas HVS A4 80gr" });
		expect(img).toBeDefined();
		// URL should be resolved to relative path through proxy
		expect(img.getAttribute("src")).toBe(
			"/storage/item_images/1/conversions/thumb.webp",
		);

		// Trigger image load error
		fireEvent.error(img);

		// Image should be removed and fallback rendered
		expect(
			screen.queryByRole("img", { name: "Kertas HVS A4 80gr" }),
		).toBeNull();
	});

	it("triggers onSelect callback on click and keyboard press (Enter / Space)", () => {
		const onSelectSpy = vi.fn();
		render(<ItemCard item={mockConsumable} onSelect={onSelectSpy} />);

		const card = screen.getByRole("button", {
			name: /Pilih Kertas HVS A4 80gr/i,
		});

		// Click
		fireEvent.click(card);
		expect(onSelectSpy).toHaveBeenCalledTimes(1);
		expect(onSelectSpy).toHaveBeenCalledWith(mockConsumable);

		// Enter key
		fireEvent.keyDown(card, { key: "Enter" });
		expect(onSelectSpy).toHaveBeenCalledTimes(2);

		// Space key
		fireEvent.keyDown(card, { key: " " });
		expect(onSelectSpy).toHaveBeenCalledTimes(3);
	});

	it("renders ItemCardSkeleton with pulse animation", () => {
		const { container } = render(<ItemCardSkeleton />);
		expect(container.querySelector(".animate-pulse")).toBeDefined();
	});
});
