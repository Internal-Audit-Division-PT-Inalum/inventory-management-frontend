import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { type AppError, mapApiError } from "@/lib/errors";
import { useAuthStore } from "../store/authStore";
import type { ChangePinPayload } from "../types";
import { type ChangePinResponse, postChangePin } from "./postChangePin";

interface UseChangePinOptions {
	onSuccess?: (data: ChangePinResponse) => void;
	onError?: (error: AppError) => void;
}

/**
 * Hook mutasi React Query untuk proses ganti PIN pegawai.
 * Otomatis mengupdate mustChangePin = false di authStore saat sukses.
 */
export function useChangePin(options?: UseChangePinOptions) {
	const setMustChangePin = useAuthStore((state) => state.setMustChangePin);

	return useMutation<ChangePinResponse, AppError, ChangePinPayload>({
		mutationFn: async (payload: ChangePinPayload) => {
			try {
				return await postChangePin(payload);
			} catch (error) {
				throw mapApiError(error);
			}
		},
		onSuccess: (data) => {
			// Update state bahwa pegawai sudah berhasil mengubah PIN
			setMustChangePin(false);
			toast.success(data.message || "PIN keamanan berhasil diperbarui!");
			options?.onSuccess?.(data);
		},
		onError: (error) => {
			toast.error(error.message || "Gagal memperbarui PIN.");
			options?.onError?.(error);
		},
	});
}
