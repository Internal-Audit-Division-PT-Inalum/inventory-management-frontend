import { z } from "zod";

/**
 * Validation schema for PT INALUM employee authentication:
 * - namecode: Alphanumeric employee initial code (2-10 characters).
 * - pin: Exactly 6 numeric digits.
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
 * Validates whether a candidate PIN matches common weak or repeating patterns.
 */
export function isWeakPin(pin: string): boolean {
	if (/^(.)\1{5}$/.test(pin)) {
		return true;
	}
	return WEAK_PINS.has(pin);
}

/**
 * Validation schema for employee security PIN modification:
 * Enforces 6 numeric digits, prevents reuse of current PIN, rejects weak patterns,
 * and confirms matching confirmation entry.
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
