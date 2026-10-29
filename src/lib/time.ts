// ==============================================================================
// TIME UTILITIES & SERVER CLOCK SKEW CORRECTION (Task P5.7)
// Menjamin timestamp occurred_at transaksi offline/online selaras dengan jam server
// ==============================================================================

import { db } from "./db";

export const SERVER_TIME_OFFSET_STORAGE_KEY = "inventory_server_time_offset_ms";
export const SERVER_TIME_SYNCED_EVENT = "inventory:server-time-synced";

/** Ambang batas perbedaan waktu perangkat vs server yang dianggap signifikan (60 detik) */
export const SIGNIFICANT_CLOCK_SKEW_THRESHOLD_MS = 60_000;

/** Batas maksimal usia transaksi di masa lalu (30 hari sesuai Backend TransactItemRequest) */
export const TRANSACTION_MAX_PAST_DAYS = 30;

/** Batas toleransi maksimal transaksi di masa depan (5 menit sesuai Backend TransactItemRequest) */
export const TRANSACTION_MAX_FUTURE_MINUTES = 5;

export interface SetServerTimeOffsetOptions {
	/** Waktu klien (Date.now()) saat permintaan HTTP dikirim ke server */
	requestStartTime?: number;
	/** Waktu klien (Date.now()) saat respons HTTP diterima dari server (default: Date.now()) */
	responseTime?: number;
	/** Melewati pencatatan log diagnostik (khusus untuk pengujian) */
	skipDiagnosticLog?: boolean;
}

export interface ClockSkewInfo {
	offsetMs: number;
	offsetSeconds: number;
	isSkewed: boolean;
	clientTimeIso: string;
	correctedTimeIso: string;
	formattedDescription: string;
}

export interface OccurredAtValidationResult {
	valid: boolean;
	reason?: "too_old" | "future_timestamp" | "invalid_format";
	message?: string;
	diffMinutes?: number;
}

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
		// Abaikan galat penyimpanan pada mode penyamaran/private
	}
	return 0;
}

let serverTimeOffsetMs = loadInitialServerOffset();

/**
 * Menghitung pergeseran waktu antara server dan klien dari header HTTP 'Date'.
 * Memperhitungkan kompensasi Network Round-Trip Time (RTT) untuk akurasi tingkat sub-detik.
 */
export function calculateOffsetFromHeader(
	serverDateHeader: string,
	options: SetServerTimeOffsetOptions = {},
): number | null {
	const serverTimestamp = Date.parse(serverDateHeader);
	if (Number.isNaN(serverTimestamp)) return null;

	const responseTime = options.responseTime ?? Date.now();
	const requestStartTime = options.requestStartTime;

	let clientReferenceTime = responseTime;
	if (
		typeof requestStartTime === "number" &&
		requestStartTime > 0 &&
		requestStartTime <= responseTime
	) {
		// Kompensasi Network Latency (RTT): T_client_est = (T_req + T_res) / 2
		clientReferenceTime = Math.round((requestStartTime + responseTime) / 2);
	}

	return serverTimestamp - clientReferenceTime;
}

/**
 * Memperbarui offset pergeseran jam antara client dan server
 * berdasarkan header 'Date' dari respons HTTP server, serta
 * menyimpannya ke persistent storage (localStorage + Dexie db.meta).
 */
export function setServerTimeOffset(
	serverDateHeader: string | undefined,
	options: SetServerTimeOffsetOptions = {},
): number {
	if (!serverDateHeader) return serverTimeOffsetMs;

	const calculatedOffset = calculateOffsetFromHeader(serverDateHeader, options);
	if (calculatedOffset === null) return serverTimeOffsetMs;

	const previousOffset = serverTimeOffsetMs;
	serverTimeOffsetMs = calculatedOffset;

	// 1. Simpan ke localStorage untuk akses sinkron cepat saat boot
	try {
		if (typeof window !== "undefined" && window.localStorage) {
			localStorage.setItem(
				SERVER_TIME_OFFSET_STORAGE_KEY,
				String(serverTimeOffsetMs),
			);
		}
	} catch {
		// Abaikan galat penyimpanan
	}

	// 2. Simpan asinkron ke Dexie db.meta (Dual-layer persistence)
	try {
		db.meta
			.put({
				key: SERVER_TIME_OFFSET_STORAGE_KEY,
				value: String(serverTimeOffsetMs),
				updatedAt: new Date().toISOString(),
			})
			.catch(() => {});
	} catch {
		// Abaikan jika database belum siap
	}

	// 3. Deteksi apakah pergeseran jam signifikan (>= 60 detik)
	const isSignificant =
		Math.abs(serverTimeOffsetMs) >= SIGNIFICANT_CLOCK_SKEW_THRESHOLD_MS;
	if (isSignificant && !options.skipDiagnosticLog) {
		const skewSec = Math.round(serverTimeOffsetMs / 1000);
		db.addDiagnosticLog({
			timestamp: new Date().toISOString(),
			level: "warn",
			category: "TIME_SYNC",
			message: `Significant clock skew detected: ${skewSec}s between device and server`,
			details: {
				offsetMs: serverTimeOffsetMs,
				skewSeconds: skewSec,
				deviceTime: new Date().toISOString(),
				correctedTime: new Date(Date.now() + serverTimeOffsetMs).toISOString(),
			},
		}).catch(() => {});
	}

	// 4. Siarkan event global jika offset berubah signifikan (> 500ms)
	if (
		typeof window !== "undefined" &&
		Math.abs(serverTimeOffsetMs - previousOffset) > 500
	) {
		window.dispatchEvent(
			new CustomEvent(SERVER_TIME_SYNCED_EVENT, {
				detail: {
					offsetMs: serverTimeOffsetMs,
					isSignificant,
				},
			}),
		);
	}

	return serverTimeOffsetMs;
}

