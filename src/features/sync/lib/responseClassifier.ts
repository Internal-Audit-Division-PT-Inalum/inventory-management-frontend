import {
	type AppError,
	ErrorCodes,
	isAxiosError,
	mapApiError,
} from "@/lib/errors";
import { parseRetryAfterHeader } from "./backoff";

export type SyncAction = "success" | "reject" | "retry" | "pause_auth";

export interface SyncResponseClassification {
	action: SyncAction;
	code: string;
	message: string;
	status?: number;
	retryAfterMs?: number | null;
	isFatal: boolean;
	isRetryable: boolean;
	isAuth: boolean;
	isReplayed: boolean;
}

/**
 * Mengklasifikasikan respons server atau error HTTP ke dalam aksi sinkronisasi terstandar:
 * - 'success': Transaksi sukses atau terdeteksi idempotency replay -> 'synced'
 * - 'reject': Pelanggaran aturan bisnis permanen (422 stok/validasi, 409 konflik, 403, 404) -> 'rejected'
 * - 'pause_auth': Sesi autentikasi habis (401) -> 'pending' & jeda antrean
 * - 'retry': Galat sementara (429 rate limit, 5xx server error, network drop) -> 'pending'/'failed' + backoff
 */
export function classifySyncResponse(
	responseOrError: unknown,
): SyncResponseClassification {
	// 1. Kasus Respons Sukses (Object response dengan status 2xx)
	if (
		typeof responseOrError === "object" &&
		responseOrError !== null &&
		!("isAxiosError" in responseOrError) &&
		!("message" in responseOrError && "kind" in responseOrError) &&
		("success" in responseOrError || "data" in responseOrError)
	) {
		const res = responseOrError as Record<string, unknown>;
		const isSuccess = res.success !== false;
		const meta = res.meta as Record<string, unknown> | undefined;
		const isReplayed = Boolean(meta?.replayed);

		if (isSuccess) {
			return {
				action: "success",
				code: isReplayed ? "REPLAYED" : "SUCCESS",
				message:
					(typeof res.message === "string" && res.message) ||
					(isReplayed
						? "Transaksi telah tercatat sebelumnya (idempotent replay)."
						: "Transaksi berhasil disinkronkan ke server."),
				isFatal: false,
				isRetryable: false,
				isAuth: false,
				isReplayed,
			};
		}
	}

	// 2. Ekstrak header Retry-After jika tersedia dari Axios error
	let retryAfterMs: number | null = null;
	if (isAxiosError(responseOrError)) {
		const headers = responseOrError.response?.headers;
		if (headers) {
			const rawHeader =
				headers["retry-after"] ??
				(typeof headers.get === "function"
					? headers.get("retry-after")
					: undefined);
			if (rawHeader) {
				retryAfterMs = parseRetryAfterHeader(rawHeader);
			}
		}
	}

	// 3. Petakan ke AppError
	const appError: AppError =
		typeof responseOrError === "object" &&
		responseOrError !== null &&
		"kind" in responseOrError &&
		"isRetryable" in responseOrError
			? (responseOrError as AppError)
			: mapApiError(responseOrError);

	// 4. Kasus 401 Unauthorized (Sesi habis -> Jeda antrean)
	if (
		appError.kind === "auth" ||
		appError.code === ErrorCodes.UNAUTHENTICATED ||
		appError.status === 401
	) {
		return {
			action: "pause_auth",
			code: ErrorCodes.UNAUTHENTICATED,
			message: appError.message,
			status: 401,
			isFatal: false,
			isRetryable: false,
			isAuth: true,
			isReplayed: false,
		};
	}

	// 5. Kasus Penolakan Fatal Aturan Bisnis (422, 409, 403, 404)
	if (
		appError.isFatal ||
		appError.kind === "rejected" ||
		appError.kind === "conflict" ||
		appError.kind === "validation"
	) {
		return {
			action: "reject",
			code: appError.code,
			message: appError.message,
			status: appError.status,
			isFatal: true,
			isRetryable: false,
			isAuth: false,
			isReplayed: false,
		};
	}

	// 6. Kasus Retryable (429 Rate Limit, 5xx Server Error, Network Failure)
	return {
		action: "retry",
		code: appError.code,
		message: appError.message,
		status: appError.status,
		retryAfterMs,
		isFatal: false,
		isRetryable: true,
		isAuth: false,
		isReplayed: false,
	};
}
