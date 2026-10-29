import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useAuthStore } from "@/features/auth/store/authStore";
import { TRANSACTION_COMMITTED_EVENT } from "@/features/transactions/lib/outboxEvents";
import { db } from "@/lib/db";
import type { Employee, Item } from "@/types/api";
import { useRecentActivities } from "./useRecentActivities";

describe("useRecentActivities Hook (Task P6.2)", () => {
	const mockEmployee: Employee = {
		id: "emp-test-01",
		user_id: "user-01",
		namecode: "MRA",
		name: "Muhammad Raihan Auditor",
		email: "raihan@inalum.id",
		is_active: true,
		must_change_pin: false,
	};

	const mockItem: Item = {
		id: "item-1",
		sku: "PPE-GLV-001",
		name: "Sarung Tangan Las",
		type: "consumable",
		unit: "pasang",
		location_id: "loc-1",
		current_stock: 10,
		minimum_stock: 5,
		image_url: null,
		is_active: true,
		updated_at: "2026-10-29T00:00:00.000Z",
	};

	beforeEach(async () => {
		useAuthStore.setState({
			token: "mock-token",
			employee: mockEmployee,
			mustChangePin: false,
		});

		await db.items.clear();
		await db.outbox.clear();

		await db.items.put(mockItem);
	});

	afterEach(async () => {
		await db.items.clear();
		await db.outbox.clear();
	});

	it("memuat aktivitas transaksi outbox milik auditor saat ini", async () => {
		await db.outbox.put({
			clientUuid: "uuid-1",
			employeeId: "emp-test-01",
			operation: "take",
			itemId: "item-1",
			quantity: 3,
			status: "pending",
			occurredAt: new Date().toISOString(),
			createdAt: new Date().toISOString(),
			attempts: 0,
		});

		// Transaksi milik auditor lain (harus diisolasi / tidak muncul)
		await db.outbox.put({
			clientUuid: "uuid-other",
			employeeId: "emp-other-99",
			operation: "take",
			itemId: "item-1",
			quantity: 1,
			status: "pending",
			occurredAt: new Date().toISOString(),
			createdAt: new Date().toISOString(),
			attempts: 0,
		});

		const { result } = renderHook(() => useRecentActivities());

		await waitFor(() => {
			expect(result.current.isLoading).toBe(false);
		});

		expect(result.current.activities).toHaveLength(1);
		expect(result.current.activities[0].id).toBe("uuid-1");
		expect(result.current.activities[0].itemName).toBe("Sarung Tangan Las");
		expect(result.current.activities[0].operationLabel).toBe(
			"Pengambilan Barang",
		);
		expect(result.current.activities[0].quantity).toBe(3);
		expect(result.current.activities[0].status).toBe("pending");
	});

	it("memperbarui daftar aktivitas secara reaktif saat TRANSACTION_COMMITTED_EVENT dipicu", async () => {
		const { result } = renderHook(() => useRecentActivities());

		await waitFor(() => {
			expect(result.current.isLoading).toBe(false);
		});

		expect(result.current.activities).toHaveLength(0);

		// Tambahkan transaksi baru
		await db.outbox.put({
			clientUuid: "uuid-new",
			employeeId: "emp-test-01",
			operation: "add",
			itemId: "item-1",
			quantity: 10,
			status: "synced",
			occurredAt: new Date().toISOString(),
			createdAt: new Date().toISOString(),
			attempts: 1,
		});

		act(() => {
			window.dispatchEvent(new CustomEvent(TRANSACTION_COMMITTED_EVENT));
		});

		await waitFor(() => {
			expect(result.current.activities).toHaveLength(1);
			expect(result.current.activities[0].operationLabel).toBe(
				"Penerimaan / Restok",
			);
			expect(result.current.activities[0].status).toBe("synced");
		});
	});
});
