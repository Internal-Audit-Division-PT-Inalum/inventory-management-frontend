import { useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { db } from "@/lib/db";
import { postLogout } from "../api/postLogout";
import { useAuthStore } from "../store/authStore";

export interface UseLogoutReturn {
	isChecking: boolean;
	isLoggingOut: boolean;
	showWarningDialog: boolean;
	pendingCount: number;
	requestLogout: () => Promise<void>;
	cancelLogout: () => void;
	confirmLogout: () => Promise<void>;
}

/**
 * Hook orkestrasi logout aman dengan pengecekan antrean transaksi offline:
 * 1. Mengecek IndexedDB (db.outbox) untuk mendeteksi transaksi pending/syncing.
 * 2. Jika ada antrean belum tersinkronisasi, memunculkan modal peringatan.
 * 3. Jika pengguna mengonfirmasi (atau antrean kosong), sesi dibersihkan tanpa menghapus antrean di IndexedDB.
 */
export function useLogout(): UseLogoutReturn {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const logout = useAuthStore((state) => state.logout);

	const [isChecking, setIsChecking] = React.useState(false);
	const [isLoggingOut, setIsLoggingOut] = React.useState(false);
	const [showWarningDialog, setShowWarningDialog] = React.useState(false);
	const [pendingCount, setPendingCount] = React.useState(0);

	/**
	 * Menghitung jumlah transaksi yang masih pending/syncing di outbox IndexedDB.
	 */
	const getPendingOutboxCount = React.useCallback(async (): Promise<number> => {
		try {
			return await db.outbox
				.filter(
					(item) => item.status === "pending" || item.status === "syncing",
				)
				.count();
		} catch {
			return 0;
		}
	}, []);

	/**
	 * Melakukan proses pembersihan sesi lokal dan revocasi token server.
	 * PENTING: Antrean di IndexedDB db.outbox TIDAK PERNAH DIHAPUS.
	 */
	const performLogout = React.useCallback(async () => {
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
	const requestLogout = React.useCallback(async () => {
		setIsChecking(true);
		try {
			const count = await getPendingOutboxCount();
			if (count > 0) {
				setPendingCount(count);
				setShowWarningDialog(true);
			} else {
				await performLogout();
			}
		} finally {
			setIsChecking(false);
		}
	}, [getPendingOutboxCount, performLogout]);

	const cancelLogout = React.useCallback(() => {
		setShowWarningDialog(false);
	}, []);

	const confirmLogout = React.useCallback(async () => {
		setShowWarningDialog(false);
		await performLogout();
	}, [performLogout]);

	return {
		isChecking,
		isLoggingOut,
		showWarningDialog,
		pendingCount,
		requestLogout,
		cancelLogout,
		confirmLogout,
	};
}
