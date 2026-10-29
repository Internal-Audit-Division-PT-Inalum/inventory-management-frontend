import { useCallback, useEffect, useRef, useState } from "react";
import { TRANSACTION_COMMITTED_EVENT } from "@/features/transactions/lib/outboxEvents";
import { db } from "@/lib/db";
import {
	isSyncEngineRunning,
	runSyncEngine,
	SYNC_ENGINE_EVENT,
	type SyncEngineOptions,
	type SyncEngineResult,
} from "../lib/syncEngine";

export interface UseSyncEngineOptions {
	employeeId?: string;
	includeFailed?: boolean;
}

export interface UseSyncEngineResult {
	isSyncing: boolean;
	pendingCount: number;
	lastResult: SyncEngineResult | null;
	syncNow: (options?: SyncEngineOptions) => Promise<SyncEngineResult>;
	refreshPendingCount: () => Promise<void>;
}

/**
 * Hook reaktif untuk memantau status Sync Engine dan jumlah antrean outbox.
 * Otomatis memperbarui counter saat transaksi dimasukkan ke outbox atau saat siklus sync selesai.
 */
export function useSyncEngine(
	options: UseSyncEngineOptions = {},
): UseSyncEngineResult {
	const { employeeId, includeFailed = true } = options;

	const [isSyncing, setIsSyncing] = useState<boolean>(isSyncEngineRunning());
	const [pendingCount, setPendingCount] = useState<number>(0);
	const [lastResult, setLastResult] = useState<SyncEngineResult | null>(null);

	const isMountedRef = useRef(true);

	const refreshPendingCount = useCallback(async () => {
		try {
			const count = await db.getPendingOutboxCount({
				employeeId,
				includeFailed,
			});
			if (isMountedRef.current) {
				setPendingCount(count);
			}
		} catch (err) {
			console.warn("Gagal menghitung antrean pending outbox:", err);
		}
	}, [employeeId, includeFailed]);

	const syncNow = useCallback(
		async (opts?: SyncEngineOptions): Promise<SyncEngineResult> => {
			setIsSyncing(true);
			try {
				const result = await runSyncEngine({
					employeeId,
					includeFailed,
					...opts,
				});
				if (isMountedRef.current) {
					setLastResult(result);
				}
				return result;
			} finally {
				if (isMountedRef.current) {
					setIsSyncing(isSyncEngineRunning());
					await refreshPendingCount();
				}
			}
		},
		[employeeId, includeFailed, refreshPendingCount],
	);

	useEffect(() => {
		isMountedRef.current = true;
		refreshPendingCount();

		const handleTransactionEvent = () => {
			refreshPendingCount();
		};

		const handleSyncEngineEvent = (e: Event) => {
			const customEvent = e as CustomEvent<SyncEngineResult>;
			if (isMountedRef.current) {
				setIsSyncing(isSyncEngineRunning());
				if (customEvent.detail) {
					setLastResult(customEvent.detail);
				}
			}
			refreshPendingCount();
		};

		if (typeof window !== "undefined") {
			window.addEventListener(
				TRANSACTION_COMMITTED_EVENT,
				handleTransactionEvent,
			);
			window.addEventListener(SYNC_ENGINE_EVENT, handleSyncEngineEvent);
		}

		return () => {
			isMountedRef.current = false;
			if (typeof window !== "undefined") {
				window.removeEventListener(
					TRANSACTION_COMMITTED_EVENT,
					handleTransactionEvent,
				);
				window.removeEventListener(SYNC_ENGINE_EVENT, handleSyncEngineEvent);
			}
		};
	}, [refreshPendingCount]);

	return {
		isSyncing,
		pendingCount,
		lastResult,
		syncNow,
		refreshPendingCount,
	};
}
