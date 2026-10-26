import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { api, getActiveAuthToken } from "@/lib/api";
import type { AuthSession, Employee } from "@/types/api";
import {
	AUTH_STORAGE_KEY,
	selectAuthStatus,
	selectCurrentEmployee,
	selectIsAuthenticated,
	selectMustChangePin,
	useAuthStore,
} from "./authStore";

const mockEmployee: Employee = {
	id: "emp-inalum-001",
	user_id: "usr-001",
	namecode: "MHS",
	name: "Mahesa Gya",
	email: "mahesa@inalum.id",
	role: "auditor",
	is_active: true,
	must_change_pin: false,
};

const mockSession: AuthSession = {
	token: "sanctum-mock-token-xyz-123",
	must_change_pin: false,
	employee: mockEmployee,
};

describe("Zustand Auth Store (authStore) Unit Tests", () => {
	beforeEach(() => {
		localStorage.clear();
		useAuthStore.setState({
			token: null,
			employee: null,
			mustChangePin: false,
			status: "unauthenticated",
		});
	});

	afterEach(() => {
		localStorage.clear();
	});

	it("initializes with unauthenticated or idle state", () => {
		const state = useAuthStore.getState();
		expect(state.token).toBeNull();
		expect(state.employee).toBeNull();
		expect(selectIsAuthenticated(state)).toBe(false);
	});

	it("sets session properly on successful login", () => {
		useAuthStore.getState().setSession(mockSession);

		const state = useAuthStore.getState();
		expect(state.token).toBe("sanctum-mock-token-xyz-123");
		expect(state.employee?.namecode).toBe("MHS");
		expect(state.mustChangePin).toBe(false);
		expect(state.status).toBe("authenticated");
		expect(selectIsAuthenticated(state)).toBe(true);
		expect(selectCurrentEmployee(state)?.email).toBe("mahesa@inalum.id");

		// Verifikasi active token resolver otomatis membaca token dari memory authStore
		expect(getActiveAuthToken()).toBe("sanctum-mock-token-xyz-123");
		expect(localStorage.getItem("inventory_token")).toBe(
			"sanctum-mock-token-xyz-123",
		);
	});

	it("handles must_change_pin flag when user must change PIN", () => {
		const sessionWithMustChangePin: AuthSession = {
			...mockSession,
			must_change_pin: true,
			employee: {
				...mockEmployee,
				must_change_pin: true,
			},
		};

		useAuthStore.getState().setSession(sessionWithMustChangePin);
		expect(useAuthStore.getState().mustChangePin).toBe(true);
		expect(selectMustChangePin(useAuthStore.getState())).toBe(true);

		// After user changes PIN successfully
		useAuthStore.getState().setMustChangePin(false);
		expect(useAuthStore.getState().mustChangePin).toBe(false);
		expect(useAuthStore.getState().employee?.must_change_pin).toBe(false);
		expect(selectMustChangePin(useAuthStore.getState())).toBe(false);
	});

	it("updates employee profile partially", () => {
		useAuthStore.getState().setSession(mockSession);
		useAuthStore.getState().updateEmployee({ name: "Mahesa Gya Pratama" });

		expect(useAuthStore.getState().employee?.name).toBe("Mahesa Gya Pratama");
		expect(useAuthStore.getState().employee?.namecode).toBe("MHS");
	});

	it("transitions to expired status on session expiration", () => {
		useAuthStore.getState().setSession(mockSession);
		expect(useAuthStore.getState().status).toBe("authenticated");

		useAuthStore.getState().expireSession();

		const state = useAuthStore.getState();
		expect(state.status).toBe("expired");
		expect(state.token).toBeNull();
		// Employee tetap dipertahankan untuk UX login cepat
		expect(state.employee?.namecode).toBe("MHS");
		expect(selectIsAuthenticated(state)).toBe(false);
		expect(selectAuthStatus(state)).toBe("expired");
		expect(localStorage.getItem("inventory_token")).toBeNull();
	});

	it("clears everything on logout", () => {
		useAuthStore.getState().setSession(mockSession);
		useAuthStore.getState().logout();

		const state = useAuthStore.getState();
		expect(state.token).toBeNull();
		expect(state.employee).toBeNull();
		expect(state.mustChangePin).toBe(false);
		expect(state.status).toBe("unauthenticated");
		expect(selectIsAuthenticated(state)).toBe(false);
		expect(localStorage.getItem("inventory_token")).toBeNull();
	});

	it("transitions to expired when Axios interceptor receives 401 on protected route", async () => {
		useAuthStore.getState().setSession(mockSession);
		expect(useAuthStore.getState().status).toBe("authenticated");

		const responseInterceptor = (
			api.interceptors.response as unknown as {
				handlers: Array<{ rejected: (error: unknown) => Promise<never> }>;
			}
		).handlers[0];

		const mock401Error = {
			config: { url: "/api/v1/loans/mine" },
			response: {
				status: 401,
				data: { message: "Unauthenticated." },
			},
		};

		await expect(responseInterceptor.rejected(mock401Error)).rejects.toEqual(
			mock401Error,
		);

		// Verifikasi status authStore otomatis terupdate menjadi 'expired' via registered callback
		expect(useAuthStore.getState().status).toBe("expired");
		expect(useAuthStore.getState().token).toBeNull();
	});

	it("persists and rehydrates properly from localStorage", () => {
		useAuthStore.getState().setSession(mockSession);

		const rawPersisted = localStorage.getItem(AUTH_STORAGE_KEY);
		expect(rawPersisted).toBeDefined();

		const parsed = JSON.parse(rawPersisted as string);
		expect(parsed.state.token).toBe("sanctum-mock-token-xyz-123");
		expect(parsed.state.employee.namecode).toBe("MHS");
	});
});
