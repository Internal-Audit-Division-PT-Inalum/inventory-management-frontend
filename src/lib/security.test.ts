import { beforeEach, describe, expect, it } from "vitest";
import {
	clearSensitiveStorage,
	isValidSanctumToken,
	sanitizeAuthHeader,
	sanitizeRedirectPath,
} from "./security";

describe("Security Hardening & Token Sanitization", () => {
	beforeEach(() => {
		localStorage.clear();
		sessionStorage.clear();
	});

	describe("isValidSanctumToken", () => {
		it("accepts valid Laravel Sanctum tokens in format <id>|<token>", () => {
			expect(isValidSanctumToken("1|a1b2c3d4e5f6g7h8i9j0")).toBe(true);
			expect(isValidSanctumToken("42|token-with-hyphens_and_underscores")).toBe(
				true,
			);
			expect(isValidSanctumToken("109|sanctumPlainTokenValue1234567890")).toBe(
				true,
			);
		});

		it("accepts valid alphanumeric hash tokens", () => {
			expect(
				isValidSanctumToken(
					"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
				),
			).toBe(true);
			expect(isValidSanctumToken("valid_token_value.12345")).toBe(true);
		});

		it("rejects invalid, null, undefined, and non-string inputs", () => {
			expect(isValidSanctumToken(null)).toBe(false);
			expect(isValidSanctumToken(undefined)).toBe(false);
			expect(isValidSanctumToken(123456)).toBe(false);
			expect(isValidSanctumToken({})).toBe(false);
			expect(isValidSanctumToken("")).toBe(false);
			expect(isValidSanctumToken("   ")).toBe(false);
			expect(isValidSanctumToken("abc")).toBe(false); // too short (< 5 chars)
		});

		it("rejects tokens with newline injection or carriage returns (anti-header injection)", () => {
			expect(isValidSanctumToken("1|token\r\nX-Injected-Header: evil")).toBe(
				false,
			);
			expect(isValidSanctumToken("1|token\nevil")).toBe(false);
			expect(isValidSanctumToken("1|token\tevil")).toBe(false);
		});

		it("rejects tokens with XSS payloads and HTML characters", () => {
			expect(isValidSanctumToken("<script>alert(1)</script>")).toBe(false);
			expect(isValidSanctumToken('1|token" onClick="alert(1)')).toBe(false);
			expect(isValidSanctumToken("1|token' OR '1'='1")).toBe(false);
		});

		it("rejects excessively long tokens (> 256 characters)", () => {
			const tooLongToken = `1|${"a".repeat(260)}`;
			expect(isValidSanctumToken(tooLongToken)).toBe(false);
		});
	});

	describe("sanitizeAuthHeader", () => {
		it("returns formatted Bearer header for valid tokens", () => {
			expect(sanitizeAuthHeader("1|validToken123")).toBe(
				"Bearer 1|validToken123",
			);
			expect(sanitizeAuthHeader("  1|validTokenWithSpaces  ")).toBe(
				"Bearer 1|validTokenWithSpaces",
			);
		});

		it("returns null for invalid tokens", () => {
			expect(sanitizeAuthHeader(null)).toBeNull();
			expect(sanitizeAuthHeader("")).toBeNull();
			expect(sanitizeAuthHeader("invalid\ntoken")).toBeNull();
		});
	});

	describe("sanitizeRedirectPath", () => {
		it("permits safe relative application routes", () => {
			expect(sanitizeRedirectPath("/loans")).toBe("/loans");
			expect(sanitizeRedirectPath("/outbox?tab=needs_action")).toBe(
				"/outbox?tab=needs_action",
			);
			expect(sanitizeRedirectPath("/?src=qr&item=SKU-001")).toBe(
				"/?src=qr&item=SKU-001",
			);
			expect(sanitizeRedirectPath("/change-pin")).toBe("/change-pin");
		});

		it("blocks open redirect attempts to external protocols or domains", () => {
			expect(sanitizeRedirectPath("https://evil.com")).toBe("/");
			expect(sanitizeRedirectPath("http://evil.com/phishing")).toBe("/");
			expect(sanitizeRedirectPath("//evil.com/fake-login")).toBe("/");
			expect(sanitizeRedirectPath("javascript:alert(document.cookie)")).toBe(
				"/",
			);
			expect(
				sanitizeRedirectPath("data:text/html,<script>alert(1)</script>"),
			).toBe("/");
		});

		it("falls back to default route when path is null or malformed", () => {
			expect(sanitizeRedirectPath(null)).toBe("/");
			expect(sanitizeRedirectPath("")).toBe("/");
			expect(sanitizeRedirectPath("relative-without-slash")).toBe("/");
		});
	});

	describe("clearSensitiveStorage", () => {
		it("removes tokens and auth storage keys cleanly", () => {
			localStorage.setItem("inventory_token", "secret-token");
			localStorage.setItem(
				"inventory_auth_storage",
				JSON.stringify({ token: "secret" }),
			);
			sessionStorage.setItem("temp_session_key", "temporary");

			clearSensitiveStorage();

			expect(localStorage.getItem("inventory_token")).toBeNull();
			expect(localStorage.getItem("inventory_auth_storage")).toBeNull();
			expect(sessionStorage.getItem("temp_session_key")).toBeNull();
		});
	});
});
