import { useCallback, useState } from "react";
import { useAuthStore } from "@/features/auth/store/authStore";
import type { AppError } from "@/lib/errors";
import type { Item } from "@/types/api";
import { enqueueAndProcessTransaction } from "../lib/outboxQueue";
import type {
	TransactionAction,
	TransactionFormData,
	TransactSubmitResult,
} from "../types";

export interface UseTransactionSubmitResult {
	submitTransaction: (
		item: Item,
		action: TransactionAction,
		formData: TransactionFormData,
	) => Promise<TransactSubmitResult>;
	isSubmitting: boolean;
	lastResult: TransactSubmitResult | null;
	error: AppError | null;
	reset: () => void;
}

/**
 * Hook untuk menangani pengiriman transaksi barang dari komponen UI.
 * Mengintegrasikan autentikasi employee saat ini, manajemen state loading,
 * serta memanggil engine outbox zero-data-loss.
 */
export function useTransactionSubmit(): UseTransactionSubmitResult {
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [lastResult, setLastResult] = useState<TransactSubmitResult | null>(
		null,
	);
	const [error, setError] = useState<AppError | null>(null);

	const employeeId =
		useAuthStore((state) => state.employee?.id) || "current-employee";

	const submitTransaction = useCallback(
		async (
			item: Item,
			action: TransactionAction,
			formData: TransactionFormData,
		): Promise<TransactSubmitResult> => {
			setIsSubmitting(true);
			setError(null);

			try {
				const result = await enqueueAndProcessTransaction({
					item,
					action,
					formData,
					employeeId,
				});

				setLastResult(result);
				if (result.error && !result.success) {
					setError(result.error);
				}

				return result;
			} finally {
				setIsSubmitting(false);
			}
		},
		[employeeId],
	);

	const reset = useCallback(() => {
		setLastResult(null);
		setError(null);
		setIsSubmitting(false);
	}, []);

	return {
		submitTransaction,
		isSubmitting,
		lastResult,
		error,
		reset,
	};
}
