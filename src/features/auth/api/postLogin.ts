import { api } from "@/lib/api";
import type { ApiResponse, AuthSession } from "@/types/api";
import type { LoginCredentials } from "../types";

/**
 * Mengirim permintaan otentikasi login pegawai ke backend Laravel Sanctum.
 * Endpoint: POST /api/v1/auth/login
 *
 * @param credentials Namecode dan 6-digit PIN
 * @returns AuthSession (token, must_change_pin, employee)
 */
export async function postLogin(
	credentials: LoginCredentials,
): Promise<AuthSession> {
	const payload = {
		namecode: credentials.namecode.trim().toUpperCase(),
		pin: credentials.pin.trim(),
	};

	const response = await api.post<ApiResponse<AuthSession>>(
		"/auth/login",
		payload,
	);
	return response.data.data;
}
