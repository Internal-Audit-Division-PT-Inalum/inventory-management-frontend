import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/features/auth/store/authStore";
import { OutboxQueueView } from "@/features/sync/components/OutboxQueueView";
import * as syncEngineModule from "@/features/sync/lib/syncEngine";
import { syncScheduler } from "@/features/sync/lib/syncScheduler";
import * as outboxQueueModule from "@/features/transactions/lib/outboxQueue";
import { db, type OutboxItem } from "@/lib/db";
import type { Item } from "@/types/api";
import { LogoutConfirmDialog } from "./components/LogoutConfirmDialog";
import { useLogout } from "./hooks/useLogout";

function TestLogoutIsolationComponent() {
	const {
		showWarningDialog,
		myPendingCount,
		otherPendingCount,
		employee,
		isLoggingOut,
		isSyncingBeforeLogout,
		requestLogout,
		cancelLogout,
		confirmLogout,
		syncBeforeLogout,
	} = useLogout();

	return (
		<div>
			<button
				type="button"
				onClick={requestLogout}
				data-testid="trigger-logout"
			>
				Keluar Akun
			</button>
			<LogoutConfirmDialog
				open={showWarningDialog}
				onOpenChange={cancelLogout}
				employee={employee}
				myPendingCount={myPendingCount}
				otherPendingCount={otherPendingCount}
				onConfirm={confirmLogout}
				onSyncBeforeLogout={syncBeforeLogout}
				isPending={isLoggingOut}
				isSyncing={isSyncingBeforeLogout}
			/>
		</div>
	);
}

