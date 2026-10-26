import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { useAuthStore } from "./store/authStore";

describe("ProtectedRoute Guard (Task P1.5) Unit Tests", () => {
	beforeEach(() => {
		localStorage.clear();
		useAuthStore.setState({
			token: null,
			employee: null,
			mustChangePin: false,
			status: "unauthenticated",
		});
	});

	it("redirects unauthenticated user to /login", () => {
		render(
			<MemoryRouter initialEntries={["/dashboard"]}>
				<Routes>
					<Route element={<ProtectedRoute />}>
						<Route path="/dashboard" element={<div>Protected Dashboard</div>} />
					</Route>
					<Route path="/login" element={<div>Login Page Target</div>} />
				</Routes>
			</MemoryRouter>,
		);

		expect(screen.getByText("Login Page Target")).toBeDefined();
		expect(screen.queryByText("Protected Dashboard")).toBeNull();
	});

	it("redirects expired session to /login with sessionExpired flag", () => {
		useAuthStore.setState({
			token: null,
			status: "expired",
			mustChangePin: false,
		});

		render(
			<MemoryRouter initialEntries={["/dashboard"]}>
				<Routes>
					<Route element={<ProtectedRoute />}>
						<Route path="/dashboard" element={<div>Protected Dashboard</div>} />
					</Route>
					<Route path="/login" element={<div>Login Page Target</div>} />
				</Routes>
			</MemoryRouter>,
		);

		expect(screen.getByText("Login Page Target")).toBeDefined();
	});

	it("redirects user with mustChangePin flag to /change-pin", () => {
		useAuthStore.setState({
			token: "valid-sanctum-token",
			employee: {
				id: "emp-1",
				user_id: "usr-1",
				namecode: "MHS",
				name: "Mahesa Gya",
				email: "m@inalum.id",
				is_active: true,
				must_change_pin: true,
			},
			mustChangePin: true,
			status: "authenticated",
		});

		render(
			<MemoryRouter initialEntries={["/dashboard"]}>
				<Routes>
					<Route element={<ProtectedRoute />}>
						<Route path="/dashboard" element={<div>Protected Dashboard</div>} />
					</Route>
					<Route path="/change-pin" element={<div>Change PIN Barrier</div>} />
					<Route path="/login" element={<div>Login Page Target</div>} />
				</Routes>
			</MemoryRouter>,
		);

		expect(screen.getByText("Change PIN Barrier")).toBeDefined();
		expect(screen.queryByText("Protected Dashboard")).toBeNull();
	});

	it("renders protected content when user is fully authenticated and pin is set", () => {
		useAuthStore.setState({
			token: "valid-sanctum-token",
			employee: {
				id: "emp-1",
				user_id: "usr-1",
				namecode: "MHS",
				name: "Mahesa Gya",
				email: "m@inalum.id",
				is_active: true,
				must_change_pin: false,
			},
			mustChangePin: false,
			status: "authenticated",
		});

		render(
			<MemoryRouter initialEntries={["/dashboard"]}>
				<Routes>
					<Route element={<ProtectedRoute />}>
						<Route path="/dashboard" element={<div>Protected Dashboard</div>} />
					</Route>
					<Route path="/login" element={<div>Login Page Target</div>} />
					<Route path="/change-pin" element={<div>Change PIN Barrier</div>} />
				</Routes>
			</MemoryRouter>,
		);

		expect(screen.getByText("Protected Dashboard")).toBeDefined();
		expect(screen.queryByText("Login Page Target")).toBeNull();
		expect(screen.queryByText("Change PIN Barrier")).toBeNull();
	});
});
