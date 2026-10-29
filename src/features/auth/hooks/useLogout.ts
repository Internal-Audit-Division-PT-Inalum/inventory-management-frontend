import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { runSyncEngine } from "@/features/sync/lib/syncEngine";
import { db } from "@/lib/db";
import type { Employee } from "@/types/api";
import { postLogout } from "../api/postLogout";
import { useAuthStore } from "../store/authStore";

export interface UseLogoutReturn {
	isChecking: boolean;
	isLoggingOut: boolean;
	isSyncingBeforeLogout: boolean;
	showWarningDialog: boolean;
	/** Jumlah antrean tertunda milik akun yang sedang aktif */
	pendingCount: number;
	myPendingCount: number;
	/** Jumlah antrean tertunda milik akun lain di perangkat ini */
	otherPendingCount: number;
	totalPendingCount: number;
	employee: Employee | null;
	requestLogout: () => Promise<void>;
	cancelLogout: () => void;
	confirmLogout: () => Promise<void>;
	syncBeforeLogout: () => Promise<boolean>;
}

/**
 * Hook orkestrasi logout aman dengan penegakan isolasi antrean per employeeId (Task P5.11):
 * 1. Mengecek IndexedDB (db.outbox) secara terisolasi per akun saat ini dan akun lain di perangkat.
 * 2. Jika ada transaksi milik akun saat ini yang belum tersinkron, memunculkan modal peringatan final.
 * 3. Menyediakan opsi "Sinkronkan Dulu" langsung dari modal logout jika online.
 * 4. Saat logout dikonfirmasi, sesi dibersihkan tanpa pernah menghapus antrean outbox di IndexedDB (Zero Data Loss).
 */
export function useLogout(): UseLogoutReturn {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const logout = useAuthStore((state) => state.logout);
	const employee = useAuthStore((state) => state.employee);
	const employeeId = employee?.id;

	const [isChecking, setIsChecking] = useState(false);
	const [isLoggingOut, setIsLoggingOut] = useState(false);
	const [isSyncingBeforeLogout, setIsSyncingBeforeLogout] = useState(false);
	const [showWarningDialog, setShowWarningDialog] = useState(false);

	const [pendingCount, setPendingCount] = useState(0);
	const [myPendingCount, setMyPendingCount] = useState(0);
	const [otherPendingCount, setOtherPendingCount] = useState(0);
	const [totalPendingCount, setTotalPendingCount] = useState(0);

	/**
	 * Menghitung rincian antrean offline terisolasi untuk akun saat ini dan akun lain.
	 */
	const calculatePendingCounts = useCallback(async () => {
		try {
			const total = await db.getPendingOutboxCount({ includeFailed: true });

			let mine = 0;
			if (employeeId) {
				mine = await db.getPendingOutboxCount({
					employeeId,
					includeFailed: true,
				});
			} else {
				mine = total;
			}

			const others = Math.max(0, total - mine);

			setMyPendingCount(mine);
			setOtherPendingCount(others);
			setTotalPendingCount(total);
			setPendingCount(mine > 0 ? mine : total);

			return { mine, others, total };
		} catch {
			return { mine: 0, others: 0, total: 0 };
		}
	}, [employeeId]);

	/**
	 * Melakukan proses pembersihan sesi lokal dan revocasi token server.
	 * PENTING: Antrean di IndexedDB db.outbox TIDAK PERNAH DIHAPUS (Zero Data Loss).
	 */
	const performLogout = useCallback(async () => {
		setIsLoggingOut(true);
		try {
			// 1. Panggil API logout (server token revocation)
			await postLogout();

			// 2. Bersihkan in-memory & persisted auth state
			logout();

			// 3. Reset react query cache
			queryClient.clear();

			toast.success("Anda berhasil keluar dari sistem.");

			// 4. Arahkan ke halaman login
			navigate("/login", { replace: true });
		} finally {
			setIsLoggingOut(false);
			setShowWarningDialog(false);
		}
	}, [logout, navigate, queryClient]);

	/**
	 * Memulai alur logout: cek antrean offline terlebih dahulu.
	 */
	const requestLogout = useCallback(async () => {
		setIsChecking(true);
		try {
			const { total } = await calculatePendingCounts();
			if (total > 0) {
				setShowWarningDialog(true);
			} else {
				await performLogout();
			}
		} finally {
			setIsChecking(false);
		}
	}, [calculatePendingCounts, performLogout]);

	/**
	 * Fitur khusus: Sinkronkan antrean akun saat ini sebelum logout selesai.
	 */
	const syncBeforeLogout = useCallback(async (): Promise<boolean> => {
		setIsSyncingBeforeLogout(true);
		try {
			await runSyncEngine({
				employeeId,
				includeFailed: true,
			});

			// Perbarui kembali status antrean
			const { mine } = await calculatePendingCounts();
			if (mine === 0) {
				toast.success("Seluruh transaksi berhasil disinkronkan ke server.");
				// Otomatis lanjutkan logout jika sudah bersih
				await performLogout();
				return true;
			}
			return false;
		} catch (err) {
			toast.error(
				err instanceof Error
					? err.message
					: "Gagal menyinkronkan antrean sebelum keluar.",
			);
			return false;
		} finally {
			setIsSyncingBeforeLogout(false);
		}
	}, [employeeId, calculatePendingCounts, performLogout]);

	const cancelLogout = useCallback(() => {
		setShowWarningDialog(false);
	}, []);

	const confirmLogout = useCallback(async () => {
		setShowWarningDialog(false);
		await performLogout();
	}, [performLogout]);

	return {
		isChecking,
		isLoggingOut,
		isSyncingBeforeLogout,
		showWarningDialog,
		pendingCount:
			pendingCount > 0
				? pendingCount
				: myPendingCount > 0
					? myPendingCount
					: totalPendingCount,
		myPendingCount,
		otherPendingCount,
		totalPendingCount,
		employee,
		requestLogout,
		cancelLogout,
		confirmLogout,
		syncBeforeLogout,
	};
}
