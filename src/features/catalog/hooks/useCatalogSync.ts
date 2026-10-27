import { useCallback, useEffect, useRef, useState } from "react";
import { db } from "@/lib/db";
import { type CatalogSyncResult, syncCatalog } from "../api/syncCatalog";

export interface UseCatalogSyncOptions {
	autoSync?: boolean;
	syncOnMount?: boolean;
}

export interface UseCatalogSyncState {
	isSyncing: boolean;
	lastSyncedAt: string | null;
	isOffline: boolean;
	error: string | null;
	etag: string | null;
}

/**
 * Hook reaktif untuk sinkronisasi katalog inventaris dengan backend.
 * Mendukung auto-sync saat mount, saat kembali online, dan pemanggilan manual.
 */
export function useCatalogSync(options: UseCatalogSyncOptions = {}) {
	const { autoSync = true, syncOnMount = true } = options;

	const [state, setState] = useState<UseCatalogSyncState>({
		isSyncing: false,
		lastSyncedAt: null,
		isOffline: typeof navigator !== "undefined" ? !navigator.onLine : false,
		error: null,
		etag: null,
	});

	const isSyncingRef = useRef(false);

	// Muat metadata awal dari IndexedDB
	useEffect(() => {
		let isMounted = true;

		async function loadInitialMeta() {
			const [lastSynced, etag] = await Promise.all([
				db.getMeta("catalog_last_synced_at"),
				db.getMeta("catalog_etag"),
			]);

			if (isMounted) {
				setState((prev) => ({
					...prev,
					lastSyncedAt: lastSynced || null,
					etag: etag || null,
				}));
			}
		}

		loadInitialMeta();

		return () => {
			isMounted = false;
		};
	}, []);

	// Fungsi eksekusi sinkronisasi
	const syncNow = useCallback(async (opts?: { forceLocations?: boolean }) => {
		if (isSyncingRef.current) {
			return;
		}

		isSyncingRef.current = true;
		setState((prev) => ({ ...prev, isSyncing: true, error: null }));

		try {
			const result: CatalogSyncResult = await syncCatalog(opts);

			setState((prev) => ({
				...prev,
				isSyncing: false,
				lastSyncedAt: result.lastSyncedAt,
				etag: result.etag || prev.etag,
				isOffline: Boolean(result.isOffline),
				error: result.error || null,
			}));

			return result;
		} catch (err: unknown) {
			const msg =
				err instanceof Error ? err.message : "Terjadi kesalahan sinkronisasi";
			setState((prev) => ({
				...prev,
				isSyncing: false,
				error: msg,
			}));
		} finally {
			isSyncingRef.current = false;
		}
	}, []);

	// Sync saat pertama kali mount
	useEffect(() => {
		if (syncOnMount && autoSync) {
			syncNow();
		}
	}, [syncOnMount, autoSync, syncNow]);

	// Listener saat perangkat kembali online
	useEffect(() => {
		if (typeof window === "undefined") return;

		const handleOnline = () => {
			setState((prev) => ({ ...prev, isOffline: false }));
			if (autoSync) {
				syncNow();
			}
		};

		const handleOffline = () => {
			setState((prev) => ({ ...prev, isOffline: true }));
		};

		window.addEventListener("online", handleOnline);
		window.addEventListener("offline", handleOffline);

		return () => {
			window.removeEventListener("online", handleOnline);
			window.removeEventListener("offline", handleOffline);
		};
	}, [autoSync, syncNow]);

	return {
		...state,
		syncNow,
	};
}
