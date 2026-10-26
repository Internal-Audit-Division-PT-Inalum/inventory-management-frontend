import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BrowserRouter, MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import { LoginPage } from "@/pages/LoginPage";
import type { AuthSession } from "@/types/api";
import { postLogin } from "./api/postLogin";
import { LoginForm } from "./components/LoginForm";
import { useAuthStore } from "./store/authStore";

const mockSuccessSession: AuthSession = {
	token: "test-token-sanctum-abc",
	must_change_pin: false,
	employee: {
		id: "emp-001",
		user_id: "usr-001",
		namecode: "MHS",
		name: "Mahesa Gya",
		email: "mahesa@inalum.id",
		role: "auditor",
		is_active: true,
		must_change_pin: false,
	},
};

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

describe("Auth Login Feature (Task P1.3) Tests", () => {
	beforeEach(() => {
		localStorage.clear();
		useAuthStore.setState({
			token: null,
			employee: null,
			mustChangePin: false,
			status: "unauthenticated",
		});
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("postLogin API Client", () => {
		it("sends sanitized payload and returns auth session", async () => {
			const postSpy = vi.spyOn(api, "post").mockResolvedValueOnce({
				data: {
					success: true,
					data: mockSuccessSession,
					message: "Login berhasil",
				},
			});

			const result = await postLogin({
				namecode: "  mhs  ",
				pin: " 123456 ",
			});

			expect(postSpy).toHaveBeenCalledWith("/auth/login", {
				namecode: "MHS",
				pin: "123456",
			});
			expect(result).toEqual(mockSuccessSession);
		});
	});

	describe("LoginForm Component", () => {
		it("renders namecode input, pin input, and submit button", () => {
			renderWithProviders(<LoginForm />);

			expect(
				screen.getByRole("textbox", { name: /namecode pegawai/i }),
			).toBeDefined();
			expect(screen.getByLabelText(/6-digit pin/i)).toBeDefined();
			expect(
				screen.getByRole("button", { name: /masuk ke sistem/i }),
			).toBeDefined();
		});

		it("shows validation error on empty fields submit", async () => {
			renderWithProviders(<LoginForm />);

			const submitButton = screen.getByRole("button", {
				name: /masuk ke sistem/i,
			});
			fireEvent.click(submitButton);

			await waitFor(() => {
				expect(screen.getByText("Namecode wajib diisi.")).toBeDefined();
				expect(screen.getByText("PIN wajib diisi.")).toBeDefined();
			});
		});

		it("validates that PIN must be 6 numeric digits", async () => {
			const user = userEvent.setup();
			renderWithProviders(<LoginForm />);

			const namecodeInput = screen.getByRole("textbox", {
				name: /namecode pegawai/i,
			});
			const pinInput = screen.getByLabelText(/6-digit pin/i);
			const submitButton = screen.getByRole("button", {
				name: /masuk ke sistem/i,
			});

			await user.type(namecodeInput, "MHS");
			await user.type(pinInput, "12345"); // 5 digits
			await user.click(submitButton);

			await waitFor(() => {
				expect(
					screen.getByText("PIN harus tepat 6 digit angka."),
				).toBeDefined();
			});
		});

		it("toggles PIN visibility between password and text", async () => {
			const user = userEvent.setup();
			renderWithProviders(<LoginForm />);

			const pinInput = screen.getByLabelText(/6-digit pin/i);
			const toggleButton = screen.getByRole("button", {
				name: /tampilkan pin/i,
			});

			expect(pinInput.getAttribute("type")).toBe("password");

			await user.click(toggleButton);
			expect(pinInput.getAttribute("type")).toBe("text");
			expect(
				screen.getByRole("button", { name: /sembunyikan pin/i }),
			).toBeDefined();

			await user.click(
				screen.getByRole("button", { name: /sembunyikan pin/i }),
			);
			expect(pinInput.getAttribute("type")).toBe("password");
		});

		it("submits valid credentials and triggers onSuccess callback", async () => {
			const user = userEvent.setup();
			const onSuccessSpy = vi.fn();

			vi.spyOn(api, "post").mockResolvedValueOnce({
				data: {
					success: true,
					data: mockSuccessSession,
					message: "Login berhasil",
				},
			});

			renderWithProviders(<LoginForm onSuccess={onSuccessSpy} />);

			const namecodeInput = screen.getByRole("textbox", {
				name: /namecode pegawai/i,
			});
			const pinInput = screen.getByLabelText(/6-digit pin/i);
			const submitButton = screen.getByRole("button", {
				name: /masuk ke sistem/i,
			});

			await user.type(namecodeInput, "mhs");
			await user.type(pinInput, "123456");
			await user.click(submitButton);

			await waitFor(() => {
				expect(onSuccessSpy).toHaveBeenCalledWith(mockSuccessSession);
				expect(useAuthStore.getState().status).toBe("authenticated");
				expect(useAuthStore.getState().token).toBe("test-token-sanctum-abc");
			});
		});

		it("displays generic error banner on invalid credentials (422)", async () => {
			const user = userEvent.setup();

			vi.spyOn(api, "post").mockRejectedValueOnce({
				isAxiosError: true,
				response: {
					status: 422,
					data: {
						success: false,
						message: "Namecode atau PIN salah.",
					},
				},
			});

			renderWithProviders(<LoginForm />);

			await user.type(
				screen.getByRole("textbox", { name: /namecode pegawai/i }),
				"XYZ",
			);
			await user.type(screen.getByLabelText(/6-digit pin/i), "999999");
			await user.click(
				screen.getByRole("button", { name: /masuk ke sistem/i }),
			);

			await waitFor(() => {
				expect(screen.getByRole("alert")).toBeDefined();
				expect(screen.getByText("Gagal Masuk")).toBeDefined();
				expect(screen.getByText("Namecode atau PIN salah.")).toBeDefined();
			});
		});

		it("displays lockout error banner when rate limit or lockout is triggered", async () => {
			const user = userEvent.setup();

			vi.spyOn(api, "post").mockRejectedValueOnce({
				isAxiosError: true,
				response: {
					status: 429,
					data: {
						success: false,
						message: "Akun terkunci sementara. Silakan coba lagi nanti.",
						meta: { code: "ACCOUNT_LOCKED" },
					},
				},
			});

			renderWithProviders(<LoginForm />);

			await user.type(
				screen.getByRole("textbox", { name: /namecode pegawai/i }),
				"XYZ",
			);
			await user.type(screen.getByLabelText(/6-digit pin/i), "999999");
			await user.click(
				screen.getByRole("button", { name: /masuk ke sistem/i }),
			);

			await waitFor(() => {
				expect(screen.getByRole("alert")).toBeDefined();
				expect(screen.getByText("Akun Terkunci Sementara")).toBeDefined();
				expect(
					screen.getByText(/terlalu banyak percobaan PIN yang salah/i),
				).toBeDefined();
			});
		});
	});

	describe("LoginPage Component", () => {
		it("renders Inalum corporate branding, title, and division header", () => {
			const queryClient = new QueryClient();

			render(
				<QueryClientProvider client={queryClient}>
					<MemoryRouter initialEntries={["/login"]}>
						<LoginPage />
					</MemoryRouter>
				</QueryClientProvider>,
			);

			expect(screen.getByText("Divisi Internal Audit")).toBeDefined();
			expect(screen.getByText("Inventory Management")).toBeDefined();
			expect(screen.getByText("Masuk Pegawai")).toBeDefined();
			expect(screen.getByAltText("Logo PT INALUM")).toBeDefined();
		});
	});
});
