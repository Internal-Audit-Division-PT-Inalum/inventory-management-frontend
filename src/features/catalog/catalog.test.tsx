import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import type { Item, Location } from "@/types/api";
import { CatalogView } from "./components/CatalogView";

const mockLocations: Location[] = [
	{
		id: "loc-atk",
		code: "LOC-ATK",
		name: "Lemari ATK Ruang Auditor",
		description: "Penyimpanan kertas dan alat tulis kantor",
	},
	{
		id: "loc-gudang",
		code: "LOC-GDG",
		name: "Gudang Sentral Divisi",
		description: "Penyimpanan perkakas dan APD lapangan",
	},
];

const mockItems: Item[] = [
	{
		id: "item-kertas-a4",
		sku: "ATK-KTS-001",
		name: "Kertas A4 Sinar Dunia 80gsm",
		type: "consumable",
		location_id: "loc-atk",
		current_stock: 45,
		minimum_stock: 10,
		unit: "rim",
		stock_status: "ok",
		image_url: null,
		updated_at: new Date().toISOString(),
	},
	{
		id: "item-spidol-board",
		sku: "ATK-SPD-002",
		name: "Spidol Whiteboard Hitam Snowman",
		type: "consumable",
		location_id: "loc-atk",
		current_stock: 3,
		minimum_stock: 5,
		unit: "buah",
		stock_status: "low",
		image_url: null,
		updated_at: new Date().toISOString(),
	},
	{
		id: "item-tinta-printer",
		sku: "ATK-TNT-003",
		name: "Tinta Printer Hitam HP GT51",
		type: "consumable",
		location_id: "loc-atk",
		current_stock: 0,
		minimum_stock: 2,
		unit: "botol",
		stock_status: "empty",
		image_url: null,
		updated_at: new Date().toISOString(),
	},
	{
		id: "item-helmet-safety",
		sku: "AST-HLM-001",
		name: "Helm Safety Lapangan MSA V-Gard",
		type: "asset",
		location_id: "loc-gudang",
		current_stock: 10,
		minimum_stock: 2,
		unit: "unit",
		stock_status: "ok",
		image_url: null,
		borrowed_quantity: 2,
		updated_at: new Date().toISOString(),
	},
	{
		id: "item-multimeter",
		sku: "AST-MLT-002",
		name: "Digital Multimeter Fluke 179",
		type: "asset",
		location_id: "loc-gudang",
		current_stock: 4,
		minimum_stock: 1,
		unit: "unit",
		stock_status: "ok",
		image_url: null,
		borrowed_quantity: 0,
		updated_at: new Date().toISOString(),
	},
];

