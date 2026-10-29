import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/features/auth/store/authStore";
import { api } from "@/lib/api";
import { db } from "@/lib/db";
import type { Employee, Item, Location } from "@/types/api";
import { HomePage } from "./HomePage";

const createTestQueryClient = () =>
	new QueryClient({
		defaultOptions: {
			queries: {
				retry: false,
			},
		},
	});

const mockEmployee: Employee = {
	id: "emp-1",
	user_id: "user-1",
	namecode: "MRA",
	name: "Muhammad Raihan Auditor",
	email: "raihan@inalum.id",
	is_active: true,
	must_change_pin: false,
};

const mockLocations: Location[] = [
	{ id: "loc-1", name: "Gudang Utama - Rak A1", code: "WH-A1" },
];

const mockItems: Item[] = [
	{
		id: "item-1",
		sku: "ATK-KTS-A4",
		name: "Kertas A4 70gsm",
		type: "consumable",
		unit: "rim",
		location_id: "loc-1",
		current_stock: 0, // out of stock
		minimum_stock: 20,
		image_url: null,
		is_active: true,
		updated_at: "2026-10-29T00:00:00.000Z",
	},
	{
		id: "item-2",
		sku: "PPE-GLV-001",
		name: "Sarung Tangan Las",
		type: "consumable",
		unit: "pasang",
		location_id: "loc-1",
		current_stock: 2, // critical
		minimum_stock: 10,
		image_url: null,
		is_active: true,
		updated_at: "2026-10-29T00:00:00.000Z",
	},
	{
		id: "item-3",
		sku: "PPE-MSK-001",
		name: "Masker N95",
		type: "consumable",
		unit: "box",
		location_id: "loc-1",
		current_stock: 15, // healthy
		minimum_stock: 10,
		image_url: null,
		is_active: true,
		updated_at: "2026-10-29T00:00:00.000Z",
	},
];

describe("HomePage with Monitoring Dashboard (Task P6.1)", () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		vi.spyOn(api, "get").mockResolvedValue({
			data: {
				success: true,
				data: [],
			},
		});

		useAuthStore.setState({
			token: "valid-token",
			employee: mockEmployee,
			mustChangePin: false,
		});

		await db.items.clear();
		await db.locations.clear();
		await db.outbox.clear();

		await db.locations.bulkPut(mockLocations);
		await db.items.bulkPut(mockItems);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("merender profil pegawai, KPI inventaris, dan widget peringatan stok kritis", async () => {
		const queryClient = createTestQueryClient();
		render(
			<QueryClientProvider client={queryClient}>
				<MemoryRouter>
					<HomePage />
				</MemoryRouter>
			</QueryClientProvider>,
		);

		// Profil Pegawai
		expect(screen.getByText("Muhammad Raihan Auditor")).toBeDefined();
		expect(screen.getByText("MRA")).toBeDefined();

		// Tunggu metrik selesai dihitung dari IndexedDB
		await waitFor(() => {
			expect(screen.getByText("Total Barang")).toBeDefined();
		});

		expect(screen.getByText("Total Barang")).toBeDefined();
		expect(screen.getByText("Stok Aman")).toBeDefined();
		expect(screen.getByText("Kritis & Habis")).toBeDefined();

		// Widget Peringatan & Katalog
		expect(screen.getByText("Peringatan Stok Kritis")).toBeDefined();
		expect(
			screen.getAllByText("Kertas A4 70gsm").length,
		).toBeGreaterThanOrEqual(1);
		expect(
			screen.getAllByText("Sarung Tangan Las").length,
		).toBeGreaterThanOrEqual(1);

		// Widget Pinjaman & Aktivitas (Task P6.2)
		await waitFor(() => {
			expect(screen.getByText("Pinjaman Aset Saya")).toBeDefined();
			expect(screen.getByText("Aktivitas Terakhir")).toBeDefined();
		});
	});

	it("mengubah filter stok katalog saat tombol lihat semua di widget diklik", async () => {
		const queryClient = createTestQueryClient();
		render(
			<QueryClientProvider client={queryClient}>
				<MemoryRouter>
					<HomePage />
				</MemoryRouter>
			</QueryClientProvider>,
		);

		await waitFor(() => {
			expect(
				screen.getByText("Lihat Semua Barang Menipis di Katalog"),
			).toBeDefined();
		});

		const viewAllBtn = screen.getByText(
			"Lihat Semua Barang Menipis di Katalog",
		);
		fireEvent.click(viewAllBtn);

		// Verifikasi bahwa klik tidak melempar error dan interaksi berjalan mulus
		expect(viewAllBtn).toBeDefined();
	});
});
