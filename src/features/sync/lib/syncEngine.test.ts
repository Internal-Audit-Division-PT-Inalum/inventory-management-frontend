import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CATALOG_SYNC_EVENT } from "@/features/catalog/api/syncCatalog";
import * as outboxQueueModule from "@/features/transactions/lib/outboxQueue";
import type { TransactSubmitResult } from "@/features/transactions/types";
import { db, type OutboxItem } from "@/lib/db";
import type { Item } from "@/types/api";
import { useSyncEngine } from "../hooks/useSyncEngine";
import {
	groupOutboxItemsByItem,
	isEligibleForSync,
	isSyncEngineRunning,
	processItemOutboxQueue,
	runSyncEngine,
	SYNC_ENGINE_EVENT,
} from "./syncEngine";
import { syncPauseController } from "./syncPauseController";
import {
	FALLBACK_STORAGE_LOCK_KEY_PREFIX,
	type FallbackLockRecord,
	SYNC_TAB_LOCK_NAME,
} from "./tabLock";

function createMockSuccess(entry: OutboxItem): TransactSubmitResult {
	return {
		success: true,
		synced: true,
		queued: false,
		outboxItem: { ...entry, status: "synced" },
		message: "Transaksi berhasil disinkronkan",
	};
}

function createMockRejected(
	entry: OutboxItem,
	message = "Stok tidak mencukupi",
): TransactSubmitResult {
	return {
		success: false,
		synced: false,
		queued: false,
		rejected: true,
		outboxItem: { ...entry, status: "rejected" },
		message,
	};
}

function createMockFailed(
	entry: OutboxItem,
	message = "Network Timeout",
): TransactSubmitResult {
	return {
		success: false,
		synced: false,
		queued: true,
		outboxItem: { ...entry, status: "failed" },
		message,
	};
}

function createMockAuthError(entry: OutboxItem): TransactSubmitResult {
	return {
		success: false,
		synced: false,
		queued: true,
		authError: true,
		outboxItem: { ...entry, status: "pending" },
		message: "Unauthorized",
	};
}