describe("Catalog Feature Full Integration Test (Task P2.9)", () => {
	beforeEach(async () => {
		sessionStorage.clear();
		await db.clearCatalog();
		await db.bulkUpsertCatalog({
			items: mockItems,
			locations: mockLocations,
		});
	});

	afterEach(async () => {
		vi.restoreAllMocks();
		await db.clearCatalog();
	});

	it("renders offline catalog items and location chips cleanly from IndexedDB", async () => {
		render(
			<MemoryRouter>
				<CatalogView />
			</MemoryRouter>,
		);

		// Verifikasi header filter dan counter
		await waitFor(() => {
			expect(screen.getByText("Kertas A4 Sinar Dunia 80gsm")).toBeDefined();
			expect(screen.getByText("Helm Safety Lapangan MSA V-Gard")).toBeDefined();
		});

		// Verifikasi chip lokasi ter-render
		expect(screen.getByTestId("location-chip-all")).toBeDefined();
		expect(screen.getByTestId("location-chip-loc-atk")).toBeDefined();
		expect(screen.getByTestId("location-chip-loc-gudang")).toBeDefined();

		// Verifikasi badge status stok
		expect(screen.getByText(/Tersedia: 45 rim/i)).toBeDefined();
		expect(screen.getByText(/Sisa 3 buah \(Menipis\)/i)).toBeDefined();
		expect(screen.getByText(/Habis \(0 botol\)/i)).toBeDefined();

		// Verifikasi D8: Asset menampilkan "Tersedia 10 · Dipinjam 2 unit"
		expect(screen.getByText(/Tersedia 10 · Dipinjam 2 unit/i)).toBeDefined();
	});

	it("filters items reactively by search query (name and SKU) and clears search", async () => {
		const user = userEvent.setup();

		render(
			<MemoryRouter>
				<CatalogView />
			</MemoryRouter>,
		);

		await waitFor(() => {
			expect(screen.getByText("Kertas A4 Sinar Dunia 80gsm")).toBeDefined();
		});

		const searchInput = screen.getByTestId("catalog-search-input");

		// Cari berdasarkan nama
		await user.type(searchInput, "Spidol");
		await waitFor(() => {
			expect(screen.getByText("Spidol Whiteboard Hitam Snowman")).toBeDefined();
			expect(screen.queryByText("Kertas A4 Sinar Dunia 80gsm")).toBeNull();
		});

		// Bersihkan pencarian via tombol X
		const clearBtn = screen.getByRole("button", {
			name: /bersihkan pencarian/i,
		});
		await user.click(clearBtn);

		await waitFor(() => {
			expect(screen.getByText("Kertas A4 Sinar Dunia 80gsm")).toBeDefined();
			expect(screen.getByText("Helm Safety Lapangan MSA V-Gard")).toBeDefined();
		});

		// Cari berdasarkan SKU
		await user.type(searchInput, "AST-HLM");
		await waitFor(() => {
			expect(screen.getByText("Helm Safety Lapangan MSA V-Gard")).toBeDefined();
			expect(screen.queryByText("Digital Multimeter Fluke 179")).toBeNull();
		});
	});

	it("filters items by location chip selection", async () => {
		const user = userEvent.setup();

		render(
			<MemoryRouter>
				<CatalogView />
			</MemoryRouter>,
		);

		await waitFor(() => {
			expect(screen.getByText("Kertas A4 Sinar Dunia 80gsm")).toBeDefined();
		});

		// Pilih Lemari ATK
		const locAtkChip = screen.getByTestId("location-chip-loc-atk");
		await user.click(locAtkChip);

		await waitFor(() => {
			// Hanya item di loc-atk yang muncul
			expect(screen.getByText("Kertas A4 Sinar Dunia 80gsm")).toBeDefined();
			expect(screen.getByText("Spidol Whiteboard Hitam Snowman")).toBeDefined();
			expect(screen.queryByText("Helm Safety Lapangan MSA V-Gard")).toBeNull();
		});

		// Kembalikan ke Semua Lokasi
		const allLocChip = screen.getByTestId("location-chip-all");
		await user.click(allLocChip);

		await waitFor(() => {
			expect(screen.getByText("Helm Safety Lapangan MSA V-Gard")).toBeDefined();
		});
	});

	it("filters items by type tabs (Habis Pakai vs Aset)", async () => {
		const user = userEvent.setup();

		render(
			<MemoryRouter>
				<CatalogView />
			</MemoryRouter>,
		);

		await waitFor(() => {
			expect(screen.getByText("Kertas A4 Sinar Dunia 80gsm")).toBeDefined();
		});

		// Klik tab Habis Pakai
		const consumableTab = screen.getByTestId("type-tab-consumable");
		await user.click(consumableTab);

		await waitFor(() => {
			expect(screen.getByText("Kertas A4 Sinar Dunia 80gsm")).toBeDefined();
			expect(screen.queryByText("Helm Safety Lapangan MSA V-Gard")).toBeNull();
		});

		// Klik tab Aset
		const assetTab = screen.getByTestId("type-tab-asset");
		await user.click(assetTab);

		await waitFor(() => {
			expect(screen.queryByText("Kertas A4 Sinar Dunia 80gsm")).toBeNull();
			expect(screen.getByText("Helm Safety Lapangan MSA V-Gard")).toBeDefined();
			expect(screen.getByText("Digital Multimeter Fluke 179")).toBeDefined();
		});
	});

	it("filters items by stock status dropdown", async () => {
		render(
			<MemoryRouter>
				<CatalogView />
			</MemoryRouter>,
		);

		await waitFor(() => {
			expect(screen.getByText("Kertas A4 Sinar Dunia 80gsm")).toBeDefined();
		});

		const stockSelect = screen.getByTestId("stock-filter-select");

		// Pilih status stok "low_or_empty"
		fireEvent.change(stockSelect, { target: { value: "low_or_empty" } });

		await waitFor(() => {
			expect(screen.getByText("Tinta Printer Hitam HP GT51")).toBeDefined();
			expect(screen.getByText("Spidol Whiteboard Hitam Snowman")).toBeDefined();
			expect(screen.queryByText("Kertas A4 Sinar Dunia 80gsm")).toBeNull();
		});
	});

	it("integrates with QR landing parameters (?src=qr&location_id=...)", async () => {
		const user = userEvent.setup();

		// Buka dengan query QR landing rak lemari ATK
		render(
			<MemoryRouter initialEntries={["/?src=qr&location_id=loc-atk"]}>
				<CatalogView />
			</MemoryRouter>,
		);

		await waitFor(() => {
			expect(screen.getByTestId("qr-landing-banner")).toBeDefined();
			expect(screen.getByText(/Mode Pindai QR Rak:/i)).toBeDefined();
			expect(
				screen.getAllByText("Lemari ATK Ruang Auditor").length,
			).toBeGreaterThanOrEqual(1);
		});

		// Verifikasi item di luar loc-atk difilter
		expect(screen.queryByText("Helm Safety Lapangan MSA V-Gard")).toBeNull();

		// Klik tombol "Tampilkan Semua" pada banner
		const showAllBtn = screen.getByRole("button", {
			name: /tampilkan semua/i,
		});
		await user.click(showAllBtn);

		await waitFor(() => {
			expect(screen.getByText("Helm Safety Lapangan MSA V-Gard")).toBeDefined();
		});
	});

	it("shows empty state and resets all filters cleanly", async () => {
		const user = userEvent.setup();

		render(
			<MemoryRouter>
				<CatalogView />
			</MemoryRouter>,
		);

		await waitFor(() => {
			expect(screen.getByText("Kertas A4 Sinar Dunia 80gsm")).toBeDefined();
		});

		const searchInput = screen.getByTestId("catalog-search-input");
		await user.type(searchInput, "non-existent-item-query-xyz");

		await waitFor(() => {
			expect(screen.getByText("Tidak Ada Barang Ditemukan")).toBeDefined();
		});

		// Klik tombol Reset Pencarian & Filter
		const resetBtn = screen.getByRole("button", {
			name: /reset pencarian & filter/i,
		});
		await user.click(resetBtn);

		await waitFor(() => {
			expect(screen.getByText("Kertas A4 Sinar Dunia 80gsm")).toBeDefined();
		});
	});
});
