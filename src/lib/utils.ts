import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
	return twMerge(clsx(inputs));
}

/**
 * Resolves media URLs (e.g., storage assets) to relative proxy paths
 * to eliminate CORS issues and preserve dynamic host routing across WiFi/LAN.
 */
export function resolveMediaUrl(url: string | null | undefined): string | null {
	if (!url || typeof url !== "string" || url.trim() === "") return null;
	const trimmed = url.trim();

	// If absolute URL pointing to backend /storage or /api
	if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
		try {
			const parsed = new URL(trimmed);
			if (
				parsed.pathname.startsWith("/storage") ||
				parsed.pathname.startsWith("/api")
			) {
				return `${parsed.pathname}${parsed.search}`;
			}
			return trimmed;
		} catch {
			return trimmed;
		}
	}

	return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}
