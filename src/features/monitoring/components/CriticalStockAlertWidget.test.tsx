import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ItemStockHealth } from "../types";
import { CriticalStockAlertWidget } from "./CriticalStockAlertWidget";

describe("CriticalStockAlertWidget Component (Task P6.1)", () => {
	const mockUrgentItems: ItemStockHealth[] = [
		{
			item: {
				id: "item-1",
				sku: "ATK-PPR-001",
				name: "Kertas A4 70gsm",
				type: "consumable",
				unit: "rim",
				location_id: "loc-1",
				current_stock: 0,
				minimum_stock: 20,
				image_url: null,
				updated_at: "2026-10-29T00:00:00.000Z",
			},
			location: {
				id: "loc-1",
				name: "Gudang Utama - Rak A1",
				code: "WH-A1",
			},
			effectiveStock: 0,
			confirmedStock: 0,
			minimumStock: 20,
			status: "out_of_stock",
			deficit: 20,
			isEstimated: false,
			hasPendingTransactions: false,
			pendingTransactionsCount: 0,
		},
		{
			item: {
				id: "item-2",
				sku: "PPE-GLV-001",
				name: "Sarung Tangan Las",
				type: "consumable",
				unit: "pasang",
				location_id: "loc-1",
				current_stock: 2,
				minimum_stock: 10,
				image_url: null,
				updated_at: "2026-10-29T00:00:00.000Z",
			},
			location: {
				id: "loc-1",
				name: "Gudang Utama - Rak A1",
				code: "WH-A1",
			},
			effectiveStock: 2,
			confirmedStock: 5,
			minimumStock: 10,
			status: "critical",
			deficit: 8,
			isEstimated: true,
			hasPendingTransactions: true,
			pendingTransactionsCount: 1,
		},
	];

	it("merender daftar barang urgen dengan badge status, nama, dan lokasi", () => {
		render(
			<CriticalStockAlertWidget
				urgentItems={mockUrgentItems}
				totalAttentionCount={2}
			/>,
		);

		expect(screen.getByText("Peringatan Stok Kritis")).toBeDefined();
		expect(screen.getByText("2 Perlu Atensi")).toBeDefined();

		// Item 1
		expect(screen.getByText("Kertas A4 70gsm")).toBeDefined();
		expect(screen.getByText("(ATK-PPR-001)")).toBeDefined();
		expect(screen.getByText("HABIS")).toBeDefined();
		expect(screen.getByText("- 20 rim")).toBeDefined();

		// Item 2
		expect(screen.getByText("Sarung Tangan Las")).toBeDefined();
		expect(screen.getByText("(PPE-GLV-001)")).toBeDefined();
		expect(screen.getByText("KRITIS")).toBeDefined();
		expect(screen.getByText("Perkiraan Lokal")).toBeDefined();
	});

	it("merender empty state positif saat tidak ada barang yang memerlukan perhatian", () => {
		render(
			<CriticalStockAlertWidget urgentItems={[]} totalAttentionCount={0} />,
		);

		expect(screen.getByText("Semua Aman")).toBeDefined();
		expect(screen.getByText("Seluruh Stok Dalam Kondisi Aman")).toBeDefined();
		expect(
			screen.getByText(/Tidak ada barang inventaris yang berada di bawah/i),
		).toBeDefined();
	});

	it("memicu onViewAllClick saat tombol lihat semua diklik", () => {
		const handleViewAll = vi.fn();
		render(
			<CriticalStockAlertWidget
				urgentItems={mockUrgentItems}
				totalAttentionCount={2}
				onViewAllClick={handleViewAll}
			/>,
		);

		const viewAllButton = screen.getByText(
			"Lihat Semua Barang Menipis di Katalog",
		);
		fireEvent.click(viewAllButton);
		expect(handleViewAll).toHaveBeenCalledTimes(1);
	});

	it("memicu onItemClick saat kartu barang diklik", () => {
		const handleItemClick = vi.fn();
		render(
			<CriticalStockAlertWidget
				urgentItems={mockUrgentItems}
				totalAttentionCount={2}
				onItemClick={handleItemClick}
			/>,
		);

		fireEvent.click(screen.getByText("Kertas A4 70gsm"));
		expect(handleItemClick).toHaveBeenCalledWith(mockUrgentItems[0].item);
	});
});
