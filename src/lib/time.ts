// ==============================================================================
// TIME UTILITIES & SERVER CLOCK SKEW CORRECTION
// Menjamin timestamp occurred_at transaksi offline/online selaras dengan jam server
// ==============================================================================

export const SERVER_TIME_OFFSET_STORAGE_KEY = "inventory_server_time_offset_ms";

function loadInitialServerOffset(): number {
	try {
		if (typeof window !== "undefined" && window.localStorage) {
			const saved = localStorage.getItem(SERVER_TIME_OFFSET_STORAGE_KEY);
			if (saved) {
				const num = Number.parseInt(saved, 10);
				if (!Number.isNaN(num)) {
					return num;
				}
			}
		}
	} catch {
		// Ignore storage errors on private mode / disabled cookies
	}
	return 0;
}

let serverTimeOffsetMs = loadInitialServerOffset();

/**
 * Memperbarui offset pergeseran jam antara client dan server
 * berdasarkan header 'Date' dari respons HTTP server, serta
 * menyimpannya ke persistent storage untuk ketahanan saat offline.
 */
export function setServerTimeOffset(
	serverDateHeader: string | undefined,
): void {
	if (!serverDateHeader) return;

	try {
		const serverTimestamp = Date.parse(serverDateHeader);
		if (!Number.isNaN(serverTimestamp)) {
			serverTimeOffsetMs = serverTimestamp - Date.now();
			try {
				if (typeof window !== "undefined" && window.localStorage) {
					localStorage.setItem(
						SERVER_TIME_OFFSET_STORAGE_KEY,
						String(serverTimeOffsetMs),
					);
				}
			} catch {
				// Ignore storage write errors
			}
		}
	} catch {
		// Ignore parse errors and retain current offset
	}
}

/**
 * Reset server time offset kembali ke 0 (biasanya untuk kebutuhan pengujian).
 */
export function resetServerTimeOffset(): void {
	serverTimeOffsetMs = 0;
	try {
		if (typeof window !== "undefined" && window.localStorage) {
			localStorage.removeItem(SERVER_TIME_OFFSET_STORAGE_KEY);
		}
	} catch {
		// Ignore
	}
}

/**
 * Mengambil nilai offset waktu server saat ini (dalam milidetik).
 */
export function getServerTimeOffset(): number {
	return serverTimeOffsetMs;
}

/**
 * Menghasilkan objek Date yang telah dikoreksi dengan offset server.
 */
export function getCorrectedNow(): Date {
	return new Date(Date.now() + serverTimeOffsetMs);
}

/**
 * Menghasilkan ISO-8601 string waktu saat ini yang telah dikoreksi dengan jam server.
 */
export function getCorrectedIsoString(): string {
	return getCorrectedNow().toISOString();
}

/**
 * Memvalidasi apakah timestamp berada di dalam jendela waktu yang dapat diterima backend
 * (Backend TransactItemRequest: >= 30 hari lalu dan <= +5 menit dari waktu server).
 */
export function isTimestampWithinAcceptableWindow(
	isoString: string,
	referenceNow: Date = getCorrectedNow(),
): boolean {
	const timestamp = Date.parse(isoString);
	if (Number.isNaN(timestamp)) return false;

	const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
	const fiveMinutesMs = 5 * 60 * 1000;

	const nowMs = referenceNow.getTime();
	const minAllowed = nowMs - thirtyDaysMs;
	const maxAllowed = nowMs + fiveMinutesMs;

	return timestamp >= minAllowed && timestamp <= maxAllowed;
}

/**
 * Format tanggal ke standar Waktu Indonesia Barat (WIB).
 */
export function formatWib(
	dateInput: Date | string | null | undefined,
	includeSeconds = false,
): string {
	if (!dateInput) return "-";

	const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
	if (Number.isNaN(date.getTime())) return "-";

	const options: Intl.DateTimeFormatOptions = {
		timeZone: "Asia/Jakarta",
		day: "2-digit",
		month: "short",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
		...(includeSeconds ? { second: "2-digit" } : {}),
		hour12: false,
	};

	return new Intl.DateTimeFormat("id-ID", options).format(date);
}

/**
 * Menghasilkan representasi waktu relatif (misal: "Baru saja", "5 menit lalu").
 */
export function formatRelative(
	dateInput: Date | string | null | undefined,
): string {
	if (!dateInput) return "-";

	const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
	if (Number.isNaN(date.getTime())) return "-";

	const now = getCorrectedNow().getTime();
	const diffSec = Math.floor((now - date.getTime()) / 1000);

	if (diffSec < 10) return "Baru saja";
	if (diffSec < 60) return `${diffSec} dtk lalu`;

	const diffMin = Math.floor(diffSec / 60);
	if (diffMin < 60) return `${diffMin} mnt lalu`;

	const diffHour = Math.floor(diffMin / 60);
	if (diffHour < 24) return `${diffHour} jam lalu`;

	const diffDay = Math.floor(diffHour / 24);
	if (diffDay < 7) return `${diffDay} hari lalu`;

	return formatWib(date);
}
