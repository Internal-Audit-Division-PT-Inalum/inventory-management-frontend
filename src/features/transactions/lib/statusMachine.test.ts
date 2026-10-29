import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db, type OutboxItem } from "@/lib/db";
import type { Item } from "@/types/api";
import { enqueueTransaction } from "./outboxQueue";
import {
	assertValidStatusTransition,
	discardOutboxItem,
	InvalidStatusTransitionError,
	isValidStatusTransition,
	retryOutboxItem,
	transitionOutboxStatus,
} from "./statusMachine";

describe("Outbox Status Machine & Pure Enqueue (P5.2)", () => {
	const mockConsumable: Item = {
		id: "item-sm-1",
		sku: "CSM-001",
		name: "Buku Catatan",
		type: "consumable",
		unit: "pcs",
		location_id: "loc-sm",
		current_stock: 20,
		minimum_stock: 5,
		image_url: null,
		updated_at: "2026-10-28T00:00:00Z",
	};

	const mockAsset: Item = {
		id: "item-sm-2",
		sku: "AST-002",
		name: "Multimeter Digital",
		type: "asset",
		unit: "unit",
		location_id: "loc-sm",
		current_stock: 5,
		borrowed_quantity: 2,
		minimum_stock: 1,
		image_url: null,
		updated_at: "2026-10-28T00:00:00Z",
	};

	beforeEach(async () => {
		await db.items.clear();
		await db.outbox.clear();
		await db.diagnostic_logs.clear();
		await db.items.bulkAdd([mockConsumable, mockAsset]);
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("Finite State Machine Transitions", () => {
		it("validates permitted transitions correctly", () => {
			// pending -> syncing
			expect(isValidStatusTransition("pending", "syncing")).toBe(true);

			// syncing -> synced, failed, rejected, pending
			expect(isValidStatusTransition("syncing", "synced")).toBe(true);
			expect(isValidStatusTransition("syncing", "failed")).toBe(true);
			expect(isValidStatusTransition("syncing", "rejected")).toBe(true);
			expect(isValidStatusTransition("syncing", "pending")).toBe(true);

			// failed -> pending, rejected
			expect(isValidStatusTransition("failed", "pending")).toBe(true);
			expect(isValidStatusTransition("failed", "rejected")).toBe(true);

			// rejected -> pending
			expect(isValidStatusTransition("rejected", "pending")).toBe(true);
		});

		it("prohibits forbidden transitions and terminal state departures", () => {
			// synced is terminal
			expect(isValidStatusTransition("synced", "pending")).toBe(false);
			expect(isValidStatusTransition("synced", "syncing")).toBe(false);
			expect(isValidStatusTransition("synced", "failed")).toBe(false);
			expect(isValidStatusTransition("synced", "rejected")).toBe(false);

			// pending cannot jump directly to terminal or error states without syncing
			expect(isValidStatusTransition("pending", "synced")).toBe(false);
			expect(isValidStatusTransition("pending", "failed")).toBe(false);
			expect(isValidStatusTransition("pending", "rejected")).toBe(false);

			// failed cannot jump directly to syncing without entering pending queue first
			expect(isValidStatusTransition("failed", "syncing")).toBe(false);
			expect(isValidStatusTransition("failed", "synced")).toBe(false);

			// rejected cannot jump to syncing or synced directly
			expect(isValidStatusTransition("rejected", "syncing")).toBe(false);
			expect(isValidStatusTransition("rejected", "synced")).toBe(false);
		});

		it("assertValidStatusTransition throws InvalidStatusTransitionError on illegal transitions", () => {
			expect(() => {
				assertValidStatusTransition("uuid-123", "synced", "pending");
			}).toThrow(InvalidStatusTransitionError);

			try {
				assertValidStatusTransition("uuid-456", "pending", "synced");
			} catch (err) {
				expect(err).toBeInstanceOf(InvalidStatusTransitionError);
				const transErr = err as InvalidStatusTransitionError;
				expect(transErr.clientUuid).toBe("uuid-456");
				expect(transErr.fromStatus).toBe("pending");
				expect(transErr.toStatus).toBe("synced");
				expect(transErr.message).toContain("uuid-456");
			}
		});
	});

	describe("transitionOutboxStatus", () => {
		it("throws an error if outbox item is not found", async () => {
			await expect(
				transitionOutboxStatus("non-existent-uuid", "syncing"),
			).rejects.toThrow("tidak ditemukan di IndexedDB");
		});

		it("throws InvalidStatusTransitionError if transition is disallowed", async () => {
			const item: OutboxItem = {
				clientUuid: "item-101",
				employeeId: "emp-1",
				operation: "take",
				itemId: mockConsumable.id,
				quantity: 2,
				occurredAt: new Date().toISOString(),
				createdAt: new Date().toISOString(),
				status: "synced",
				attempts: 1,
			};
			await db.outbox.add(item);

			await expect(
				transitionOutboxStatus(item.clientUuid, "pending"),
			).rejects.toThrow(InvalidStatusTransitionError);
		});

		it("updates status, attempts, nextAttemptAt, lastError, and logs diagnostic entry", async () => {
			const item: OutboxItem = {
				clientUuid: "item-102",
				employeeId: "emp-1",
				operation: "take",
				itemId: mockConsumable.id,
				quantity: 3,
				occurredAt: new Date().toISOString(),
				createdAt: new Date().toISOString(),
				status: "pending",
				attempts: 0,
			};
			await db.outbox.add(item);

			const dispatchSpy = vi.spyOn(window, "dispatchEvent");

			// 1. pending -> syncing
			const syncing = await transitionOutboxStatus(item.clientUuid, "syncing", {
				attempts: 1,
			});
			expect(syncing.status).toBe("syncing");
			expect(syncing.attempts).toBe(1);

			// 2. syncing -> failed
			const nextRetry = new Date(Date.now() + 5000).toISOString();
			const failed = await transitionOutboxStatus(item.clientUuid, "failed", {
				attempts: 2,
				nextAttemptAt: nextRetry,
				lastError: { code: "NETWORK_ERROR", message: "Koneksi terputus" },
			});

			expect(failed.status).toBe("failed");
			expect(failed.attempts).toBe(2);
			expect(failed.nextAttemptAt).toBe(nextRetry);
			expect(failed.lastError?.code).toBe("NETWORK_ERROR");

			// Check DB record
			const inDb = await db.outbox.get(item.clientUuid);
			expect(inDb?.status).toBe("failed");
			expect(inDb?.nextAttemptAt).toBe(nextRetry);

			// Check diagnostic logs
			const logs = await db.diagnostic_logs.toArray();
			expect(logs.length).toBeGreaterThanOrEqual(2);
			const stateMachineLogs = logs.filter(
				(l) => l.category === "STATE_MACHINE",
			);
			expect(stateMachineLogs.length).toBe(2);
			expect(stateMachineLogs[0].message).toContain("pending -> syncing");
			expect(stateMachineLogs[1].message).toContain("syncing -> failed");

			// Check window event dispatched
			expect(dispatchSpy).toHaveBeenCalled();
		});
	});

	describe("discardOutboxItem", () => {
		it("throws an error if item does not exist", async () => {
			await expect(discardOutboxItem("unknown-uuid")).rejects.toThrow(
				"tidak ditemukan",
			);
		});

		it("throws an error if item is in 'syncing' status to protect in-flight requests", async () => {
			const item: OutboxItem = {
				clientUuid: "item-syncing",
				employeeId: "emp-1",
				operation: "take",
				itemId: mockConsumable.id,
				quantity: 5,
				occurredAt: new Date().toISOString(),
				createdAt: new Date().toISOString(),
				status: "syncing",
				attempts: 1,
			};
			await db.outbox.add(item);

			await expect(discardOutboxItem("item-syncing")).rejects.toThrow(
				"sedang dalam proses pengiriman (syncing)",
			);
		});

		it("throws an error if item is in 'synced' status", async () => {
			const item: OutboxItem = {
				clientUuid: "item-synced",
				employeeId: "emp-1",
				operation: "take",
				itemId: mockConsumable.id,
				quantity: 5,
				occurredAt: new Date().toISOString(),
				createdAt: new Date().toISOString(),
				status: "synced",
				attempts: 1,
			};
			await db.outbox.add(item);

			await expect(discardOutboxItem("item-synced")).rejects.toThrow(
				"sudah berhasil disinkronkan",
			);
		});

		it("reverts optimistic stock deltas and deletes item when discarded from 'rejected' state", async () => {
			// Consumable stock was 20, take 5 made it 15 optimistically
			await db.items.update(mockConsumable.id, { current_stock: 15 });

			const rejectedItem: OutboxItem = {
				clientUuid: "item-rejected-1",
				employeeId: "emp-1",
				operation: "take",
				itemId: mockConsumable.id,
				quantity: 5,
				appliedDeltaStock: -5,
				appliedDeltaBorrowed: 0,
				occurredAt: new Date().toISOString(),
				createdAt: new Date().toISOString(),
				status: "rejected",
				attempts: 1,
				lastError: {
					code: "INSUFFICIENT_STOCK",
					message: "Stok server habis",
				},
			};
			await db.outbox.add(rejectedItem);

			await discardOutboxItem("item-rejected-1");

			// Outbox item deleted
			const outboxRecord = await db.outbox.get("item-rejected-1");
			expect(outboxRecord).toBeUndefined();

			// Stock reverted: 15 - (-5) = 20
			const itemRecord = await db.items.get(mockConsumable.id);
			expect(itemRecord?.current_stock).toBe(20);

			// Diagnostic log created
			const logs = await db.diagnostic_logs
				.where({ category: "OUTBOX" })
				.toArray();
			const discardLog = logs.find((l) => l.message.includes("discarded"));
			expect(discardLog).toBeDefined();
			expect(discardLog?.message).toContain("status sebelumnya: rejected");
		});

		it("reverts optimistic asset stock and borrowed deltas when discarded", async () => {
			// Asset stock was 5, borrowed 2.
			// Optimistic borrow 2 made stock: 3, borrowed: 4
			await db.items.update(mockAsset.id, {
				current_stock: 3,
				borrowed_quantity: 4,
			});

			const outboxItem: OutboxItem = {
				clientUuid: "item-borrow-failed",
				employeeId: "emp-1",
				operation: "borrow",
				itemId: mockAsset.id,
				quantity: 2,
				appliedDeltaStock: -2,
				appliedDeltaBorrowed: 2,
				occurredAt: new Date().toISOString(),
				createdAt: new Date().toISOString(),
				status: "failed",
				attempts: 3,
			};
			await db.outbox.add(outboxItem);

			await discardOutboxItem("item-borrow-failed");

			// Outbox item deleted
			expect(await db.outbox.get("item-borrow-failed")).toBeUndefined();

			// Reverted: current_stock: 3 - (-2) = 5; borrowed_quantity: 4 - 2 = 2
			const assetRecord = await db.items.get(mockAsset.id);
			expect(assetRecord?.current_stock).toBe(5);
			expect(assetRecord?.borrowed_quantity).toBe(2);
		});
	});

	describe("retryOutboxItem", () => {
		it("throws an error if item does not exist", async () => {
			await expect(retryOutboxItem("non-existent")).rejects.toThrow(
				"tidak ditemukan",
			);
		});

		it("throws an error if item is in invalid state for manual retry (pending, syncing, synced)", async () => {
			const pendingItem: OutboxItem = {
				clientUuid: "item-pending-retry",
				employeeId: "emp-1",
				operation: "take",
				itemId: mockConsumable.id,
				quantity: 1,
				occurredAt: new Date().toISOString(),
				createdAt: new Date().toISOString(),
				status: "pending",
				attempts: 0,
			};
			await db.outbox.add(pendingItem);

			await expect(retryOutboxItem("item-pending-retry")).rejects.toThrow(
				"Hanya entri outbox berstatus 'failed' atau 'rejected'",
			);
		});

		it("resets failed item to pending, clearing nextAttemptAt and lastError", async () => {
			const failedItem: OutboxItem = {
				clientUuid: "item-failed-retry",
				employeeId: "emp-1",
				operation: "take",
				itemId: mockConsumable.id,
				quantity: 2,
				occurredAt: new Date().toISOString(),
				createdAt: new Date().toISOString(),
				status: "failed",
				attempts: 3,
				nextAttemptAt: new Date(Date.now() + 60000).toISOString(),
				lastError: { code: "NETWORK_TIMEOUT", message: "Timeout" },
			};
			await db.outbox.add(failedItem);

			const retried = await retryOutboxItem("item-failed-retry");
			expect(retried.status).toBe("pending");
			expect(retried.nextAttemptAt).toBeNull();
			expect(retried.lastError).toBeNull();

			const inDb = await db.outbox.get("item-failed-retry");
			expect(inDb?.status).toBe("pending");
			expect(inDb?.nextAttemptAt).toBeNull();
			expect(inDb?.lastError).toBeNull();
		});

		it("resets rejected item to pending for re-submission", async () => {
			const rejectedItem: OutboxItem = {
				clientUuid: "item-rejected-retry",
				employeeId: "emp-1",
				operation: "add",
				itemId: mockConsumable.id,
				quantity: 10,
				occurredAt: new Date().toISOString(),
				createdAt: new Date().toISOString(),
				status: "rejected",
				attempts: 1,
				lastError: { code: "SERVER_REJECTED", message: "Invalid payload" },
			};
			await db.outbox.add(rejectedItem);

			const retried = await retryOutboxItem("item-rejected-retry");
			expect(retried.status).toBe("pending");
			expect(retried.nextAttemptAt).toBeNull();
			expect(retried.lastError).toBeNull();
		});
	});

	describe("Pure enqueueTransaction", () => {
		it("enqueues transaction to outbox with applied deltas, logs, and zero network call", async () => {
			const initialStock = mockConsumable.current_stock;
			const quantityToTake = 4;

			const result = await enqueueTransaction({
				item: mockConsumable,
				action: "take",
				formData: {
					quantity: quantityToTake,
					notes: "Untuk audit visual",
					reference_number: "REF-PURE-01",
				},
				employeeId: "emp-pure-1",
			});

			expect(result.clientUuid).toBeDefined();
			expect(result.status).toBe("pending");
			expect(result.attempts).toBe(0);
			expect(result.appliedDeltaStock).toBe(-quantityToTake);
			expect(result.appliedDeltaBorrowed).toBe(0);

			// Verify Dexie outbox item stored
			const outboxRecord = await db.outbox.get(result.clientUuid);
			expect(outboxRecord).toBeDefined();
			expect(outboxRecord?.status).toBe("pending");
			expect(outboxRecord?.notes).toBe("Untuk audit visual");
			expect(outboxRecord?.referenceNumber).toBe("REF-PURE-01");

			// Verify local stock updated optimistically
			const updatedItem = await db.items.get(mockConsumable.id);
			expect(updatedItem?.current_stock).toBe(initialStock - quantityToTake);

			// Verify diagnostic log created
			const logs = await db.diagnostic_logs.toArray();
			const enqueueLog = logs.find(
				(l) =>
					l.message.includes("Transaction enqueued") && l.category === "OUTBOX",
			);
			expect(enqueueLog).toBeDefined();
		});
	});
});
