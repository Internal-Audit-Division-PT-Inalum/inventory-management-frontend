import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import App from "@/App";
import { AppProviders } from "@/app/AppProviders";
import { useAuthStore } from "@/features/auth/store/authStore";

describe("App Root Component Smoke Test", () => {
	beforeEach(() => {
		localStorage.clear();
		useAuthStore.setState({
			token: "mock-valid-token-123",
			employee: {
				id: "emp-smoke-001",
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
	});

	it("renders the inventory system header with Inalum brand", () => {
		render(
			<AppProviders>
				<App />
			</AppProviders>,
		);
		expect(screen.getByText("INVENTORY SYSTEM")).toBeDefined();
		expect(screen.getByText("Internal Audit PT INALUM")).toBeDefined();
		expect(screen.getAllByText("Online").length).toBeGreaterThanOrEqual(1);
	});

	it("renders the monitoring dashboard overview on home page", async () => {
		render(
			<AppProviders>
				<App />
			</AppProviders>,
		);
		await waitFor(() => {
			expect(screen.getByText("Total Barang")).toBeDefined();
		});
		expect(screen.getByText("Peringatan Stok Kritis")).toBeDefined();
	});

	it("redirects unauthenticated users to login page", () => {
		useAuthStore.setState({
			token: null,
			employee: null,
			status: "unauthenticated",
			mustChangePin: false,
		});

		render(
			<AppProviders>
				<App />
			</AppProviders>,
		);

		expect(screen.getByText("Masuk Pegawai")).toBeDefined();
		expect(screen.getByText("Divisi Internal Audit")).toBeDefined();
	});
});
