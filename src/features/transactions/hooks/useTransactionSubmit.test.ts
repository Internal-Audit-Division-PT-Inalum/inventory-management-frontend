import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/features/auth/store/authStore";
import { db } from "@/lib/db";
import type { Item } from "@/types/api";
import * as outboxQueueModule from "../lib/outboxQueue";
import type { TransactSubmitResult } from "../types";
import { useTransactionSubmit } from "./useTransactionSubmit";

const mockItem: Item = {
	id: "item-submit-1",
	location_id: "loc-1",
	name: "Rompi Safety K3",
	sku: "SAF-ROMPI-001",
	type: "consumable",
	current_stock: 20,
	minimum_stock: 5,
	unit: "pcs",
	image_url: null,
	is_active: true,
	created_at: "2026-10-01T08:00:00Z",
	updated_at: "2026-10-01T08:00:00Z",
};

describe("useTransactionSubmit Hook (Task P3.5)", () => {
	beforeEach(async () => {
		await db.items.clear();
		await db.outbox.clear();
		useAuthStore.getState().logout();
		vi.restoreAllMocks();
	});

	it("initializes with default idle state", () => {
		const { result } = renderHook(() => useTransactionSubmit());

		expect(result.current.isSubmitting).toBe(false);
		expect(result.current.lastResult).toBeNull();
		expect(result.current.error).toBeNull();
	});

	it("submits transaction using current authenticated employee identity", async () => {
		useAuthStore.setState({
			token: "valid-token-30d",
			employee: {
				id: "emp-999",
				user_id: "user-999",
				namecode: "RD12",
				name: "Raditya Pratama",
				email: "raditya@inalum.id",
				is_active: true,
				must_change_pin: false,
			},
		});

		const mockEnqueue = vi
			.spyOn(outboxQueueModule, "enqueueAndProcessTransaction")
			.mockResolvedValueOnce({
				success: true,
				synced: true,
				queued: false,
				message: "Transaksi berhasil dikirim",
			} as TransactSubmitResult);

		const { result } = renderHook(() => useTransactionSubmit());

		let submitPromise: Promise<TransactSubmitResult>;
		act(() => {
			submitPromise = result.current.submitTransaction(mockItem, "take", {
				quantity: 3,
				notes: "Keperluan audit K3",
				reference_number: "REF-001",
			});
		});

		expect(result.current.isSubmitting).toBe(true);

		let submitResult: TransactSubmitResult | undefined;
		await act(async () => {
			submitResult = await submitPromise;
		});

		expect(result.current.isSubmitting).toBe(false);
		expect(submitResult?.success).toBe(true);
		expect(result.current.lastResult?.message).toBe(
			"Transaksi berhasil dikirim",
		);
		expect(result.current.error).toBeNull();

		expect(mockEnqueue).toHaveBeenCalledWith(
			expect.objectContaining({
				item: mockItem,
				action: "take",
				employeeId: "emp-999",
				formData: {
					quantity: 3,
					notes: "Keperluan audit K3",
					reference_number: "REF-001",
				},
			}),
		);
	});

	it("captures error state when transaction is rejected fatally", async () => {
		vi.spyOn(
			outboxQueueModule,
			"enqueueAndProcessTransaction",
		).mockResolvedValueOnce({
			success: false,
			synced: false,
			queued: false,
			rejected: true,
			message: "Stok tidak mencukupi untuk pengambilan",
			error: {
				code: "INSUFFICIENT_STOCK",
				kind: "rejected",
				message: "Stok tidak mencukupi untuk pengambilan",
				status: 422,
			},
		} as TransactSubmitResult);

		const { result } = renderHook(() => useTransactionSubmit());

		await act(async () => {
			await result.current.submitTransaction(mockItem, "take", {
				quantity: 999,
			});
		});

		expect(result.current.isSubmitting).toBe(false);
		expect(result.current.lastResult?.rejected).toBe(true);
		expect(result.current.error?.code).toBe("INSUFFICIENT_STOCK");

		// Test reset function
		act(() => {
			result.current.reset();
		});

		expect(result.current.lastResult).toBeNull();
		expect(result.current.error).toBeNull();
		expect(result.current.isSubmitting).toBe(false);
	});
});