/**
 * Inisialisasi asinkron offset jam server dari IndexedDB (db.meta)
 * jika localStorage belum terisi atau dibersihkan peramban.
 */
export async function initServerTimeOffset(): Promise<number> {
	if (serverTimeOffsetMs !== 0) {
		return serverTimeOffsetMs;
	}

	try {
		const record = await db.meta.get(SERVER_TIME_OFFSET_STORAGE_KEY);
		if (record?.value) {
			const val = Number.parseInt(record.value, 10);
			if (!Number.isNaN(val)) {
				serverTimeOffsetMs = val;
				return val;
			}
		}
	} catch {
		// Abaikan galat database
	}

	return 0;
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
	try {
		db.meta.delete(SERVER_TIME_OFFSET_STORAGE_KEY).catch(() => {});
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
 * Memeriksa apakah pergeseran waktu perangkat melebihi batas signifikansi.
 */
export function isClockSkewSignificant(
	thresholdMs: number = SIGNIFICANT_CLOCK_SKEW_THRESHOLD_MS,
): boolean {
	return Math.abs(serverTimeOffsetMs) >= thresholdMs;
}

/**
 * Mengambil informasi diagnostik lengkap mengenai pergeseran waktu perangkat.
 */
export function getClockSkewInfo(): ClockSkewInfo {
	const offsetSec = Math.round(serverTimeOffsetMs / 1000);
	const isSkewed = isClockSkewSignificant();

	let formattedDescription = "Waktu perangkat selaras dengan server";
	if (isSkewed) {
		if (offsetSec > 0) {
			formattedDescription = `Waktu perangkat lebih lambat ${Math.abs(offsetSec)} detik dari server`;
		} else {
			formattedDescription = `Waktu perangkat lebih cepat ${Math.abs(offsetSec)} detik dari server`;
		}
	}

	return {
		offsetMs: serverTimeOffsetMs,
		offsetSeconds: offsetSec,
		isSkewed,
		clientTimeIso: new Date().toISOString(),
		correctedTimeIso: getCorrectedIsoString(),
		formattedDescription,
	};
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
	return validateOccurredAt(isoString, referenceNow).valid;
}

/**
 * Validasi mendalam timestamp occurred_at dengan pesan alasan yang terperinci.
 */
export function validateOccurredAt(
	occurredAtIso: string,
	referenceNow: Date = getCorrectedNow(),
): OccurredAtValidationResult {
	const timestamp = Date.parse(occurredAtIso);
	if (Number.isNaN(timestamp)) {
		return {
			valid: false,
			reason: "invalid_format",
			message: "Format tanggal tidak valid",
		};
	}

	const nowMs = referenceNow.getTime();
	const thirtyDaysMs = TRANSACTION_MAX_PAST_DAYS * 24 * 60 * 60 * 1000;
	const fiveMinutesMs = TRANSACTION_MAX_FUTURE_MINUTES * 60 * 1000;

	const minAllowed = nowMs - thirtyDaysMs;
	const maxAllowed = nowMs + fiveMinutesMs;

	if (timestamp < minAllowed) {
		const diffDays = Math.round((nowMs - timestamp) / (24 * 60 * 60 * 1000));
		return {
			valid: false,
			reason: "too_old",
			message: `Waktu transaksi melebihi batas ${TRANSACTION_MAX_PAST_DAYS} hari yang lalu (${diffDays} hari lalu)`,
			diffMinutes: Math.round((nowMs - timestamp) / 60000),
		};
	}

	if (timestamp > maxAllowed) {
		const diffMin = Math.round((timestamp - nowMs) / 60000);
		return {
			valid: false,
			reason: "future_timestamp",
			message: `Waktu transaksi berada di masa depan (${diffMin} menit ke depan)`,
			diffMinutes: diffMin,
		};
	}

	return { valid: true };
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
