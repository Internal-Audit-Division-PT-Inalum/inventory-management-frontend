import type { AxiosError } from "axios";
import type { ApiErrorResponse } from "@/types/api";

export type ErrorKind = "retry" | "rejected" | "auth" | "validation";

export interface AppError {
	kind: ErrorKind;
	code?: string;
	message: string;
	fieldErrors?: Record<string, string[]>;
	status?: number;
}

const ERROR_MESSAGE_MAP: Record<string, string> = {
	INSUFFICIENT_STOCK: "Stok barang tidak mencukupi untuk jumlah yang diminta.",
	LOAN_EXCEEDS_OUTSTANDING:
		"Jumlah pengembalian melebihi sisa pinjaman aktif Anda.",
	INVALID_OPERATION:
		"Operasi tidak sesuai dengan tipe barang (Consumable vs Aset).",
	IDEMPOTENCY_CONFLICT:
		"Konflik transaksi: ID transaksi telah dipakai oleh pengguna lain.",
	ITEM_NOT_FOUND: "Barang atau lokasi tidak ditemukan dalam sistem.",
	UNAUTHENTICATED: "Sesi Anda telah kedaluwarsa. Silakan login kembali.",
	FORBIDDEN: "Anda tidak memiliki izin untuk melakukan tindakan ini.",
	ACCOUNT_LOCKED:
		"Akun terkunci sementara karena beberapa kali salah PIN. Silakan coba lagi nanti.",
	VALIDATION_FAILED: "Data yang dimasukkan tidak valid. Periksa kembali form.",
};

export function mapApiError(error: unknown): AppError {
	// 1. Non-Axios Error (Network crash / native runtime error)
	if (!isAxiosError(error)) {
		if (error instanceof Error) {
			return {
				kind: "retry",
				message: error.message || "Terjadi kesalahan pada aplikasi.",
			};
		}
		return {
			kind: "retry",
			message: "Koneksi jaringan terputus atau tidak stabil.",
		};
	}

	const axiosError = error as AxiosError<ApiErrorResponse>;
	const status = axiosError.response?.status;
	const data = axiosError.response?.data;
	const backendCode = data?.meta?.code;

	// 2. Offline / Jaringan Gagal
	if (!axiosError.response || axiosError.code === "ERR_NETWORK") {
		return {
			kind: "retry",
			code: "NETWORK_ERROR",
			message:
				"Tidak dapat terhubung ke server. Transaksi akan disimpan di antrean offline.",
		};
	}

	// 3. Autentikasi Kedaluwarsa (401)
	if (status === 401 || backendCode === "UNAUTHENTICATED") {
		return {
			kind: "auth",
			code: backendCode || "UNAUTHENTICATED",
			status,
			message:
				data?.message ||
				ERROR_MESSAGE_MAP.UNAUTHENTICATED ||
				"Sesi login telah berakhir.",
		};
	}

	// 4. Validasi Form (422)
	if (status === 422 && data?.errors) {
		const firstError = Object.values(data.errors)[0]?.[0];
		return {
			kind: "validation",
			code: backendCode || "VALIDATION_FAILED",
			status,
			message: firstError || data.message || "Validasi input gagal.",
			fieldErrors: data.errors,
		};
	}

	// 5. Rate Limiting / Akun Terkunci (429 / ACCOUNT_LOCKED)
	if (status === 429 || backendCode === "ACCOUNT_LOCKED") {
		return {
			kind: "rejected",
			code: backendCode || "ACCOUNT_LOCKED",
			status,
			message:
				data?.message ||
				ERROR_MESSAGE_MAP.ACCOUNT_LOCKED ||
				"Akun terkunci sementara karena beberapa kali salah PIN. Silakan coba lagi nanti.",
		};
	}

	// 6. Penolakan Aturan Bisnis (409 Konflik, 422 Insufficient Stock, dll)
	if (backendCode && ERROR_MESSAGE_MAP[backendCode]) {
		return {
			kind: "rejected",
			code: backendCode,
			status,
			message: data?.message || ERROR_MESSAGE_MAP[backendCode],
		};
	}

	// 6. 403 Forbidden / Akses Ditolak
	if (status === 403) {
		return {
			kind: "rejected",
			code: backendCode || "FORBIDDEN",
			status,
			message:
				data?.message || "Anda tidak memiliki hak akses untuk tindakan ini.",
		};
	}

	// 7. 404 Not Found
	if (status === 404) {
		return {
			kind: "rejected",
			code: backendCode || "ITEM_NOT_FOUND",
			status,
			message: data?.message || "Data tidak ditemukan.",
		};
	}

	// 8. 500+ Internal Server Error (Bisa di-retry)
	if (status && status >= 500) {
		return {
			kind: "retry",
			code: "SERVER_ERROR",
			status,
			message: "Server internal mengalami gangguan. Silakan coba sesaat lagi.",
		};
	}

	// Fallback umum
	return {
		kind: "rejected",
		code: backendCode || "UNKNOWN_ERROR",
		status,
		message: data?.message || "Terjadi kesalahan saat memproses permintaan.",
	};
}

function isAxiosError(error: unknown): error is AxiosError {
	return (
		typeof error === "object" &&
		error !== null &&
		"isAxiosError" in error &&
		Boolean((error as Record<string, unknown>).isAxiosError)
	);
}
