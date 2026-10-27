import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	buildQrLandingUrl,
	getAndClearPostLoginRedirect,
	POST_LOGIN_REDIRECT_KEY,
	parseQrLandingParams,
	savePostLoginRedirect,
} from "./lib/qrLanding";

describe("QR Landing & Post-Login Redirection Engine (Task P2.8)", () => {
	beforeEach(() => {
		sessionStorage.clear();
	});

	afterEach(() => {
		sessionStorage.clear();
	});

	describe("parseQrLandingParams", () => {
		it("detects generic QR landing without location or item", () => {
			const result = parseQrLandingParams("?src=qr");
			expect(result.isQrLanding).toBe(true);
			expect(result.locationId).toBeNull();
			expect(result.itemId).toBeNull();
		});

		it("extracts rack location parameter correctly (location_id)", () => {
			const result = parseQrLandingParams("?src=qr&location_id=LOC-RACK-A1");
			expect(result.isQrLanding).toBe(true);
			expect(result.locationId).toBe("LOC-RACK-A1");
			expect(result.itemId).toBeNull();
		});

		it("extracts rack location parameter correctly (location alias)", () => {
			const result = parseQrLandingParams("?location=LOC-RACK-B2");
			expect(result.isQrLanding).toBe(false);
			expect(result.locationId).toBe("LOC-RACK-B2");
			expect(result.itemId).toBeNull();
		});

		it("extracts item parameter correctly (item_id and item alias)", () => {
			const res1 = parseQrLandingParams("?src=qr&item_id=ITM-SAFETY-01");
			expect(res1.isQrLanding).toBe(true);
			expect(res1.itemId).toBe("ITM-SAFETY-01");

			const res2 = parseQrLandingParams("?item=ITM-SAFETY-02");
			expect(res2.isQrLanding).toBe(false);
			expect(res2.itemId).toBe("ITM-SAFETY-02");
		});

		it("returns defaults on empty or unrelated query string", () => {
			const resEmpty = parseQrLandingParams("");
			expect(resEmpty.isQrLanding).toBe(false);
			expect(resEmpty.locationId).toBeNull();
			expect(resEmpty.itemId).toBeNull();

			const resOther = parseQrLandingParams("?tab=overview&page=2");
			expect(resOther.isQrLanding).toBe(false);
			expect(resOther.locationId).toBeNull();
			expect(resOther.itemId).toBeNull();
		});
	});

	describe("savePostLoginRedirect & getAndClearPostLoginRedirect", () => {
		it("saves and retrieves string redirect path preserving query params", () => {
			savePostLoginRedirect("/?src=qr&location_id=LOC-CENTRAL-01");
			expect(sessionStorage.getItem(POST_LOGIN_REDIRECT_KEY)).toBe(
				"/?src=qr&location_id=LOC-CENTRAL-01",
			);

			const retrieved = getAndClearPostLoginRedirect();
			expect(retrieved).toBe("/?src=qr&location_id=LOC-CENTRAL-01");
			// Verifikasi pembersihan otomatis
			expect(sessionStorage.getItem(POST_LOGIN_REDIRECT_KEY)).toBeNull();
		});

		it("preserves full path from React Router Location object including hash and search", () => {
			const mockLocation = {
				pathname: "/location/LOC-001",
				search: "?src=qr&rack=3",
				hash: "#item-section",
			};

			savePostLoginRedirect(mockLocation);
			expect(sessionStorage.getItem(POST_LOGIN_REDIRECT_KEY)).toBe(
				"/location/LOC-001?src=qr&rack=3#item-section",
			);

			const retrieved = getAndClearPostLoginRedirect(mockLocation);
			expect(retrieved).toBe("/location/LOC-001?src=qr&rack=3#item-section");
		});

		it("refuses to save or redirect to /login to prevent infinite redirect loops", () => {
			savePostLoginRedirect("/login");
			expect(sessionStorage.getItem(POST_LOGIN_REDIRECT_KEY)).toBeNull();

			const fallbackResult = getAndClearPostLoginRedirect("/login");
			expect(fallbackResult).toBe("/");
		});

		it("returns '/' fallback when nothing is stored or provided", () => {
			const result = getAndClearPostLoginRedirect(null);
			expect(result).toBe("/");
		});
	});

	describe("buildQrLandingUrl", () => {
		it("generates generic QR landing URL", () => {
			const url = buildQrLandingUrl({ baseUrl: "https://inventory.inalum.id" });
			expect(url).toBe("https://inventory.inalum.id/?src=qr");
		});

		it("generates rack landing QR URL with location_id", () => {
			const url = buildQrLandingUrl({
				locationId: "LOC-RACK-05",
				baseUrl: "https://inventory.inalum.id",
			});
			expect(url).toBe(
				"https://inventory.inalum.id/?src=qr&location_id=LOC-RACK-05",
			);
		});

		it("generates item landing QR URL with item_id", () => {
			const url = buildQrLandingUrl({
				itemId: "ITM-HELMET-RED",
				baseUrl: "https://inventory.inalum.id",
			});
			expect(url).toBe(
				"https://inventory.inalum.id/?src=qr&item_id=ITM-HELMET-RED",
			);
		});
	});
});
