import { createBrowserRouter, Navigate } from "react-router-dom";
import { MustChangePinRoute } from "@/features/auth/components/MustChangePinRoute";
import { ProtectedRoute } from "@/features/auth/components/ProtectedRoute";
import { ChangePinPage } from "@/pages/ChangePinPage";
import { HomePage } from "@/pages/HomePage";
import { LoginPage } from "@/pages/LoginPage";

/**
 * Konfigurasi router utama aplikasi Mobile PWA Inventaris PT INALUM:
 * 1. /login: Halaman login publik. Jika pegawai sudah login, dialihkan ke beranda.
 * 2. /change-pin: Halaman ubah PIN dengan proteksi MustChangePinRoute.
 * 3. /: Halaman utama internal yang diproteksi secara ketat oleh ProtectedRoute.
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
				path: "/",
				element: <HomePage />,
			},
		],
	},
	{
		path: "*",
		element: <Navigate to="/" replace />,
	},
]);
