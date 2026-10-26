import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	AUTH_EXPIRED_EVENT,
	api,
	getActiveAuthToken,
	setAuthTokenGetter,
	setUnauthorizedHandler,
} from "./api";
import { db } from "./db";
import { mapApiError } from "./errors";
import { formatRelative, formatWib, setServerTimeOffset } from "./time";

describe("Lib Utilities Unit Tests", () => {
	beforeEach(() => {
		localStorage.clear();
		setAuthTokenGetter(null);
		setUnauthorizedHandler(null);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("corrects time and formats dates in WIB accurately", () => {
		// Test WIB formatting
		const testDate = new Date("2026-10-23T10:00:00Z");
		const formatted = formatWib(testDate);
		expect(formatted).toBeDefined();
		expect(typeof formatted).toBe("string");

		// Test relative time
		const justNow = new Date();
		expect(formatRelative(justNow)).toBe("Baru saja");

		// Test server time offset
		const serverDate = new Date(Date.now() + 5000).toUTCString();
		setServerTimeOffset(serverDate);
	});

	it("maps network and business error responses accurately", () => {
		// Network error
		const networkErr = new Error("Network Error");
		const mappedNetwork = mapApiError(networkErr);
		expect(mappedNetwork.kind).toBe("retry");

		// Mock Axios 422 Insufficient Stock
		const mockAxiosStockError = {
			isAxiosError: true,
			response: {
				status: 422,
				data: {
					success: false,
					message: "Stok Kertas A4 tidak mencukupi",
					meta: { code: "INSUFFICIENT_STOCK" },
				},
			},
		};
		const mappedStock = mapApiError(mockAxiosStockError);
		expect(mappedStock.kind).toBe("rejected");
		expect(mappedStock.code).toBe("INSUFFICIENT_STOCK");
		expect(mappedStock.message).toBe("Stok Kertas A4 tidak mencukupi");

		// Mock Axios 401 Unauthenticated
		const mockAxios401 = {
			isAxiosError: true,
			response: {
				status: 401,
				data: {
					success: false,
					message: "Unauthenticated.",
					meta: { code: "UNAUTHENTICATED" },
				},
			},
		};
		const mapped401 = mapApiError(mockAxios401);
		expect(mapped401.kind).toBe("auth");
		expect(mapped401.status).toBe(401);
	});

	it("initializes Dexie database with expected tables", () => {
		expect(db.name).toBe("inventory_iia_pwa");
		expect(db.locations).toBeDefined();
		expect(db.items).toBeDefined();
		expect(db.meta).toBeDefined();
		expect(db.outbox).toBeDefined();
	});

	// P1.1 Tests: Bearer token resolution & safe 401 handling
	it("resolves active auth token from custom getter and fallbacks", () => {
		// Case 1: No token
		expect(getActiveAuthToken()).toBeNull();

		// Case 2: Direct localStorage
		localStorage.setItem("inventory_token", "direct-test-token-123");
		expect(getActiveAuthToken()).toBe("direct-test-token-123");

		// Case 3: Zustand storage format fallback
		localStorage.removeItem("inventory_token");
		localStorage.setItem(
			"inventory_auth_storage",
			JSON.stringify({ state: { token: "zustand-persisted-token-456" } }),
		);
		expect(getActiveAuthToken()).toBe("zustand-persisted-token-456");

		// Case 4: Memory getter has highest priority
		setAuthTokenGetter(() => "in-memory-priority-token-789");
		expect(getActiveAuthToken()).toBe("in-memory-priority-token-789");
	});

	it("intercepts request and injects Sanctum Bearer token when present", async () => {
		// Access the registered request interceptor
		const requestInterceptor = (
			api.interceptors.request as unknown as {
				handlers: Array<{
					fulfilled: (config: {
						headers: Record<string, string>;
					}) =>
						| Promise<{ headers: Record<string, string> }>
						| { headers: Record<string, string> };
				}>;
			}
		).handlers[0];

		// Case 1: No token present
		const configWithoutToken = await requestInterceptor.fulfilled({
			headers: {},
		});
		expect(configWithoutToken.headers.Authorization).toBeUndefined();

		// Case 2: Token present via getter
		setAuthTokenGetter(() => "sanctum-test-token-777");
		const configWithToken = await requestInterceptor.fulfilled({ headers: {} });
		expect(configWithToken.headers.Authorization).toBe(
			"Bearer sanctum-test-token-777",
		);
	});

	it("intercepts 401 unauthorized, triggers handler & event, and preserves outbox", async () => {
		const responseInterceptor = (
			api.interceptors.response as unknown as {
				handlers: Array<{ rejected: (error: unknown) => Promise<never> }>;
			}
		).handlers[0];

		let expiredHandled = false;
		setUnauthorizedHandler(() => {
			expiredHandled = true;
		});

		// Listen to global AUTH_EXPIRED_EVENT
		let eventFired = false;
		const listener = () => {
			eventFired = true;
		};
		window.addEventListener(AUTH_EXPIRED_EVENT, listener);

		// Seed a dummy offline transaction in Dexie outbox
		await db.outbox.put({
			clientUuid: "test-uuid-p1-safe-outbox",
			employeeId: "emp-1",
			operation: "take",
			itemId: "item-1",
			quantity: 2,
			occurredAt: new Date().toISOString(),
			status: "pending",
			attempts: 0,
			createdAt: new Date().toISOString(),
		});

		// Trigger 401 on regular API request (e.g. /api/v1/items)
		const mock401Error = {
			config: { url: "/api/v1/items" },
			response: {
				status: 401,
				headers: { date: new Date().toUTCString() },
				data: { message: "Unauthenticated." },
			},
		};

		await expect(responseInterceptor.rejected(mock401Error)).rejects.toEqual(
			mock401Error,
		);

		expect(expiredHandled).toBe(true);
		expect(eventFired).toBe(true);

		// Verify outbox transaction remains intact in IndexedDB!
		const pendingItems = await db.outbox.toArray();
		const savedItem = pendingItems.find(
			(i) => i.clientUuid === "test-uuid-p1-safe-outbox",
		);
		expect(savedItem).toBeDefined();
		expect(savedItem?.status).toBe("pending");

		// Trigger 401 on login request (should NOT trigger expired handler)
		let loginExpiredTriggered = false;
		setUnauthorizedHandler(() => {
			loginExpiredTriggered = true;
		});
		const mockLogin401Error = {
			config: { url: "/api/v1/auth/login" },
			response: {
				status: 401,
				data: { message: "Namecode atau PIN salah." },
			},
		};

		await expect(
			responseInterceptor.rejected(mockLogin401Error),
		).rejects.toEqual(mockLogin401Error);
		expect(loginExpiredTriggered).toBe(false);

		window.removeEventListener(AUTH_EXPIRED_EVENT, listener);
		await db.outbox.delete("test-uuid-p1-safe-outbox");
	});
});
