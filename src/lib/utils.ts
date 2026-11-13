import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { sanitizeUrl } from "./security";

export function cn(...inputs: ClassValue[]): string {
	return twMerge(clsx(inputs));
}

/**
 * Resolves and sanitizes media URLs (e.g., storage assets) to safe URLs or relative proxy paths
 * to eliminate CORS issues, mitigate XSS URI schemes, and preserve dynamic host routing across WiFi/LAN.
 */
export function resolveMediaUrl(url: string | null | undefined): string | null {
	const safeUrl = sanitizeUrl(url, { allowRelative: true });
	if (!safeUrl) return null;

	// If absolute URL pointing to backend /storage or /api
	if (safeUrl.startsWith("http://") || safeUrl.startsWith("https://")) {
		try {
			const parsed = new URL(safeUrl);
			if (
				parsed.pathname.startsWith("/storage") ||
				parsed.pathname.startsWith("/api")
			) {
				return `${parsed.pathname}${parsed.search}`;
			}
			return safeUrl;
		} catch {
			return null;
		}
	}

	return safeUrl.startsWith("/") ? safeUrl : `/${safeUrl}`;
}
