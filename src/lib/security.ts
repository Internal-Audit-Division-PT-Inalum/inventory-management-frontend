/**
 * Security and sanitization utilities:
 * - Laravel Sanctum authentication token validation and header injection mitigation
 * - Post-login redirect path sanitization (Open Redirect prevention)
 * - Safe session and sensitive storage disposal
 */

/**
 * Validates whether an authentication token matches Laravel Sanctum specifications
 * (`<token_id>|<plain_text_token>`) or general cryptographic hash standards.
 * Enforces length boundaries (5-256 characters) and rejects control, whitespace,
 * newline, quote, or HTML characters to prevent XSS and HTTP header injection.
 */
export function isValidSanctumToken(token: unknown): boolean {
	if (typeof token !== "string") return false;

	const trimmed = token.trim();
	if (trimmed.length < 5 || trimmed.length > 256) return false;

	for (let i = 0; i < trimmed.length; i++) {
		const code = trimmed.charCodeAt(i);
		if (code <= 32 || code >= 127) return false;
	}

	const sanctumPattern = /^[0-9]+\|[A-Za-z0-9_-]+$/;
	const genericTokenPattern = /^[A-Za-z0-9_.-]+$/;

	return sanctumPattern.test(trimmed) || genericTokenPattern.test(trimmed);
}

/**
 * Sanitizes an authorization token before injecting into HTTP Authorization header.
 * Returns formatted "Bearer <token>" or null if token is invalid.
 */
export function sanitizeAuthHeader(token: unknown): string | null {
	if (!isValidSanctumToken(token)) {
		return null;
	}
	return `Bearer ${(token as string).trim()}`;
}

/**
 * Sanitizes a post-login destination URL to prevent Open Redirect vulnerabilities.
 * Permits only internal relative application routes starting with a single forward slash.
 * Rejects external protocols (http:, https:), protocol-relative targets (//), and control characters.
 */
export function sanitizeRedirectPath(
	path: string | null | undefined,
	fallback = "/",
): string {
	if (!path || typeof path !== "string") {
		return fallback;
	}

	const trimmed = path.trim();

	if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed) || trimmed.startsWith("//")) {
		return fallback;
	}

	if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
		return fallback;
	}

	if (/[\r\n\t\0]/.test(trimmed)) {
		return fallback;
	}

	return trimmed;
}

/**
 * Safely clears sensitive authentication session keys and tokens on logout or session expiration.
 */
export function clearSensitiveStorage(): void {
	try {
		localStorage.removeItem("inventory_token");
		localStorage.removeItem("inventory_auth_storage");
		sessionStorage.clear();
	} catch {
		// Suppress storage access errors in restricted browser contexts
	}
}
