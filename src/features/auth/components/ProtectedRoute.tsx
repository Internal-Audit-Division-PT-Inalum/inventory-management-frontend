import type * as React from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { savePostLoginRedirect } from "@/features/catalog";
import {
	selectAuthStatus,
	selectIsAuthenticated,
	selectMustChangePin,
	useAuthStore,
} from "../store/authStore";

interface ProtectedRouteProps {
	children?: React.ReactNode;
}

/**
 * Route guard pelindung rute internal aplikasi inventaris:
 * 1. Memeriksa apakah pegawai telah terautentikasi (token aktif dan status 'authenticated').
 *    - Jika belum login atau sesi 'unauthenticated', simpan rute tujuan (termasuk ?src=qr) dan arahkan ke /login.
 *    - Jika sesi 'expired' (HTTP 401), arahkan ke /login dengan state 'sessionExpired: true'.
 * 2. Memeriksa flag keamanan PIN (mustChangePin === true).
 *    - Jika pegawai wajib ganti PIN, paksa redirect ke /change-pin demi kepatuhan keamanan.
 * 3. Jika seluruh verifikasi lolos, tampilkan konten rute terproteksi.
 */
export function ProtectedRoute({ children }: ProtectedRouteProps) {
	const isAuthenticated = useAuthStore(selectIsAuthenticated);
	const authStatus = useAuthStore(selectAuthStatus);
	const mustChangePin = useAuthStore(selectMustChangePin);
	const location = useLocation();

	// 1. Cek autentikasi & sesi kedaluwarsa
	if (!isAuthenticated) {
		const isExpired = authStatus === "expired";
		// Simpan rute asal (termasuk query parameters seperti ?src=qr&location_id=...)
		savePostLoginRedirect(location);

		return (
			<Navigate
				to="/login"
				state={{ from: location, sessionExpired: isExpired }}
				replace
			/>
		);
	}

	// 2. Cek apakah wajib ganti PIN (login perdana / flag keamanan)
	if (mustChangePin) {
		return <Navigate to="/change-pin" replace />;
	}

	return (children as React.ReactElement) || <Outlet />;
}

export default ProtectedRoute;
