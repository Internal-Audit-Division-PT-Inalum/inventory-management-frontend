import type { AxiosError } from "axios";
import type { ApiErrorResponse } from "@/types/api";

export const ErrorCodes = {
	INSUFFICIENT_STOCK: "INSUFFICIENT_STOCK",
	LOAN_EXCEEDS_OUTSTANDING: "LOAN_EXCEEDS_OUTSTANDING",
	INVALID_OPERATION: "INVALID_OPERATION",
	IDEMPOTENCY_CONFLICT: "IDEMPOTENCY_CONFLICT",
	ITEM_NOT_FOUND: "ITEM_NOT_FOUND",
	UNAUTHENTICATED: "UNAUTHENTICATED",
	FORBIDDEN: "FORBIDDEN",
	ACCOUNT_LOCKED: "ACCOUNT_LOCKED",
	RATE_LIMIT_EXCEEDED: "RATE_LIMIT_EXCEEDED",
	VALIDATION_FAILED: "VALIDATION_FAILED",
	NETWORK_ERROR: "NETWORK_ERROR",
	SERVER_ERROR: "SERVER_ERROR",
	UNKNOWN_ERROR: "UNKNOWN_ERROR",
} as const;

export type ErrorCode =
	| (typeof ErrorCodes)[keyof typeof ErrorCodes]
	| (string & {});

export type ErrorKind =
	| "retry"
	| "rejected"
	| "auth"
	| "conflict"
	| "validation";

export interface AppError {
	kind: ErrorKind;
	code: ErrorCode;
	message: string;
	status?: number;
	fieldErrors?: Record<string, string[]>;
	isRetryable: boolean;
	isFatal: boolean;
	raw?: unknown;
}

const ERROR_MESSAGE_MAP: Record<string, string> = {
	[ErrorCodes.INSUFFICIENT_STOCK]:
		"Stok barang di sistem tidak mencukupi untuk jumlah yang diminta.",
	[ErrorCodes.LOAN_EXCEEDS_OUTSTANDING]:
		"Jumlah pengembalian melebihi sisa pinjaman aktif Anda.",
	[ErrorCodes.INVALID_OPERATION]:
		"Operasi tidak sesuai dengan tipe barang (Barang Habis Pakai vs Aset Inventaris).",
	[ErrorCodes.IDEMPOTENCY_CONFLICT]:
		"Konflik transaksi: ID transaksi telah dicatat oleh akun lain. Hubungi administrator.",
	[ErrorCodes.ITEM_NOT_FOUND]:
		"Barang atau lokasi tidak ditemukan dalam database sistem.",
	[ErrorCodes.UNAUTHENTICATED]:
		"Sesi kerja Anda telah berakhir. Silakan login kembali dengan PIN.",
	[ErrorCodes.FORBIDDEN]:
		"Anda tidak memiliki hak akses untuk melakukan transaksi pada barang/lokasi ini.",
	[ErrorCodes.ACCOUNT_LOCKED]:
		"Akun terkunci sementara karena beberapa kali salah PIN. Silakan coba beberapa saat lagi.",
	[ErrorCodes.RATE_LIMIT_EXCEEDED]:
		"Terlalu banyak permintaan dalam waktu singkat. Mohon tunggu sesaat sebelum mencoba lagi.",
	[ErrorCodes.VALIDATION_FAILED]:
		"Data formulir transaksi tidak valid. Periksa kembali isian form Anda.",
	[ErrorCodes.NETWORK_ERROR]:
		"Koneksi jaringan terputus. Transaksi aman tersimpan di antrean offline perangkat.",
	[ErrorCodes.SERVER_ERROR]:
		"Layanan server internal mengalami gangguan sementara. Sistem akan mencoba kembali secara berkala.",
	[ErrorCodes.UNKNOWN_ERROR]:
		"Terjadi kesalahan saat memproses permintaan transaksi.",
};

/**
 * Retrieves human-readable Indonesian error message based on application error code.
 */
export function getHumanErrorMessage(
	code: string | undefined | null,
	fallback?: string,
): string {
	if (code && ERROR_MESSAGE_MAP[code]) {
		return ERROR_MESSAGE_MAP[code];
	}
	return (
		fallback ||
		ERROR_MESSAGE_MAP[ErrorCodes.UNKNOWN_ERROR] ||
		"Terjadi kesalahan."
	);
}

/**
 * Type guard verifying whether an error is an Axios error.
 */
export function isAxiosError(
	error: unknown,
): error is AxiosError<ApiErrorResponse> {
	return (
		typeof error === "object" &&
		error !== null &&
		"isAxiosError" in error &&
		Boolean((error as Record<string, unknown>).isAxiosError)
	);
}

/**
 * Maps raw HTTP, network, and runtime exceptions into structured AppError representations.
 * Classifies transient (retryable) vs permanent (fatal) failures for PWA outbox sync.
 */
