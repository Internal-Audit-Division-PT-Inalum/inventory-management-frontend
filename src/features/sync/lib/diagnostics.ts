import { type DiagnosticLogLevel, db } from "@/lib/db";

/**
 * Event global saat entri log diagnostik baru ditambahkan atau dibersihkan.
 */
export const DIAGNOSTIC_LOG_UPDATED_EVENT = "inventory:diagnostic-log-updated";

/**
 * Batas kapasitas default ring-buffer log diagnostik lokal di IndexedDB.
 */
export const DEFAULT_DIAGNOSTIC_LOG_CAP = 100;

/**
 * Kategori standar entri diagnostik sistem.
 */
export const DIAGNOSTIC_CATEGORIES = [
	"SYNC_ENGINE",
	"SYNC_SCHEDULER",
	"STATE_MACHINE",
	"TIME_SYNC",
	"AUTH",
	"CATALOG_SYNC",
	"SYSTEM",
] as const;

export type DiagnosticCategory =
	| (typeof DIAGNOSTIC_CATEGORIES)[number]
	| (string & {});

export interface AddDiagnosticLogOptions {
	level: DiagnosticLogLevel;
	category: DiagnosticCategory;
	message: string;
	details?: Record<string, unknown> | string | null;
	maxEntries?: number;
}

/**
 * Mencatat log diagnostik ke IndexedDB dan menyiarkan event reaktif.
 */
export async function recordDiagnosticLog(
	options: AddDiagnosticLogOptions,
): Promise<number> {
	const timestamp = new Date().toISOString();
	return await db.addDiagnosticLog(
		{
			timestamp,
			level: options.level,
			category: options.category,
			message: options.message,
			details: options.details ?? null,
		},
		options.maxEntries ?? DEFAULT_DIAGNOSTIC_LOG_CAP,
	);
}

/**
 * Menyalin teks log diagnostik ke papan klip (clipboard) dengan fallback aman.
 */
export async function copyLogsToClipboard(text: string): Promise<boolean> {
	if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
		try {
			await navigator.clipboard.writeText(text);
			return true;
		} catch {
			// Lanjutkan ke fallback textarea di bawah
		}
	}

	if (typeof document !== "undefined") {
		try {
			const textarea = document.createElement("textarea");
			textarea.value = text;
			textarea.style.position = "fixed";
			textarea.style.opacity = "0";
			document.body.appendChild(textarea);
			textarea.select();
			const successful = document.execCommand("copy");
			document.body.removeChild(textarea);
			return successful;
		} catch {
			return false;
		}
	}

	return false;
}

/**
 * Mengunduh berkas log diagnostik ke perangkat pengguna (PWA/Browser).
 */
export function downloadLogsFile(
	content: string,
	filename: string,
	mimeType = "text/plain;charset=utf-8",
): boolean {
	if (typeof window === "undefined" || typeof document === "undefined") {
		return false;
	}

	try {
		const blob = new Blob([content], { type: mimeType });
		const url = URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.href = url;
		link.download = filename;
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
		URL.revokeObjectURL(url);
		return true;
	} catch {
		return false;
	}
}

/**
 * Memformat timestamp ISO menjadi format waktu Indonesia resmi (WIB).
 */
export function formatDiagnosticTimestamp(isoString: string): string {
	try {
		const date = new Date(isoString);
		if (Number.isNaN(date.getTime())) return isoString;

		return new Intl.DateTimeFormat("id-ID", {
			timeZone: "Asia/Jakarta",
			day: "2-digit",
			month: "short",
			year: "numeric",
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
			hour12: false,
		}).format(date);
	} catch {
		return isoString;
	}
}