describe("Sync Engine: FIFO per item & Low Concurrency (Task P5.3)", () => {
	const mockItemA: Item = {
		id: "item-sync-A",
		sku: "SKU-A",
		name: "Kertas A4",
		type: "consumable",
		unit: "rim",
		location_id: "loc-1",
		current_stock: 50,
		minimum_stock: 10,
		image_url: null,
		updated_at: "2026-10-28T00:00:00Z",
	};

	const mockItemB: Item = {
		id: "item-sync-B",
		sku: "SKU-B",
		name: "Baterai AA",
		type: "consumable",
		unit: "pack",
		location_id: "loc-1",
		current_stock: 30,
		minimum_stock: 5,
		image_url: null,
		updated_at: "2026-10-28T00:00:00Z",
	};

	beforeEach(async () => {
		localStorage.clear();
		await db.items.clear();
		await db.outbox.clear();
		await db.diagnostic_logs.clear();
		await db.items.bulkAdd([mockItemA, mockItemB]);
		syncPauseController.resume();
		vi.clearAllMocks();
	});

	afterEach(() => {
		localStorage.clear();
		syncPauseController.resume();
		vi.restoreAllMocks();
	});

	describe("Eligibility & Grouping Helpers", () => {
		it("isEligibleForSync returns true only when status is pending/failed and nextAttemptAt is past or null", () => {
			const now = new Date("2026-10-28T10:00:00Z");

			const itemPending: OutboxItem = {
				clientUuid: "uuid-1",
				employeeId: "emp-1",
				operation: "take",
				itemId: "item-1",
				quantity: 1,
				occurredAt: now.toISOString(),
				createdAt: now.toISOString(),
				status: "pending",
				attempts: 0,
			};
			expect(isEligibleForSync(itemPending, now)).toBe(true);

			// nextAttemptAt in past
			const itemPastRetry: OutboxItem = {
				...itemPending,
				status: "failed",
				nextAttemptAt: "2026-10-28T09:59:00Z",
			};
			expect(isEligibleForSync(itemPastRetry, now)).toBe(true);

			// nextAttemptAt in future -> not eligible yet
			const itemFutureRetry: OutboxItem = {
				...itemPending,
				status: "failed",
				nextAttemptAt: "2026-10-28T10:05:00Z",
			};
			expect(isEligibleForSync(itemFutureRetry, now)).toBe(false);

			// status syncing or synced or rejected -> not eligible
			expect(
				isEligibleForSync({ ...itemPending, status: "syncing" }, now),
			).toBe(false);
			expect(isEligibleForSync({ ...itemPending, status: "synced" }, now)).toBe(
				false,
			);
			expect(
				isEligibleForSync({ ...itemPending, status: "rejected" }, now),
			).toBe(false);
		});

		it("groupOutboxItemsByItem groups items by itemId while preserving FIFO order", () => {
			const items: OutboxItem[] = [
				{
					clientUuid: "u1",
					employeeId: "e1",
					operation: "take",
					itemId: "item-A",
					quantity: 1,
					occurredAt: "2026-10-28T09:00:00Z",
					createdAt: "2026-10-28T09:00:00Z",
					status: "pending",
					attempts: 0,
				},
				{
					clientUuid: "u2",
					employeeId: "e1",
					operation: "take",
					itemId: "item-B",
					quantity: 2,
					occurredAt: "2026-10-28T09:01:00Z",
					createdAt: "2026-10-28T09:01:00Z",
					status: "pending",
					attempts: 0,
				},
				{
					clientUuid: "u3",
					employeeId: "e1",
					operation: "take",
					itemId: "item-A",
					quantity: 3,
					occurredAt: "2026-10-28T09:02:00Z",
					createdAt: "2026-10-28T09:02:00Z",
					status: "pending",
					attempts: 0,
				},
			];

			const grouped = groupOutboxItemsByItem(items);
			expect(grouped.size).toBe(2);

			const queueA = grouped.get("item-A");
			expect(queueA).toBeDefined();
			expect(queueA?.length).toBe(2);
			expect(queueA?.[0].clientUuid).toBe("u1");
			expect(queueA?.[1].clientUuid).toBe("u3");

			const queueB = grouped.get("item-B");
			expect(queueB?.length).toBe(1);
			expect(queueB?.[0].clientUuid).toBe("u2");
		});
	});

	describe("processItemOutboxQueue — Strict FIFO per item", () => {
		it("processes multiple transactions for the same item in strictly serial order", async () => {
			const item1: OutboxItem = {
				clientUuid: "fifo-1",
				employeeId: "emp-1",
				operation: "take",
				itemId: mockItemA.id,
				quantity: 2,
				occurredAt: "2026-10-28T09:00:00Z",
				createdAt: "2026-10-28T09:00:00Z",
				status: "pending",
				attempts: 0,
			};
			const item2: OutboxItem = {
				clientUuid: "fifo-2",
				employeeId: "emp-1",
				operation: "take",
				itemId: mockItemA.id,
				quantity: 3,
				occurredAt: "2026-10-28T09:05:00Z",
				createdAt: "2026-10-28T09:05:00Z",
				status: "pending",
				attempts: 0,
			};
			await db.outbox.bulkAdd([item1, item2]);

			const executionOrder: string[] = [];
			vi.spyOn(
				outboxQueueModule,
				"processPendingOutboxEntry",
			).mockImplementation(async (entry) => {
				executionOrder.push(entry.clientUuid);
				await db.updateOutboxItem(entry.clientUuid, { status: "synced" });
				return createMockSuccess(entry);
			});

			const result = await processItemOutboxQueue(mockItemA.id, [item1, item2]);

			expect(result.synced).toBe(2);
			expect(result.failed).toBe(0);
			expect(result.rejected).toBe(0);
			expect(result.skipped).toBe(0);
			expect(executionOrder).toEqual(["fifo-1", "fifo-2"]);
		});

		it("halts remaining queue for the item when a transaction is rejected (422) to prevent cascading errors", async () => {
			const item1: OutboxItem = {
				clientUuid: "rej-1",
				employeeId: "emp-1",
				operation: "take",
				itemId: mockItemA.id,
				quantity: 100, // will be rejected
				occurredAt: "2026-10-28T09:00:00Z",
				createdAt: "2026-10-28T09:00:00Z",
				status: "pending",
				attempts: 0,
			};
			const item2: OutboxItem = {
				clientUuid: "rej-2",
				employeeId: "emp-1",
				operation: "take",
				itemId: mockItemA.id,
				quantity: 2,
				occurredAt: "2026-10-28T09:05:00Z",
				createdAt: "2026-10-28T09:05:00Z",
				status: "pending",
				attempts: 0,
			};
			await db.outbox.bulkAdd([item1, item2]);

			const processSpy = vi
				.spyOn(outboxQueueModule, "processPendingOutboxEntry")
				.mockImplementation(async (entry) => {
					if (entry.clientUuid === "rej-1") {
						await db.updateOutboxItem(entry.clientUuid, { status: "rejected" });
						return createMockRejected(entry, "Stok tidak mencukupi");
					}
					await db.updateOutboxItem(entry.clientUuid, { status: "synced" });
					return createMockSuccess(entry);
				});

			const result = await processItemOutboxQueue(mockItemA.id, [item1, item2]);

			expect(result.rejected).toBe(1);
			expect(result.synced).toBe(0);
			expect(result.skipped).toBe(1);
			expect(result.haltedReason).toBe("rejected");

			// Ensure item2 was NEVER sent to the server
			expect(processSpy).toHaveBeenCalledTimes(1);
			expect(processSpy).toHaveBeenCalledWith(
				expect.objectContaining({ clientUuid: "rej-1" }),
			);

			// Item2 should remain untouched in pending status
			const record2 = await db.outbox.get("rej-2");
			expect(record2?.status).toBe("pending");
		});

		it("halts remaining queue for the item when a transient failure occurs to preserve ordering", async () => {
			const item1: OutboxItem = {
				clientUuid: "fail-1",
				employeeId: "emp-1",
				operation: "take",
				itemId: mockItemA.id,
				quantity: 5,
				occurredAt: "2026-10-28T09:00:00Z",
				createdAt: "2026-10-28T09:00:00Z",
				status: "pending",
				attempts: 0,
			};
			const item2: OutboxItem = {
				clientUuid: "fail-2",
				employeeId: "emp-1",
				operation: "take",
				itemId: mockItemA.id,
				quantity: 2,
				occurredAt: "2026-10-28T09:05:00Z",
				createdAt: "2026-10-28T09:05:00Z",
				status: "pending",
				attempts: 0,
			};
			await db.outbox.bulkAdd([item1, item2]);

			vi.spyOn(
				outboxQueueModule,
				"processPendingOutboxEntry",
			).mockImplementation(async (entry) => {
				await db.updateOutboxItem(entry.clientUuid, { status: "failed" });
				return createMockFailed(entry, "Network Timeout");
			});

			const result = await processItemOutboxQueue(mockItemA.id, [item1, item2]);
			expect(result.failed).toBe(1);
			expect(result.skipped).toBe(1);
			expect(result.haltedReason).toBe("failed");
		});
	});

	describe("runSyncEngine — Worker Pool & Controlled Concurrency", () => {
		it("returns empty result if no eligible items exist", async () => {
			const result = await runSyncEngine();
			expect(result.totalProcessed).toBe(0);
			expect(result.syncedCount).toBe(0);
			expect(result.itemsProcessed).toHaveLength(0);
		});

		it("processes different items concurrently respecting concurrencyLimit", async () => {
			const itemA: OutboxItem = {
				clientUuid: "conc-A",
				employeeId: "emp-1",
				operation: "take",
				itemId: mockItemA.id,
				quantity: 2,
				occurredAt: "2026-10-28T09:00:00Z",
				createdAt: "2026-10-28T09:00:00Z",
				status: "pending",
				attempts: 0,
			};
			const itemB: OutboxItem = {
				clientUuid: "conc-B",
				employeeId: "emp-1",
				operation: "take",
				itemId: mockItemB.id,
				quantity: 3,
				occurredAt: "2026-10-28T09:01:00Z",
				createdAt: "2026-10-28T09:01:00Z",
				status: "pending",
				attempts: 0,
			};
			await db.outbox.bulkAdd([itemA, itemB]);

			let activeWorkers = 0;
			let maxActiveWorkers = 0;

			vi.spyOn(
				outboxQueueModule,
				"processPendingOutboxEntry",
			).mockImplementation(async (entry) => {
				activeWorkers++;
				maxActiveWorkers = Math.max(maxActiveWorkers, activeWorkers);
				// Small delay to simulate network latency
				await new Promise((r) => setTimeout(r, 20));
				activeWorkers--;
				await db.updateOutboxItem(entry.clientUuid, { status: "synced" });
				return createMockSuccess(entry);
			});

			const dispatchSpy = vi.spyOn(window, "dispatchEvent");

			const result = await runSyncEngine({ concurrencyLimit: 2 });

			expect(result.totalProcessed).toBe(2);
			expect(result.syncedCount).toBe(2);
			expect(result.itemsProcessed).toContain(mockItemA.id);
			expect(result.itemsProcessed).toContain(mockItemB.id);
			expect(maxActiveWorkers).toBeLessThanOrEqual(2);

			// Check event dispatched
			expect(dispatchSpy).toHaveBeenCalledWith(
				expect.objectContaining({ type: CATALOG_SYNC_EVENT }),
			);
			expect(dispatchSpy).toHaveBeenCalledWith(
				expect.objectContaining({ type: SYNC_ENGINE_EVENT }),
			);

			// Diagnostic logs recorded
			const logs = await db.diagnostic_logs
				.where({ category: "SYNC_ENGINE" })
				.toArray();
			expect(logs.length).toBeGreaterThanOrEqual(2);
			expect(logs[0].message).toContain("Sync cycle started");
			expect(logs[logs.length - 1].message).toContain("Sync cycle finished");
		});

		it("resets abandoned syncing items on crash recovery before starting cycle", async () => {
			const abandonedItem: OutboxItem = {
				clientUuid: "abandoned-1",
				employeeId: "emp-1",
				operation: "take",
				itemId: mockItemA.id,
				quantity: 1,
				occurredAt: "2026-10-28T08:00:00Z",
				createdAt: "2026-10-28T08:00:00Z",
				status: "syncing", // was left syncing when app closed
				attempts: 1,
			};
			await db.outbox.add(abandonedItem);

			vi.spyOn(
				outboxQueueModule,
				"processPendingOutboxEntry",
			).mockImplementation(async (entry) => {
				await db.updateOutboxItem(entry.clientUuid, { status: "synced" });
				return createMockSuccess(entry);
			});

			const result = await runSyncEngine();
			expect(result.syncedCount).toBe(1);

			const recoveredRecord = await db.outbox.get("abandoned-1");
			expect(recoveredRecord?.status).toBe("synced");
		});

		it("provides anti-overlap lock so parallel calls share the running promise", async () => {
			const itemA: OutboxItem = {
				clientUuid: "overlap-A",
				employeeId: "emp-1",
				operation: "take",
				itemId: mockItemA.id,
				quantity: 1,
				occurredAt: "2026-10-28T09:00:00Z",
				createdAt: "2026-10-28T09:00:00Z",
				status: "pending",
				attempts: 0,
			};
			await db.outbox.add(itemA);

			vi.spyOn(
				outboxQueueModule,
				"processPendingOutboxEntry",
			).mockImplementation(async (entry) => {
				await new Promise((r) => setTimeout(r, 40));
				await db.updateOutboxItem(entry.clientUuid, { status: "synced" });
				return createMockSuccess(entry);
			});

			expect(isSyncEngineRunning()).toBe(false);

			const p1 = runSyncEngine();
			expect(isSyncEngineRunning()).toBe(true);

			const p2 = runSyncEngine();
			// Both promises should resolve to identical results
			const [res1, res2] = await Promise.all([p1, p2]);

			expect(res1).toBe(res2);
			expect(isSyncEngineRunning()).toBe(false);
		});

		it("halts sync cycle if auth error (401) is encountered", async () => {
			const itemA: OutboxItem = {
				clientUuid: "auth-err-1",
				employeeId: "emp-1",
				operation: "take",
				itemId: mockItemA.id,
				quantity: 1,
				occurredAt: "2026-10-28T09:00:00Z",
				createdAt: "2026-10-28T09:00:00Z",
				status: "pending",
				attempts: 0,
			};
			await db.outbox.add(itemA);

			vi.spyOn(
				outboxQueueModule,
				"processPendingOutboxEntry",
			).mockImplementation(async (entry) => createMockAuthError(entry));

			const result = await runSyncEngine();
			expect(result.haltedByAuth).toBe(true);
			expect(result.failedCount).toBe(1);
		});
	});

	describe("useSyncEngine React Hook", () => {
		it("provides reactive pendingCount and syncNow functionality", async () => {
			const item: OutboxItem = {
				clientUuid: "hook-1",
				employeeId: "emp-1",
				operation: "take",
				itemId: mockItemA.id,
				quantity: 2,
				occurredAt: "2026-10-28T09:00:00Z",
				createdAt: "2026-10-28T09:00:00Z",
				status: "pending",
				attempts: 0,
			};
			await db.outbox.add(item);

			vi.spyOn(
				outboxQueueModule,
				"processPendingOutboxEntry",
			).mockImplementation(async (entry) => {
				await db.updateOutboxItem(entry.clientUuid, { status: "synced" });
				return createMockSuccess(entry);
			});

			const { result } = renderHook(() => useSyncEngine());

			// Wait for initial pendingCount load
			await act(async () => {
				await result.current.refreshPendingCount();
			});
			expect(result.current.pendingCount).toBe(1);

			// Trigger syncNow
			await act(async () => {
				const syncRes = await result.current.syncNow();
				expect(syncRes.syncedCount).toBe(1);
			});

			expect(result.current.isSyncing).toBe(false);
			expect(result.current.pendingCount).toBe(0);
			expect(result.current.lastResult?.syncedCount).toBe(1);
		});
	});

	describe("Cross-Tab Lock Protection (Task P5.6)", () => {
		it("skips sync cycle with skippedDueToTabLock=true when another tab holds the lock", async () => {
			// Simulasikan tab lain sedang memegang lock sinkronisasi
			const otherTabLock: FallbackLockRecord = {
				lockId: "other_lock_id",
				tabId: "tab_concurrent_user",
				acquiredAt: Date.now(),
				expiresAt: Date.now() + 30_000,
			};
			localStorage.setItem(
				`${FALLBACK_STORAGE_LOCK_KEY_PREFIX}${SYNC_TAB_LOCK_NAME}`,
				JSON.stringify(otherTabLock),
			);

			// Tambahkan outbox item yang pending
			await db.outbox.add({
				clientUuid: "pending-tab-lock-1",
				employeeId: "emp-1",
				operation: "take",
				itemId: mockItemA.id,
				quantity: 1,
				occurredAt: new Date().toISOString(),
				createdAt: new Date().toISOString(),
				status: "pending",
				attempts: 0,
			});

			const processSpy = vi.spyOn(
				outboxQueueModule,
				"processPendingOutboxEntry",
			);

			const result = await runSyncEngine();

			expect(result.skippedDueToTabLock).toBe(true);
			expect(result.totalProcessed).toBe(0);
			expect(result.syncedCount).toBe(0);
			// Pastikan processPendingOutboxEntry sama sekali TIDAK dipanggil karena lock dipegang tab lain
			expect(processSpy).not.toHaveBeenCalled();

			// Pastikan tercatat di diagnostic log
			const logs = await db.getDiagnosticLogs(5);
			const lockLog = logs.find(
				(l) =>
					l.category === "SYNC_ENGINE" &&
					l.message.includes(
						"another browser tab is currently running sync engine",
					),
			);
			expect(lockLog).toBeDefined();
		});

		it("allows bypassing tab lock when explicitly requested via options.bypassTabLock", async () => {
			const otherTabLock: FallbackLockRecord = {
				lockId: "other_lock_id",
				tabId: "tab_concurrent_user",
				acquiredAt: Date.now(),
				expiresAt: Date.now() + 30_000,
			};
			localStorage.setItem(
				`${FALLBACK_STORAGE_LOCK_KEY_PREFIX}${SYNC_TAB_LOCK_NAME}`,
				JSON.stringify(otherTabLock),
			);

			await db.outbox.add({
				clientUuid: "pending-bypass-1",
				employeeId: "emp-1",
				operation: "take",
				itemId: mockItemA.id,
				quantity: 1,
				occurredAt: new Date().toISOString(),
				createdAt: new Date().toISOString(),
				status: "pending",
				attempts: 0,
			});

			vi.spyOn(
				outboxQueueModule,
				"processPendingOutboxEntry",
			).mockImplementation(async (entry) => {
				await db.updateOutboxItem(entry.clientUuid, { status: "synced" });
				return createMockSuccess(entry);
			});

			const result = await runSyncEngine({ bypassTabLock: true });

			expect(result.skippedDueToTabLock).toBeUndefined();
			expect(result.syncedCount).toBe(1);
			expect(result.totalProcessed).toBe(1);
		});
	});
});
