import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { syncPauseController } from "@/features/sync/lib/syncPauseController";
import { setAuthTokenGetter, setUnauthorizedHandler } from "@/lib/api";
import { clearSensitiveStorage, isValidSanctumToken } from "@/lib/security";
import type { AuthSession, Employee } from "@/types/api";

export type AuthStatus =
	| "idle"
	| "authenticated"
	| "expired"
	| "unauthenticated";

export interface AuthState {
	token: string | null;
	employee: Employee | null;
	mustChangePin: boolean;
	status: AuthStatus;

	setSession: (session: AuthSession) => void;
	setMustChangePin: (mustChange: boolean) => void;
	updateEmployee: (employee: Partial<Employee>) => void;
	expireSession: () => void;
	logout: () => void;
}

export const AUTH_STORAGE_KEY = "inventory_auth_storage";

export const useAuthStore = create<AuthState>()(
	persist(
		(set) => ({
			token: null,
			employee: null,
			mustChangePin: false,
			status: "idle",

			setSession: (session: AuthSession) => {
				const validToken = isValidSanctumToken(session.token)
					? session.token.trim()
					: null;

				set({
					token: validToken,
					employee: session.employee,
					mustChangePin:
						session.must_change_pin ??
						session.employee.must_change_pin ??
						false,
					status: validToken ? "authenticated" : "unauthenticated",
				});
				if (validToken) {
					syncPauseController.resume();
					try {
						localStorage.setItem("inventory_token", validToken);
					} catch {
						// Suppress storage access errors
					}
				}
			},

			setMustChangePin: (mustChange: boolean) => {
				set((state) => ({
					mustChangePin: mustChange,
					employee: state.employee
						? { ...state.employee, must_change_pin: mustChange }
						: null,
				}));
			},

			updateEmployee: (employeePartial: Partial<Employee>) => {
				set((state) => ({
					employee: state.employee
						? { ...state.employee, ...employeePartial }
						: null,
				}));
			},

			expireSession: () => {
				set({
					token: null,
					status: "expired",
				});
				syncPauseController.pause("Sesi autentikasi telah kedaluwarsa.");
				try {
					localStorage.removeItem("inventory_token");
				} catch {
					// Suppress storage removal errors
				}
			},

			logout: () => {
				set({
					token: null,
					employee: null,
					mustChangePin: false,
					status: "unauthenticated",
				});
				clearSensitiveStorage();
			},
		}),
		{
			name: AUTH_STORAGE_KEY,
			storage: createJSONStorage(() => localStorage),
			partialize: (state) => ({
				token: state.token,
				employee: state.employee,
				mustChangePin: state.mustChangePin,
				status: state.token ? state.status : "unauthenticated",
			}),
			onRehydrateStorage: () => (state) => {
				if (state) {
					if (state.token && state.employee) {
						state.status =
							state.status === "expired" ? "expired" : "authenticated";
					} else {
						state.status = "unauthenticated";
						state.token = null;
					}
				}
			},
		},
	),
);

setAuthTokenGetter(() => useAuthStore.getState().token);
setUnauthorizedHandler(() => {
	useAuthStore.getState().expireSession();
});

export const selectIsAuthenticated = (state: AuthState): boolean =>
	state.status === "authenticated" && Boolean(state.token);

export const selectMustChangePin = (state: AuthState): boolean =>
	state.mustChangePin || Boolean(state.employee?.must_change_pin);

export const selectCurrentEmployee = (state: AuthState): Employee | null =>
	state.employee;

export const selectAuthStatus = (state: AuthState): AuthStatus => state.status;