describe("Account Isolation & Final Logout Flow Suite (Task P5.11)", () => {
	const mockItem: Item = {
		id: "item-iso-1",
		sku: "SKU-ISO-1",
		name: "Buku Panduan Audit",
		type: "consumable",
		unit: "buku",
		location_id: "loc-1",
		current_stock: 50,
		minimum_stock: 10,
		image_url: null,
		updated_at: "2026-10-28T00:00:00Z",
	};

	beforeEach(async () => {
		localStorage.clear();
		await db.items.clear();
		await db.outbox.clear();
		await db.diagnostic_logs.clear();
		await db.items.add(mockItem);

		// Pegawai Aktif: Auditor A (ID: emp-A)
		useAuthStore.setState({
			token: "token-auditor-a",
			employee: {
				id: "emp-A",
				user_id: "usr-A",
				namecode: "MHS",
				name: "Mahesa Gya",
				email: "mahesa@inalum.id",
				role: "auditor",
				is_active: true,
				must_change_pin: false,
			},
			mustChangePin: false,
			status: "authenticated",
		});

		vi.clearAllMocks();
	});

	afterEach(async () => {
		vi.restoreAllMocks();
		localStorage.clear();
		await db.items.clear();
		await db.outbox.clear();
	});

	it("isolates syncEngine execution strictly to current logged-in employee", async () => {
		// Simulasikan 2 entri outbox: 1 milik Auditor A (emp-A), 1 milik Auditor B (emp-B)
		const entryA: OutboxItem = {
			clientUuid: "uuid-emp-A-tx",
			employeeId: "emp-A",
			operation: "take",
			itemId: "item-iso-1",
			quantity: 2,
			occurredAt: "2026-10-28T08:00:00Z",
			status: "pending",
			attempts: 0,
			createdAt: "2026-10-28T08:00:00Z",
		};

		const entryB: OutboxItem = {
			clientUuid: "uuid-emp-B-tx",
			employeeId: "emp-B",
			operation: "take",
			itemId: "item-iso-1",
			quantity: 3,
			occurredAt: "2026-10-28T08:30:00Z",
			status: "pending",
			attempts: 0,
			createdAt: "2026-10-28T08:30:00Z",
		};

		await db.outbox.bulkAdd([entryA, entryB]);

		// Spy pada processPendingOutboxEntry
		const processSpy = vi
			.spyOn(outboxQueueModule, "processPendingOutboxEntry")
			.mockResolvedValue({
				success: true,
				synced: true,
				queued: false,
				outboxItem: { ...entryA, status: "synced" },
				message: "Transaksi sukses disinkronkan",
			});

		// Jalankan syncEngine tanpa mempassing options.employeeId eksplisit (otomatis mengambil emp-A)
		const result = await syncEngineModule.runSyncEngine({
			bypassTabLock: true,
		});

		// Verifikasi: Hanya 1 item (milik emp-A) yang diproses dalam siklus ini
		expect(processSpy).toHaveBeenCalledTimes(1);
		expect(processSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				clientUuid: "uuid-emp-A-tx",
				employeeId: "emp-A",
			}),
		);
		expect(result.syncedCount).toBe(1);

		// Item B tetap pending di IndexedDB (tidak terganggu sama sekali)
		const itemB = await db.outbox.get("uuid-emp-B-tx");
		expect(itemB?.status).toBe("pending");
		expect(itemB?.attempts).toBe(0);
	});

	it("prevents syncScheduler from triggering when no pending items belong to current employee", async () => {
		// Hanya ada item milik Auditor B (emp-B)
		await db.outbox.add({
			clientUuid: "uuid-only-b",
			employeeId: "emp-B",
			operation: "take",
			itemId: "item-iso-1",
			quantity: 1,
			occurredAt: "2026-10-28T08:00:00Z",
			status: "pending",
			attempts: 0,
			createdAt: "2026-10-28T08:00:00Z",
		});

		// Auditor A sedang aktif, dan tidak punya antrean sendiri
		const canRun = await syncScheduler.canSyncNow("interval");
		expect(canRun).toBe(false);
	});

	it("shows other-employees queue banner in OutboxQueueView and toggles scope", async () => {
		const user = userEvent.setup();

		await db.outbox.bulkAdd([
			{
				clientUuid: "tx-auditor-a",
				employeeId: "emp-A",
				operation: "take",
				itemId: "item-iso-1",
				quantity: 1,
				occurredAt: "2026-10-28T08:00:00Z",
				status: "pending",
				attempts: 0,
				createdAt: "2026-10-28T08:00:00Z",
			},
			{
				clientUuid: "tx-auditor-b",
				employeeId: "emp-B",
				operation: "take",
				itemId: "item-iso-1",
				quantity: 5,
				occurredAt: "2026-10-28T08:15:00Z",
				status: "pending",
				attempts: 0,
				createdAt: "2026-10-28T08:15:00Z",
			},
		]);

		render(
			<MemoryRouter>
				<OutboxQueueView />
			</MemoryRouter>,
		);

		await waitFor(() => {
			const banner = screen.getByTestId("other-employees-queue-banner");
			expect(banner).toBeDefined();
			expect(banner.textContent).toContain("1 transaksi offline");
			expect(banner.textContent).toContain("milik akun lain");
		});

		// Default scope (current_employee): Hanya menampilkan transaksi Auditor A
		expect(screen.getByTestId("outbox-card-tx-auditor-a")).toBeDefined();
		expect(screen.queryByTestId("outbox-card-tx-auditor-b")).toBeNull();

		// Beralih ke "Lihat Semua"
		const toggleBtn = screen.getByTestId("toggle-outbox-scope-button");
		await user.click(toggleBtn);

		// Menampilkan kedua transaksi
		expect(screen.getByTestId("outbox-card-tx-auditor-a")).toBeDefined();
		expect(screen.getByTestId("outbox-card-tx-auditor-b")).toBeDefined();
	});

	it("handles final logout dialog with account isolation details and zero data loss confirmation", async () => {
		const user = userEvent.setup();

		// 2 transaksi milik Auditor A, 1 transaksi milik Auditor B
		await db.outbox.bulkAdd([
			{
				clientUuid: "tx-a-1",
				employeeId: "emp-A",
				operation: "take",
				itemId: "item-iso-1",
				quantity: 2,
				occurredAt: "2026-10-28T08:00:00Z",
				status: "pending",
				attempts: 0,
				createdAt: "2026-10-28T08:00:00Z",
			},
			{
				clientUuid: "tx-a-2",
				employeeId: "emp-A",
				operation: "borrow",
				itemId: "item-iso-1",
				quantity: 1,
				occurredAt: "2026-10-28T08:10:00Z",
				status: "pending",
				attempts: 0,
				createdAt: "2026-10-28T08:10:00Z",
			},
			{
				clientUuid: "tx-b-1",
				employeeId: "emp-B",
				operation: "take",
				itemId: "item-iso-1",
				quantity: 3,
				occurredAt: "2026-10-28T08:20:00Z",
				status: "pending",
				attempts: 0,
				createdAt: "2026-10-28T08:20:00Z",
			},
		]);

		const queryClient = new QueryClient();

		render(
			<QueryClientProvider client={queryClient}>
				<MemoryRouter initialEntries={["/"]}>
					<Routes>
						<Route path="/" element={<TestLogoutIsolationComponent />} />
						<Route path="/login" element={<div>Halaman Login Target</div>} />
					</Routes>
				</MemoryRouter>
			</QueryClientProvider>,
		);

		// Buka alur logout
		await user.click(screen.getByTestId("trigger-logout"));

		await waitFor(() => {
			expect(
				screen.getByRole("heading", {
					name: /Transaksi Belum Tersinkronisasi/i,
				}),
			).toBeDefined();
			// Menampilkan antrean Auditor A (2 antrean)
			expect(screen.getByText("2 Antrean")).toBeDefined();
			// Menampilkan identitas Auditor A
			expect(screen.getByText("Mahesa Gya")).toBeDefined();
			expect(screen.getByText("MHS")).toBeDefined();
			// Menampilkan catatan akun lain (1 transaksi)
			expect(screen.getByText(/Catatan: Terdapat juga/i)).toBeDefined();
			expect(screen.getByText(/milik akun lain/i)).toBeDefined();
		});

		// Konfirmasi Tetap Keluar
		await user.click(screen.getByTestId("confirm-logout-button"));

		await waitFor(() => {
			expect(useAuthStore.getState().token).toBeNull();
			expect(useAuthStore.getState().status).toBe("unauthenticated");
		});

		// ZERO DATA LOSS: Pastikan SEMUA 3 transaksi di IndexedDB tetap utuh tersimpan!
		const allOutbox = await db.outbox.toArray();
		expect(allOutbox.length).toBe(3);
		expect(allOutbox.find((t) => t.clientUuid === "tx-a-1")).toBeDefined();
		expect(allOutbox.find((t) => t.clientUuid === "tx-a-2")).toBeDefined();
		expect(allOutbox.find((t) => t.clientUuid === "tx-b-1")).toBeDefined();
	});

	it("allows syncing current employee queue directly from logout dialog before logging out", async () => {
		const user = userEvent.setup();

		// Transaksi Auditor A
		await db.outbox.add({
			clientUuid: "tx-sync-before-logout",
			employeeId: "emp-A",
			operation: "take",
			itemId: "item-iso-1",
			quantity: 1,
			occurredAt: "2026-10-28T08:00:00Z",
			status: "pending",
			attempts: 0,
			createdAt: "2026-10-28T08:00:00Z",
		});

		// Mock runSyncEngine agar berhasil menyinkronkan
		vi.spyOn(syncEngineModule, "runSyncEngine").mockImplementation(
			async (_opts) => {
				// Ubah status item Auditor A menjadi synced
				await db.outbox.update("tx-sync-before-logout", { status: "synced" });
				return {
					totalProcessed: 1,
					syncedCount: 1,
					failedCount: 0,
					rejectedCount: 0,
					skippedCount: 0,
					itemsProcessed: ["item-iso-1"],
					itemResults: {},
					durationMs: 50,
				};
			},
		);

		const queryClient = new QueryClient();

		render(
			<QueryClientProvider client={queryClient}>
				<MemoryRouter initialEntries={["/"]}>
					<Routes>
						<Route path="/" element={<TestLogoutIsolationComponent />} />
						<Route path="/login" element={<div>Halaman Login Target</div>} />
					</Routes>
				</MemoryRouter>
			</QueryClientProvider>,
		);

		await user.click(screen.getByTestId("trigger-logout"));

		await waitFor(() => {
			expect(screen.getByTestId("sync-before-logout-button")).toBeDefined();
		});

		// Klik "Sinkronkan Sekarang" di modal logout
		await user.click(screen.getByTestId("sync-before-logout-button"));

		// Otomatis tersinkron dan logout dijalankan
		await waitFor(() => {
			expect(useAuthStore.getState().status).toBe("unauthenticated");
		});

		const syncedItem = await db.outbox.get("tx-sync-before-logout");
		expect(syncedItem?.status).toBe("synced");
	});
});
