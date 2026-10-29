import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { RecentActivityItem } from "../types";
import { RecentActivityFeed } from "./RecentActivityFeed";

describe("RecentActivityFeed Component (Task P6.2)", () => {
	const mockActivities: RecentActivityItem[] = [
		{
			id: "uuid-1",
			clientUuid: "uuid-1",
			operation: "take",
			operationLabel: "Pengambilan Barang",
			itemId: "item-1",
			itemName: "Sarung Tangan Las",
			itemSku: "PPE-GLV-001",
			itemUnit: "pasang",
			quantity: 2,
			status: "pending",
			statusLabel: "Menunggu Sinkron",
			occurredAt: "2026-10-29T09:50:00.000Z",
			relativeTime: "10 menit lalu",
			notes: "Pekerjaan peleburan",
		},
		{
			id: "uuid-2",
			clientUuid: "uuid-2",
			operation: "return",
			operationLabel: "Pengembalian Aset",
			itemId: "item-2",
			itemName: "Multimeter Fluke 87V",
			itemSku: "AST-FLK-087",
			itemUnit: "unit",
			quantity: 1,
			status: "synced",
			statusLabel: "Tersinkron",
			occurredAt: "2026-10-29T08:00:00.000Z",
			relativeTime: "2 jam lalu",
		},
	];

	it("merender daftar aktivitas mutasi transaksi dengan status dan kuantitas", () => {
		render(
			<MemoryRouter>
				<RecentActivityFeed activities={mockActivities} />
			</MemoryRouter>,
		);

		expect(screen.getByText("Aktivitas Terakhir")).toBeDefined();
		expect(screen.getByText("2 Transaksi")).toBeDefined();

		// Activity 1
		expect(screen.getByText("Sarung Tangan Las")).toBeDefined();
		expect(screen.getByText("(PPE-GLV-001)")).toBeDefined();
		expect(screen.getByText("Pengambilan Barang:")).toBeDefined();
		expect(screen.getByText("2 pasang")).toBeDefined();
		expect(screen.getByText("Menunggu")).toBeDefined();
		expect(screen.getByText("10 menit lalu")).toBeDefined();

		// Activity 2
		expect(screen.getByText("Multimeter Fluke 87V")).toBeDefined();
		expect(screen.getByText("(AST-FLK-087)")).toBeDefined();
		expect(screen.getByText("Pengembalian Aset:")).toBeDefined();
		expect(screen.getByText("1 unit")).toBeDefined();
		expect(screen.getByText("Tersinkron")).toBeDefined();
		expect(screen.getByText("2 jam lalu")).toBeDefined();
	});

	it("merender empty state saat belum ada transaksi pada perangkat ini", () => {
		render(
			<MemoryRouter>
				<RecentActivityFeed activities={[]} />
			</MemoryRouter>,
		);

		expect(screen.getByText("Belum Ada Transaksi Terbaru")).toBeDefined();
		expect(
			screen.getByText(/Mutasi pengambilan, restok, atau peminjaman/i),
		).toBeDefined();
	});

	it("memicu onViewAllClick saat tombol lihat antrean outbox diklik", () => {
		const handleViewAll = vi.fn();
		render(
			<MemoryRouter>
				<RecentActivityFeed
					activities={mockActivities}
					onViewAllClick={handleViewAll}
				/>
			</MemoryRouter>,
		);

		const button = screen.getByText("Lihat Antrean Outbox Lengkap");
		fireEvent.click(button);
		expect(handleViewAll).toHaveBeenCalledTimes(1);
	});
});
