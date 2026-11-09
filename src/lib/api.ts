import axios, {
	type AxiosError,
	type AxiosInstance,
	type InternalAxiosRequestConfig,
} from "axios";
import { isValidSanctumToken, sanitizeAuthHeader } from "./security";
import { setServerTimeOffset } from "./time";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api/v1";

/**
 * Global event dispatched when an authenticated session expires (HTTP 401).
 * Observed by the synchronization engine to pause processing without clearing the outbox.
 */
export const AUTH_EXPIRED_EVENT = "inventory:auth-expired";

export const api: AxiosInstance = axios.create({
	baseURL: API_BASE_URL,
	timeout: 15000,
	headers: {
		Accept: "application/json",
		"Content-Type": "application/json",
	},
});

type TokenGetter = () => string | null;
let customTokenGetter: TokenGetter | null = null;

export function setAuthTokenGetter(getter: TokenGetter | null): void {
	customTokenGetter = getter;
}

type UnauthorizedHandler = () => void;
let onUnauthorizedCallback: UnauthorizedHandler | null = null;

export function setUnauthorizedHandler(
	handler: UnauthorizedHandler | null,
): void {
	onUnauthorizedCallback = handler;
}

/**
 * Retrieves the currently active authentication token:
 * 1. Checks custom in-memory token getter (e.g., Zustand store).
 * 2. Falls back to direct localStorage storage key.
 * 3. Falls back to persisted Zustand auth store payload.
 */
export function getActiveAuthToken(): string | null {
	if (customTokenGetter) {
		const token = customTokenGetter();
		if (token && isValidSanctumToken(token)) return token.trim();
	}

	try {
		const directToken = localStorage.getItem("inventory_token");
		if (directToken && isValidSanctumToken(directToken))
			return directToken.trim();

		const persistedAuth = localStorage.getItem("inventory_auth_storage");
		if (persistedAuth) {
			const parsed = JSON.parse(persistedAuth);
			const tokenCandidate = parsed?.state?.token;
			if (tokenCandidate && isValidSanctumToken(tokenCandidate)) {
				return tokenCandidate.trim();
			}
		}
	} catch {
		// Suppress parsing errors on malformed local storage
	}

	return null;
}

interface RequestMetadata {
	requestStartTime: number;
}

declare module "axios" {
	export interface InternalAxiosRequestConfig {
		metadata?: RequestMetadata;
	}
}

api.interceptors.request.use(
	(config: InternalAxiosRequestConfig) => {
		config.metadata = { requestStartTime: Date.now() };

		const token = getActiveAuthToken();
		const authHeader = sanitizeAuthHeader(token);
		if (authHeader && config.headers) {
			config.headers.Authorization = authHeader;
		}
		return config;
	},
	(error: AxiosError) => {
		return Promise.reject(error);
	},
);

api.interceptors.response.use(
	(response) => {
		const serverDate = response.headers?.date;
		if (serverDate) {
			setServerTimeOffset(serverDate, {
				requestStartTime: response.config?.metadata?.requestStartTime,
				responseTime: Date.now(),
			});
		}
		return response;
	},
	(error: AxiosError) => {
		if (error.response?.headers?.date) {
			setServerTimeOffset(error.response.headers.date, {
				requestStartTime: error.config?.metadata?.requestStartTime,
				responseTime: Date.now(),
			});
		}

		if (error.response?.status === 401) {
			const requestUrl = error.config?.url || "";
			const isLoginRequest = requestUrl.includes("/auth/login");

			if (!isLoginRequest) {
				if (onUnauthorizedCallback) {
					onUnauthorizedCallback();
				}

				if (typeof window !== "undefined") {
					window.dispatchEvent(
						new CustomEvent(AUTH_EXPIRED_EVENT, {
							detail: { timestamp: Date.now() },
						}),
					);
				}
			}
		}

		return Promise.reject(error);
	},
);
