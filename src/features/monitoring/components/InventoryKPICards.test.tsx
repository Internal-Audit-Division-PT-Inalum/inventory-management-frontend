import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { StockMetricsSummary } from "../types";
import { InventoryKPICards } from "./InventoryKPICards";

describe("InventoryKPICards Component (Task P6.1)", () => {
	const mockMetrics: StockMetricsSummary = {
		totalActiveItems: 142,
		consumablesCount: 100,
		assetsCount: 42,
		outOfStockCount: 2,
		criticalCount: 3,
		lowStockCount: 10,
		healthyCount: 127,
		attentionNeededCount: 15,
		healthRatioPercent: 89.4,
		urgentItems: [],
	};

	it("merender 4 kartu metrik dengan angka dan persentase yang benar", () => {
		render(<InventoryKPICards metrics={mockMetrics} />);

		// Total Barang
		expect(screen.getByText("Total Barang")).toBeDefined();
		expect(screen.getByText("142")).toBeDefined();
		expect(screen.getByText("100 Habis Pakai • 42 Aset")).toBeDefined();

		// Stok Aman
		expect(screen.getByText("Stok Aman")).toBeDefined();
		expect(screen.getByText("127")).toBeDefined();
		expect(screen.getByText("89.4% Sehat")).toBeDefined();

		// Stok Menipis
		expect(screen.getByText("Stok Menipis")).toBeDefined();
		expect(screen.getByText("10")).toBeDefined();

		// Kritis & Habis (2 out of stock + 3 critical = 5)
		expect(screen.getByText("Kritis & Habis")).toBeDefined();
		expect(screen.getByText("5")).toBeDefined();
		expect(screen.getByText("2 Habis")).toBeDefined();
	});

	it("merender skeleton loading state saat isLoading bernilai true", () => {
		render(<InventoryKPICards metrics={mockMetrics} isLoading={true} />);

		expect(screen.getByLabelText("Memuat Metrik Inventaris")).toBeDefined();
		expect(screen.queryByText("Total Barang")).toBeNull();
	});

	it("memicu onCardClick dengan filter yang sesuai saat kartu diklik", () => {
		const handleCardClick = vi.fn();
		render(
			<InventoryKPICards metrics={mockMetrics} onCardClick={handleCardClick} />,
		);

		// Klik kartu Total Barang
		fireEvent.click(screen.getByText("Total Barang"));
		expect(handleCardClick).toHaveBeenCalledWith("all");

		// Klik kartu Stok Aman
		fireEvent.click(screen.getByText("Stok Aman"));
		expect(handleCardClick).toHaveBeenCalledWith("healthy");

		// Klik kartu Stok Menipis
		fireEvent.click(screen.getByText("Stok Menipis"));
		expect(handleCardClick).toHaveBeenCalledWith("low");

		// Klik kartu Kritis & Habis
		fireEvent.click(screen.getByText("Kritis & Habis"));
		expect(handleCardClick).toHaveBeenCalledWith("critical_or_empty");
	});
});
