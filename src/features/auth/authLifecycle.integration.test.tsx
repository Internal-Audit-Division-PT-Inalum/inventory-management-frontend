import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "@/components/layout/AppShell";
import { AUTH_EXPIRED_EVENT, api } from "@/lib/api";
import { db } from "@/lib/db";
import { ChangePinPage } from "@/pages/ChangePinPage";
import { HomePage } from "@/pages/HomePage";
import { LoginPage } from "@/pages/LoginPage";
import type { AuthSession } from "@/types/api";
import { MustChangePinRoute } from "./components/MustChangePinRoute";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { useAuthStore } from "./store/authStore";

function createTestQueryClient() {
	return new QueryClient({
		defaultOptions: {
			queries: { retry: false },
			mutations: { retry: false },
		},
	});
}

function renderFullAuthApp(initialEntry = "/") {
	const queryClient = createTestQueryClient();

	return render(
		<QueryClientProvider client={queryClient}>
			<MemoryRouter initialEntries={[initialEntry]}>
				<Routes>
					<Route path="/login" element={<LoginPage />} />
					<Route element={<MustChangePinRoute />}>
						<Route path="/change-pin" element={<ChangePinPage />} />
					</Route>
					<Route element={<ProtectedRoute />}>
						<Route element={<AppShell />}>
							<Route path="/" element={<HomePage />} />
						</Route>
					</Route>
				</Routes>
			</MemoryRouter>
		</QueryClientProvider>,
	);
}

