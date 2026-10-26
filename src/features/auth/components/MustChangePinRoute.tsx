import type * as React from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import {
	selectIsAuthenticated,
	selectMustChangePin,
	useAuthStore,
} from "../store/authStore";

interface MustChangePinRouteProps {
	children?: React.ReactNode;
}

/**
 * Route guard untuk halaman /change-pin.
 * - Memastikan hanya pegawai yang sudah login yang dapat mengakses halaman ini.
 * - Jika pegawai belum terautentikasi, paksa redirect ke /login.
 */
export function MustChangePinRoute({ children }: MustChangePinRouteProps) {
	const isAuthenticated = useAuthStore(selectIsAuthenticated);
	const location = useLocation();

	if (!isAuthenticated) {
		return <Navigate to="/login" state={{ from: location }} replace />;
	}

	return (children as React.ReactElement) || <Outlet />;
}

/**
 * Route guard pelindung rute internal:
 * - Jika pegawai login tetapi memiliki status must_change_pin === true,
 *   mereka tidak diizinkan masuk ke dashboard/katalog dan wajib diarahkan ke /change-pin.
 */
export function EnsurePinChangedGuard({ children }: MustChangePinRouteProps) {
	const isAuthenticated = useAuthStore(selectIsAuthenticated);
	const mustChangePin = useAuthStore(selectMustChangePin);

	if (isAuthenticated && mustChangePin) {
		return <Navigate to="/change-pin" replace />;
	}

	return (children as React.ReactElement) || <Outlet />;
}
