import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { LowStockReconciliationResult } from "../types";
import { ReconciliationBadge } from "./ReconciliationBadge";

describe("ReconciliationBadge Component (Task P6.3)", () => {
	it("merender status reconciled dengan badge 100% Cocok", () => {
		const reconciledResult: LowStockReconciliationResult = {
			status: "reconciled",
			statusLabel: "Sinkron Terverifikasi (100% Cocok)",
			localCount: 3,
			serverCount: 3,
			matchingCount: 3,
			discrepancyCount: 0,
			localOnlyItemIds: [],
			serverOnlyItemIds: [],
			isMatching: true,
			message: "Angka cocok.",
			canRefreshCatalog: false,
			verifiedAt: "2026-10-29T10:00:00Z",
		};

		render(<ReconciliationBadge reconciliation={reconciledResult} />);

		expect(screen.getByText("Stok Rendah Terverifikasi Server")).toBeDefined();
		expect(screen.getByText("100% Cocok")).toBeDefined();
		expect(
			screen.getByText(
				"Sebanyak 3 barang stok rendah cocok persis dengan server.",
			),
		).toBeDefined();
	});

	it("merender status divergent_pending_mutations saat terdapat mutasi antre", () => {
		const pendingResult: LowStockReconciliationResult = {
			status: "divergent_pending_mutations",
			statusLabel: "Divergensi Terkendali (Mutasi Antre)",
			localCount: 4,
			serverCount: 3,
			matchingCount: 3,
			discrepancyCount: 1,
			localOnlyItemIds: ["item-2"],
			serverOnlyItemIds: [],
			isMatching: false,
			message: "Selisih karena outbox.",
			canRefreshCatalog: false,
			verifiedAt: "2026-10-29T10:00:00Z",
		};

		render(<ReconciliationBadge reconciliation={pendingResult} />);

		expect(screen.getByText("Divergensi Terkendali")).toBeDefined();
		expect(screen.getByText("Mutasi Antre")).toBeDefined();
		expect(
			screen.getByText(
				/Perbedaan angka terproyeksi akibat transaksi offline di outbox/i,
			),
		).toBeDefined();
	});

	it("merender status divergent_outdated_cache dan memicu onRefreshCatalog saat tombol segarkan diklik", () => {
		const outdatedResult: LowStockReconciliationResult = {
			status: "divergent_outdated_cache",
			statusLabel: "Perlu Sinkronisasi Katalog",
			localCount: 2,
			serverCount: 4,
			matchingCount: 2,
			discrepancyCount: 2,
			localOnlyItemIds: [],
			serverOnlyItemIds: ["item-4", "item-5"],
			isMatching: false,
			message: "Perlu update.",
			canRefreshCatalog: true,
			verifiedAt: "2026-10-29T10:00:00Z",
		};

		const handleRefresh = vi.fn();

		render(
			<ReconciliationBadge
				reconciliation={outdatedResult}
				onRefreshCatalog={handleRefresh}
			/>,
		);

		expect(screen.getByText("Perlu Sinkronisasi Katalog")).toBeDefined();
		expect(screen.getByText("Selisih Terdeteksi")).toBeDefined();

		const refreshButton = screen.getByText("Segarkan");
		fireEvent.click(refreshButton);
		expect(handleRefresh).toHaveBeenCalledTimes(1);
	});

	it("merender status offline_fallback saat dalam mode offline", () => {
		const offlineResult: LowStockReconciliationResult = {
			status: "offline_fallback",
			statusLabel: "Perhitungan Lokal (Offline)",
			localCount: 2,
			serverCount: null,
			matchingCount: 0,
			discrepancyCount: 0,
			localOnlyItemIds: [],
			serverOnlyItemIds: [],
			isMatching: false,
			message: "Mode offline.",
			canRefreshCatalog: false,
			verifiedAt: "2026-10-29T10:00:00Z",
		};

		render(<ReconciliationBadge reconciliation={offlineResult} />);

		expect(screen.getByText("Perhitungan Mandiri Lokal")).toBeDefined();
		expect(screen.getByText("Mode Offline")).toBeDefined();
		expect(
			screen.getByText(/Monitoring beroperasi penuh berdasarkan data lokal/i),
		).toBeDefined();
	});
});
