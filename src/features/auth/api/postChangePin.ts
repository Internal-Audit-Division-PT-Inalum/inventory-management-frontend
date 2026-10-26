import { api } from "@/lib/api";
import type { ApiResponse } from "@/types/api";
import type { ChangePinPayload } from "../types";

export interface ChangePinResponse {
	success: boolean;
	message: string;
}

/**
 * Mengirim permintaan perubahan PIN pegawai ke backend Laravel Sanctum.
 * Endpoint: POST /api/v1/auth/pin/change (Requires Sanctum Bearer Token)
 *
 * @param payload current_pin, new_pin, new_pin_confirmation
 * @returns Respons hasil pembaruan PIN
 */
export async function postChangePin(
	payload: ChangePinPayload,
): Promise<ChangePinResponse> {
	const sanitizedPayload = {
		current_pin: payload.current_pin.trim(),
		new_pin: payload.new_pin.trim(),
		new_pin_confirmation: payload.new_pin_confirmation.trim(),
	};

	const response = await api.post<ApiResponse<null>>(
		"/auth/pin/change",
		sanitizedPayload,
	);

	return {
		success: response.data.success,
		message: response.data.message || "PIN berhasil diubah.",
	};
}
