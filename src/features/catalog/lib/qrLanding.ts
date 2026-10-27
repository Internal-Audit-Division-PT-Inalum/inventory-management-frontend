import * as React from "react";
import { type Location as RouterLocation, useLocation } from "react-router-dom";

export const POST_LOGIN_REDIRECT_KEY = "pwa_post_login_redirect";

export interface QrLandingParams {
	isQrLanding: boolean;
	locationId: string | null;
	itemId: string | null;
	rawSearch: string;
}

/**
 * Membaca parameter query URL untuk mendeteksi apakah pegawai membuka aplikasi dari scan QR fisik di rak/barang.
 * Mendukung format:
 * - `/?src=qr`
 * - `/?src=qr&location_id=LOC-A1` atau `/?location=LOC-A1`
 * - `/?src=qr&item_id=ITEM-001` atau `/?item=ITEM-001`
 */
export function parseQrLandingParams(
	search: string | URLSearchParams,
): QrLandingParams {
	const params =
		typeof search === "string" ? new URLSearchParams(search) : search;

	const src = params.get("src");
	const isQrLanding = src === "qr";
	const locationId =
		params.get("location_id") || params.get("location") || null;
	const itemId = params.get("item_id") || params.get("item") || null;

	return {
		isQrLanding,
		locationId,
		itemId,
		rawSearch: params.toString(),
	};
}

/**
 * Hook reaktif untuk mengekstrak parameter QR landing dari URL rute aktif.
 */
export function useQrLanding(): QrLandingParams {
	const location = useLocation();
	return React.useMemo(
		() => parseQrLandingParams(location.search),
		[location.search],
	);
}

/**
 * Menyimpan rute tujuan sebelum dialihkan ke /login (misal saat scan QR sebelum login).
 * Mendukung objek Location dari React Router atau string path URL lengkap.
 */
export function savePostLoginRedirect(
	target: string | Partial<RouterLocation>,
): void {
	if (typeof window === "undefined") return;

	try {
		let path = "/";
		if (typeof target === "string") {
			path = target;
		} else if (target) {
			const pathname = target.pathname || "/";
			const search = target.search || "";
			const hash = target.hash || "";
			path = `${pathname}${search}${hash}`;
		}

		// Cegah menyimpan rute ke login itu sendiri demi menghindari infinite loop
		if (path.startsWith("/login")) return;

		sessionStorage.setItem(POST_LOGIN_REDIRECT_KEY, path);
	} catch {
		// Abaikan galat penyimpanan (misal storage penuh atau private browsing mode)
	}
}

/**
 * Mengambil dan membersihkan URL tujuan pasca-login dari location.state atau sessionStorage.
 * Mengembalikan path lengkap (termasuk query parameters dan hash).
 */
export function getAndClearPostLoginRedirect(stateFrom?: unknown): string {
	let redirectUrl: string | null = null;

	// 1. Cek dari location.state React Router
	if (stateFrom && typeof stateFrom === "object") {
		const loc = stateFrom as Partial<RouterLocation>;
		if (loc.pathname) {
			redirectUrl = `${loc.pathname}${loc.search || ""}${loc.hash || ""}`;
		}
	} else if (typeof stateFrom === "string" && stateFrom.trim().length > 0) {
		redirectUrl = stateFrom.trim();
	}

	// 2. Fallback ke sessionStorage jika state kosong (misal hard refresh / scan eksternal)
	if (!redirectUrl && typeof window !== "undefined") {
		try {
			redirectUrl = sessionStorage.getItem(POST_LOGIN_REDIRECT_KEY);
		} catch {
			// Abaikan galat baca sessionStorage
		}
	}

	// 3. Bersihkan dari sessionStorage setelah diambil (one-time consume)
	if (typeof window !== "undefined") {
		try {
			sessionStorage.removeItem(POST_LOGIN_REDIRECT_KEY);
		} catch {
			// Abaikan galat hapus sessionStorage
		}
	}

	// Sanitasi: Jangan izinkan redirect kembali ke /login
	if (!redirectUrl || redirectUrl.startsWith("/login")) {
		return "/";
	}

	return redirectUrl;
}

/**
 * Helper pembuat URL QR Code untuk cetak label fisik di rak inventaris Divisi Internal Audit PT INALUM.
 */
export function buildQrLandingUrl(params?: {
	locationId?: string;
	itemId?: string;
	baseUrl?: string;
}): string {
	const base =
		params?.baseUrl ||
		(typeof window !== "undefined" ? window.location.origin : "");
	const searchParams = new URLSearchParams();
	searchParams.set("src", "qr");

	if (params?.locationId) {
		searchParams.set("location_id", params.locationId);
	}
	if (params?.itemId) {
		searchParams.set("item_id", params.itemId);
	}

	const queryString = searchParams.toString();
	return `${base}/?${queryString}`;
}
