import { describe, expect, it } from "vitest";
import {
	type AppError,
	ErrorCodes,
	getHumanErrorMessage,
	isAuthError,
	isConflictError,
	isFatalError,
	isRetryableError,
	isStockError,
	mapApiError,
} from "./errors";

describe("Error Mapping & Classification Suite (Task P3.4)", () => {
	describe("Human Friendly Error Messages", () => {
		it("provides descriptive Indonesian messages for all enterprise error codes", () => {
			for (const code of Object.values(ErrorCodes)) {
				const message = getHumanErrorMessage(code);
				expect(typeof message).toBe("string");
				expect(message.length).toBeGreaterThan(10);
			}
		});

		it("falls back to fallback text or unknown error message when code is not recognized", () => {
			expect(getHumanErrorMessage("CUSTOM_UNKNOWN", "Pesan kustom")).toBe(
				"Pesan kustom",
			);
			expect(getHumanErrorMessage(null)).toBe(
				getHumanErrorMessage(ErrorCodes.UNKNOWN_ERROR),
			);
			expect(getHumanErrorMessage(undefined)).toBe(
				getHumanErrorMessage(ErrorCodes.UNKNOWN_ERROR),
			);
		});
	});

	describe("mapApiError Mappings", () => {
		it("maps non-Axios runtime and network error objects to retryable NETWORK_ERROR", () => {
			const err = new Error("Device network socket closed");
			const mapped = mapApiError(err);

			expect(mapped.kind).toBe("retry");
			expect(mapped.code).toBe(ErrorCodes.NETWORK_ERROR);
			expect(mapped.message).toBe("Device network socket closed");
			expect(mapped.isRetryable).toBe(true);
			expect(mapped.isFatal).toBe(false);
		});

		it("maps unknown non-Error inputs gracefully", () => {
			const mapped = mapApiError("some raw string error");

			expect(mapped.kind).toBe("retry");
			expect(mapped.code).toBe(ErrorCodes.NETWORK_ERROR);
			expect(mapped.isRetryable).toBe(true);
			expect(mapped.isFatal).toBe(false);
		});

		it("maps Axios network disconnection (offline / ERR_NETWORK) to retryable", () => {
			const axiosNetworkErr = {
				isAxiosError: true,
				code: "ERR_NETWORK",
				message: "Network Error",
				response: undefined,
			};
			const mapped = mapApiError(axiosNetworkErr);

			expect(mapped.kind).toBe("retry");
			expect(mapped.code).toBe(ErrorCodes.NETWORK_ERROR);
			expect(mapped.isRetryable).toBe(true);
			expect(mapped.isFatal).toBe(false);
		});

		it("maps Axios timeout (ECONNABORTED) to retryable", () => {
			const timeoutErr = {
				isAxiosError: true,
				code: "ECONNABORTED",
				message: "timeout of 10000ms exceeded",
				response: undefined,
			};
			const mapped = mapApiError(timeoutErr);

			expect(mapped.kind).toBe("retry");
			expect(mapped.code).toBe(ErrorCodes.NETWORK_ERROR);
			expect(mapped.isRetryable).toBe(true);
		});

		it("maps HTTP 401 Unauthenticated to auth kind and non-fatal", () => {
			const mock401 = {
				isAxiosError: true,
				response: {
					status: 401,
					data: {
						success: false,
						message: "Unauthenticated.",
						meta: { code: ErrorCodes.UNAUTHENTICATED },
					},
				},
			};
			const mapped = mapApiError(mock401);

			expect(mapped.kind).toBe("auth");
			expect(mapped.code).toBe(ErrorCodes.UNAUTHENTICATED);
			expect(mapped.status).toBe(401);
			expect(mapped.isRetryable).toBe(false);
			expect(mapped.isFatal).toBe(false);
		});

		it("maps HTTP 409 Conflict (IDEMPOTENCY_CONFLICT) to conflict kind and fatal", () => {
			const mock409 = {
				isAxiosError: true,
				response: {
					status: 409,
					data: {
						success: false,
						message: "UUID telah dipakai akun lain",
						meta: { code: ErrorCodes.IDEMPOTENCY_CONFLICT },
					},
				},
			};
			const mapped = mapApiError(mock409);

			expect(mapped.kind).toBe("conflict");
			expect(mapped.code).toBe(ErrorCodes.IDEMPOTENCY_CONFLICT);
			expect(mapped.status).toBe(409);
			expect(mapped.isRetryable).toBe(false);
			expect(mapped.isFatal).toBe(true);
		});

		it("maps HTTP 429 Too Many Requests to retryable", () => {
			const mock429 = {
				isAxiosError: true,
				response: {
					status: 429,
					data: {
						success: false,
						message: "Too Many Requests",
						meta: { code: ErrorCodes.RATE_LIMIT_EXCEEDED },
					},
				},
			};
			const mapped = mapApiError(mock429);

			expect(mapped.kind).toBe("retry");
			expect(mapped.code).toBe(ErrorCodes.RATE_LIMIT_EXCEEDED);
			expect(mapped.status).toBe(429);
			expect(mapped.isRetryable).toBe(true);
			expect(mapped.isFatal).toBe(false);
		});

		it("maps HTTP 422 Form Validation errors with field breakdown", () => {
			const mock422Validation = {
				isAxiosError: true,
				response: {
					status: 422,
					data: {
						success: false,
						message: "Validasi gagal.",
						meta: { code: ErrorCodes.VALIDATION_FAILED },
						errors: {
							quantity: ["Jumlah wajib diisi dan minimal 1."],
							notes: ["Catatan maksimal 1000 karakter."],
						},
					},
				},
			};
			const mapped = mapApiError(mock422Validation);

			expect(mapped.kind).toBe("validation");
			expect(mapped.code).toBe(ErrorCodes.VALIDATION_FAILED);
			expect(mapped.status).toBe(422);
			expect(mapped.message).toBe("Jumlah wajib diisi dan minimal 1.");
			expect(mapped.fieldErrors).toEqual({
				quantity: ["Jumlah wajib diisi dan minimal 1."],
				notes: ["Catatan maksimal 1000 karakter."],
			});
			expect(mapped.isRetryable).toBe(false);
			expect(mapped.isFatal).toBe(true);
		});

		it("maps HTTP 422 INSUFFICIENT_STOCK correctly", () => {
			const mockStock = {
				isAxiosError: true,
				response: {
					status: 422,
					data: {
						success: false,
						message: "Stok Kertas A4 tidak mencukupi (sisa 2).",
						meta: { code: ErrorCodes.INSUFFICIENT_STOCK },
					},
				},
			};
			const mapped = mapApiError(mockStock);

			expect(mapped.kind).toBe("rejected");
			expect(mapped.code).toBe(ErrorCodes.INSUFFICIENT_STOCK);
			expect(mapped.status).toBe(422);
			expect(mapped.message).toBe("Stok Kertas A4 tidak mencukupi (sisa 2).");
			expect(mapped.isRetryable).toBe(false);
			expect(mapped.isFatal).toBe(true);
		});

		it("maps HTTP 422 LOAN_EXCEEDS_OUTSTANDING correctly", () => {
			const mockLoan = {
				isAxiosError: true,
				response: {
					status: 422,
					data: {
						success: false,
						message: "Jumlah pengembalian melebihi sisa pinjaman aktif.",
						meta: { code: ErrorCodes.LOAN_EXCEEDS_OUTSTANDING },
					},
				},
			};
			const mapped = mapApiError(mockLoan);

			expect(mapped.kind).toBe("rejected");
			expect(mapped.code).toBe(ErrorCodes.LOAN_EXCEEDS_OUTSTANDING);
			expect(mapped.isRetryable).toBe(false);
			expect(mapped.isFatal).toBe(true);
		});

		it("maps HTTP 422 INVALID_OPERATION correctly", () => {
			const mockOp = {
				isAxiosError: true,
				response: {
					status: 422,
					data: {
						success: false,
						message: "Barang consumable tidak dapat dipinjam.",
						meta: { code: ErrorCodes.INVALID_OPERATION },
					},
				},
			};
			const mapped = mapApiError(mockOp);

			expect(mapped.kind).toBe("rejected");
			expect(mapped.code).toBe(ErrorCodes.INVALID_OPERATION);
			expect(mapped.isRetryable).toBe(false);
			expect(mapped.isFatal).toBe(true);
		});

		it("maps HTTP 403 Forbidden correctly", () => {
			const mock403 = {
				isAxiosError: true,
				response: {
					status: 403,
					data: {
						success: false,
						message: "Akses ditolak.",
						meta: { code: ErrorCodes.FORBIDDEN },
					},
				},
			};
			const mapped = mapApiError(mock403);

			expect(mapped.kind).toBe("rejected");
			expect(mapped.code).toBe(ErrorCodes.FORBIDDEN);
			expect(mapped.status).toBe(403);
			expect(mapped.isFatal).toBe(true);
		});

		it("maps HTTP 404 Item/Location Not Found correctly", () => {
			const mock404 = {
				isAxiosError: true,
				response: {
					status: 404,
					data: {
						success: false,
						message: "Item tidak ditemukan.",
						meta: { code: ErrorCodes.ITEM_NOT_FOUND },
					},
				},
			};
			const mapped = mapApiError(mock404);

			expect(mapped.kind).toBe("rejected");
			expect(mapped.code).toBe(ErrorCodes.ITEM_NOT_FOUND);
			expect(mapped.status).toBe(404);
			expect(mapped.isFatal).toBe(true);
		});

		it("maps HTTP 500, 502, 503, 504 Internal Server Errors to retryable", () => {
			for (const status of [500, 502, 503, 504]) {
				const mock5xx = {
					isAxiosError: true,
					response: {
						status,
						data: {
							success: false,
							message: "Server Error",
						},
					},
				};
				const mapped = mapApiError(mock5xx);

				expect(mapped.kind).toBe("retry");
				expect(mapped.code).toBe(ErrorCodes.SERVER_ERROR);
				expect(mapped.status).toBe(status);
				expect(mapped.isRetryable).toBe(true);
				expect(mapped.isFatal).toBe(false);
			}
		});
	});

	describe("Predicate Helper Functions", () => {
		const sampleRetryable: AppError = {
			kind: "retry",
			code: ErrorCodes.NETWORK_ERROR,
			message: "Offline",
			isRetryable: true,
			isFatal: false,
		};

		const sampleFatal: AppError = {
			kind: "rejected",
			code: ErrorCodes.INSUFFICIENT_STOCK,
			message: "Stok habis",
			isRetryable: false,
			isFatal: true,
		};

		const sampleAuth: AppError = {
			kind: "auth",
			code: ErrorCodes.UNAUTHENTICATED,
			message: "Login expired",
			status: 401,
			isRetryable: false,
			isFatal: false,
		};

		const sampleConflict: AppError = {
			kind: "conflict",
			code: ErrorCodes.IDEMPOTENCY_CONFLICT,
			message: "Conflict",
			status: 409,
			isRetryable: false,
			isFatal: true,
		};

		it("isRetryableError correctly identifies retryable errors", () => {
			expect(isRetryableError(sampleRetryable)).toBe(true);
			expect(isRetryableError(sampleFatal)).toBe(false);
			expect(isRetryableError(sampleAuth)).toBe(false);
			expect(isRetryableError(new Error("socket hang up"))).toBe(true);
		});

		it("isFatalError correctly identifies permanent business rejection errors", () => {
			expect(isFatalError(sampleFatal)).toBe(true);
			expect(isFatalError(sampleConflict)).toBe(true);
			expect(isFatalError(sampleRetryable)).toBe(false);
			expect(isFatalError(sampleAuth)).toBe(false);
		});

		it("isAuthError correctly identifies authentication expiration errors", () => {
			expect(isAuthError(sampleAuth)).toBe(true);
			expect(isAuthError(sampleFatal)).toBe(false);
			expect(
				isAuthError({
					isAxiosError: true,
					response: { status: 401, data: {} },
				}),
			).toBe(true);
		});

		it("isConflictError correctly identifies idempotency conflicts", () => {
			expect(isConflictError(sampleConflict)).toBe(true);
			expect(isConflictError(sampleFatal)).toBe(false);
		});

		it("isStockError correctly identifies stock shortage errors", () => {
			expect(isStockError(sampleFatal)).toBe(true);
			expect(isStockError(sampleRetryable)).toBe(false);
		});
	});
});
