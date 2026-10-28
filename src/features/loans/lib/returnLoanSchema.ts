import { z } from "zod";

/**
 * Parameter untuk membangun skema validasi pengembalian pinjaman aset
 */
export interface ReturnLoanSchemaOptions {
	maxOutstanding: number;
}

/**
 * Membuat skema validasi Zod untuk formulir pengembalian barang aset.
 * Memastikan kuantitas:
 * 1. Integer positif >= 1
 * 2. Tidak boleh melebihi sisa pinjaman aktif (maxOutstanding)
 */
export function createReturnLoanSchema(options: ReturnLoanSchemaOptions) {
	const { maxOutstanding } = options;
	const safeMax = Math.max(1, maxOutstanding);

	return z.object({
		quantity: z
			.number()
			.int("Jumlah barang harus berupa bilangan bulat.")
			.min(1, "Minimal jumlah pengembalian adalah 1 unit.")
			.max(
				safeMax,
				`Jumlah pengembalian tidak boleh melebihi sisa pinjaman (${safeMax} unit).`,
			),
		notes: z
			.string()
			.max(500, "Catatan maksimal 500 karakter.")
			.optional()
			.transform((val) => val?.trim() || ""),
		reference_number: z
			.string()
			.max(100, "Nomor referensi maksimal 100 karakter.")
			.optional()
			.transform((val) => val?.trim() || ""),
	});
}

export type ReturnLoanFormData = z.infer<
	ReturnType<typeof createReturnLoanSchema>
>;
