import { db } from "./db";

export const SERVER_TIME_OFFSET_STORAGE_KEY = "inventory_server_time_offset_ms";
export const SERVER_TIME_SYNCED_EVENT = "inventory:server-time-synced";

/** Threshold in milliseconds considered a significant clock skew (60 seconds) */
export const SIGNIFICANT_CLOCK_SKEW_THRESHOLD_MS = 60_000;

/** Maximum allowed transaction age in the past (30 days per backend validation) */
export const TRANSACTION_MAX_PAST_DAYS = 30;

/** Maximum allowed transaction timestamp ahead in the future (5 minutes per backend validation) */
export const TRANSACTION_MAX_FUTURE_MINUTES = 5;

export interface SetServerTimeOffsetOptions {
	requestStartTime?: number;
	responseTime?: number;
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
		// Suppress storage access errors in private/sandboxed modes
	}
	return 0;
}

let serverTimeOffsetMs = loadInitialServerOffset();

/**
 * Calculates time offset between server and client from the HTTP 'Date' response header.
 * Applies network round-trip time (RTT) compensation for sub-second synchronization.
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
		clientReferenceTime = Math.round((requestStartTime + responseTime) / 2);
	}

	return serverTimestamp - clientReferenceTime;
}

/**
 * Updates the client-to-server clock skew offset from an HTTP Date header.
 * Persists the offset to dual-layer storage (localStorage and Dexie db.meta).
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

	try {
		if (typeof window !== "undefined" && window.localStorage) {
			localStorage.setItem(
				SERVER_TIME_OFFSET_STORAGE_KEY,
				String(serverTimeOffsetMs),
			);
		}
	} catch {
		// Suppress storage write errors
	}

	try {
		db.meta
			.put({
				key: SERVER_TIME_OFFSET_STORAGE_KEY,
				value: String(serverTimeOffsetMs),
				updatedAt: new Date().toISOString(),
			})
			.catch(() => {});
	} catch {
		// Suppress database transaction errors when unready
	}

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
 * Asynchronously initializes server time offset from IndexedDB when localStorage is empty.
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
		// Suppress database lookup errors
	}

	return 0;
}

/**
 * Resets the in-memory and persistent server time offset back to zero.
 */
export function resetServerTimeOffset(): void {
	serverTimeOffsetMs = 0;
	try {
		if (typeof window !== "undefined" && window.localStorage) {
			localStorage.removeItem(SERVER_TIME_OFFSET_STORAGE_KEY);
		}
	} catch {
		// Suppress
	}
	try {
		db.meta.delete(SERVER_TIME_OFFSET_STORAGE_KEY).catch(() => {});
	} catch {
		// Suppress
	}
}

/**
 * Returns the current server time offset in milliseconds.
 */
export function getServerTimeOffset(): number {
	return serverTimeOffsetMs;
}

/**
 * Checks whether device clock skew exceeds the specified significance threshold.
 */
export function isClockSkewSignificant(
	thresholdMs: number = SIGNIFICANT_CLOCK_SKEW_THRESHOLD_MS,
): boolean {
	return Math.abs(serverTimeOffsetMs) >= thresholdMs;
}

/**
 * Retrieves comprehensive diagnostic information regarding device clock skew.
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
 * Produces a Date instance adjusted with the current server time offset.
 */
export function getCorrectedNow(): Date {
	return new Date(Date.now() + serverTimeOffsetMs);
}

/**
 * Generates an ISO-8601 string of current time adjusted with server clock offset.
 */
export function getCorrectedIsoString(): string {
	return getCorrectedNow().toISOString();
}

/**
 * Validates whether a transaction timestamp falls within acceptable backend windows
 * (>= 30 days in the past and <= +5 minutes in the future).
 */
export function isTimestampWithinAcceptableWindow(
	isoString: string,
	referenceNow: Date = getCorrectedNow(),
): boolean {
	return validateOccurredAt(isoString, referenceNow).valid;
}

/**
 * Detailed validation of transaction occurred_at timestamp with actionable error reasons.
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
 * Formats date into Western Indonesia Time (WIB) representation.
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
 * Produces relative elapsed time representation (e.g., "Baru saja", "5 mnt lalu").
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
