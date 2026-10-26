import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BrowserRouter, MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import { db } from "@/lib/db";
import { HomePage } from "@/pages/HomePage";
import { postLogout } from "./api/postLogout";
import { LogoutConfirmDialog } from "./components/LogoutConfirmDialog";
import { useLogout } from "./hooks/useLogout";
import { useAuthStore } from "./store/authStore";

function renderWithProviders(ui: React.ReactElement) {
	const queryClient = new QueryClient({
		defaultOptions: {
			queries: { retry: false },
			mutations: { retry: false },
		},
	});

	return render(
		<QueryClientProvider client={queryClient}>
			<BrowserRouter>{ui}</BrowserRouter>
		</QueryClientProvider>,
	);
}

function TestLogoutComponent() {
	const {
		showWarningDialog,
		pendingCount,
		requestLogout,
		cancelLogout,
		confirmLogout,
	} = useLogout();

	return (
		<div>
			<button type="button" onClick={requestLogout}>
				Trigger Logout
			</button>
			<LogoutConfirmDialog
				open={showWarningDialog}
				onOpenChange={cancelLogout}
				pendingCount={pendingCount}
				onConfirm={confirmLogout}
			/>
		</div>
	);
}

describe("Logout with Outbox Warning (Task P1.6) Tests", () => {
	beforeEach(async () => {
		localStorage.clear();
		await db.outbox.clear();

		useAuthStore.setState({
			token: "active-token-logout-test",
			employee: {
				id: "emp-logout-001",
				user_id: "usr-001",
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
		await db.outbox.clear();
	});

	describe("postLogout API Client", () => {
		it("calls /auth/logout on server and returns success", async () => {
			const postSpy = vi.spyOn(api, "post").mockResolvedValueOnce({
				data: { success: true, message: "Logout berhasil." },
			});

			const res = await postLogout();
			expect(postSpy).toHaveBeenCalledWith("/auth/logout");
			expect(res.success).toBe(true);
		});

		it("gracefully succeeds even when network is offline / error", async () => {
			vi.spyOn(api, "post").mockRejectedValueOnce(new Error("Network Error"));

			const res = await postLogout();
			expect(res.success).toBe(true);
			expect(res.message).toBe("Logout lokal berhasil.");
		});
	});

	describe("LogoutConfirmDialog Component", () => {
		it("renders warning title, count badge, and buttons", () => {
			const onOpenChange = vi.fn();
			const onConfirm = vi.fn();

			render(
				<LogoutConfirmDialog
					open={true}
					onOpenChange={onOpenChange}
					pendingCount={3}
					onConfirm={onConfirm}
				/>,
			);

			expect(screen.getByText("Transaksi Belum Tersinkronisasi")).toBeDefined();
			expect(screen.getByText("3 Antrean")).toBeDefined();
			expect(screen.getByText("Batal")).toBeDefined();
			expect(screen.getByText("Tetap Keluar")).toBeDefined();

			fireEvent.click(screen.getByText("Batal"));
			expect(onOpenChange).toHaveBeenCalledWith(false);

			fireEvent.click(screen.getByText("Tetap Keluar"));
			expect(onConfirm).toHaveBeenCalled();
		});
	});

	describe("useLogout Hook & Integration", () => {
		it("logs out directly when outbox is empty", async () => {
			const user = userEvent.setup();
			vi.spyOn(api, "post").mockResolvedValueOnce({
				data: { success: true, message: "OK" },
			});

			renderWithProviders(<TestLogoutComponent />);

			await user.click(screen.getByRole("button", { name: /trigger logout/i }));

			await waitFor(() => {
				// Store session dibersihkan
				expect(useAuthStore.getState().token).toBeNull();
				expect(useAuthStore.getState().status).toBe("unauthenticated");
			});
		});

		it("opens warning dialog when pending transactions exist in outbox", async () => {
			const user = userEvent.setup();

			// Simulasikan 2 transaksi offline tersimpan di Dexie outbox
			await db.outbox.bulkPut([
				{
					clientUuid: "uuid-1",
					employeeId: "emp-1",
					operation: "take",
					itemId: "item-1",
					quantity: 2,
					occurredAt: new Date().toISOString(),
					status: "pending",
					attempts: 0,
					createdAt: new Date().toISOString(),
				},
				{
					clientUuid: "uuid-2",
					employeeId: "emp-1",
					operation: "borrow",
					itemId: "item-2",
					quantity: 1,
					occurredAt: new Date().toISOString(),
					status: "pending",
					attempts: 0,
					createdAt: new Date().toISOString(),
				},
			]);

			renderWithProviders(<TestLogoutComponent />);

			await user.click(screen.getByRole("button", { name: /trigger logout/i }));

			// Dialog peringatan harus muncul
			await waitFor(() => {
				expect(
					screen.getByText("Transaksi Belum Tersinkronisasi"),
				).toBeDefined();
				expect(screen.getByText("2 Antrean")).toBeDefined();
			});

			// User membatalkan logout
			await user.click(screen.getByRole("button", { name: /batal/i }));

			// Sesi tetap aktif
			expect(useAuthStore.getState().token).toBe("active-token-logout-test");
			expect(useAuthStore.getState().status).toBe("authenticated");
		});

		it("confirms logout with pending outbox and keeps IndexedDB records safe", async () => {
			const user = userEvent.setup();
			vi.spyOn(api, "post").mockResolvedValueOnce({
				data: { success: true, message: "OK" },
			});

			// Masukkan 1 transaksi offline pending
			await db.outbox.put({
				clientUuid: "uuid-vital-offline",
				employeeId: "emp-1",
				operation: "take",
				itemId: "item-1",
				quantity: 5,
				occurredAt: new Date().toISOString(),
				status: "pending",
				attempts: 0,
				createdAt: new Date().toISOString(),
			});

			renderWithProviders(<TestLogoutComponent />);

			await user.click(screen.getByRole("button", { name: /trigger logout/i }));

			await waitFor(() => {
				expect(
					screen.getByText("Transaksi Belum Tersinkronisasi"),
				).toBeDefined();
			});

			// Klik "Tetap Keluar"
			await user.click(screen.getByRole("button", { name: /tetap keluar/i }));

			await waitFor(() => {
				expect(useAuthStore.getState().token).toBeNull();
				expect(useAuthStore.getState().status).toBe("unauthenticated");
			});

			// PENTING: Verifikasi antrean di Dexie IndexedDB tetap utuh dan tidak terhapus!
			const savedRecords = await db.outbox.toArray();
			expect(savedRecords.length).toBe(1);
			expect(savedRecords[0].clientUuid).toBe("uuid-vital-offline");
			expect(savedRecords[0].status).toBe("pending");
		});
	});

	describe("HomePage Logout Button Interaction", () => {
		it("triggers logout confirmation dialog on home page when outbox has pending items", async () => {
			const user = userEvent.setup();

			await db.outbox.put({
				clientUuid: "uuid-home-test",
				employeeId: "emp-1",
				operation: "take",
				itemId: "item-1",
				quantity: 1,
				occurredAt: new Date().toISOString(),
				status: "pending",
				attempts: 0,
				createdAt: new Date().toISOString(),
			});

			const queryClient = new QueryClient();

			render(
				<QueryClientProvider client={queryClient}>
					<MemoryRouter initialEntries={["/"]}>
						<Routes>
							<Route path="/" element={<HomePage />} />
							<Route path="/login" element={<div>Login Page Target</div>} />
						</Routes>
					</MemoryRouter>
				</QueryClientProvider>,
			);

			const logoutButton = screen.getByRole("button", { name: /keluar/i });
			await user.click(logoutButton);

			await waitFor(() => {
				expect(
					screen.getByText("Transaksi Belum Tersinkronisasi"),
				).toBeDefined();
				expect(screen.getByText("1 Antrean")).toBeDefined();
			});
		});
	});
});
