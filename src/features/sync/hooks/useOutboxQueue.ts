import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { OUTBOX_CHANGE_EVENT } from "@/components/layout/usePendingOutboxCount";
import { useAuthStore } from "@/features/auth/store/authStore";
import { TRANSACTION_COMMITTED_EVENT } from "@/features/transactions/lib/outboxEvents";
import {
	discardOutboxItem,
	retryOutboxItem,
} from "@/features/transactions/lib/statusMachine";
import { db, type OutboxItem } from "@/lib/db";
import {
	isSyncEngineRunning,
	runSyncEngine,
	SYNC_ENGINE_EVENT,
} from "../lib/syncEngine";
import { syncScheduler } from "../lib/syncScheduler";

export type OutboxQueueTab = "all" | "pending" | "needs_action" | "synced";
export type OutboxQueueScope = "current_employee" | "all";

export interface EnrichedOutboxItem extends OutboxItem {
	itemName: string;
	itemSku: string;
	itemUnit: string;
}

export interface OutboxQueueCounters {
	total: number;
	pending: number;
	needsAction: number;
	synced: number;
}

export interface UseOutboxQueueOptions {
	/**
	 * Batasi antrean hanya untuk karyawan tertentu (opsional).
	 */
	employeeId?: string;
	/**
	 * Cakupan filter akun: hanya akun login saat ini ('current_employee') atau semua akun di perangkat ('all').
	 * Default: 'current_employee'.
	 */
	initialScope?: OutboxQueueScope;
	/**
	 * Interval polling dalam milidetik untuk memastikan data tetap segar.
	 * Default: 4000ms.
	 */
	pollIntervalMs?: number;
	/**
	 * Tab aktif mula-mula.
	 * Default: "all".
	 */
	initialTab?: OutboxQueueTab;
}

export interface UseOutboxQueueResult {
	items: EnrichedOutboxItem[];
	filteredItems: EnrichedOutboxItem[];
	counters: OutboxQueueCounters;
	activeTab: OutboxQueueTab;
	setActiveTab: (tab: OutboxQueueTab) => void;
	scope: OutboxQueueScope;
	setScope: (scope: OutboxQueueScope) => void;
	otherEmployeesPendingCount: number;
	currentEmployeeId: string | undefined;
	isLoading: boolean;
	isSyncing: boolean;
	refreshQueue: () => Promise<void>;
	retryItem: (clientUuid: string) => Promise<void>;
	discardItem: (clientUuid: string) => Promise<void>;
	syncNow: () => Promise<void>;
}

/**
 * Hook reaktif terpadu untuk mengelola Layar Antrian Outbox Offline:
 * - Mengambil seluruh entri outbox dari IndexedDB dan memperkaya informasi barang dari katalog lokal.
 * - Menegakkan isolasi antrean per employeeId (Task P5.11) secara otomatis.
 * - Menghitung ringkasan status antrean (Total, Menunggu, Perlu Tindakan, Tersinkron).
 * - Menghitung jumlah transaksi offline milik akun lain yang tersimpan aman di perangkat.
 * - Mendukung penyaringan per tab dan per scope akun.
 */
