import { useCallback, useEffect, useState } from "react";
import {
	selectCurrentEmployee,
	useAuthStore,
} from "@/features/auth/store/authStore";
import { CATALOG_SYNC_EVENT } from "@/features/catalog/api/syncCatalog";
import { SYNC_ENGINE_EVENT } from "@/features/sync";
import { TRANSACTION_COMMITTED_EVENT } from "@/features/transactions/lib/outboxEvents";
import { db } from "@/lib/db";
import type { Item } from "@/types/api";
import { transformOutboxToActivities } from "../lib/activityTransformer";
import type { RecentActivityItem } from "../types";

export interface UseRecentActivitiesOptions {
	limit?: number;
	autoRefresh?: boolean;
}

export interface UseRecentActivitiesResult {
	activities: RecentActivityItem[];
	isLoading: boolean;
	refetch: () => Promise<void>;
}

/**
 * Hook reaktif offline-first untuk memuat feed aktivitas transaksi terbaru auditor dari IndexedDB outbox.
 */
export function useRecentActivities(
	options: UseRecentActivitiesOptions = {},
): UseRecentActivitiesResult {
	const { limit = 8, autoRefresh = true } = options;
	const currentEmployee = useAuthStore(selectCurrentEmployee);

	const [activities, setActivities] = useState<RecentActivityItem[]>([]);
	const [isLoading, setIsLoading] = useState<boolean>(true);

	const loadActivities = useCallback(async () => {
		try {
			if (!currentEmployee?.id) {
				setActivities([]);
				setIsLoading(false);
				return;
			}

			// 1. Ambil entri outbox terbaru milik auditor saat ini
			const outboxItems = await db.getOutboxItems({
				employeeId: currentEmployee.id,
			});
			const slicedOutbox = outboxItems.slice(0, limit);

			// 2. Kumpulkan item ID dan ambil data item terkait dari IndexedDB
			const itemIds = Array.from(new Set(slicedOutbox.map((o) => o.itemId)));
			const itemRecords = await Promise.all(
				itemIds.map((id) => db.items.get(id)),
			);
			const itemMap = new Map<string, Item>();
			for (const item of itemRecords) {
				if (item) {
					itemMap.set(item.id, item);
				}
			}

			// 3. Transformasikan ke RecentActivityItem
			const transformed = transformOutboxToActivities(slicedOutbox, itemMap);
			setActivities(transformed);
		} catch (error) {
			console.warn(
				"Gagal memuat feed aktivitas terbaru dari IndexedDB:",
				error,
			);
		} finally {
			setIsLoading(false);
		}
	}, [currentEmployee?.id, limit]);

	useEffect(() => {
		let isMounted = true;

		loadActivities();

		if (!autoRefresh) {
			return;
		}

		const handleInvalidation = () => {
			if (isMounted) {
				loadActivities();
			}
		};

		if (typeof window !== "undefined") {
			window.addEventListener(TRANSACTION_COMMITTED_EVENT, handleInvalidation);
			window.addEventListener(CATALOG_SYNC_EVENT, handleInvalidation);
			window.addEventListener(SYNC_ENGINE_EVENT, handleInvalidation);
		}

		return () => {
			isMounted = false;
			if (typeof window !== "undefined") {
				window.removeEventListener(
					TRANSACTION_COMMITTED_EVENT,
					handleInvalidation,
				);
				window.removeEventListener(CATALOG_SYNC_EVENT, handleInvalidation);
				window.removeEventListener(SYNC_ENGINE_EVENT, handleInvalidation);
			}
		};
	}, [loadActivities, autoRefresh]);

	return {
		activities,
		isLoading,
		refetch: loadActivities,
	};
}
