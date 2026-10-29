import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/features/auth/store/authStore";
import { processPendingOutboxEntry } from "@/features/transactions/lib/outboxQueue";
import { db, type OutboxItem } from "@/lib/db";
import type { Item } from "@/types/api";
import {
	calculateBackoffDelay,
	calculateNextAttemptAt,
	parseRetryAfterHeader,
} from "./backoff";
import { classifySyncResponse } from "./responseClassifier";
import { runSyncEngine } from "./syncEngine";
import { SYNC_PAUSE_EVENT, syncPauseController } from "./syncPauseController";

describe("Response Classification, Exponential Backoff & Auth Pause (Task P5.4)", () => {
	const mockItem: Item = {
		id: "item-p54-1",
		sku: "SKU-P54",
		name: "Kabel UTP Cat6",
		type: "consumable",
		unit: "meter",
		location_id: "loc-1",
		current_stock: 100,
		minimum_stock: 20,
		image_url: null,
		updated_at: "2026-10-28T00:00:00Z",
	};

	beforeEach(async () => {
		await db.items.clear();
		await db.outbox.clear();
		await db.diagnostic_logs.clear();
		await db.items.add(mockItem);
		syncPauseController.resume();
		vi.clearAllMocks();
	});

	afterEach(() => {
		syncPauseController.resume();
		vi.restoreAllMocks();
	});

	describe("1. Exponential Backoff & Full Jitter", () => {
		it("calculates deterministic exponential delay when jitter is 'none'", () => {
			expect(
				calculateBackoffDelay(0, {
					jitter: "none",
					baseDelayMs: 1000,
					factor: 2,
				}),
			).toBe(1000);
			expect(
				calculateBackoffDelay(1, {
					jitter: "none",
					baseDelayMs: 1000,
					factor: 2,
				}),
			).toBe(2000);
			expect(
				calculateBackoffDelay(2, {
					jitter: "none",
					baseDelayMs: 1000,
					factor: 2,
				}),
			).toBe(4000);
			expect(
				calculateBackoffDelay(3, {
					jitter: "none",
					baseDelayMs: 1000,
					factor: 2,
				}),
			).toBe(8000);
		});

		it("caps exponential delay at maxDelayMs", () => {
			const delay = calculateBackoffDelay(10, {
				jitter: "none",
				baseDelayMs: 1000,
				maxDelayMs: 30000,
				factor: 2,
			});
			expect(delay).toBe(30000);
		});

		it("applies full jitter using randomFn", () => {
			// With randomFn returning 0.5, delay should be 50% of the exponential cap
			const delayHalf = calculateBackoffDelay(2, {
				jitter: "full",
				baseDelayMs: 1000,
				factor: 2,
				randomFn: () => 0.5,
			});
			// 1000 * 2^2 = 4000. 4000 * 0.5 = 2000
			expect(delayHalf).toBe(2000);

			// With randomFn returning 0, delay is 0
			const delayZero = calculateBackoffDelay(3, {
				jitter: "full",
				baseDelayMs: 1000,
				randomFn: () => 0,
			});
			expect(delayZero).toBe(0);
		});

		it("calculates nextAttemptAt ISO timestamp accurately", () => {
			const nowMs = new Date("2026-10-28T10:00:00.000Z").getTime();
			const iso = calculateNextAttemptAt(
				1,
				{
					jitter: "none",
					baseDelayMs: 5000,
					factor: 2,
				},
				nowMs,
			);
			// 5000 * 2^1 = 10000ms (10 seconds)
			expect(iso).toBe(new Date("2026-10-28T10:00:10.000Z").toISOString());
		});

		it("parses Retry-After header for integer seconds and HTTP dates", () => {
			const nowMs = new Date("2026-10-28T10:00:00.000Z").getTime();

			// Integer seconds
			expect(parseRetryAfterHeader("30", nowMs)).toBe(30000);
			expect(parseRetryAfterHeader(60, nowMs)).toBe(60000);

			// HTTP-Date
			const futureDate = "Wed, 28 Oct 2026 10:02:00 GMT"; // 120 seconds ahead
			expect(parseRetryAfterHeader(futureDate, nowMs)).toBe(120000);

			// Invalid or null
			expect(parseRetryAfterHeader(null, nowMs)).toBeNull();
			expect(parseRetryAfterHeader("", nowMs)).toBeNull();
			expect(parseRetryAfterHeader("invalid-date", nowMs)).toBeNull();
		});
	});

	describe("2. Response Classifier", () => {
		it("classifies standard 200/201 response as 'success'", () => {
			const res = {
				success: true,
				data: { id: "item-1" },
				message: "Sukses",
			};
			const classification = classifySyncResponse(res);
			expect(classification.action).toBe("success");
			expect(classification.code).toBe("SUCCESS");
			expect(classification.isFatal).toBe(false);
			expect(classification.isRetryable).toBe(false);
			expect(classification.isReplayed).toBe(false);
		});

		it("classifies idempotent replayed response as 'success' with isReplayed true", () => {
			const res = {
				success: true,
				meta: { replayed: true },
				message: "Transaksi telah tercatat sebelumnya",
			};
			const classification = classifySyncResponse(res);
			expect(classification.action).toBe("success");
			expect(classification.code).toBe("REPLAYED");
			expect(classification.isReplayed).toBe(true);
		});

		it("classifies 401 Unauthorized as 'pause_auth'", () => {
			const err401 = {
				isAxiosError: true,
				response: {
					status: 401,
					data: {
						success: false,
						message: "Sesi kerja Anda telah berakhir.",
						meta: { code: "UNAUTHENTICATED" },
					},
				},
			};
			const classification = classifySyncResponse(err401);
			expect(classification.action).toBe("pause_auth");
			expect(classification.code).toBe("UNAUTHENTICATED");
			expect(classification.isAuth).toBe(true);
			expect(classification.isFatal).toBe(false);
		});

		it("classifies 422 business rejection (INSUFFICIENT_STOCK) as 'reject'", () => {
			const err422 = {
				isAxiosError: true,
				response: {
					status: 422,
					data: {
						success: false,
						message: "Stok fisik barang tidak mencukupi",
						meta: { code: "INSUFFICIENT_STOCK" },
					},
				},
			};
			const classification = classifySyncResponse(err422);
			expect(classification.action).toBe("reject");
			expect(classification.code).toBe("INSUFFICIENT_STOCK");
			expect(classification.isFatal).toBe(true);
			expect(classification.isRetryable).toBe(false);
		});

		it("classifies 409 conflict (IDEMPOTENCY_CONFLICT) as 'reject'", () => {
			const err409 = {
				isAxiosError: true,
				response: {
					status: 409,
					data: {
						success: false,
						meta: { code: "IDEMPOTENCY_CONFLICT" },
					},
				},
			};
			const classification = classifySyncResponse(err409);
			expect(classification.action).toBe("reject");
			expect(classification.isFatal).toBe(true);
		});

		it("classifies 429 Too Many Requests as 'retry' and parses Retry-After header", () => {
			const err429 = {
				isAxiosError: true,
				response: {
					status: 429,
					headers: { "retry-after": "45" },
					data: {
						success: false,
						message: "Rate limit exceeded",
						meta: { code: "RATE_LIMIT_EXCEEDED" },
					},
				},
			};
			const classification = classifySyncResponse(err429);
			expect(classification.action).toBe("retry");
			expect(classification.code).toBe("RATE_LIMIT_EXCEEDED");
			expect(classification.isRetryable).toBe(true);
			expect(classification.retryAfterMs).toBe(45000);
		});

		it("classifies 500 server error and network failures as 'retry'", () => {
			const err500 = {
				isAxiosError: true,
				response: {
					status: 500,
					data: { message: "Internal Server Error" },
				},
			};
			const classification500 = classifySyncResponse(err500);
			expect(classification500.action).toBe("retry");
			expect(classification500.isRetryable).toBe(true);

			const netErr = new TypeError("Failed to fetch");
			const classificationNet = classifySyncResponse(netErr);
			expect(classificationNet.action).toBe("retry");
			expect(classificationNet.code).toBe("NETWORK_ERROR");
			expect(classificationNet.isRetryable).toBe(true);
		});
	});

	describe("3. SyncPauseController", () => {
		it("manages pause and resume states and dispatches SYNC_PAUSE_EVENT", () => {
			const dispatchSpy = vi.spyOn(window, "dispatchEvent");
			const listener = vi.fn();
			const unsubscribe = syncPauseController.subscribe(listener);

			expect(syncPauseController.isPaused()).toBe(false);

			// Pause
			syncPauseController.pause("401 Unauthorized Sesi Habis");
			expect(syncPauseController.isPaused()).toBe(true);
			expect(syncPauseController.getReason()).toBe(
				"401 Unauthorized Sesi Habis",
			);
			expect(syncPauseController.getPausedAt()).toBeDefined();
			expect(dispatchSpy).toHaveBeenCalledWith(
				expect.objectContaining({ type: SYNC_PAUSE_EVENT }),
			);

			// Resume
			syncPauseController.resume();
			expect(syncPauseController.isPaused()).toBe(false);
			expect(syncPauseController.getReason()).toBeNull();
			expect(syncPauseController.getPausedAt()).toBeNull();

			unsubscribe();
		});
	});

	describe("4. End-to-End Outbox & Sync Engine Integration", () => {
		it("calculates nextAttemptAt on retryable network error in processPendingOutboxEntry", async () => {
			const outboxItem: OutboxItem = {
				clientUuid: "retry-backoff-1",
				employeeId: "emp-1",
				operation: "take",
				itemId: mockItem.id,
				quantity: 5,
				occurredAt: "2026-10-28T10:00:00Z",
				createdAt: "2026-10-28T10:00:00Z",
				status: "pending",
				attempts: 0,
			};
			await db.outbox.add(outboxItem);

			// Mock transactItemApi with network error
			const netErr = new Error("Network Error");
			vi.spyOn(
				await import("@/features/transactions/api/transactItem"),
				"transactItemApi",
			).mockRejectedValueOnce(netErr);

			const result = await processPendingOutboxEntry(outboxItem);
			expect(result.queued).toBe(true);
			expect(result.synced).toBe(false);

			const updated = await db.outbox.get("retry-backoff-1");
			expect(updated?.status).toBe("pending");
			expect(updated?.attempts).toBe(1);
			expect(updated?.nextAttemptAt).toBeDefined();
			expect(
				new Date(updated?.nextAttemptAt as string).getTime(),
			).toBeGreaterThan(Date.now() - 1000);
		});

		it("pauses sync engine on 401 error and skips future sync cycles until resumed", async () => {
			const outboxItem: OutboxItem = {
				clientUuid: "auth-401-item",
				employeeId: "emp-1",
				operation: "take",
				itemId: mockItem.id,
				quantity: 2,
				occurredAt: "2026-10-28T10:00:00Z",
				createdAt: "2026-10-28T10:00:00Z",
				status: "pending",
				attempts: 0,
			};
			await db.outbox.add(outboxItem);

			const err401 = {
				isAxiosError: true,
				response: {
					status: 401,
					data: {
						success: false,
						message: "Sesi kerja Anda telah berakhir.",
						meta: { code: "UNAUTHENTICATED" },
					},
				},
			};

			vi.spyOn(
				await import("@/features/transactions/api/transactItem"),
				"transactItemApi",
			).mockRejectedValueOnce(err401);

			const result = await processPendingOutboxEntry(outboxItem);
			expect(result.authError).toBe(true);

			// Verify controller was paused
			expect(syncPauseController.isPaused()).toBe(true);

			// Running sync engine while paused immediately skips without making API calls
			const syncResult = await runSyncEngine();
			expect(syncResult.haltedByAuth).toBe(true);
			expect(syncResult.totalProcessed).toBe(0);

			// When user logs in again (setSession in authStore), sync resumes automatically
			useAuthStore.getState().setSession({
				token: "new-valid-token",
				must_change_pin: false,
				employee: {
					id: "emp-1",
					user_id: "user-1",
					name: "User Login",
					namecode: "USR",
					email: "user@inalum.id",
					role: "staff",
					is_active: true,
					must_change_pin: false,
				},
			});

			expect(syncPauseController.isPaused()).toBe(false);
		});
	});
});
