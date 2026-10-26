import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { type AppError, mapApiError } from "@/lib/errors";
import type { AuthSession } from "@/types/api";
import { useAuthStore } from "../store/authStore";
import type { LoginCredentials } from "../types";
import { postLogin } from "./postLogin";

interface UseLoginOptions {
	onSuccess?: (data: AuthSession) => void;
	onError?: (error: AppError) => void;
}

/**
 * Hook mutasi React Query untuk proses login pegawai.
 * Otomatis mengupdate authStore saat berhasil dan menampilkan notifikasi.
 */
export function useLogin(options?: UseLoginOptions) {
	const setSession = useAuthStore((state) => state.setSession);

	return useMutation<AuthSession, AppError, LoginCredentials>({
		mutationFn: async (credentials: LoginCredentials) => {
			try {
				return await postLogin(credentials);
			} catch (error) {
				throw mapApiError(error);
			}
		},
		onSuccess: (data) => {
			setSession(data);
			toast.success(
				`Selamat datang, ${data.employee.name || data.employee.namecode}!`,
			);
			options?.onSuccess?.(data);
		},
		onError: (error) => {
			toast.error(error.message || "Gagal masuk ke sistem.");
			options?.onError?.(error);
		},
	});
}
