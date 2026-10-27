import { createBrowserRouter, Navigate } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { MustChangePinRoute } from "@/features/auth/components/MustChangePinRoute";
import { ProtectedRoute } from "@/features/auth/components/ProtectedRoute";
import { ChangePinPage } from "@/pages/ChangePinPage";
import { HomePage } from "@/pages/HomePage";
import { LoansPage } from "@/pages/LoansPage";
import { LoginPage } from "@/pages/LoginPage";
import { OutboxPage } from "@/pages/OutboxPage";
import { ProfilePage } from "@/pages/ProfilePage";

/**
 * Konfigurasi router utama aplikasi Mobile PWA Inventaris PT INALUM:
 * 1. /login: Halaman login publik. Jika pegawai sudah login, dialihkan ke beranda.
 * 2. /change-pin: Halaman ubah PIN dengan proteksi MustChangePinRoute.
 * 3. /: Rute internal diproteksi oleh ProtectedRoute dan dibungkus oleh AppShell (Header + BottomNav):
 *    - /: Beranda & Katalog Barang
 *    - /loans: Modul Pinjaman Saya (Fase P4)
 *    - /outbox: Antrean Transaksi Offline (Fase P5)
 *    - /profile: Profil Pegawai & Pengaturan Akun
 * 4. *: Catch-all redirect ke root.
 */
export const router = createBrowserRouter([
	{
		path: "/login",
		element: <LoginPage />,
	},
	{
		element: <MustChangePinRoute />,
		children: [
			{
				path: "/change-pin",
				element: <ChangePinPage />,
			},
		],
	},
	{
		element: <ProtectedRoute />,
		children: [
			{
				element: <AppShell />,
				children: [
					{
						path: "/",
						element: <HomePage />,
					},
					{
						path: "/loans",
						element: <LoansPage />,
					},
					{
						path: "/outbox",
						element: <OutboxPage />,
					},
					{
						path: "/profile",
						element: <ProfilePage />,
					},
				],
			},
		],
	},
	{
		path: "*",
		element: <Navigate to="/" replace />,
	},
]);
