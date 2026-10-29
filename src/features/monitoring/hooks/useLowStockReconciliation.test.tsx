import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import type { Item } from "@/types/api";
import * as lowStockApi from "../api/getLowStockReport";
import type { ItemStockHealth } from "../types";
import { useLowStockReconciliation } from "./useLowStockReconciliation";

vi.mock("../api/getLowStockReport", () => ({
	getLowStockReportApi: vi.fn(),
}));

describe("useLowStockReconciliation Hook (Task P6.3)", () => {
	let queryClient: QueryClient;

	beforeEach(async () => {
		vi.clearAllMocks();
		queryClient = new QueryClient({
			defaultOptions: {
				queries: {
					retry: false,
				},
			},
		});

		await db.outbox.clear();
	});

	const wrapper = ({ children }: { children: React.ReactNode }) => (
		<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
	);

	const createMockHealth = (id: string, name: string): ItemStockHealth => ({
		item: {
			id,
			name,
			sku: `SKU-${id}`,
			type: "consumable",
			unit: "buah",
			location_id: "loc-1",
			current_stock: 2,
			minimum_stock: 5,
			image_url: null,
			updated_at: "2026-10-29T00:00:00.000Z",
		},
		effectiveStock: 2,
		confirmedStock: 2,
		minimumStock: 5,
		status: "critical",
		deficit: 3,
		isEstimated: false,
		hasPendingTransactions: false,
		pendingTransactionsCount: 0,
	});

	const createMockServerItem = (id: string, name: string): Item => ({
		id,
		name,
		sku: `SKU-${id}`,
		type: "consumable",
		unit: "buah",
		location_id: "loc-1",
		current_stock: 2,
		minimum_stock: 5,
		image_url: null,
		updated_at: "2026-10-29T00:00:00.000Z",
	});

	it("merekonsiliasi data stok rendah lokal dengan server dan menghasilkan status reconciled", async () => {
		const localUrgent = [createMockHealth("item-1", "Kertas A4")];
		const serverItems = [createMockServerItem("item-1", "Kertas A4")];

		vi.mocked(lowStockApi.getLowStockReportApi).mockResolvedValueOnce(
			serverItems,
		);

		const { result } = renderHook(
			() => useLowStockReconciliation({ localUrgentItems: localUrgent }),
			{ wrapper },
		);

		await waitFor(() => {
			expect(result.current.isChecking).toBe(false);
		});

		expect(result.current.reconciliation.status).toBe("reconciled");
		expect(result.current.reconciliation.isMatching).toBe(true);
		expect(result.current.reconciliation.localCount).toBe(1);
		expect(result.current.reconciliation.serverCount).toBe(1);
	});

	it("mendeteksi divergensi mutasi antre saat terdapat outbox lokal", async () => {
		const localUrgent = [
			createMockHealth("item-1", "Kertas A4"),
			createMockHealth("item-2", "Sarung Tangan Las"),
		];
		const serverItems = [createMockServerItem("item-1", "Kertas A4")];

		await db.outbox.put({
			clientUuid: "outbox-take-2",
			employeeId: "emp-1",
			operation: "take",
			itemId: "item-2",
			quantity: 5,
			occurredAt: new Date().toISOString(),
			status: "pending",
			attempts: 0,
			createdAt: new Date().toISOString(),
		});

		vi.mocked(lowStockApi.getLowStockReportApi).mockResolvedValueOnce(
			serverItems,
		);

		const { result } = renderHook(
			() => useLowStockReconciliation({ localUrgentItems: localUrgent }),
			{ wrapper },
		);

		await waitFor(() => {
			expect(result.current.isChecking).toBe(false);
		});

		expect(result.current.reconciliation.status).toBe(
			"divergent_pending_mutations",
		);
		expect(result.current.reconciliation.isMatching).toBe(false);
		expect(result.current.reconciliation.localOnlyItemIds).toEqual(["item-2"]);
	});
});
