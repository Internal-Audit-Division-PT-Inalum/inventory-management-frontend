import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { OUTBOX_CHANGE_EVENT } from "@/components/layout/usePendingOutboxCount";
import {
	isIosDevice,
	isRunningStandalone,
} from "@/features/pwa/hooks/usePwaInstall";
import { TRANSACTION_COMMITTED_EVENT } from "@/features/transactions/lib/outboxEvents";
import { db, type OutboxItem } from "@/lib/db";
import {
	calculateOutboxAging,
	type OutboxAgingInfo,
	type OutboxAgingOptions,
} from "../lib/outboxAging";
import { SYNC_ENGINE_EVENT } from "../lib/syncEngine";

export const AGING_WARNING_DISMISSED_KEY =
	"inventory_aging_warning_dismissed_at";
export const AGING_WARNING_COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6 jam cooldown
export const DANGER_WARNING_COOLDOWN_MS = 1 * 60 * 60 * 1000; // 1 jam cooldown untuk level bahaya

export interface UseOutboxAgingWarningOptions extends OutboxAgingOptions {
	/**
	 * Interval pengecekan umur antrean dalam milidetik.
	 * Default: 10000ms (10 detik).
	 */
	checkIntervalMs?: number;
}

export interface UseOutboxAgingWarningResult {
	agingInfo: OutboxAgingInfo;
	hasWarning: boolean;
	isDismissed: boolean;
	isGuideModalOpen: boolean;
	dismissWarning: () => void;
	resetDismissed: () => void;
	openGuideModal: () => void;
	closeGuideModal: () => void;
	refreshAging: () => Promise<void>;
}

/**
 * Hook reaktif untuk memantau penuaan antrean outbox dan memicu peringatan khusus pengguna iOS Safari
 * terkait risiko penghapusan penyimpanan otomatis 7 hari oleh WebKit (ITP 7-day storage eviction).
 */
export function useOutboxAgingWarning(
	options: UseOutboxAgingWarningOptions = {},
): UseOutboxAgingWarningResult {
	const { checkIntervalMs = 10000, warningHours, dangerHours } = options;

	const [rawItems, setRawItems] = useState<OutboxItem[]>([]);
	const [isDismissed, setIsDismissed] = useState<boolean>(() => {
		if (typeof window === "undefined") return false;
		try {
			const saved = localStorage.getItem(AGING_WARNING_DISMISSED_KEY);
			if (!saved) return false;
			const timePassed = Date.now() - Number(saved);
			return timePassed < AGING_WARNING_COOLDOWN_MS;
		} catch {
			return false;
		}
	});
	const [isGuideModalOpen, setIsGuideModalOpen] = useState<boolean>(false);

	const isMountedRef = useRef<boolean>(true);

	// Deteksi platform klien
	const { isIos } = useMemo(() => isIosDevice(), []);
	const isStandalone = useMemo(() => isRunningStandalone(), []);

	const refreshAging = useCallback(async () => {
		try {
			const items = await db.getOutboxItems();
			if (isMountedRef.current) {
				setRawItems(items);
			}
		} catch (err) {
			console.warn("Gagal membaca antrean outbox untuk analisis penuaan:", err);
		}
	}, []);

	// Analisis penuaan antrean secara deterministik
	const agingInfo = useMemo(() => {
		return calculateOutboxAging(rawItems, new Date(), {
			isIos: options.isIos ?? isIos,
			isStandalone: options.isStandalone ?? isStandalone,
			warningHours,
			dangerHours,
		});
	}, [
		rawItems,
		options.isIos,
		isIos,
		options.isStandalone,
		isStandalone,
		warningHours,
		dangerHours,
	]);

	// Peringatan bahaya kritis mengabaikan cooldown dismiss biasa
	const shouldShowWarning = useMemo(() => {
		if (agingInfo.warningLevel === "none") return false;
		if (agingInfo.warningLevel === "danger") {
			// Periksa apakah dismiss baru saja dilakukan dalam 1 jam terakhir
			if (typeof window !== "undefined") {
				try {
					const saved = localStorage.getItem(AGING_WARNING_DISMISSED_KEY);
					if (saved) {
						const timePassed = Date.now() - Number(saved);
						return timePassed >= DANGER_WARNING_COOLDOWN_MS;
					}
				} catch {
					// Abaikan galat storage
				}
			}
			return true;
		}
		return !isDismissed;
	}, [agingInfo.warningLevel, isDismissed]);

	const dismissWarning = useCallback(() => {
		setIsDismissed(true);
		try {
			localStorage.setItem(AGING_WARNING_DISMISSED_KEY, Date.now().toString());
		} catch {
			// Abaikan galat localStorage
		}
	}, []);

	const resetDismissed = useCallback(() => {
		setIsDismissed(false);
		try {
			localStorage.removeItem(AGING_WARNING_DISMISSED_KEY);
		} catch {
			// Abaikan galat localStorage
		}
	}, []);

	const openGuideModal = useCallback(() => {
		setIsGuideModalOpen(true);
	}, []);

	const closeGuideModal = useCallback(() => {
		setIsGuideModalOpen(false);
	}, []);

	useEffect(() => {
		isMountedRef.current = true;
		void refreshAging();

		const handleQueueChange = () => {
			if (isMountedRef.current) {
				void refreshAging();
			}
		};

		if (typeof window !== "undefined") {
			window.addEventListener(TRANSACTION_COMMITTED_EVENT, handleQueueChange);
			window.addEventListener(SYNC_ENGINE_EVENT, handleQueueChange);
			window.addEventListener(OUTBOX_CHANGE_EVENT, handleQueueChange);
		}

		const interval = setInterval(() => {
			if (isMountedRef.current) {
				void refreshAging();
			}
		}, checkIntervalMs);

		return () => {
			isMountedRef.current = false;
			clearInterval(interval);
			if (typeof window !== "undefined") {
				window.removeEventListener(
					TRANSACTION_COMMITTED_EVENT,
					handleQueueChange,
				);
				window.removeEventListener(SYNC_ENGINE_EVENT, handleQueueChange);
				window.removeEventListener(OUTBOX_CHANGE_EVENT, handleQueueChange);
			}
		};
	}, [checkIntervalMs, refreshAging]);

	return {
		agingInfo,
		hasWarning: shouldShowWarning,
		isDismissed,
		isGuideModalOpen,
		dismissWarning,
		resetDismissed,
		openGuideModal,
		closeGuideModal,
		refreshAging,
	};
}
