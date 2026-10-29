import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { useDiagnosticLogs } from "../hooks/useDiagnosticLogs";
import {
	copyLogsToClipboard,
	DEFAULT_DIAGNOSTIC_LOG_CAP,
	DIAGNOSTIC_CATEGORIES,
	DIAGNOSTIC_LOG_UPDATED_EVENT,
	downloadLogsFile,
	formatDiagnosticTimestamp,
	recordDiagnosticLog,
} from "./diagnostics";

describe("Diagnostics Module & Ring-Buffer Suite (Task P5.13)", () => {
	beforeEach(async () => {
		await db.diagnostic_logs.clear();
		vi.clearAllMocks();
	});

	afterEach(async () => {
		await db.diagnostic_logs.clear();
		vi.restoreAllMocks();
	});

	describe("recordDiagnosticLog & Ring-Buffer Storage", () => {
		it("records a diagnostic log to IndexedDB and dispatches event", async () => {
			const eventListener = vi.fn();
			window.addEventListener(DIAGNOSTIC_LOG_UPDATED_EVENT, eventListener);

			const logId = await recordDiagnosticLog({
				level: "info",
				category: "SYNC_ENGINE",
				message: "Siklus sinkronisasi dimulai",
				details: { candidateCount: 3 },
			});

			expect(logId).toBeDefined();
			expect(typeof logId).toBe("number");

			const logs = await db.diagnostic_logs.toArray();
			expect(logs).toHaveLength(1);
			expect(logs[0]).toMatchObject({
				id: logId,
				level: "info",
				category: "SYNC_ENGINE",
				message: "Siklus sinkronisasi dimulai",
				details: { candidateCount: 3 },
			});
			expect(logs[0].timestamp).toBeDefined();

			expect(eventListener).toHaveBeenCalledTimes(1);
			const event = eventListener.mock.calls[0][0] as CustomEvent;
			expect(event.detail).toMatchObject({
				id: logId,
				level: "info",
				category: "SYNC_ENGINE",
			});

			window.removeEventListener(DIAGNOSTIC_LOG_UPDATED_EVENT, eventListener);
		});

		it("enforces FIFO ring-buffer cap when count exceeds maxEntries", async () => {
			// Batasi kapasitas ring-buffer menjadi 5 entri untuk pengetesan
			const MAX_ENTRIES = 5;

			for (let i = 1; i <= 8; i++) {
				await recordDiagnosticLog({
					level: "info",
					category: "SYNC_ENGINE",
					message: `Log event ke-${i}`,
					maxEntries: MAX_ENTRIES,
				});
			}

			const count = await db.getDiagnosticLogCount();
			expect(count).toBe(MAX_ENTRIES);

			const remainingLogs = await db.diagnostic_logs.orderBy("id").toArray();
			// 8 - 5 = 3 log pertama (1, 2, 3) harus sudah ter-evict; log tersisa adalah 4, 5, 6, 7, 8
			expect(remainingLogs.map((l) => l.message)).toEqual([
				"Log event ke-4",
				"Log event ke-5",
				"Log event ke-6",
				"Log event ke-7",
				"Log event ke-8",
			]);
		});

		it("has standard diagnostic categories defined", () => {
			expect(DIAGNOSTIC_CATEGORIES).toContain("SYNC_ENGINE");
			expect(DIAGNOSTIC_CATEGORIES).toContain("SYNC_SCHEDULER");
			expect(DIAGNOSTIC_CATEGORIES).toContain("TIME_SYNC");
			expect(DIAGNOSTIC_CATEGORIES).toContain("AUTH");
			expect(DIAGNOSTIC_CATEGORIES).toContain("CATALOG_SYNC");
			expect(DEFAULT_DIAGNOSTIC_LOG_CAP).toBe(100);
		});
	});

	describe("Filtering & Database Diagnostic Queries", () => {
		beforeEach(async () => {
			await recordDiagnosticLog({
				level: "info",
				category: "AUTH",
				message: "User logged in",
			});
			await recordDiagnosticLog({
				level: "warn",
				category: "SYNC_ENGINE",
				message: "Network request retry scheduled",
			});
			await recordDiagnosticLog({
				level: "error",
				category: "SYNC_ENGINE",
				message: "Network timeout 504 Gateway Timeout",
			});
		});

		it("returns accurate count via getDiagnosticLogCount", async () => {
			const count = await db.getDiagnosticLogCount();
			expect(count).toBe(3);
		});

		it("returns logs ordered newest first (reverse chronological by id)", async () => {
			const logs = await db.getDiagnosticLogs();
			expect(logs).toHaveLength(3);
			expect(logs[0].message).toBe("Network timeout 504 Gateway Timeout");
			expect(logs[2].message).toBe("User logged in");
		});

		it("filters logs by level correctly", async () => {
			const errorsOnly = await db.getDiagnosticLogs({ level: "error" });
			expect(errorsOnly).toHaveLength(1);
			expect(errorsOnly[0].message).toBe("Network timeout 504 Gateway Timeout");

			const warnsOnly = await db.getDiagnosticLogs({ level: "warn" });
			expect(warnsOnly).toHaveLength(1);
			expect(warnsOnly[0].message).toBe("Network request retry scheduled");
		});

		it("filters logs by category correctly", async () => {
			const authLogs = await db.getDiagnosticLogs({ category: "AUTH" });
			expect(authLogs).toHaveLength(1);
			expect(authLogs[0].message).toBe("User logged in");

			const syncLogs = await db.getDiagnosticLogs({ category: "SYNC_ENGINE" });
			expect(syncLogs).toHaveLength(2);
		});
	});

	describe("Export Utilities (Text & JSON)", () => {
		it("exports diagnostic logs as readable plain text with header", async () => {
			await recordDiagnosticLog({
				level: "info",
				category: "SYSTEM",
				message: "Aplikasi dimulai dalam mode offline",
				details: { version: "1.0.0", mode: "pwa" },
			});

			const text = await db.exportDiagnosticLogsAsText();
			expect(text).toContain(
				"INVENTORY PWA - LOG DIAGNOSTIK SISTEM (PT INALUM)",
			);
			expect(text).toContain("Jumlah Entri: 1 entri");
			expect(text).toContain(
				"[INFO] [SYSTEM] Aplikasi dimulai dalam mode offline",
			);
			expect(text).toContain("Payload: {");
			expect(text).toContain('"version": "1.0.0"');
		});

		it("returns fallback message when exporting empty log as text", async () => {
			const text = await db.exportDiagnosticLogsAsText();
			expect(text).toBe("=== TIDAK ADA LOG DIAGNOSTIK ===");
		});

		it("exports diagnostic logs as structured JSON with environment metadata", async () => {
			await recordDiagnosticLog({
				level: "error",
				category: "AUTH",
				message: "Token expired",
			});

			const jsonString = await db.exportDiagnosticLogsAsJson();
			const parsed = JSON.parse(jsonString);

			expect(parsed).toMatchObject({
				application: "Inventory PWA PT Inalum",
				version: "1.0.0",
				totalLogs: 1,
			});
			expect(parsed.exportedAt).toBeDefined();
			expect(parsed.environment).toBeDefined();
			expect(parsed.logs).toHaveLength(1);
			expect(parsed.logs[0].message).toBe("Token expired");
		});
	});

	describe("Clipboard, File Download & Timestamp Utilities", () => {
		it("copies text to clipboard when navigator.clipboard is available", async () => {
			const writeTextMock = vi.fn().mockResolvedValue(undefined);
			Object.defineProperty(navigator, "clipboard", {
				value: { writeText: writeTextMock },
				configurable: true,
			});

			const success = await copyLogsToClipboard("Log content sample");
			expect(success).toBe(true);
			expect(writeTextMock).toHaveBeenCalledWith("Log content sample");
		});

		it("handles clipboard failure gracefully", async () => {
			const writeTextMock = vi
				.fn()
				.mockRejectedValue(new Error("Permission denied"));
			Object.defineProperty(navigator, "clipboard", {
				value: { writeText: writeTextMock },
				configurable: true,
			});

			const success = await copyLogsToClipboard("Log content sample");
			expect(success).toBe(false);
		});

		it("downloads log file using Blob and anchor trigger", () => {
			const createObjectURLMock = vi
				.fn()
				.mockReturnValue("blob:http://localhost/dummy-url");
			const revokeObjectURLMock = vi.fn();
			window.URL.createObjectURL = createObjectURLMock;
			window.URL.revokeObjectURL = revokeObjectURLMock;

			const clickMock = vi.fn();
			const appendChildSpy = vi
				.spyOn(document.body, "appendChild")
				.mockImplementation((node) => {
					(node as HTMLAnchorElement).click = clickMock;
					return node;
				});
			const removeChildSpy = vi
				.spyOn(document.body, "removeChild")
				.mockImplementation((node) => node);

			downloadLogsFile(
				"Sample export content",
				"diagnostic-logs.txt",
				"text/plain",
			);

			expect(createObjectURLMock).toHaveBeenCalled();
			expect(appendChildSpy).toHaveBeenCalled();
			expect(clickMock).toHaveBeenCalled();
			expect(removeChildSpy).toHaveBeenCalled();
			expect(revokeObjectURLMock).toHaveBeenCalledWith(
				"blob:http://localhost/dummy-url",
			);

			appendChildSpy.mockRestore();
			removeChildSpy.mockRestore();
		});

		it("formats diagnostic timestamp with Indonesian / WIB locale representation", () => {
			const iso = "2026-10-29T10:30:45.123Z";
			const formatted = formatDiagnosticTimestamp(iso);
			expect(typeof formatted).toBe("string");
			expect(formatted.length).toBeGreaterThan(5);
		});

		it("handles invalid timestamp safely without throwing", () => {
			const invalid = "invalid-date-string";
			const result = formatDiagnosticTimestamp(invalid);
			expect(result).toBe("invalid-date-string");
		});
	});

	describe("useDiagnosticLogs React Hook", () => {
		it("loads logs and statistics on mount and reacts to update events", async () => {
			await recordDiagnosticLog({
				level: "info",
				category: "SYNC_ENGINE",
				message: "Initial log entry",
			});

			const { result } = renderHook(() => useDiagnosticLogs());

			await waitFor(() => {
				expect(result.current.isLoading).toBe(false);
			});

			expect(result.current.totalCount).toBe(1);
			expect(result.current.filteredLogs).toHaveLength(1);
			expect(result.current.stats).toMatchObject({
				total: 1,
				info: 1,
				warn: 0,
				error: 0,
			});

			// Simulasi event update baru
			await act(async () => {
				await recordDiagnosticLog({
					level: "error",
					category: "CATALOG_SYNC",
					message: "Catalog fetch failed with 500",
				});
			});

			await waitFor(() => {
				expect(result.current.totalCount).toBe(2);
			});
			expect(result.current.stats.error).toBe(1);
			expect(result.current.stats.info).toBe(1);
		});

		it("filters logs by level, category, and text search query", async () => {
			await recordDiagnosticLog({
				level: "info",
				category: "AUTH",
				message: "PIN verified successfully",
			});
			await recordDiagnosticLog({
				level: "warn",
				category: "SYNC_ENGINE",
				message: "Item outbox retry delayed by backoff",
			});
			await recordDiagnosticLog({
				level: "error",
				category: "CATALOG_SYNC",
				message: "Failed to parse item master payload",
				details: { errorCode: "ERR_PARSE_JSON" },
			});

			const { result } = renderHook(() => useDiagnosticLogs());

			await waitFor(() => {
				expect(result.current.totalCount).toBe(3);
			});

			// Filter by level: error
			act(() => {
				result.current.setLevelFilter("error");
			});
			expect(result.current.filteredLogs).toHaveLength(1);
			expect(result.current.filteredLogs[0].category).toBe("CATALOG_SYNC");

			// Reset level, filter by category: SYNC_ENGINE
			act(() => {
				result.current.setLevelFilter("all");
				result.current.setCategoryFilter("SYNC_ENGINE");
			});
			expect(result.current.filteredLogs).toHaveLength(1);
			expect(result.current.filteredLogs[0].message).toContain("backoff");

			// Reset category, search query on JSON details
			act(() => {
				result.current.setCategoryFilter("all");
				result.current.setSearchQuery("ERR_PARSE_JSON");
			});
			expect(result.current.filteredLogs).toHaveLength(1);
			expect(result.current.filteredLogs[0].message).toContain(
				"Failed to parse",
			);

			// Search query with no match
			act(() => {
				result.current.setSearchQuery("nonexistent_keyword_xyz");
			});
			expect(result.current.filteredLogs).toHaveLength(0);
		});

		it("clears logs and resets state when clearLogs is called", async () => {
			await recordDiagnosticLog({
				level: "info",
				category: "SYSTEM",
				message: "Log to be cleared",
			});

			const { result } = renderHook(() => useDiagnosticLogs());

			await waitFor(() => {
				expect(result.current.totalCount).toBe(1);
			});

			await act(async () => {
				await result.current.clearLogs();
			});

			await waitFor(() => {
				expect(result.current.totalCount).toBe(0);
			});
			expect(result.current.filteredLogs).toHaveLength(0);
			expect(result.current.stats.total).toBe(0);
		});
	});
});
