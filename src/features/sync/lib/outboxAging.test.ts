import { describe, expect, it } from "vitest";
import type { OutboxItem } from "@/lib/db";
import { calculateOutboxAging, IOS_EVICTION_MAX_DAYS } from "./outboxAging";

describe("Outbox Aging & iOS Warning Calculation Engine (Task P5.10)", () => {
	const fixedNow = new Date("2026-10-28T12:00:00Z");

	function createMockItem(
		clientUuid: string,
		createdAt: string,
		status: OutboxItem["status"] = "pending",
	): OutboxItem {
		return {
			clientUuid,
			employeeId: "emp-1",
			operation: "take",
			itemId: "item-1",
			quantity: 1,
			occurredAt: createdAt,
			status,
			attempts: 0,
			createdAt,
		};
	}

	it("returns 'none' warning level when there are no items or only synced items", () => {
		const emptyResult = calculateOutboxAging([], fixedNow);
		expect(emptyResult.warningLevel).toBe("none");
		expect(emptyResult.pendingCount).toBe(0);
		expect(emptyResult.hasStaleItems).toBe(false);
		expect(emptyResult.message).toBeNull();

		const allSynced = [
			createMockItem("u1", "2026-10-20T00:00:00Z", "synced"),
			createMockItem("u2", "2026-10-22T00:00:00Z", "synced"),
		];
		const syncedResult = calculateOutboxAging(allSynced, fixedNow);
		expect(syncedResult.warningLevel).toBe("none");
		expect(syncedResult.pendingCount).toBe(0);
	});

	it("returns 'none' for recent items (< 24h) on desktop/Android or standalone PWA", () => {
		// Dibuat 2 jam yang lalu
		const items = [createMockItem("u1", "2026-10-28T10:00:00Z", "pending")];

		const result = calculateOutboxAging(items, fixedNow, {
			isIos: false,
			isStandalone: false,
		});

		expect(result.warningLevel).toBe("none");
		expect(result.pendingCount).toBe(1);
		expect(result.oldestAgeHours).toBe(2);
		expect(result.hasStaleItems).toBe(false);
		expect(result.shouldSyncImmediately).toBe(false);
	});

	it("returns 'warning' for items older than 24h on any platform", () => {
		// Dibuat 30 jam yang lalu
		const items = [createMockItem("u1", "2026-10-27T06:00:00Z", "pending")];

		const result = calculateOutboxAging(items, fixedNow, {
			isIos: false,
			isStandalone: false,
		});

		expect(result.warningLevel).toBe("warning");
		expect(result.oldestAgeHours).toBe(30);
		expect(result.hasStaleItems).toBe(true);
		expect(result.shouldSyncImmediately).toBe(true);
		expect(result.message).toContain("30 jam");
	});

	it("returns 'danger' for items older than 72h (3 days)", () => {
		// Dibuat 80 jam (3 hari 8 jam) yang lalu
		const items = [createMockItem("u1", "2026-10-25T04:00:00Z", "pending")];

		const result = calculateOutboxAging(items, fixedNow, {
			isIos: false,
			isStandalone: false,
		});

		expect(result.warningLevel).toBe("danger");
		expect(result.oldestAgeHours).toBe(80);
		expect(result.oldestAgeDays).toBe(3);
		expect(result.shouldSyncImmediately).toBe(true);
		expect(result.message).toContain("3 hari");
	});

	it("triggers iOS Home Screen warning when pending items exist on iOS Safari browser", () => {
		// Item baru (1 jam lalu) di iOS Safari (bukan standalone)
		const items = [createMockItem("u1", "2026-10-28T11:00:00Z", "pending")];

		const result = calculateOutboxAging(items, fixedNow, {
			isIos: true,
			isStandalone: false,
		});

		expect(result.isIosBrowser).toBe(true);
		expect(result.warningLevel).toBe("warning");
		expect(result.shouldInstallToHomeScreen).toBe(true);
		expect(result.message).toContain("Pengguna iPhone");
		expect(result.estimatedDaysUntilIosEviction).toBe(IOS_EVICTION_MAX_DAYS);
	});

	it("triggers critical 'danger' on iOS Safari browser when items age approaches WebKit eviction (e.g. 4 days)", () => {
		// Dibuat 4 hari lalu di iOS Safari
		const items = [createMockItem("u1", "2026-10-24T12:00:00Z", "failed")];

		const result = calculateOutboxAging(items, fixedNow, {
			isIos: true,
			isStandalone: false,
		});

		expect(result.isIosBrowser).toBe(true);
		expect(result.warningLevel).toBe("danger");
		expect(result.oldestAgeDays).toBe(4);
		expect(result.estimatedDaysUntilIosEviction).toBe(3); // 7 - 4 = 3 hari tersisa
		expect(result.shouldInstallToHomeScreen).toBe(true);
		expect(result.shouldSyncImmediately).toBe(true);
		expect(result.message).toContain(
			"Safari dapat menghapus data lokal dalam 3 hari",
		);
	});

	it("does not demand Home Screen installation when already running as iOS standalone PWA", () => {
		// Dibuat 2 jam lalu pada iOS standalone PWA
		const items = [createMockItem("u1", "2026-10-28T10:00:00Z", "pending")];

		const result = calculateOutboxAging(items, fixedNow, {
			isIos: true,
			isStandalone: true, // Sudah terpasang di Home Screen
		});

		expect(result.isIosBrowser).toBe(false);
		expect(result.shouldInstallToHomeScreen).toBe(false);
		expect(result.warningLevel).toBe("none");
	});
});
