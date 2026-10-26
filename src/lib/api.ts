import axios, {
	type AxiosError,
	type AxiosInstance,
	type InternalAxiosRequestConfig,
} from "axios";
import { setServerTimeOffset } from "./time";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api/v1";

export const api: AxiosInstance = axios.create({
	baseURL: API_BASE_URL,
	timeout: 15000,
	headers: {
		Accept: "application/json",
		"Content-Type": "application/json",
	},
});

// Listener type for 401 unauthenticated session expiry
type UnauthorizedHandler = () => void;
let onUnauthorizedCallback: UnauthorizedHandler | null = null;

export function setUnauthorizedHandler(handler: UnauthorizedHandler): void {
	onUnauthorizedCallback = handler;
}

// Request Interceptor: Inject Sanctum Bearer Token
api.interceptors.request.use(
	(config: InternalAxiosRequestConfig) => {
		const token = localStorage.getItem("inventory_token");
		if (token && config.headers) {
			config.headers.Authorization = `Bearer ${token}`;
		}
		return config;
	},
	(error: AxiosError) => {
		return Promise.reject(error);
	},
);

// Response Interceptor: Server Clock Skew Sync & 401 Handling
api.interceptors.response.use(
	(response) => {
		// Sinkronisasi pergeseran jam server dari header HTTP Date
		const serverDate = response.headers.date;
		if (serverDate) {
			setServerTimeOffset(serverDate);
		}
		return response;
	},
	(error: AxiosError) => {
		// Sinkronisasi jam server bahkan saat respons error
		if (error.response?.headers?.date) {
			setServerTimeOffset(error.response.headers.date);
		}

		// Sesi kedaluwarsa (401)
		if (error.response?.status === 401) {
			if (onUnauthorizedCallback) {
				onUnauthorizedCallback();
			}
		}

		return Promise.reject(error);
	},
);
