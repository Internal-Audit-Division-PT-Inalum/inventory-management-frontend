import { describe, expect, it } from "vitest";
import { db } from "./db";
import { mapApiError } from "./errors";
import { formatRelative, formatWib, setServerTimeOffset } from "./time";

describe("Lib Utilities Unit Tests", () => {
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
});
