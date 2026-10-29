import axios, {
	type AxiosError,
	type AxiosInstance,
	type InternalAxiosRequestConfig,
} from "axios";
import { setServerTimeOffset } from "./time";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api/v1";

/**
 * Event nama global saat sesi kedaluwarsa (HTTP 401).
 * Didengarkan oleh sync engine untuk menjeda (pause) antrean tanpa menghapus outbox.
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

// Pluggable token getter (mendukung pembacaan in-memory dari Zustand auth store)
type TokenGetter = () => string | null;
let customTokenGetter: TokenGetter | null = null;

export function setAuthTokenGetter(getter: TokenGetter | null): void {
	customTokenGetter = getter;
}

// Callback type untuk penanganan 401 unauthenticated
type UnauthorizedHandler = () => void;
let onUnauthorizedCallback: UnauthorizedHandler | null = null;

export function setUnauthorizedHandler(
	handler: UnauthorizedHandler | null,
): void {
	onUnauthorizedCallback = handler;
}

/**
 * Mengambil token autentikasi aktif.
 * 1. Menggunakan custom token getter (misal dari memory store Zustand).
 * 2. Fallback membaca dari localStorage ("inventory_token" atau persisted Zustand store).
 */
export function getActiveAuthToken(): string | null {
	if (customTokenGetter) {
		const token = customTokenGetter();
		if (token) return token;
	}

	try {
		// 1. Direct storage fallback
		const directToken = localStorage.getItem("inventory_token");
		if (directToken) return directToken;

		// 2. Zustand persisted storage fallback
		const persistedAuth = localStorage.getItem("inventory_auth_storage");
		if (persistedAuth) {
			const parsed = JSON.parse(persistedAuth);
			if (parsed?.state?.token) {
				return parsed.state.token;
			}
		}
	} catch {
		// Ignore parsing errors on invalid local storage
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

// Request Interceptor: Inject Sanctum Bearer Token & Timestamp for RTT calculation
api.interceptors.request.use(
	(config: InternalAxiosRequestConfig) => {
		config.metadata = { requestStartTime: Date.now() };

		const token = getActiveAuthToken();
		if (token && config.headers) {
			config.headers.Authorization = `Bearer ${token}`;
		}
		return config;
	},
	(error: AxiosError) => {
		return Promise.reject(error);
	},
);

// Response Interceptor: Server Clock Skew Sync & Safe 401 Handling
api.interceptors.response.use(
	(response) => {
		// Sinkronisasi pergeseran jam server dari header HTTP Date dengan kompensasi RTT
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
		// Sinkronisasi jam server bahkan saat respons error
		if (error.response?.headers?.date) {
			setServerTimeOffset(error.response.headers.date, {
				requestStartTime: error.config?.metadata?.requestStartTime,
				responseTime: Date.now(),
			});
		}

		// Sesi kedaluwarsa (401 Unauthorized)
		if (error.response?.status === 401) {
			const requestUrl = error.config?.url || "";
			const isLoginRequest = requestUrl.includes("/auth/login");

			// Jika bukan request login itu sendiri, tandai sesi kedaluwarsa
			if (!isLoginRequest) {
				// 1. Eksekusi handler terdaftar (ubah status sesi di store jadi 'expired')
				if (onUnauthorizedCallback) {
					onUnauthorizedCallback();
				}

				// 2. Broadcast event global agar sync engine menjeda antrean
				// PENTING: Antrean di IndexedDB TIDAK DIHAPUS, hanya dijeda (pause)
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
