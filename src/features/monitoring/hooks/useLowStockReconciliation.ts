import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CATALOG_SYNC_EVENT } from "@/features/catalog/api/syncCatalog";
import { SYNC_ENGINE_EVENT } from "@/features/sync";
import { TRANSACTION_COMMITTED_EVENT } from "@/features/transactions/lib/outboxEvents";
import { db, type OutboxItem } from "@/lib/db";
import type { Item } from "@/types/api";
import { getLowStockReportApi } from "../api/getLowStockReport";
import { reconcileLowStockReports } from "../lib/reconciliationEngine";
import type { ItemStockHealth, LowStockReconciliationResult } from "../types";

export interface UseLowStockReconciliationOptions {
	localUrgentItems: ItemStockHealth[];
	enabled?: boolean;
}

export interface UseLowStockReconciliationResult {
	reconciliation: LowStockReconciliationResult;
	isChecking: boolean;
	isError: boolean;
	serverItems: Item[];
	refetch: () => Promise<unknown>;
}

/**
 * Hook reaktif untuk rekonsiliasi metrik stok rendah lokal vs laporan backend /reports/low-stock (Task P6.3).
 */
export function useLowStockReconciliation(
	options: UseLowStockReconciliationOptions,
): UseLowStockReconciliationResult {
	const { localUrgentItems, enabled = true } = options;

	const [isOnline, setIsOnline] = useState<boolean>(
		typeof navigator !== "undefined" ? navigator.onLine : true,
	);
	const [pendingOutbox, setPendingOutbox] = useState<OutboxItem[]>([]);

	// 1. Ambil transaksi outbox lokal yang masih pending/syncing
	const loadPendingOutbox = useCallback(async () => {
		try {
			const items = await db.outbox
				.where("status")
				.anyOf(["pending", "syncing"])
				.toArray();
			setPendingOutbox(items);
		} catch (err) {
			console.warn("Gagal memuat antrean pending outbox rekonsiliasi:", err);
		}
	}, []);

	useEffect(() => {
		loadPendingOutbox();

		const handleOnline = () => setIsOnline(true);
		const handleOffline = () => setIsOnline(false);

		if (typeof window !== "undefined") {
			window.addEventListener("online", handleOnline);
			window.addEventListener("offline", handleOffline);
			window.addEventListener(TRANSACTION_COMMITTED_EVENT, loadPendingOutbox);
			window.addEventListener(CATALOG_SYNC_EVENT, loadPendingOutbox);
			window.addEventListener(SYNC_ENGINE_EVENT, loadPendingOutbox);
		}

		return () => {
			if (typeof window !== "undefined") {
				window.removeEventListener("online", handleOnline);
				window.removeEventListener("offline", handleOffline);
				window.removeEventListener(
					TRANSACTION_COMMITTED_EVENT,
					loadPendingOutbox,
				);
				window.removeEventListener(CATALOG_SYNC_EVENT, loadPendingOutbox);
				window.removeEventListener(SYNC_ENGINE_EVENT, loadPendingOutbox);
			}
		};
	}, [loadPendingOutbox]);

	// 2. Fetch laporan stok rendah dari server jika dalam mode online
	const query = useQuery<Item[], Error>({
		queryKey: ["reports", "low-stock"],
		queryFn: getLowStockReportApi,
		enabled: enabled && isOnline,
		staleTime: 60_000,
		retry: 1,
	});

	// 3. Komparasi rekonsiliasi data
	const reconciliation = useMemo(() => {
		const serverData = !isOnline || query.isError ? null : (query.data ?? null);

		return reconcileLowStockReports({
			localUrgentItems,
			serverItems: serverData,
			pendingOutboxItems: pendingOutbox,
			isOnline,
		});
	}, [localUrgentItems, query.data, query.isError, pendingOutbox, isOnline]);

	return {
		reconciliation,
		isChecking: query.isLoading || query.isFetching,
		isError: query.isError,
		serverItems: query.data ?? [],
		refetch: query.refetch,
	};
}
