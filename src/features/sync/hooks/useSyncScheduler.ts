import { useCallback, useEffect, useState } from "react";
import {
	SYNC_TRIGGERED_EVENT,
	type SyncEngineResult,
	type SyncSchedulerOptions,
	type SyncTriggerReason,
	syncPauseController,
	syncScheduler,
} from "../index";

export interface UseSyncSchedulerResult {
	triggerSync: () => Promise<SyncEngineResult | null>;
	isOnline: boolean;
	isPaused: boolean;
	lastTriggerReason: SyncTriggerReason | null;
}

/**
 * Hook reaktif untuk mengaktifkan orchestrator pemicu sinkronisasi (app_mount, online, visibility, interval, manual)
 * dalam lifecycle komponen React (misal di AppShell root).
 */
export function useSyncScheduler(
	options?: SyncSchedulerOptions,
): UseSyncSchedulerResult {
	const [isOnline, setIsOnline] = useState<boolean>(() =>
		typeof navigator !== "undefined" ? navigator.onLine !== false : true,
	);
	const [isPaused, setIsPaused] = useState<boolean>(() =>
		syncPauseController.isPaused(),
	);
	const [lastTriggerReason, setLastTriggerReason] =
		useState<SyncTriggerReason | null>(() =>
			syncScheduler.getLastTriggerReason(),
		);

	useEffect(() => {
		// Mulai scheduler saat komponen di-mount
		syncScheduler.start(options);

		// Listener online / offline lokal
		const handleOnline = () => setIsOnline(true);
		const handleOffline = () => setIsOnline(false);

		// Listener event pemicu sinkronisasi
		const handleTriggered = (e: Event) => {
			const customEvent = e as CustomEvent<{ reason: SyncTriggerReason }>;
			if (customEvent.detail?.reason) {
				setLastTriggerReason(customEvent.detail.reason);
			}
		};

		// Listener status jeda autentikasi
		const unsubscribePause = syncPauseController.subscribe((state) => {
			setIsPaused(state.isPaused);
		});

		if (typeof window !== "undefined") {
			window.addEventListener("online", handleOnline);
			window.addEventListener("offline", handleOffline);
			window.addEventListener(SYNC_TRIGGERED_EVENT, handleTriggered);
		}

		return () => {
			syncScheduler.stop();
			unsubscribePause();

			if (typeof window !== "undefined") {
				window.removeEventListener("online", handleOnline);
				window.removeEventListener("offline", handleOffline);
				window.removeEventListener(SYNC_TRIGGERED_EVENT, handleTriggered);
			}
		};
	}, [options]);

	const triggerSync = useCallback(async () => {
		return await syncScheduler.triggerManualSync();
	}, []);

	return {
		triggerSync,
		isOnline,
		isPaused,
		lastTriggerReason,
	};
}