export function mapApiError(error: unknown): AppError {
	if (!isAxiosError(error)) {
		const message =
			error instanceof Error && error.message
				? error.message
				: getHumanErrorMessage(ErrorCodes.NETWORK_ERROR);

		return {
			kind: "retry",
			code: ErrorCodes.NETWORK_ERROR,
			message,
			isRetryable: true,
			isFatal: false,
			raw: error,
		};
	}

	const status = error.response?.status;
	const data = error.response?.data;
	const backendCode = data?.meta?.code;

	if (
		!error.response ||
		error.code === "ERR_NETWORK" ||
		error.code === "ECONNABORTED"
	) {
		return {
			kind: "retry",
			code: ErrorCodes.NETWORK_ERROR,
			status,
			message: getHumanErrorMessage(ErrorCodes.NETWORK_ERROR),
			isRetryable: true,
			isFatal: false,
			raw: error,
		};
	}

	if (status === 401 || backendCode === ErrorCodes.UNAUTHENTICATED) {
		return {
			kind: "auth",
			code: ErrorCodes.UNAUTHENTICATED,
			status: 401,
			message:
				data?.message || getHumanErrorMessage(ErrorCodes.UNAUTHENTICATED),
			isRetryable: false,
			isFatal: false,
			raw: error,
		};
	}

	if (status === 409 || backendCode === ErrorCodes.IDEMPOTENCY_CONFLICT) {
		return {
			kind: "conflict",
			code: ErrorCodes.IDEMPOTENCY_CONFLICT,
			status: 409,
			message:
				data?.message || getHumanErrorMessage(ErrorCodes.IDEMPOTENCY_CONFLICT),
			isRetryable: false,
			isFatal: true,
			raw: error,
		};
	}

	if (status === 429 || backendCode === ErrorCodes.RATE_LIMIT_EXCEEDED) {
		return {
			kind: "retry",
			code: ErrorCodes.RATE_LIMIT_EXCEEDED,
			status: 429,
			message:
				data?.message || getHumanErrorMessage(ErrorCodes.RATE_LIMIT_EXCEEDED),
			isRetryable: true,
			isFatal: false,
			raw: error,
		};
	}

	if (status === 422 && data?.errors && Object.keys(data.errors).length > 0) {
		const firstError = Object.values(data.errors)[0]?.[0];
		return {
			kind: "validation",
			code: backendCode || ErrorCodes.VALIDATION_FAILED,
			status: 422,
			message:
				firstError ||
				data.message ||
				getHumanErrorMessage(ErrorCodes.VALIDATION_FAILED),
			fieldErrors: data.errors,
			isRetryable: false,
			isFatal: true,
			raw: error,
		};
	}

	if (status && status >= 500) {
		return {
			kind: "retry",
			code: ErrorCodes.SERVER_ERROR,
			status,
			message: getHumanErrorMessage(ErrorCodes.SERVER_ERROR),
			isRetryable: true,
			isFatal: false,
			raw: error,
		};
	}

	if (backendCode && ERROR_MESSAGE_MAP[backendCode]) {
		return {
			kind: "rejected",
			code: backendCode,
			status: status || 422,
			message: data?.message || getHumanErrorMessage(backendCode),
			isRetryable: false,
			isFatal: true,
			raw: error,
		};
	}

	if (status === 403 || backendCode === ErrorCodes.FORBIDDEN) {
		return {
			kind: "rejected",
			code: ErrorCodes.FORBIDDEN,
			status: 403,
			message: data?.message || getHumanErrorMessage(ErrorCodes.FORBIDDEN),
			isRetryable: false,
			isFatal: true,
			raw: error,
		};
	}

	if (status === 404 || backendCode === ErrorCodes.ITEM_NOT_FOUND) {
		return {
			kind: "rejected",
			code: ErrorCodes.ITEM_NOT_FOUND,
			status: 404,
			message: data?.message || getHumanErrorMessage(ErrorCodes.ITEM_NOT_FOUND),
			isRetryable: false,
			isFatal: true,
			raw: error,
		};
	}

	return {
		kind: "rejected",
		code: backendCode || ErrorCodes.UNKNOWN_ERROR,
		status,
		message:
			data?.message ||
			getHumanErrorMessage(backendCode, ErrorCodes.UNKNOWN_ERROR),
		isRetryable: false,
		isFatal: true,
		raw: error,
	};
}

/**
 * Predicate helper checking if an error is retryable.
 */
export function isRetryableError(error: unknown): boolean {
	const appError =
		typeof error === "object" && error !== null && "kind" in error
			? (error as AppError)
			: mapApiError(error);
	return appError.isRetryable;
}

/**
 * Predicate helper checking if an error is a permanent rejection (fatal).
 */
export function isFatalError(error: unknown): boolean {
	const appError =
		typeof error === "object" && error !== null && "kind" in error
			? (error as AppError)
			: mapApiError(error);
	return appError.isFatal;
}

/**
 * Predicate helper checking if an error represents an expired authentication session (401).
 */
export function isAuthError(error: unknown): boolean {
	const appError =
		typeof error === "object" && error !== null && "kind" in error
			? (error as AppError)
			: mapApiError(error);
	return (
		appError.kind === "auth" || appError.code === ErrorCodes.UNAUTHENTICATED
	);
}

/**
 * Predicate helper checking if an error represents an idempotency transaction conflict (409).
 */
export function isConflictError(error: unknown): boolean {
	const appError =
		typeof error === "object" && error !== null && "kind" in error
			? (error as AppError)
			: mapApiError(error);
	return (
		appError.kind === "conflict" ||
		appError.code === ErrorCodes.IDEMPOTENCY_CONFLICT
	);
}

/**
 * Predicate helper checking if an error represents an insufficient inventory stock condition.
 */
export function isStockError(error: unknown): boolean {
	const appError =
		typeof error === "object" && error !== null && "kind" in error
			? (error as AppError)
			: mapApiError(error);
	return appError.code === ErrorCodes.INSUFFICIENT_STOCK;
}
