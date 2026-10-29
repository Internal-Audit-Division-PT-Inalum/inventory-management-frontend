import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useServerTimeOffset } from "@/features/sync";
import { db } from "./db";
import {
	calculateOffsetFromHeader,
	getClockSkewInfo,
	getCorrectedIsoString,
	getCorrectedNow,
	getServerTimeOffset,
	initServerTimeOffset,
	isClockSkewSignificant,
	isTimestampWithinAcceptableWindow,
	resetServerTimeOffset,
	SERVER_TIME_OFFSET_STORAGE_KEY,
	SERVER_TIME_SYNCED_EVENT,
	setServerTimeOffset,
	TRANSACTION_MAX_FUTURE_MINUTES,
	TRANSACTION_MAX_PAST_DAYS,
	validateOccurredAt,
} from "./time";

describe("Task P5.7: Server Clock Skew Correction & Time Utilities", () => {
	beforeEach(async () => {
		localStorage.clear();
		await db.meta.clear();
		await db.diagnostic_logs.clear();
		resetServerTimeOffset();
		vi.restoreAllMocks();
	});

	afterEach(() => {
		localStorage.clear();
		resetServerTimeOffset();
		vi.restoreAllMocks();
	});

	describe("Offset Calculation & RTT Compensation", () => {
		it("menghitung offset waktu server standar dari header Date", () => {
			const clientNow = 1_700_000_000_000;
			vi.spyOn(Date, "now").mockReturnValue(clientNow);

			// Server lebih cepat 5 menit (300.000 ms)
			const serverTime = clientNow + 300_000;
			const serverDateHeader = new Date(serverTime).toUTCString();

			const offset = calculateOffsetFromHeader(serverDateHeader, {
				responseTime: clientNow,
			});

			expect(offset).toBe(300_000);
		});

		it("memperhitungkan kompensasi Network RTT saat requestStartTime tersedia", () => {
			const requestStartTime = 1_700_000_000_000;
			const responseTime = 1_700_000_000_400; // RTT = 400ms
			// Estimasi client time adalah titik tengah = 1_700_000_000_200
			const serverTime = 1_700_000_001_000; // Server 800ms lebih cepat dari titik tengah
			const serverDateHeader = new Date(serverTime).toUTCString();

			const offset = calculateOffsetFromHeader(serverDateHeader, {
				requestStartTime,
				responseTime,
			});

			// 1_700_000_001_000 - 1_700_000_000_200 = 800 ms
			expect(offset).toBe(800);
		});

		it("mengembalikan null jika format header Date rusak/invalid", () => {
			expect(calculateOffsetFromHeader("invalid-date-string")).toBeNull();
			expect(calculateOffsetFromHeader("")).toBeNull();
		});
	});

	describe("setServerTimeOffset & Dual-Layer Persistence", () => {
		it("memperbarui in-memory offset dan menyimpannya ke localStorage dan Dexie db.meta", async () => {
			const clientNow = 1_700_000_000_000;
			vi.spyOn(Date, "now").mockReturnValue(clientNow);

			const serverTime = clientNow + 120_000; // +2 menit
			const serverDateHeader = new Date(serverTime).toUTCString();

			const newOffset = setServerTimeOffset(serverDateHeader, {
				responseTime: clientNow,
			});

			expect(newOffset).toBe(120_000);
			expect(getServerTimeOffset()).toBe(120_000);

			// Verifikasi persistensi di localStorage
			expect(localStorage.getItem(SERVER_TIME_OFFSET_STORAGE_KEY)).toBe(
				"120000",
			);

			// Tunggu penulisan asinkron ke Dexie db.meta
			const metaRecord = await db.meta.get(SERVER_TIME_OFFSET_STORAGE_KEY);
			expect(metaRecord).toBeDefined();
			expect(metaRecord?.value).toBe("120000");
		});

		it("initServerTimeOffset memulihkan offset dari Dexie jika in-memory bernilai 0", async () => {
			resetServerTimeOffset();
			localStorage.clear();

			// Simulasikan record sudah ada di Dexie db.meta
			await db.meta.put({
				key: SERVER_TIME_OFFSET_STORAGE_KEY,
				value: "45000",
				updatedAt: new Date().toISOString(),
			});

			expect(getServerTimeOffset()).toBe(0);

			const restored = await initServerTimeOffset();
			expect(restored).toBe(45_000);
			expect(getServerTimeOffset()).toBe(45_000);
		});

		it("resetServerTimeOffset membersihkan memory, localStorage, dan db.meta", async () => {
			setServerTimeOffset(new Date(Date.now() + 10_000).toUTCString());
			expect(getServerTimeOffset()).not.toBe(0);

			resetServerTimeOffset();
			expect(getServerTimeOffset()).toBe(0);
			expect(localStorage.getItem(SERVER_TIME_OFFSET_STORAGE_KEY)).toBeNull();
		});
	});

	describe("Significant Clock Skew Detection & Diagnostic Logging", () => {
		it("mendeteksi pergeseran jam signifikan (>= 60 detik) dan mencatat diagnostic log", async () => {
			const clientNow = 1_700_000_000_000;
			vi.spyOn(Date, "now").mockReturnValue(clientNow);

			// Server lebih cepat 90 detik (> 60 detik ambang batas)
			const serverTime = clientNow + 90_000;
			const serverDateHeader = new Date(serverTime).toUTCString();

			setServerTimeOffset(serverDateHeader, { responseTime: clientNow });

			expect(isClockSkewSignificant()).toBe(true);

			const info = getClockSkewInfo();
			expect(info.isSkewed).toBe(true);
			expect(info.offsetSeconds).toBe(90);
			expect(info.formattedDescription).toContain(
				"lebih lambat 90 detik dari server",
			);

			// Verifikasi log diagnostik tercatat di db.diagnostic_logs
			const logs = await db.getDiagnosticLogs(5);
			const timeLog = logs.find(
				(l) => l.category === "TIME_SYNC" && l.level === "warn",
			);
			expect(timeLog).toBeDefined();
			expect(timeLog?.message).toContain(
				"Significant clock skew detected: 90s",
			);
		});

		it("menandai waktu selaras ketika pergeseran di bawah ambang batas (misal 5 detik)", () => {
			const clientNow = 1_700_000_000_000;
			vi.spyOn(Date, "now").mockReturnValue(clientNow);

			const serverTime = clientNow + 5_000;
			setServerTimeOffset(new Date(serverTime).toUTCString(), {
				responseTime: clientNow,
				skipDiagnosticLog: true,
			});

			expect(isClockSkewSignificant()).toBe(false);
			const info = getClockSkewInfo();
			expect(info.isSkewed).toBe(false);
			expect(info.formattedDescription).toBe(
				"Waktu perangkat selaras dengan server",
			);
		});
	});

	describe("Event Broadcasting", () => {
		it("menyiarkan event global SERVER_TIME_SYNCED_EVENT saat offset diperbarui", () => {
			const eventListener = vi.fn();
			window.addEventListener(SERVER_TIME_SYNCED_EVENT, eventListener);

			try {
				const clientNow = 1_700_000_000_000;
				vi.spyOn(Date, "now").mockReturnValue(clientNow);

				const serverTime = clientNow + 15_000;
				setServerTimeOffset(new Date(serverTime).toUTCString(), {
					responseTime: clientNow,
				});

				expect(eventListener).toHaveBeenCalledTimes(1);
			} finally {
				window.removeEventListener(SERVER_TIME_SYNCED_EVENT, eventListener);
			}
		});
	});

	describe("Corrected Time & ISO Generation", () => {
		it("getCorrectedNow dan getCorrectedIsoString mengembalikan waktu yang telah digeser offset", () => {
			const clientNow = 1_700_000_000_000;
			vi.spyOn(Date, "now").mockReturnValue(clientNow);

			// Offset +60.000 ms
			setServerTimeOffset(new Date(clientNow + 60_000).toUTCString(), {
				responseTime: clientNow,
				skipDiagnosticLog: true,
			});

			const correctedNow = getCorrectedNow();
			expect(correctedNow.getTime()).toBe(clientNow + 60_000);

			const correctedIso = getCorrectedIsoString();
			expect(correctedIso).toBe(new Date(clientNow + 60_000).toISOString());
		});
	});

	describe("Transaction OccurredAt Window Validation", () => {
		const baseNow = new Date("2026-10-28T12:00:00Z");

		it("menerima waktu transaksi saat ini atau dalam rentang wajar", () => {
			// Tepat saat ini
			expect(validateOccurredAt(baseNow.toISOString(), baseNow).valid).toBe(
				true,
			);

			// 2 hari lalu (< 30 hari)
			const twoDaysAgo = new Date(baseNow.getTime() - 2 * 24 * 60 * 60 * 1000);
			expect(validateOccurredAt(twoDaysAgo.toISOString(), baseNow).valid).toBe(
				true,
			);
			expect(
				isTimestampWithinAcceptableWindow(twoDaysAgo.toISOString(), baseNow),
			).toBe(true);

			// 3 menit ke depan (< 5 menit toleransi)
			const threeMinutesFuture = new Date(baseNow.getTime() + 3 * 60 * 1000);
			expect(
				validateOccurredAt(threeMinutesFuture.toISOString(), baseNow).valid,
			).toBe(true);
		});

		it("menolak transaksi yang lebih tua dari 30 hari (too_old)", () => {
			const thirtyOneDaysAgo = new Date(
				baseNow.getTime() -
					(TRANSACTION_MAX_PAST_DAYS + 1) * 24 * 60 * 60 * 1000,
			);
			const result = validateOccurredAt(
				thirtyOneDaysAgo.toISOString(),
				baseNow,
			);

			expect(result.valid).toBe(false);
			expect(result.reason).toBe("too_old");
			expect(result.message).toContain("melebihi batas 30 hari");
			expect(
				isTimestampWithinAcceptableWindow(
					thirtyOneDaysAgo.toISOString(),
					baseNow,
				),
			).toBe(false);
		});

		it("menolak transaksi yang berada lebih dari 5 menit di masa depan (future_timestamp)", () => {
			const sixMinutesFuture = new Date(
				baseNow.getTime() + (TRANSACTION_MAX_FUTURE_MINUTES + 1) * 60 * 1000,
			);
			const result = validateOccurredAt(
				sixMinutesFuture.toISOString(),
				baseNow,
			);

			expect(result.valid).toBe(false);
			expect(result.reason).toBe("future_timestamp");
			expect(result.message).toContain("berada di masa depan");
			expect(
				isTimestampWithinAcceptableWindow(
					sixMinutesFuture.toISOString(),
					baseNow,
				),
			).toBe(false);
		});

		it("menolak format tanggal yang tidak valid (invalid_format)", () => {
			const result = validateOccurredAt("bukan-tanggal", baseNow);
			expect(result.valid).toBe(false);
			expect(result.reason).toBe("invalid_format");
		});
	});

	describe("useServerTimeOffset React Hook", () => {
		it("menyediakan state reaktif offset jam server dan refresh method", () => {
			const { result } = renderHook(() => useServerTimeOffset());

			expect(result.current.offsetMs).toBe(0);
			expect(result.current.isSkewed).toBe(false);

			// Simulasikan event server time sync
			act(() => {
				const clientNow = 1_700_000_000_000;
				vi.spyOn(Date, "now").mockReturnValue(clientNow);
				setServerTimeOffset(new Date(clientNow + 95_000).toUTCString(), {
					responseTime: clientNow,
					skipDiagnosticLog: true,
				});
			});

			expect(result.current.offsetMs).toBe(95_000);
			expect(result.current.isSkewed).toBe(true);
			expect(result.current.offsetSeconds).toBe(95);

			// Test refresh()
			act(() => {
				resetServerTimeOffset();
				result.current.refresh();
			});

			expect(result.current.offsetMs).toBe(0);
			expect(result.current.isSkewed).toBe(false);
		});
	});
});
