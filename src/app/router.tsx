import { lazy, type ReactNode, Suspense } from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { MustChangePinRoute } from "@/features/auth/components/MustChangePinRoute";
import { ProtectedRoute } from "@/features/auth/components/ProtectedRoute";

const LoginPage = lazy(() =>
	import("@/pages/LoginPage").then((m) => ({ default: m.LoginPage })),
);
const ChangePinPage = lazy(() =>
	import("@/pages/ChangePinPage").then((m) => ({ default: m.ChangePinPage })),
);
const HomePage = lazy(() =>
	import("@/pages/HomePage").then((m) => ({ default: m.HomePage })),
);
const LoansPage = lazy(() =>
	import("@/pages/LoansPage").then((m) => ({ default: m.LoansPage })),
);
const OutboxPage = lazy(() =>
	import("@/pages/OutboxPage").then((m) => ({ default: m.OutboxPage })),
);
const ProfilePage = lazy(() =>
	import("@/pages/ProfilePage").then((m) => ({ default: m.ProfilePage })),
);

function RouteLoadingFallback() {
	return (
		<output
			aria-label="Memuat halaman"
			className="flex min-h-[50vh] items-center justify-center p-6"
		>
			<div className="h-7 w-7 animate-spin rounded-full border-2 border-[#004785]/20 border-t-[#004785]" />
		</output>
	);
}

function withSuspense(element: ReactNode): ReactNode {
	return <Suspense fallback={<RouteLoadingFallback />}>{element}</Suspense>;
}

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
		element: withSuspense(<LoginPage />),
	},
	{
		element: <MustChangePinRoute />,
		children: [
			{
				path: "/change-pin",
				element: withSuspense(<ChangePinPage />),
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
						element: withSuspense(<HomePage />),
					},
					{
						path: "/loans",
						element: withSuspense(<LoansPage />),
					},
					{
						path: "/outbox",
						element: withSuspense(<OutboxPage />),
					},
					{
						path: "/profile",
						element: withSuspense(<ProfilePage />),
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
