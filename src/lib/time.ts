// ==============================================================================
// TIME UTILITIES & SERVER CLOCK SKEW CORRECTION
// Menjamin timestamp occurred_at transaksi offline/online selaras dengan jam server
// ==============================================================================

let serverTimeOffsetMs = 0;

/**
 * Memperbarui offset pergeseran jam antara client dan server
 * berdasarkan header 'Date' dari respons HTTP server.
 */
export function setServerTimeOffset(
	serverDateHeader: string | undefined,
): void {
	if (!serverDateHeader) return;

	try {
		const serverTimestamp = Date.parse(serverDateHeader);
		if (!Number.isNaN(serverTimestamp)) {
			serverTimeOffsetMs = serverTimestamp - Date.now();
		}
	} catch {
		// Ignore parse errors and retain current offset
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
 * Menghasilkan ISO-8601 string waktu saat ini yang telah dikoreksi.
 */
export function getCorrectedIsoString(): string {
	return getCorrectedNow().toISOString();
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
