export interface BackoffOptions {
	/**
	 * Delay dasar dalam milidetik (default: 1000ms / 1 detik).
	 */
	baseDelayMs?: number;

	/**
	 * Batas maksimum delay dalam milidetik (default: 60000ms / 1 menit).
	 */
	maxDelayMs?: number;

	/**
	 * Faktor pengali eksponensial (default: 2).
	 */
	factor?: number;

	/**
	 * Mode jitter: 'full' (AWS recommended) atau 'none' (deterministik tanpa jitter).
	 * Default: 'full'.
	 */
	jitter?: "full" | "none";

	/**
	 * Fungsi pembangkit acak untuk determinisme pengujian unit.
	 * Default: Math.random.
	 */
	randomFn?: () => number;
}

export const DEFAULT_BACKOFF_CONFIG: Required<
	Omit<BackoffOptions, "randomFn">
> = {
	baseDelayMs: 1000,
	maxDelayMs: 60000,
	factor: 2,
	jitter: "full",
};

/**
 * Menghitung durasi delay dalam milidetik menggunakan Exponential Backoff dengan Full Jitter.
 *
 * Full Jitter Algorithm (Marc Brooker / AWS Architecture):
 *   exponential = min(maxDelayMs, baseDelayMs * (factor ^ attempts))
 *   sleep = floor(random() * exponential)
 *
 * Jitter mencegah "Thundering Herd Problem" saat banyak perangkat PWA serentak
 * mencoba sinkronisasi ulang ketika jaringan kantor pulih.
 */
export function calculateBackoffDelay(
	attempts: number,
	options: BackoffOptions = {},
): number {
	const baseDelayMs = options.baseDelayMs ?? DEFAULT_BACKOFF_CONFIG.baseDelayMs;
	const maxDelayMs = options.maxDelayMs ?? DEFAULT_BACKOFF_CONFIG.maxDelayMs;
	const factor = options.factor ?? DEFAULT_BACKOFF_CONFIG.factor;
	const jitter = options.jitter ?? DEFAULT_BACKOFF_CONFIG.jitter;
	const randomFn = options.randomFn ?? Math.random;

	const safeAttempts = Math.max(0, attempts);
	const exponential = Math.min(
		maxDelayMs,
		baseDelayMs * factor ** safeAttempts,
	);

	if (jitter === "none") {
		return Math.round(exponential);
	}

	const jittered = Math.floor(randomFn() * exponential);
	return Math.max(0, jittered);
}

/**
 * Menghitung timestamp ISO string untuk waktu percobaan berikutnya (nextAttemptAt).
 */
export function calculateNextAttemptAt(
	attempts: number,
	options: BackoffOptions = {},
	nowMs: number = Date.now(),
): string {
	const delayMs = calculateBackoffDelay(attempts, options);
	return new Date(nowMs + delayMs).toISOString();
}

/**
 * Mengurai nilai header 'Retry-After' (RFC 7231 / RFC 9110) dari respons server 429 atau 503.
 * Mendukung format detik integer (misal "60") dan format HTTP-Date (misal "Wed, 28 Oct 2026 10:30:00 GMT").
 * Mengembalikan durasi delay dalam milidetik, atau null jika tidak ada/tidak valid.
 */
export function parseRetryAfterHeader(
	headerValue?: string | number | null,
	nowMs: number = Date.now(),
): number | null {
	if (headerValue === undefined || headerValue === null) {
		return null;
	}

	// 1. Jika bertipe number murni
	if (typeof headerValue === "number" && !Number.isNaN(headerValue)) {
		return Math.max(0, Math.round(headerValue * 1000));
	}

	const str = String(headerValue).trim();
	if (!str) {
		return null;
	}

	// 2. Jika berupa string angka detik murni (e.g., "30")
	if (/^\d+$/.test(str)) {
		const seconds = Number.parseInt(str, 10);
		if (!Number.isNaN(seconds)) {
			return Math.max(0, seconds * 1000);
		}
	}

	// 3. Jika berupa HTTP-Date (e.g., "Wed, 28 Oct 2026 03:20:00 GMT")
	const dateParsed = Date.parse(str);
	if (!Number.isNaN(dateParsed)) {
		const diffMs = dateParsed - nowMs;
		return Math.max(0, diffMs);
	}

	return null;
}
