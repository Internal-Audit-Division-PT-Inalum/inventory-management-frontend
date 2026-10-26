import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BrowserRouter, MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import { ChangePinPage } from "@/pages/ChangePinPage";
import { postChangePin } from "./api/postChangePin";
import { ChangePinForm } from "./components/ChangePinForm";
import {
	EnsurePinChangedGuard,
	MustChangePinRoute,
} from "./components/MustChangePinRoute";
import { useAuthStore } from "./store/authStore";
import { isWeakPin } from "./types";

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

describe("Change PIN Feature (Task P1.4) Tests", () => {
	beforeEach(() => {
		localStorage.clear();
		useAuthStore.setState({
			token: "active-auth-token-123",
			employee: {
				id: "emp-001",
				user_id: "usr-001",
				namecode: "MHS",
				name: "Mahesa Gya",
				email: "mahesa@inalum.id",
				role: "auditor",
				is_active: true,
				must_change_pin: true,
			},
			mustChangePin: true,
			status: "authenticated",
		});
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("isWeakPin Utility", () => {
		it("identifies repeating and common sequential PINs as weak", () => {
			expect(isWeakPin("000000")).toBe(true);
			expect(isWeakPin("111111")).toBe(true);
			expect(isWeakPin("999999")).toBe(true);
			expect(isWeakPin("123456")).toBe(true);
			expect(isWeakPin("654321")).toBe(true);
			expect(isWeakPin("123123")).toBe(true);

			// Strong PINs
			expect(isWeakPin("982736")).toBe(false);
			expect(isWeakPin("481902")).toBe(false);
		});
	});

	describe("postChangePin API Client", () => {
		it("sends sanitized payload and returns success response", async () => {
			const postSpy = vi.spyOn(api, "post").mockResolvedValueOnce({
				data: {
					success: true,
					message: "PIN berhasil diubah.",
				},
			});

			const result = await postChangePin({
				current_pin: " 123456 ",
				new_pin: " 982736 ",
				new_pin_confirmation: " 982736 ",
			});

			expect(postSpy).toHaveBeenCalledWith("/auth/pin/change", {
				current_pin: "123456",
				new_pin: "982736",
				new_pin_confirmation: "982736",
			});
			expect(result.success).toBe(true);
		});
	});

	describe("ChangePinForm Component", () => {
		it("renders current, new, and confirm PIN fields", () => {
			renderWithProviders(<ChangePinForm />);

			expect(screen.getByLabelText(/^pin saat ini/i)).toBeDefined();
			expect(screen.getByLabelText(/^pin baru/i)).toBeDefined();
			expect(screen.getByLabelText(/^konfirmasi pin baru/i)).toBeDefined();
			expect(
				screen.getByRole("button", { name: /simpan pin keamanan/i }),
			).toBeDefined();
		});

		it("shows validation error on empty submit", async () => {
			renderWithProviders(<ChangePinForm />);

			fireEvent.click(
				screen.getByRole("button", { name: /simpan pin keamanan/i }),
			);

			await waitFor(() => {
				expect(screen.getByText("PIN saat ini wajib diisi.")).toBeDefined();
				expect(screen.getByText("PIN baru wajib diisi.")).toBeDefined();
			});
		});

		it("rejects when new PIN equals current PIN", async () => {
			const user = userEvent.setup();
			renderWithProviders(<ChangePinForm />);

			await user.type(screen.getByLabelText(/^pin saat ini/i), "123456");
			await user.type(screen.getByLabelText(/^pin baru/i), "123456");
			await user.type(screen.getByLabelText(/^konfirmasi pin baru/i), "123456");
			await user.click(
				screen.getByRole("button", { name: /simpan pin keamanan/i }),
			);

			await waitFor(() => {
				expect(
					screen.getByText("PIN baru tidak boleh sama dengan PIN saat ini."),
				).toBeDefined();
			});
		});

		it("rejects weak PIN combinations", async () => {
			const user = userEvent.setup();
			renderWithProviders(<ChangePinForm />);

			await user.type(screen.getByLabelText(/^pin saat ini/i), "837492");
			await user.type(screen.getByLabelText(/^pin baru/i), "111111"); // Weak
			await user.type(screen.getByLabelText(/^konfirmasi pin baru/i), "111111");
			await user.click(
				screen.getByRole("button", { name: /simpan pin keamanan/i }),
			);

			await waitFor(() => {
				expect(
					screen.getByText(
						"PIN terlalu mudah ditebak. Hindari kombinasi berulang atau berurutan.",
					),
				).toBeDefined();
			});
		});

		it("rejects when new PIN confirmation does not match", async () => {
			const user = userEvent.setup();
			renderWithProviders(<ChangePinForm />);

			await user.type(screen.getByLabelText(/^pin saat ini/i), "123456");
			await user.type(screen.getByLabelText(/^pin baru/i), "982736");
			await user.type(screen.getByLabelText(/^konfirmasi pin baru/i), "982737"); // mismatch
			await user.click(
				screen.getByRole("button", { name: /simpan pin keamanan/i }),
			);

			await waitFor(() => {
				expect(
					screen.getByText("Konfirmasi PIN baru tidak cocok."),
				).toBeDefined();
			});
		});

		it("submits successfully and clears mustChangePin state in authStore", async () => {
			const user = userEvent.setup();
			const onSuccessSpy = vi.fn();

			vi.spyOn(api, "post").mockResolvedValueOnce({
				data: {
					success: true,
					message: "PIN berhasil diubah.",
				},
			});

			renderWithProviders(<ChangePinForm onSuccess={onSuccessSpy} />);

			await user.type(screen.getByLabelText(/^pin saat ini/i), "123456");
			await user.type(screen.getByLabelText(/^pin baru/i), "982736");
			await user.type(screen.getByLabelText(/^konfirmasi pin baru/i), "982736");
			await user.click(
				screen.getByRole("button", { name: /simpan pin keamanan/i }),
			);

			await waitFor(() => {
				expect(onSuccessSpy).toHaveBeenCalled();
				// State mustChangePin terupdate menjadi false
				expect(useAuthStore.getState().mustChangePin).toBe(false);
			});
		});

		it("displays server validation error on mismatched current PIN", async () => {
			const user = userEvent.setup();

			vi.spyOn(api, "post").mockRejectedValueOnce({
				isAxiosError: true,
				response: {
					status: 422,
					data: {
						success: false,
						message: "Validasi input gagal.",
						errors: {
							current_pin: ["PIN saat ini tidak cocok."],
						},
					},
				},
			});

			renderWithProviders(<ChangePinForm />);

			await user.type(screen.getByLabelText(/^pin saat ini/i), "000000");
			await user.type(screen.getByLabelText(/^pin baru/i), "982736");
			await user.type(screen.getByLabelText(/^konfirmasi pin baru/i), "982736");
			await user.click(
				screen.getByRole("button", { name: /simpan pin keamanan/i }),
			);

			await waitFor(() => {
				expect(screen.getByText("PIN saat ini tidak cocok.")).toBeDefined();
			});
		});
	});

	describe("MustChangePinRoute and Guards", () => {
		it("redirects unauthenticated users to /login", () => {
			useAuthStore.setState({
				token: null,
				status: "unauthenticated",
			});

			render(
				<MemoryRouter initialEntries={["/change-pin"]}>
					<Routes>
						<Route element={<MustChangePinRoute />}>
							<Route
								path="/change-pin"
								element={<div>Change PIN Screen</div>}
							/>
						</Route>
						<Route path="/login" element={<div>Login Screen</div>} />
					</Routes>
				</MemoryRouter>,
			);

			expect(screen.getByText("Login Screen")).toBeDefined();
		});

		it("allows authenticated users to view /change-pin", () => {
			render(
				<MemoryRouter initialEntries={["/change-pin"]}>
					<Routes>
						<Route element={<MustChangePinRoute />}>
							<Route
								path="/change-pin"
								element={<div>Change PIN Screen</div>}
							/>
						</Route>
						<Route path="/login" element={<div>Login Screen</div>} />
					</Routes>
				</MemoryRouter>,
			);

			expect(screen.getByText("Change PIN Screen")).toBeDefined();
		});

		it("EnsurePinChangedGuard redirects users to /change-pin if mustChangePin is true", () => {
			useAuthStore.setState({
				mustChangePin: true,
				status: "authenticated",
			});

			render(
				<MemoryRouter initialEntries={["/dashboard"]}>
					<Routes>
						<Route element={<EnsurePinChangedGuard />}>
							<Route path="/dashboard" element={<div>Dashboard Screen</div>} />
						</Route>
						<Route path="/change-pin" element={<div>Change PIN Barrier</div>} />
					</Routes>
				</MemoryRouter>,
			);

			expect(screen.getByText("Change PIN Barrier")).toBeDefined();
		});
	});

	describe("ChangePinPage Component", () => {
		it("renders mandatory PIN change notice when mustChangePin is true", () => {
			const queryClient = new QueryClient();

			render(
				<QueryClientProvider client={queryClient}>
					<MemoryRouter initialEntries={["/change-pin"]}>
						<ChangePinPage />
					</MemoryRouter>
				</QueryClientProvider>,
			);

			expect(screen.getByText("Pembaruan PIN Wajib")).toBeDefined();
			expect(screen.getByText("Wajib Diganti")).toBeDefined();
			expect(screen.getByText(/Mahesa Gya \(MHS\)/)).toBeDefined();
			expect(screen.getByText(/Ketentuan PIN Aman:/)).toBeDefined();
		});
	});
});