describe("Fase P1: Full Employee Authentication Lifecycle Integration Test", () => {
	beforeEach(async () => {
		localStorage.clear();
		await db.outbox.clear();
		useAuthStore.setState({
			token: null,
			employee: null,
			mustChangePin: false,
			status: "unauthenticated",
		});
		vi.clearAllMocks();
	});

	afterEach(async () => {
		vi.restoreAllMocks();
		await db.outbox.clear();
	});

	it("executes the entire authentication, first-time PIN change, session expiration, and safe logout lifecycle", async () => {
		const user = userEvent.setup();

		// -------------------------------------------------------------------------
		// LANGKAH 1: Pegawai belum login membuka rute terproteksi "/"
		// -------------------------------------------------------------------------
		renderFullAuthApp("/");

		// Verifikasi: Tercegat oleh ProtectedRoute dan otomatis dialihkan ke halaman /login
		await waitFor(() => {
			expect(screen.getByText("Masuk Pegawai")).toBeDefined();
			expect(screen.getByText("Divisi Internal Audit")).toBeDefined();
		});

		// -------------------------------------------------------------------------
		// LANGKAH 2: Pegawai login dengan status must_change_pin: true (Login Perdana)
		// -------------------------------------------------------------------------
		const mockFirstTimeSession: AuthSession = {
			token: "first-login-sanctum-token-999",
			must_change_pin: true,
			employee: {
				id: "emp-inalum-lifecycle-001",
				user_id: "usr-lifecycle-001",
				namecode: "MHS",
				name: "Mahesa Gya",
				email: "mahesa@inalum.id",
				role: "auditor",
				is_active: true,
				must_change_pin: true,
			},
		};

		vi.spyOn(api, "post").mockResolvedValueOnce({
			data: {
				success: true,
				data: mockFirstTimeSession,
				message: "Login berhasil",
			},
		});

		const namecodeInput = screen.getByRole("textbox", {
			name: /namecode pegawai/i,
		});
		const pinInput = screen.getByLabelText(/6-digit pin/i);
		const loginSubmitBtn = screen.getByRole("button", {
			name: /masuk ke sistem/i,
		});

		await user.type(namecodeInput, "mhs");
		await user.type(pinInput, "123456");
		await user.click(loginSubmitBtn);

		// Verifikasi: Karena must_change_pin: true, pegawai otomatis diarahkan ke /change-pin
		await waitFor(() => {
			expect(screen.getByText("Pembaruan PIN Wajib")).toBeDefined();
			expect(screen.getByText("Wajib Diganti")).toBeDefined();
		});

		// -------------------------------------------------------------------------
		// LANGKAH 3: Pegawai memperbarui PIN sementara menjadi PIN baru yang kuat
		// -------------------------------------------------------------------------
		vi.spyOn(api, "post").mockResolvedValueOnce({
			data: {
				success: true,
				message: "PIN berhasil diubah.",
			},
		});

		const currentPinInput = screen.getByLabelText(/^pin saat ini/i);
		const newPinInput = screen.getByLabelText(/^pin baru/i);
		const confirmPinInput = screen.getByLabelText(/^konfirmasi pin baru/i);
		const savePinBtn = screen.getByRole("button", {
			name: /simpan pin keamanan/i,
		});

		await user.type(currentPinInput, "123456");
		await user.type(newPinInput, "982736");
		await user.type(confirmPinInput, "982736");
		await user.click(savePinBtn);

		// Verifikasi: mustChangePin menjadi false di authStore
		await waitFor(() => {
			expect(useAuthStore.getState().mustChangePin).toBe(false);
		});

		// -------------------------------------------------------------------------
		// LANGKAH 4: Pegawai tiba di Beranda Internal ("/")
		// -------------------------------------------------------------------------
		cleanup();
		renderFullAuthApp("/");

		await waitFor(() => {
			expect(screen.getByText("INVENTORY SYSTEM")).toBeDefined();
			expect(screen.getByText(/Mahesa Gya/i)).toBeDefined();
			expect(screen.getAllByText("MHS").length).toBeGreaterThanOrEqual(1);
			expect(screen.getAllByText("Online").length).toBeGreaterThanOrEqual(1);
		});

		// -------------------------------------------------------------------------
		// LANGKAH 5: Simulasi Transaksi Offline dan Interceptor HTTP 401 Sesi Kedaluwarsa
		// -------------------------------------------------------------------------
		// Simulasikan pegawai melakukan pengambilan barang saat offline
		await db.outbox.put({
			clientUuid: "offline-tx-important-001",
			employeeId: "emp-inalum-lifecycle-001",
			operation: "take",
			itemId: "item-kertas-a4",
			quantity: 3,
			occurredAt: new Date().toISOString(),
			status: "pending",
			attempts: 0,
			createdAt: new Date().toISOString(),
		});

		let eventFired = false;
		const authExpiredListener = () => {
			eventFired = true;
		};
		window.addEventListener(AUTH_EXPIRED_EVENT, authExpiredListener);

		// Akses response interceptor 401 dari api.ts
		const responseInterceptor = (
			api.interceptors.response as unknown as {
				handlers: Array<{ rejected: (error: unknown) => Promise<never> }>;
			}
		).handlers[0];

		const mock401SessionError = {
			config: { url: "/api/v1/catalog/items" },
			response: {
				status: 401,
				data: { message: "Unauthenticated." },
			},
		};

		await expect(
			responseInterceptor.rejected(mock401SessionError),
		).rejects.toEqual(mock401SessionError);

		// Verifikasi: Status sesi beralih ke 'expired', event global terpancar
		expect(useAuthStore.getState().status).toBe("expired");
		expect(eventFired).toBe(true);

		// PENTING: Antrean transaksi offline di IndexedDB TETAP UTUH dan TIDAK HILANG!
		const outboxItems = await db.outbox.toArray();
		expect(outboxItems.length).toBe(1);
		expect(outboxItems[0].clientUuid).toBe("offline-tx-important-001");
		expect(outboxItems[0].status).toBe("pending");

		window.removeEventListener(AUTH_EXPIRED_EVENT, authExpiredListener);

		// -------------------------------------------------------------------------
		// LANGKAH 6: Pegawai Login Kembali & Mencoba Logout dengan Peringatan Antrean
		// -------------------------------------------------------------------------
		// Kembalikan status authenticated dengan PIN yang sudah valid
		useAuthStore.getState().setSession({
			...mockFirstTimeSession,
			must_change_pin: false,
			employee: {
				...mockFirstTimeSession.employee,
				must_change_pin: false,
			},
		});

		cleanup();
		renderFullAuthApp("/");

		const logoutBtn = screen.getByRole("button", { name: /keluar/i });
		await user.click(logoutBtn);

		// Verifikasi: Dialog peringatan antrean offline muncul karena ada 1 item pending
		await waitFor(() => {
			expect(screen.getByText("Transaksi Belum Tersinkronisasi")).toBeDefined();
			expect(screen.getByText("1 Antrean")).toBeDefined();
		});

		// Pegawai memilih "Tetap Keluar"
		vi.spyOn(api, "post").mockResolvedValueOnce({
			data: { success: true, message: "OK" },
		});

		const confirmLogoutBtn = screen.getByRole("button", {
			name: /tetap keluar/i,
		});
		await user.click(confirmLogoutBtn);

		// Verifikasi: Sesi dibersihkan, tetapi transaksi di IndexedDB TETAP UTUH
		await waitFor(() => {
			expect(useAuthStore.getState().token).toBeNull();
			expect(useAuthStore.getState().status).toBe("unauthenticated");
		});

		const remainingOutbox = await db.outbox.toArray();
		expect(remainingOutbox.length).toBe(1);
		expect(remainingOutbox[0].clientUuid).toBe("offline-tx-important-001");
	});
});
