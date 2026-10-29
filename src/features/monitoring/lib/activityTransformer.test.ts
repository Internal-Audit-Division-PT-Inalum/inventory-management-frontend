import { describe, expect, it } from "vitest";
import type { OutboxItem } from "@/lib/db";
import type { Item } from "@/types/api";
import {
	formatRelativeTime,
	getOperationLabel,
	getStatusLabel,
	transformOutboxToActivities,
} from "./activityTransformer";

describe("activityTransformer - Pure Logic Engine (Task P6.2)", () => {
	const fixedNow = new Date("2026-10-29T10:00:00.000Z").getTime();

	describe("getOperationLabel", () => {
		it("memetakan setiap operasi outbox ke label bahasa Indonesia", () => {
			expect(getOperationLabel("take")).toBe("Pengambilan Barang");
			expect(getOperationLabel("add")).toBe("Penerimaan / Restok");
			expect(getOperationLabel("borrow")).toBe("Peminjaman Aset");
			expect(getOperationLabel("return")).toBe("Pengembalian Aset");
		});
	});

	describe("getStatusLabel", () => {
		it("memetakan setiap status outbox ke label status yang jelas", () => {
			expect(getStatusLabel("pending")).toBe("Menunggu Sinkron");
			expect(getStatusLabel("syncing")).toBe("Sedang Dikirim");
			expect(getStatusLabel("synced")).toBe("Tersinkron");
			expect(getStatusLabel("rejected")).toBe("Ditolak Server");
			expect(getStatusLabel("failed")).toBe("Gagal Sementara");
		});
	});

	describe("formatRelativeTime", () => {
		it("memformat selisih waktu secara tepat", () => {
			// Kurang dari 1 menit lalu
			const date30SecAgo = new Date("2026-10-29T09:59:30.000Z").toISOString();
			expect(formatRelativeTime(date30SecAgo, fixedNow)).toBe("Baru saja");

			// 15 menit lalu
			const date15MinAgo = new Date("2026-10-29T09:45:00.000Z").toISOString();
			expect(formatRelativeTime(date15MinAgo, fixedNow)).toBe("15 menit lalu");

			// 2 jam lalu
			const date2HoursAgo = new Date("2026-10-29T08:00:00.000Z").toISOString();
			expect(formatRelativeTime(date2HoursAgo, fixedNow)).toBe("2 jam lalu");

			// Kemarin (24 jam - 47 jam)
			const dateYesterday = new Date("2026-10-28T09:00:00.000Z").toISOString();
			expect(formatRelativeTime(dateYesterday, fixedNow)).toBe("Kemarin");

			// 3 hari lalu
			const date3DaysAgo = new Date("2026-10-26T09:00:00.000Z").toISOString();
			expect(formatRelativeTime(date3DaysAgo, fixedNow)).toBe("3 hari lalu");
		});
	});

	describe("transformOutboxToActivities", () => {
		const mockItemMap = new Map<string, Item>([
			[
				"item-1",
				{
					id: "item-1",
					name: "Sarung Tangan Las",
					sku: "PPE-GLV-001",
					type: "consumable",
					unit: "pasang",
					location_id: "loc-1",
					current_stock: 10,
					minimum_stock: 5,
					image_url: null,
					updated_at: "2026-10-29T00:00:00.000Z",
				},
			],
		]);

		const mockOutbox: OutboxItem[] = [
			{
				clientUuid: "uuid-1",
				employeeId: "emp-1",
				operation: "take",
				itemId: "item-1",
				quantity: 2,
				occurredAt: "2026-10-29T09:50:00.000Z", // 10 menit lalu
				status: "pending",
				attempts: 0,
				createdAt: "2026-10-29T09:50:00.000Z",
				notes: "Untuk inspeksi furnace",
			},
			{
				clientUuid: "uuid-2",
				employeeId: "emp-1",
				operation: "borrow",
				itemId: "item-unknown", // item belum ter-cache
				quantity: 1,
				occurredAt: "2026-10-29T08:00:00.000Z", // 2 jam lalu
				status: "synced",
				attempts: 1,
				createdAt: "2026-10-29T08:00:00.000Z",
			},
		];

		it("mentransformasikan dan memperkaya entri outbox dengan benar", () => {
			const activities = transformOutboxToActivities(
				mockOutbox,
				mockItemMap,
				fixedNow,
			);

			expect(activities).toHaveLength(2);

			// Item 1
			expect(activities[0].id).toBe("uuid-1");
			expect(activities[0].operation).toBe("take");
			expect(activities[0].operationLabel).toBe("Pengambilan Barang");
			expect(activities[0].itemName).toBe("Sarung Tangan Las");
			expect(activities[0].itemSku).toBe("PPE-GLV-001");
			expect(activities[0].itemUnit).toBe("pasang");
			expect(activities[0].quantity).toBe(2);
			expect(activities[0].status).toBe("pending");
			expect(activities[0].statusLabel).toBe("Menunggu Sinkron");
			expect(activities[0].relativeTime).toBe("10 menit lalu");
			expect(activities[0].notes).toBe("Untuk inspeksi furnace");

			// Item 2 (fallback item name)
			expect(activities[1].id).toBe("uuid-2");
			expect(activities[1].operationLabel).toBe("Peminjaman Aset");
			expect(activities[1].itemName).toBe("Barang Inventaris");
			expect(activities[1].statusLabel).toBe("Tersinkron");
			expect(activities[1].relativeTime).toBe("2 jam lalu");
		});
	});
});