export function useOutboxQueue(
	options: UseOutboxQueueOptions = {},
): UseOutboxQueueResult {
	const currentEmployee = useAuthStore((state) => state.employee);
	const currentEmployeeId = currentEmployee?.id;

	const {
		employeeId = currentEmployeeId,
		initialScope = "current_employee",
		pollIntervalMs = 4000,
		initialTab = "all",
	} = options;

	const [items, setItems] = useState<EnrichedOutboxItem[]>([]);
	const [activeTab, setActiveTab] = useState<OutboxQueueTab>(initialTab);
	const [scope, setScope] = useState<OutboxQueueScope>(initialScope);
	const [otherEmployeesPendingCount, setOtherEmployeesPendingCount] =
		useState<number>(0);
	const [isLoading, setIsLoading] = useState<boolean>(true);
	const [isSyncing, setIsSyncing] = useState<boolean>(isSyncEngineRunning());

	const isMountedRef = useRef<boolean>(true);

	const refreshQueue = useCallback(async () => {
		try {
			// 1. Ambil seluruh entri outbox dari IndexedDB
			const rawAllItems: OutboxItem[] = await db.getOutboxItems();

			// 2. Hitung jumlah antrean tertunda milik akun lain di perangkat ini
			if (currentEmployeeId) {
				const othersCount = rawAllItems.filter(
					(i) => i.employeeId !== currentEmployeeId && i.status !== "synced",
				).length;
				if (isMountedRef.current) {
					setOtherEmployeesPendingCount(othersCount);
				}
			} else {
				if (isMountedRef.current) {
					setOtherEmployeesPendingCount(0);
				}
			}

			// 3. Terapkan filter scope/employeeId (Task P5.11 Isolasi Akun)
			let rawItems = rawAllItems;
			if (scope === "current_employee" && employeeId) {
				rawItems = rawAllItems.filter((i) => i.employeeId === employeeId);
			}

			// 4. Kumpulkan ID unik item untuk query katalog lokal sekaligus
			const uniqueItemIds = Array.from(new Set(rawItems.map((i) => i.itemId)));
			const itemRecords = await Promise.all(
				uniqueItemIds.map(async (id) => {
					const item = await db.items.get(id);
					return { id, item };
				}),
			);

			const itemMap = new Map<
				string,
				{ name: string; sku: string; unit: string }
			>();
			for (const { id, item } of itemRecords) {
				if (item) {
					itemMap.set(id, {
						name: item.name,
						sku: item.sku,
						unit: item.unit,
					});
				}
			}

			// 5. Bentuk daftar EnrichedOutboxItem
			const enriched: EnrichedOutboxItem[] = rawItems.map((outbox) => {
				const info = itemMap.get(outbox.itemId);
				return {
					...outbox,
					itemName: info?.name ?? `Barang #${outbox.itemId.slice(0, 8)}`,
					itemSku: info?.sku ?? outbox.itemId.slice(0, 8).toUpperCase(),
					itemUnit: info?.unit ?? "unit",
				};
			});

			if (isMountedRef.current) {
				setItems(enriched);
				setIsLoading(false);
				setIsSyncing(isSyncEngineRunning());
			}
		} catch (err) {
			console.warn("Gagal memperbarui daftar antrean outbox:", err);
			if (isMountedRef.current) {
				setIsLoading(false);
			}
		}
	}, [employeeId, currentEmployeeId, scope]);

	// Hitung counter kategori secara efisien
	const counters: OutboxQueueCounters = useMemo(() => {
		let pending = 0;
		let needsAction = 0;
		let synced = 0;

		for (const item of items) {
			if (item.status === "pending" || item.status === "syncing") {
				pending++;
			} else if (item.status === "failed" || item.status === "rejected") {
				needsAction++;
			} else if (item.status === "synced") {
				synced++;
			}
		}

		return {
			total: items.length,
			pending,
			needsAction,
			synced,
		};
	}, [items]);

	// Saring item berdasarkan tab aktif
	const filteredItems: EnrichedOutboxItem[] = useMemo(() => {
		switch (activeTab) {
			case "pending":
				return items.filter(
					(i) => i.status === "pending" || i.status === "syncing",
				);
			case "needs_action":
				return items.filter(
					(i) => i.status === "failed" || i.status === "rejected",
				);
			case "synced":
				return items.filter((i) => i.status === "synced");
			default:
				return items;
		}
	}, [items, activeTab]);

	// Aksi Coba Lagi (Retry) untuk item failed / rejected
	const retryItem = useCallback(
		async (clientUuid: string) => {
			await retryOutboxItem(clientUuid);
			// Refresh state lokal
			await refreshQueue();
			// Picu sinkronisasi manual ke sync scheduler
			await syncScheduler.triggerManualSync();
		},
		[refreshQueue],
	);

	// Aksi Hapus / Batalkan Antrean (Discard & Rollback Stok)
	const discardItem = useCallback(
		async (clientUuid: string) => {
			await discardOutboxItem(clientUuid);
			await refreshQueue();
		},
		[refreshQueue],
	);

	// Aksi Sinkronkan Sekarang (hanya untuk akun aktif)
	const syncNow = useCallback(async () => {
		setIsSyncing(true);
		try {
			await runSyncEngine({
				employeeId: scope === "current_employee" ? employeeId : undefined,
				includeFailed: true,
			});
		} finally {
			if (isMountedRef.current) {
				setIsSyncing(isSyncEngineRunning());
				await refreshQueue();
			}
		}
	}, [employeeId, scope, refreshQueue]);

	// Lifecycle effect: polling & event listeners
	useEffect(() => {
		isMountedRef.current = true;
		void refreshQueue();

		const handleQueueEvent = () => {
			if (isMountedRef.current) {
				setIsSyncing(isSyncEngineRunning());
				void refreshQueue();
			}
		};

		if (typeof window !== "undefined") {
			window.addEventListener(TRANSACTION_COMMITTED_EVENT, handleQueueEvent);
			window.addEventListener(SYNC_ENGINE_EVENT, handleQueueEvent);
			window.addEventListener(OUTBOX_CHANGE_EVENT, handleQueueEvent);
		}

		const interval = setInterval(() => {
			if (isMountedRef.current) {
				setIsSyncing(isSyncEngineRunning());
				void refreshQueue();
			}
		}, pollIntervalMs);

		return () => {
			isMountedRef.current = false;
			clearInterval(interval);
			if (typeof window !== "undefined") {
				window.removeEventListener(
					TRANSACTION_COMMITTED_EVENT,
					handleQueueEvent,
				);
				window.removeEventListener(SYNC_ENGINE_EVENT, handleQueueEvent);
				window.removeEventListener(OUTBOX_CHANGE_EVENT, handleQueueEvent);
			}
		};
	}, [pollIntervalMs, refreshQueue]);

	return {
		items,
		filteredItems,
		counters,
		activeTab,
		setActiveTab,
		scope,
		setScope,
		otherEmployeesPendingCount,
		currentEmployeeId,
		isLoading,
		isSyncing,
		refreshQueue,
		retryItem,
		discardItem,
		syncNow,
	};
}
