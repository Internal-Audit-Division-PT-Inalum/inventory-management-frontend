import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as syncEngineModule from "@/features/sync/lib/syncEngine";
import { syncScheduler } from "@/features/sync/lib/syncScheduler";
import { db, type OutboxItem } from "@/lib/db";
import type { Item } from "@/types/api";
import { OutboxQueueView } from "./OutboxQueueView";

describe("OutboxQueueView Component & Actions Suite (Task P5.9)", () => {
	const mockItemA: Item = {
		id: "item-001",
		sku: "SKU-001",
		name: "Baterai AA Alkaline",
		type: "consumable",
		unit: "pack",
		location_id: "loc-01",
		current_stock: 15,
		minimum_stock: 5,
		image_url: null,
		updated_at: "2026-10-28T00:00:00Z",
	};

	const mockItemB: Item = {
		id: "item-002",
		sku: "SKU-002",
		name: "Helm Safety Pro",
		type: "asset",
		unit: "unit",
		location_id: "loc-01",
		current_stock: 8,
		borrowed_quantity: 2,
		minimum_stock: 2,
		image_url: null,
		updated_at: "2026-10-28T00:00:00Z",
	};

	beforeEach(async () => {
		await db.items.clear();
		await db.outbox.clear();
		await db.diagnostic_logs.clear();
		await db.items.bulkAdd([mockItemA, mockItemB]);
		vi.clearAllMocks();
	});

	afterEach(async () => {
		vi.restoreAllMocks();
		await db.items.clear();
		await db.outbox.clear();
	});

	it("renders empty state correctly when outbox is clean", async () => {
		render(
			<MemoryRouter>
				<OutboxQueueView />
			</MemoryRouter>,
		);

		await waitFor(() => {
			expect(
				screen.getByRole("heading", { name: /Antrean Transaksi \(Outbox\)/i }),
			).toBeDefined();
			expect(screen.getByText(/Antrean Offline Kosong/i)).toBeDefined();
			expect(
				screen.getByRole("link", { name: /Kembali ke Katalog Barang/i }),
			).toBeDefined();
		});
	});

	it("renders tab counters and categorized outbox items correctly", async () => {
		const outboxEntries: OutboxItem[] = [
			{
				clientUuid: "uuid-1",
				employeeId: "emp-1",
				operation: "take",
				itemId: "item-001",
				quantity: 2,
				occurredAt: "2026-10-28T08:00:00Z",
				status: "pending",
				attempts: 0,
				notes: "Keperluan audit lapangan",
				createdAt: "2026-10-28T08:00:00Z",
			},
			{
				clientUuid: "uuid-2",
				employeeId: "emp-1",
				operation: "borrow",
				itemId: "item-002",
				quantity: 1,
				occurredAt: "2026-10-28T08:15:00Z",
				status: "syncing",
				attempts: 1,
				createdAt: "2026-10-28T08:15:00Z",
			},
			{
				clientUuid: "uuid-3",
				employeeId: "emp-1",
				operation: "take",
				itemId: "item-001",
				quantity: 5,
				occurredAt: "2026-10-28T08:30:00Z",
				status: "failed",
				attempts: 3,
				lastError: {
					code: "TIMEOUT",
					message: "Koneksi ke server timeout setelah 15000ms",
				},
				createdAt: "2026-10-28T08:30:00Z",
			},
			{
				clientUuid: "uuid-4",
				employeeId: "emp-1",
				operation: "take",
				itemId: "item-001",
				quantity: 50,
				occurredAt: "2026-10-28T08:45:00Z",
				status: "rejected",
				attempts: 1,
				lastError: {
					code: "INSUFFICIENT_STOCK",
					message: "Stok di server tidak mencukupi untuk jumlah yang diminta",
				},
				createdAt: "2026-10-28T08:45:00Z",
			},
			{
				clientUuid: "uuid-5",
				employeeId: "emp-1",
				operation: "add",
				itemId: "item-001",
				quantity: 10,
				occurredAt: "2026-10-28T07:00:00Z",
				status: "synced",
				attempts: 1,
				createdAt: "2026-10-28T07:00:00Z",
			},
		];

		await db.outbox.bulkAdd(outboxEntries);

		render(
			<MemoryRouter>
				<OutboxQueueView />
			</MemoryRouter>,
		);

		// Verifikasi Header & Counter Keseluruhan
		await waitFor(() => {
			expect(screen.getByTestId("needs-action-indicator-badge")).toBeDefined();
			expect(
				screen.getByTestId("needs-action-indicator-badge").textContent,
			).toContain("2 Perlu Tindakan");
		});

		// Verifikasi counter pada tiap tab
		expect(screen.getByTestId("tab-all").textContent).toContain("5");
		expect(screen.getByTestId("tab-pending").textContent).toContain("2");
		expect(screen.getByTestId("tab-needs-action").textContent).toContain("2");
		expect(screen.getByTestId("tab-synced").textContent).toContain("1");

		// Tab default "all" menampilkan semua kartu
		expect(screen.getByTestId("outbox-card-uuid-1")).toBeDefined();
		expect(screen.getByTestId("outbox-card-uuid-2")).toBeDefined();
		expect(screen.getByTestId("outbox-card-uuid-3")).toBeDefined();
		expect(screen.getByTestId("outbox-card-uuid-4")).toBeDefined();
		expect(screen.getByTestId("outbox-card-uuid-5")).toBeDefined();
	});

	it("switches tabs and filters outbox items appropriately", async () => {
		const user = userEvent.setup();

		await db.outbox.bulkAdd([
			{
				clientUuid: "uuid-pending",
				employeeId: "emp-1",
				operation: "take",
				itemId: "item-001",
				quantity: 1,
				occurredAt: "2026-10-28T08:00:00Z",
				status: "pending",
				attempts: 0,
				createdAt: "2026-10-28T08:00:00Z",
			},
			{
				clientUuid: "uuid-failed",
				employeeId: "emp-1",
				operation: "take",
				itemId: "item-001",
				quantity: 2,
				occurredAt: "2026-10-28T08:10:00Z",
				status: "failed",
				attempts: 2,
				lastError: { message: "Server 500 Internal Error" },
				createdAt: "2026-10-28T08:10:00Z",
			},
		]);

		render(
			<MemoryRouter>
				<OutboxQueueView />
			</MemoryRouter>,
		);

		await waitFor(() => {
			expect(screen.getByTestId("outbox-card-uuid-pending")).toBeDefined();
		});

		// Pindah ke tab "Menunggu"
		await user.click(screen.getByTestId("tab-pending"));
		expect(screen.getByTestId("outbox-card-uuid-pending")).toBeDefined();
		expect(screen.queryByTestId("outbox-card-uuid-failed")).toBeNull();

		// Pindah ke tab "Perlu Tindakan"
		await user.click(screen.getByTestId("tab-needs-action"));
		expect(screen.queryByTestId("outbox-card-uuid-pending")).toBeNull();
		expect(screen.getByTestId("outbox-card-uuid-failed")).toBeDefined();
		expect(screen.getByText("Server 500 Internal Error")).toBeDefined();

		// Pindah ke tab "Tersinkron" (kosong)
		await user.click(screen.getByTestId("tab-synced"));
		expect(screen.getByText(/Belum Ada Riwayat Tersinkron/i)).toBeDefined();
	});

	it("handles Retry action on failed item and triggers syncScheduler", async () => {
		const user = userEvent.setup();
		const triggerSyncSpy = vi
			.spyOn(syncScheduler, "triggerManualSync")
			.mockResolvedValue({
				totalProcessed: 0,
				syncedCount: 0,
				failedCount: 0,
				rejectedCount: 0,
				skippedCount: 0,
				itemsProcessed: [],
				itemResults: {},
				durationMs: 0,
			});

		await db.outbox.add({
			clientUuid: "uuid-retry-1",
			employeeId: "emp-1",
			operation: "take",
			itemId: "item-001",
			quantity: 2,
			occurredAt: "2026-10-28T08:00:00Z",
			status: "failed",
			attempts: 2,
			lastError: { message: "Network offline" },
			createdAt: "2026-10-28T08:00:00Z",
		});

		render(
			<MemoryRouter>
				<OutboxQueueView initialTab="needs_action" />
			</MemoryRouter>,
		);

		await waitFor(() => {
			expect(screen.getByTestId("retry-button-uuid-retry-1")).toBeDefined();
		});

		// Klik tombol Coba Lagi
		await user.click(screen.getByTestId("retry-button-uuid-retry-1"));

		// Verifikasi status di IndexedDB berubah menjadi pending
		await waitFor(async () => {
			const item = await db.outbox.get("uuid-retry-1");
			expect(item?.status).toBe("pending");
			expect(item?.attempts).toBe(2);
			expect(item?.lastError).toBeNull();
		});

		await waitFor(() => {
			expect(triggerSyncSpy).toHaveBeenCalled();
		});

		expect(
			screen.getByText(
				/Status transaksi berhasil direset ke antrean pengiriman/i,
			),
		).toBeDefined();
	});

	it("handles Discard (Hapus Antrean) with confirmation dialog and rolls back optimistic stock", async () => {
		const user = userEvent.setup();

		// Simulasikan stok sebelum transaksi: 20
		// Transaksi: take 3 pcs (appliedDeltaStock: -3), stok lokal sekarang: 17
		await db.items.update("item-001", { current_stock: 17 });

		await db.outbox.add({
			clientUuid: "uuid-discard-1",
			employeeId: "emp-1",
			operation: "take",
			itemId: "item-001",
			quantity: 3,
			appliedDeltaStock: -3,
			appliedDeltaBorrowed: 0,
			occurredAt: "2026-10-28T08:00:00Z",
			status: "rejected",
			attempts: 1,
			lastError: {
				code: "ITEM_DISABLED",
				message: "Barang telah dinonaktifkan oleh admin",
			},
			createdAt: "2026-10-28T08:00:00Z",
		});

		render(
			<MemoryRouter>
				<OutboxQueueView initialTab="needs_action" />
			</MemoryRouter>,
		);

		await waitFor(() => {
			expect(screen.getByTestId("discard-button-uuid-discard-1")).toBeDefined();
		});

		// 1. Klik tombol Hapus Antrean -> memicu dialog konfirmasi
		await user.click(screen.getByTestId("discard-button-uuid-discard-1"));

		// Dialog muncul
		expect(
			screen.getByRole("heading", {
				name: /Batalkan Transaksi & Hapus Antrean\?/i,
			}),
		).toBeDefined();
		expect(
			screen.getAllByText(/Baterai AA Alkaline/i).length,
		).toBeGreaterThanOrEqual(2);
		expect(screen.getByText(/Rollback Stok Otomatis/i)).toBeDefined();

		// 2. Klik Batal terlebih dahulu -> dialog tertutup tanpa menghapus
		await user.click(screen.getByRole("button", { name: "Batal" }));
		const itemAfterCancel = await db.outbox.get("uuid-discard-1");
		expect(itemAfterCancel).toBeDefined();

		// 3. Klik lagi Hapus Antrean dan konfirmasi
		await user.click(screen.getByTestId("discard-button-uuid-discard-1"));
		await user.click(screen.getByTestId("confirm-discard-button"));

		// 4. Verifikasi item terhapus dari outbox
		await waitFor(async () => {
			const itemAfterDiscard = await db.outbox.get("uuid-discard-1");
			expect(itemAfterDiscard).toBeUndefined();
		});

		// 5. Verifikasi stok optimistik lokal di-rollback: 17 + 3 = 20
		const restoredItem = await db.items.get("item-001");
		expect(restoredItem?.current_stock).toBe(20);

		// 6. Verifikasi feedback banner
		await waitFor(() => {
			expect(
				screen.getByText(
					/Transaksi dibatalkan dan perubahan stok lokal berhasil di-rollback/i,
				),
			).toBeDefined();
		});
	});

	it("executes manual sync via Sinkronkan Sekarang button", async () => {
		const user = userEvent.setup();
		const runSyncSpy = vi
			.spyOn(syncEngineModule, "runSyncEngine")
			.mockResolvedValue({
				totalProcessed: 1,
				syncedCount: 1,
				failedCount: 0,
				rejectedCount: 0,
				skippedCount: 0,
				itemsProcessed: ["item-001"],
				itemResults: {},
				durationMs: 50,
			});

		await db.outbox.add({
			clientUuid: "uuid-sync-1",
			employeeId: "emp-1",
			operation: "take",
			itemId: "item-001",
			quantity: 1,
			occurredAt: "2026-10-28T08:00:00Z",
			status: "pending",
			attempts: 0,
			createdAt: "2026-10-28T08:00:00Z",
		});

		render(
			<MemoryRouter>
				<OutboxQueueView />
			</MemoryRouter>,
		);

		await waitFor(() => {
			expect(screen.getByTestId("sync-now-button")).toBeDefined();
		});

		await user.click(screen.getByTestId("sync-now-button"));

		expect(runSyncSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				includeFailed: true,
			}),
		);
	});

	it("shows offline warning and disables sync button when network is offline", async () => {
		render(
			<MemoryRouter>
				<OutboxQueueView />
			</MemoryRouter>,
		);

		// Simulasikan event offline pada window
		fireEvent(window, new Event("offline"));

		await waitFor(() => {
			expect(screen.getByText(/Mode Offline:/i)).toBeDefined();
			const syncBtn = screen.getByTestId("sync-now-button");
			expect(syncBtn.hasAttribute("disabled")).toBe(true);
		});

		// Simulasikan event online kembali
		fireEvent(window, new Event("online"));

		await waitFor(() => {
			expect(screen.queryByText(/Mode Offline:/i)).toBeNull();
			const syncBtn = screen.getByTestId("sync-now-button");
			expect(syncBtn.hasAttribute("disabled")).toBe(false);
		});
	});
});
