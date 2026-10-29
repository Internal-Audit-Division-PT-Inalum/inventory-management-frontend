import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as syncEngineModule from "@/features/sync/lib/syncEngine";
import { db, type OutboxItem } from "@/lib/db";
import type { Item } from "@/types/api";
import { useSyncScheduler } from "../hooks/useSyncScheduler";
import { syncPauseController } from "./syncPauseController";
import {
	SYNC_TRIGGERED_EVENT,
	SyncScheduler,
	syncScheduler,
} from "./syncScheduler";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(
	assertion: () => void | Promise<void>,
	timeoutMs = 1500,
	stepMs = 20,
): Promise<void> {
	const start = Date.now();
	while (true) {
		try {
			await assertion();
			return;
		} catch (err) {
			if (Date.now() - start > timeoutMs) {
				throw err;
			}
			await sleep(stepMs);
		}
	}
}

describe("SyncScheduler: All 5 Sync Triggers (Task P5.5)", () => {
	const mockItem: Item = {
		id: "item-sch-1",
		sku: "SKU-SCH",
		name: "Buku Ledger Pro",
		type: "consumable",
		unit: "buku",
		location_id: "loc-1",
		current_stock: 10,
		minimum_stock: 2,
		image_url: null,
		updated_at: "2026-10-28T00:00:00Z",
	};

	const mockOutboxItem: OutboxItem = {
		clientUuid: "uuid-sch-1",
		employeeId: "emp-1",
		operation: "take",
		itemId: mockItem.id,
		quantity: 1,
		occurredAt: "2026-10-28T10:00:00Z",
		createdAt: "2026-10-28T10:00:00Z",
		status: "pending",
		attempts: 0,
	};

	let scheduler: SyncScheduler;

	beforeEach(async () => {
		await db.items.clear();
		await db.outbox.clear();
		await db.diagnostic_logs.clear();
		await db.items.add(mockItem);
		await db.outbox.add(mockOutboxItem);

		syncPauseController.resume();
		syncScheduler.stop();

		scheduler = new SyncScheduler();
		vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
	});

	afterEach(() => {
		scheduler.stop();
		syncScheduler.stop();
		syncPauseController.resume();
		vi.restoreAllMocks();
	});

	describe("1. Trigger: app_mount (Buka App)", () => {
		it("triggers sync upon initialization after debounce window", async () => {
			const runSyncSpy = vi
				.spyOn(syncEngineModule, "runSyncEngine")
				.mockResolvedValueOnce({
					totalProcessed: 1,
					syncedCount: 1,
					failedCount: 0,
					rejectedCount: 0,
					skippedCount: 0,
					itemsProcessed: [mockItem.id],
					itemResults: {},
					durationMs: 10,
				});

			scheduler.start({
				syncOnMount: true,
				debounceMs: 30,
			});

			expect(scheduler.getLastTriggerReason()).toBe("app_mount");
			expect(runSyncSpy).not.toHaveBeenCalled();

			await waitFor(() => {
				expect(runSyncSpy).toHaveBeenCalledTimes(1);
			});

			// Diagnostic log recorded
			const logs = await db.diagnostic_logs
				.where({ category: "SYNC_SCHEDULER" })
				.toArray();
			expect(logs.length).toBeGreaterThanOrEqual(1);
			expect(logs[0].message).toContain("triggered by 'app_mount'");
		});
	});

	describe("2. Trigger: online (Kembali Terhubung)", () => {
		it("schedules sync when window 'online' event fires and debounces bursts", async () => {
			const runSyncSpy = vi
				.spyOn(syncEngineModule, "runSyncEngine")
				.mockResolvedValue({
					totalProcessed: 1,
					syncedCount: 1,
					failedCount: 0,
					rejectedCount: 0,
					skippedCount: 0,
					itemsProcessed: [mockItem.id],
					itemResults: {},
					durationMs: 10,
				});

			scheduler.start({
				syncOnMount: false,
				syncOnOnline: true,
				debounceMs: 40,
			});

			// Simulate multiple rapid 'online' flapping events
			window.dispatchEvent(new Event("online"));
			window.dispatchEvent(new Event("online"));
			window.dispatchEvent(new Event("online"));

			expect(scheduler.getLastTriggerReason()).toBe("online");

			// Wait past debounce with polling
			await waitFor(() => {
				expect(runSyncSpy).toHaveBeenCalledTimes(1);
			});
		});
	});

	describe("3. Trigger: visibility_change (Tab Kembali Aktif)", () => {
		it("triggers sync when visibilityState becomes visible", async () => {
			const runSyncSpy = vi
				.spyOn(syncEngineModule, "runSyncEngine")
				.mockResolvedValue({
					totalProcessed: 1,
					syncedCount: 1,
					failedCount: 0,
					rejectedCount: 0,
					skippedCount: 0,
					itemsProcessed: [mockItem.id],
					itemResults: {},
					durationMs: 10,
				});

			scheduler.start({
				syncOnMount: false,
				syncOnVisibility: true,
				debounceMs: 30,
			});

			// Tab becomes hidden -> should NOT trigger
			Object.defineProperty(document, "visibilityState", {
				value: "hidden",
				configurable: true,
			});
			document.dispatchEvent(new Event("visibilitychange"));
			await sleep(50);
			expect(runSyncSpy).not.toHaveBeenCalled();

			// Tab becomes visible -> SHOULD trigger
			Object.defineProperty(document, "visibilityState", {
				value: "visible",
				configurable: true,
			});
			document.dispatchEvent(new Event("visibilitychange"));

			expect(scheduler.getLastTriggerReason()).toBe("visibility_change");

			await waitFor(() => {
				expect(runSyncSpy).toHaveBeenCalledTimes(1);
			});
		});
	});

	describe("4. Trigger: interval (Periodic Background Sync)", () => {
		it("triggers background sync periodically when tab is visible", async () => {
			const runSyncSpy = vi
				.spyOn(syncEngineModule, "runSyncEngine")
				.mockResolvedValue({
					totalProcessed: 1,
					syncedCount: 1,
					failedCount: 0,
					rejectedCount: 0,
					skippedCount: 0,
					itemsProcessed: [mockItem.id],
					itemResults: {},
					durationMs: 10,
				});

			Object.defineProperty(document, "visibilityState", {
				value: "visible",
				configurable: true,
			});

			scheduler.start({
				syncOnMount: false,
				intervalMs: 50,
				debounceMs: 15,
			});

			expect(runSyncSpy).not.toHaveBeenCalled();

			await waitFor(() => {
				expect(runSyncSpy).toHaveBeenCalled();
			});
			expect(scheduler.getLastTriggerReason()).toBe("interval");
		});

		it("skips periodic interval when tab is hidden", async () => {
			const runSyncSpy = vi
				.spyOn(syncEngineModule, "runSyncEngine")
				.mockResolvedValue({
					totalProcessed: 1,
					syncedCount: 1,
					failedCount: 0,
					rejectedCount: 0,
					skippedCount: 0,
					itemsProcessed: [mockItem.id],
					itemResults: {},
					durationMs: 10,
				});

			Object.defineProperty(document, "visibilityState", {
				value: "hidden",
				configurable: true,
			});

			scheduler.start({
				syncOnMount: false,
				intervalMs: 40,
				debounceMs: 15,
			});

			await sleep(90);
			expect(runSyncSpy).not.toHaveBeenCalled();
		});
	});

	describe("5. Trigger: manual (Pemicu Manual UI)", () => {
		it("executes immediately without debounce delay on triggerManualSync", async () => {
			const runSyncSpy = vi
				.spyOn(syncEngineModule, "runSyncEngine")
				.mockResolvedValueOnce({
					totalProcessed: 1,
					syncedCount: 1,
					failedCount: 0,
					rejectedCount: 0,
					skippedCount: 0,
					itemsProcessed: [mockItem.id],
					itemResults: {},
					durationMs: 5,
				});

			scheduler.start({
				syncOnMount: false,
				debounceMs: 5000, // long debounce
			});

			const dispatchSpy = vi.spyOn(window, "dispatchEvent");

			// Trigger manual
			const result = await scheduler.triggerManualSync();

			// No need to wait 5000ms debounce!
			expect(runSyncSpy).toHaveBeenCalledTimes(1);
			expect(result?.syncedCount).toBe(1);
			expect(scheduler.getLastTriggerReason()).toBe("manual");

			expect(dispatchSpy).toHaveBeenCalledWith(
				expect.objectContaining({
					type: SYNC_TRIGGERED_EVENT,
				}),
			);
		});
	});

	describe("Pre-flight Guards & Edge Cases", () => {
		it("skips sync when navigator is offline", async () => {
			vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);

			const canRun = await scheduler.canSyncNow("online");
			expect(canRun).toBe(false);
		});

		it("skips sync when syncPauseController is paused", async () => {
			syncPauseController.pause("401 Unauthorized");

			const canRun = await scheduler.canSyncNow("app_mount");
			expect(canRun).toBe(false);
		});

		it("skips automated sync when outbox is empty and requirePendingItems is true", async () => {
			await db.outbox.clear();

			const canAutomatedRun = await scheduler.canSyncNow("interval");
			expect(canAutomatedRun).toBe(false);

			// Manual sync bypasses the empty check
			const canManualRun = await scheduler.canSyncNow("manual", true);
			expect(canManualRun).toBe(true);
		});

		it("stop() cleans up timers and removes listeners cleanly", () => {
			const removeWindowSpy = vi.spyOn(window, "removeEventListener");
			const removeDocSpy = vi.spyOn(document, "removeEventListener");

			scheduler.start({
				syncOnMount: true,
				syncOnOnline: true,
				syncOnVisibility: true,
				intervalMs: 5000,
			});

			expect(scheduler.isActive()).toBe(true);

			scheduler.stop();
			expect(scheduler.isActive()).toBe(false);

			expect(removeWindowSpy).toHaveBeenCalledWith(
				"online",
				expect.any(Function),
			);
			expect(removeDocSpy).toHaveBeenCalledWith(
				"visibilitychange",
				expect.any(Function),
			);
		});
	});

	describe("React Hook: useSyncScheduler", () => {
		it("manages scheduler lifecycle and exposes reactive state", async () => {
			const runSyncSpy = vi
				.spyOn(syncEngineModule, "runSyncEngine")
				.mockResolvedValue({
					totalProcessed: 1,
					syncedCount: 1,
					failedCount: 0,
					rejectedCount: 0,
					skippedCount: 0,
					itemsProcessed: [mockItem.id],
					itemResults: {},
					durationMs: 10,
				});

			const { result, unmount } = renderHook(() =>
				useSyncScheduler({
					syncOnMount: false,
					debounceMs: 20,
				}),
			);

			expect(result.current.isOnline).toBe(true);
			expect(result.current.isPaused).toBe(false);

			// Manual trigger via hook
			await act(async () => {
				await result.current.triggerSync();
			});

			expect(runSyncSpy).toHaveBeenCalledTimes(1);
			expect(result.current.lastTriggerReason).toBe("manual");

			// Unmount cleans up scheduler
			unmount();
			expect(syncScheduler.isActive()).toBe(false);
		});
	});
});
