import { z } from "zod";

/**
 * Skema validasi login pegawai PT Inalum
 * - namecode: Huruf/angka inisial unik pegawai (misal: MHS, RDT), panjang 2-10 karakter.
 * - pin: Tepat 6 digit angka numerik.
 */
export const loginSchema = z.object({
	namecode: z
		.string()
		.min(1, "Namecode wajib diisi.")
		.max(10, "Namecode maksimal 10 karakter.")
		.regex(/^[a-zA-Z0-9]+$/, "Namecode hanya boleh huruf dan angka."),
	pin: z
		.string()
		.min(1, "PIN wajib diisi.")
		.length(6, "PIN harus tepat 6 digit angka.")
		.regex(/^\d{6}$/, "PIN harus berupa 6 digit angka numerik."),
});

export type LoginFormData = z.infer<typeof loginSchema>;

export interface LoginCredentials {
	namecode: string;
	pin: string;
}

const WEAK_PINS = new Set(["000000", "123456", "111111", "654321", "123123"]);

/**
 * Validasi apakah PIN termasuk kategori lemah:
 * 1. Angka berulang seluruhnya (misal: 111111, 222222, dll).
 * 2. Daftar kombinasi umum yang mudah ditebak (WEAK_PINS).
 */
export function isWeakPin(pin: string): boolean {
	if (/^(.)\1{5}$/.test(pin)) {
		return true;
	}
	return WEAK_PINS.has(pin);
}

/**
 * Skema validasi pengubahan PIN keamanan pegawai.
 * - current_pin: Tepat 6 digit angka numerik.
 * - new_pin: Tepat 6 digit angka numerik, tidak boleh sama dengan PIN saat ini, dan tidak boleh lemah.
 * - new_pin_confirmation: Harus identik dengan new_pin.
 */
export const changePinSchema = z
	.object({
		current_pin: z
			.string()
			.min(1, "PIN saat ini wajib diisi.")
			.length(6, "PIN saat ini harus tepat 6 digit angka.")
			.regex(/^\d{6}$/, "PIN harus berupa 6 digit angka numerik."),
		new_pin: z
			.string()
			.min(1, "PIN baru wajib diisi.")
			.length(6, "PIN baru harus tepat 6 digit angka.")
			.regex(/^\d{6}$/, "PIN baru harus berupa 6 digit angka numerik."),
		new_pin_confirmation: z
			.string()
			.min(1, "Konfirmasi PIN baru wajib diisi.")
			.length(6, "Konfirmasi PIN baru harus tepat 6 digit angka.")
			.regex(/^\d{6}$/, "Konfirmasi PIN harus berupa 6 digit angka numerik."),
	})
	.refine((data) => data.new_pin !== data.current_pin, {
		message: "PIN baru tidak boleh sama dengan PIN saat ini.",
		path: ["new_pin"],
	})
	.refine((data) => !isWeakPin(data.new_pin), {
		message:
			"PIN terlalu mudah ditebak. Hindari kombinasi berulang atau berurutan.",
		path: ["new_pin"],
	})
	.refine((data) => data.new_pin === data.new_pin_confirmation, {
		message: "Konfirmasi PIN baru tidak cocok.",
		path: ["new_pin_confirmation"],
	});

export type ChangePinFormData = z.infer<typeof changePinSchema>;

export interface ChangePinPayload {
	current_pin: string;
	new_pin: string;
	new_pin_confirmation: string;
}
