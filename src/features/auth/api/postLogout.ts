import { api } from "@/lib/api";
import type { ApiResponse } from "@/types/api";

export interface LogoutResponse {
	success: boolean;
	message: string;
}

/**
 * Mengirim permintaan pencabutan token sesi ke backend Laravel Sanctum.
 * Endpoint: POST /api/v1/auth/logout (Requires Sanctum Bearer Token)
 *
 * Catatan Ketahanan (Enterprise Resilience):
 * Jika perangkat sedang offline atau koneksi terputus, kegagalan request ke server
 * tidak boleh memblokir proses logout lokal di perangkat.
 */
export async function postLogout(): Promise<LogoutResponse> {
	try {
		const response = await api.post<ApiResponse<null>>("/auth/logout");
		return {
			success: response.data.success ?? true,
			message: response.data.message || "Logout berhasil.",
		};
	} catch {
		// Toleransi kegagalan server/jaringan agar pengguna offline tetap bisa logout
		return {
			success: true,
			message: "Logout lokal berhasil.",
		};
	}
}
