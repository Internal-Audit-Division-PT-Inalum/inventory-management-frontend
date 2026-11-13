/**
 * Security and sanitization utilities:
 * - Laravel Sanctum authentication token validation and header injection mitigation
 * - External & relative URL protocol sanitization (XSS / Open Redirect prevention)
 * - Post-login redirect path sanitization (Open Redirect prevention)
 * - Safe session and sensitive storage disposal
 */

export interface SanitizeUrlOptions {
	allowRelative?: boolean;
}

/**
 * Validates and sanitizes external or relative URLs before passing them into DOM sinks.
 * Enforces an explicit allowlist of HTTP/HTTPS schemes (and optional safe relative paths),
 * rejecting dangerous protocols (javascript:, vbscript:, data:, file:), control characters,
 * backslash tricks, and protocol-relative targets (//).
 */
export function sanitizeUrl(
	url: string | null | undefined,
	options: SanitizeUrlOptions = {},
): string | null {
	if (!url || typeof url !== "string") {
		return null;
	}

	for (let i = 0; i < url.length; i++) {
		const code = url.charCodeAt(i);
		if (code < 32 || code === 127) {
			return null;
		}
	}

	const trimmed = url.trim();
	if (trimmed === "") {
		return null;
	}

	if (
		trimmed.startsWith("//") ||
		trimmed.startsWith("\\\\") ||
		trimmed.startsWith("/\\") ||
		trimmed.startsWith("\\/")
	) {
		return null;
	}

	const allowRelative = options.allowRelative ?? true;
	const firstSlash = trimmed.indexOf("/");
	const firstQuery = trimmed.indexOf("?");
	const firstHash = trimmed.indexOf("#");
	const firstColon = trimmed.indexOf(":");

	const firstDelimiterCandidates = [firstSlash, firstQuery, firstHash].filter(
		(idx) => idx !== -1,
	);
	const firstDelimiter =
		firstDelimiterCandidates.length > 0
			? Math.min(...firstDelimiterCandidates)
			: Number.POSITIVE_INFINITY;

	const hasSchemePrefix =
		!trimmed.startsWith("/") &&
		firstColon !== -1 &&
		firstColon < firstDelimiter;

	if (hasSchemePrefix || /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
		if (!/^https?:\/\//i.test(trimmed)) {
			return null;
		}
		try {
			const parsed = new URL(trimmed);
			if (
				(parsed.protocol === "http:" || parsed.protocol === "https:") &&
				parsed.hostname.length > 0
			) {
				return trimmed;
			}
			return null;
		} catch {
			return null;
		}
	}

	if (!allowRelative) {
		return null;
	}

	return trimmed;
}

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
