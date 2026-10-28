import { z } from "zod";
import type { TransactionAction } from "../types";

export const MAX_TRANSACTION_QUANTITY = 500;
export const LARGE_QUANTITY_THRESHOLD = 10;
export const LARGE_QUANTITY_STOCK_RATIO = 0.5;

/**
 * Skema dasar form transaksi barang inventaris.
 * Menegakkan tipe data kuantitas bilangan bulat positif (1 - 500) serta batasan panjang teks.
 */
export const baseTransactionSchema = z.object({
	quantity: z
		.number()
		.int("Jumlah harus berupa bilangan bulat.")
		.min(1, "Jumlah minimal 1 unit.")
		.max(
			MAX_TRANSACTION_QUANTITY,
			`Jumlah maksimal ${MAX_TRANSACTION_QUANTITY} unit per transaksi.`,
		),
	notes: z.string().max(1000, "Catatan maksimal 1000 karakter.").optional(),
	reference_number: z
		.string()
		.max(100, "Nomor referensi maksimal 100 karakter.")
		.optional(),
});

export type TransactionFormData = z.infer<typeof baseTransactionSchema>;

/**
 * Sanitasi data form sebelum dikirim ke API atau outbox:
 * - Membersihkan whitespace berlebih.
 * - Mengubah string kosong menjadi undefined.
 */
export function sanitizeTransactionFormData(
	data: TransactionFormData,
): TransactionFormData {
	const trimmedNotes = data.notes?.trim();
	const trimmedRef = data.reference_number?.trim();

	return {
		quantity: data.quantity,
		notes: trimmedNotes && trimmedNotes.length > 0 ? trimmedNotes : undefined,
		reference_number:
			trimmedRef && trimmedRef.length > 0 ? trimmedRef : undefined,
	};
}

/**
 * Factory skema transaksi kontekstual:
 * Memastikan aksi 'take' dan 'borrow' tidak dapat melebihi stok fisik yang tersedia.
 */
export function createTransactionSchema(
	maxAvailableStock: number,
	action: TransactionAction,
) {
	return baseTransactionSchema.superRefine((data, ctx) => {
		if (action === "take" || action === "borrow") {
			if (data.quantity > maxAvailableStock) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: `Jumlah melebihi stok yang tersedia (${maxAvailableStock} unit).`,
					path: ["quantity"],
				});
			}
		}
	});
}

export interface LargeQuantityWarningOptions {
	quantity: number;
	currentStock: number;
	action: TransactionAction;
}

/**
 * Deteksi apakah transaksi memerlukan modal konfirmasi jumlah besar:
 * 1. Mengambil atau meminjam >= 10 unit sekaligus.
 * 2. ATAU mengambil/meminjam >= 50% dari sisa stok (dan quantity > 1).
 */
export function isLargeQuantityTransaction({
	quantity,
	currentStock,
	action,
}: LargeQuantityWarningOptions): boolean {
	if (action !== "take" && action !== "borrow") {
		return false;
	}
	if (quantity >= LARGE_QUANTITY_THRESHOLD) {
		return true;
	}
	if (
		currentStock > 0 &&
		quantity / currentStock >= LARGE_QUANTITY_STOCK_RATIO &&
		quantity > 1
	) {
		return true;
	}
	return false;
}
