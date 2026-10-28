import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	getCorrectedNow,
	getServerTimeOffset,
	isTimestampWithinAcceptableWindow,
	resetServerTimeOffset,
	SERVER_TIME_OFFSET_STORAGE_KEY,
	setServerTimeOffset,
} from "@/lib/time";
import {
	buildOutboxItem,
	buildTransactionPayload,
	generateClientUuid,
	getOccurredAt,
	isValidClientUuid,
} from "./lib/transactionIdentity";
import type { TransactionFormData } from "./lib/transactionSchema";

describe("Transaction Identity & Clock Skew Correction (Task P3.3)", () => {
	beforeEach(() => {
		localStorage.clear();
		resetServerTimeOffset();
	});

	afterEach(() => {
		vi.restoreAllMocks();
		resetServerTimeOffset();
	});

	describe("UUID v4 Generation & Validation", () => {
		it("generates a valid RFC 4122 v4 UUID using crypto.randomUUID()", () => {
			const uuid = generateClientUuid();
			expect(typeof uuid).toBe("string");
			expect(isValidClientUuid(uuid)).toBe(true);

			// Check RFC 4122 v4 structure: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
			const parts = uuid.split("-");
			expect(parts).toHaveLength(5);
			expect(parts[0]).toHaveLength(8);
			expect(parts[1]).toHaveLength(4);
			expect(parts[2]).toHaveLength(4);
			expect(parts[2].startsWith("4")).toBe(true); // Version 4
			expect(["8", "9", "a", "b"]).toContain(parts[3][0].toLowerCase()); // Variant RFC 4122
			expect(parts[4]).toHaveLength(12);
		});

		it("generates unique UUIDs on consecutive invocations", () => {
			const set = new Set<string>();
			for (let i = 0; i < 50; i++) {
				const uuid = generateClientUuid();
				expect(set.has(uuid)).toBe(false);
				set.add(uuid);
			}
			expect(set.size).toBe(50);
		});

		it("falls back to getRandomValues when crypto.randomUUID is undefined", () => {
			const originalRandomUUID = globalThis.crypto.randomUUID;
			try {
				// Simulate environment without randomUUID
				// @ts-expect-error deliberately setting to undefined
				globalThis.crypto.randomUUID = undefined;

				const uuid = generateClientUuid();
				expect(isValidClientUuid(uuid)).toBe(true);
				expect(uuid.split("-")[2].startsWith("4")).toBe(true);
			} finally {
				globalThis.crypto.randomUUID = originalRandomUUID;
			}
		});

		it("validates UUID v4 strings strictly with isValidClientUuid", () => {
			// Valid UUIDs
			expect(isValidClientUuid("c8a24558-7561-460d-9ff8-f4f71fb13ec4")).toBe(
				true,
			);
			expect(isValidClientUuid("C8A24558-7561-460D-9FF8-F4F71FB13EC4")).toBe(
				true,
			); // Case insensitive

			// Invalid: Nil UUID (version is 0, not 4)
			expect(isValidClientUuid("00000000-0000-0000-0000-000000000000")).toBe(
				false,
			);

			// Invalid: Wrong version (version 1)
			expect(isValidClientUuid("c8a24558-7561-160d-9ff8-f4f71fb13ec4")).toBe(
				false,
			);

			// Invalid: Wrong variant ('c' is not 8, 9, a, b)
			expect(isValidClientUuid("c8a24558-7561-460d-cff8-f4f71fb13ec4")).toBe(
				false,
			);

			// Invalid: Garbage strings and non-string inputs
			expect(isValidClientUuid("invalid-uuid-string")).toBe(false);
			expect(isValidClientUuid("")).toBe(false);
			expect(isValidClientUuid(null)).toBe(false);
			expect(isValidClientUuid(undefined)).toBe(false);
			expect(isValidClientUuid(123456)).toBe(false);
		});
	});

	describe("Server Time Skew Correction & occurred_at", () => {
		it("calculates server offset accurately from HTTP Date header and persists to localStorage", () => {
			expect(getServerTimeOffset()).toBe(0);

			// Server is 60,000 ms (1 minute) ahead of client
			const futureDate = new Date(Date.now() + 60000);
			setServerTimeOffset(futureDate.toUTCString());

			const offset = getServerTimeOffset();
			// Toleransi 1000ms untuk eksekusi instruksi
			expect(offset).toBeGreaterThanOrEqual(59000);
			expect(offset).toBeLessThanOrEqual(61000);

			// Verifikasi persistensi di localStorage
			const stored = localStorage.getItem(SERVER_TIME_OFFSET_STORAGE_KEY);
			expect(stored).toBe(String(offset));

			// Verifikasi getCorrectedNow()
			const corrected = getCorrectedNow();
			expect(corrected.getTime()).toBeGreaterThan(Date.now() + 50000);
		});

		it("resets server time offset cleanly", () => {
			setServerTimeOffset(new Date(Date.now() + 30000).toUTCString());
			expect(getServerTimeOffset()).not.toBe(0);

			resetServerTimeOffset();
			expect(getServerTimeOffset()).toBe(0);
			expect(localStorage.getItem(SERVER_TIME_OFFSET_STORAGE_KEY)).toBeNull();
		});

		it("validates acceptable timestamp window (<= 30 days ago, <= +5 minutes future)", () => {
			const now = new Date();

			// 1. Current time is valid
			expect(isTimestampWithinAcceptableWindow(now.toISOString(), now)).toBe(
				true,
			);

			// 2. 10 days ago is valid
			const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
			expect(
				isTimestampWithinAcceptableWindow(tenDaysAgo.toISOString(), now),
			).toBe(true);

			// 3. Exactly 30 days ago is valid
			const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
			expect(
				isTimestampWithinAcceptableWindow(thirtyDaysAgo.toISOString(), now),
			).toBe(true);

			// 4. 31 days ago is rejected (> 30 days)
			const thirtyOneDaysAgo = new Date(
				now.getTime() - 31 * 24 * 60 * 60 * 1000,
			);
			expect(
				isTimestampWithinAcceptableWindow(thirtyOneDaysAgo.toISOString(), now),
			).toBe(false);

			// 5. 3 minutes in future is valid (network drift tolerance)
			const threeMinsFuture = new Date(now.getTime() + 3 * 60 * 1000);
			expect(
				isTimestampWithinAcceptableWindow(threeMinsFuture.toISOString(), now),
			).toBe(true);

			// 6. 6 minutes in future is rejected (> +5 minutes drift)
			const sixMinsFuture = new Date(now.getTime() + 6 * 60 * 1000);
			expect(
				isTimestampWithinAcceptableWindow(sixMinsFuture.toISOString(), now),
			).toBe(false);

			// 7. Invalid string returns false
			expect(isTimestampWithinAcceptableWindow("not-a-date", now)).toBe(false);
		});

		it("getOccurredAt returns a valid ISO string aligned with corrected time", () => {
			const occurredAt = getOccurredAt();
			expect(typeof occurredAt).toBe("string");
			expect(new Date(occurredAt).toISOString()).toBe(occurredAt);
			expect(isTimestampWithinAcceptableWindow(occurredAt)).toBe(true);
		});
	});

	describe("Transaction Payload & Outbox Builders", () => {
		const sampleForm: TransactionFormData = {
			quantity: 5,
			notes: "Audit lapangan PLTA",
			reference_number: "ND-2026/01",
		};

		it("buildTransactionPayload generates fresh UUID and occurred_at by default", () => {
			const payload = buildTransactionPayload(sampleForm);

			expect(isValidClientUuid(payload.client_uuid)).toBe(true);
			expect(payload.quantity).toBe(5);
			expect(payload.notes).toBe("Audit lapangan PLTA");
			expect(payload.reference_number).toBe("ND-2026/01");
			expect(typeof payload.occurred_at).toBe("string");
			expect(isTimestampWithinAcceptableWindow(payload.occurred_at ?? "")).toBe(
				true,
			);
		});

		it("buildTransactionPayload accepts custom clientUuid and occurredAt for idempotent re-sends", () => {
			const customUuid = "e7b0c3d4-28e4-4a25-a4b5-6f8b9e1c2d3e";
			const customTime = "2026-10-27T08:00:00.000Z";

			const payload = buildTransactionPayload(sampleForm, {
				customClientUuid: customUuid,
				customOccurredAt: customTime,
			});

			expect(payload.client_uuid).toBe(customUuid);
			expect(payload.occurred_at).toBe(customTime);
		});

		it("buildOutboxItem creates a complete OutboxItem ready for Dexie IndexedDB", () => {
			const outboxItem = buildOutboxItem({
				employeeId: "01JEMP001AUDIT",
				operation: "take",
				itemId: "01JITEM001PPR",
				quantity: 3,
				notes: "Kertas cetak laporan",
				referenceNumber: "AUD/X/01",
			});

			expect(isValidClientUuid(outboxItem.clientUuid)).toBe(true);
			expect(outboxItem.employeeId).toBe("01JEMP001AUDIT");
			expect(outboxItem.operation).toBe("take");
			expect(outboxItem.itemId).toBe("01JITEM001PPR");
			expect(outboxItem.quantity).toBe(3);
			expect(outboxItem.notes).toBe("Kertas cetak laporan");
			expect(outboxItem.referenceNumber).toBe("AUD/X/01");
			expect(outboxItem.status).toBe("pending");
			expect(outboxItem.attempts).toBe(0);
			expect(outboxItem.nextAttemptAt).toBeNull();
			expect(outboxItem.lastError).toBeNull();
			expect(typeof outboxItem.occurredAt).toBe("string");
			expect(typeof outboxItem.createdAt).toBe("string");
		});

		it("buildOutboxItem sanitizes null/undefined notes and reference numbers", () => {
			const outboxItem = buildOutboxItem({
				employeeId: "01JEMP001AUDIT",
				operation: "borrow",
				itemId: "01JITEM002AST",
				quantity: 1,
			});

			expect(outboxItem.notes).toBeNull();
			expect(outboxItem.referenceNumber).toBeNull();
		});
	});
});
