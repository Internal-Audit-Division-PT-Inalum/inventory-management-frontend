import type { OutboxItem, OutboxOperation } from "@/lib/db";
import { getCorrectedIsoString } from "@/lib/time";
import type { TransactItemPayload } from "../types";
import type { TransactionFormData } from "./transactionSchema";

const UUID_V4_REGEX =
	/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Menghasilkan UUID v4 yang sesuai dengan standar RFC 4122.
 * Menggunakan Web Crypto API (`crypto.randomUUID()`) sebagai jalur utama,
 * dengan fallback kriptografis menggunakan `crypto.getRandomValues()`
 * untuk kompatibilitas pada konteks non-HTTPS atau WebView lama.
 */
export function generateClientUuid(): string {
	const cryptoObj =
		typeof globalThis !== "undefined" ? globalThis.crypto : undefined;

	// 1. Jalur Utama: Standar Web Crypto randomUUID()
	if (cryptoObj && typeof cryptoObj.randomUUID === "function") {
		return cryptoObj.randomUUID();
	}

	// 2. Fallback Kriptografis: getRandomValues()
	if (cryptoObj && typeof cryptoObj.getRandomValues === "function") {
		const bytes = new Uint8Array(16);
		cryptoObj.getRandomValues(bytes);

		// RFC 4122 section 4.4: set version to 4
		bytes[6] = (bytes[6] & 0x0f) | 0x40;
		// RFC 4122 section 4.4: set clock_seq_hi_and_reserved bits to 10xx
		bytes[8] = (bytes[8] & 0x3f) | 0x80;

		const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"));
		return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10, 16).join("")}`;
	}

	// 3. Fallback Terakhir: pseudo-random generator RFC 4122 v4
	return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
		const r = (Math.random() * 16) | 0;
		const v = c === "x" ? r : (r & 0x3) | 0x8;
		return v.toString(16);
	});
}

/**
 * Memvalidasi apakah string merupakan UUID v4 RFC 4122 yang valid.
 */
export function isValidClientUuid(uuid: unknown): boolean {
	if (typeof uuid !== "string") return false;
	return UUID_V4_REGEX.test(uuid);
}

/**
 * Menghasilkan stempel waktu ISO-8601 yang telah dikoreksi dengan offset jam server.
 * Digunakan untuk field `occurred_at` pada transaksi inventaris.
 */
export function getOccurredAt(): string {
	return getCorrectedIsoString();
}

export interface BuildTransactionPayloadOptions {
	customClientUuid?: string;
	customOccurredAt?: string;
}

/**
 * Merakit payload transaksi barang inventaris (`TransactItemPayload`)
 * yang siap dikirimkan langsung ke backend API atau disimpan ke antrean offline.
 */
export function buildTransactionPayload(
	formData: TransactionFormData,
	options: BuildTransactionPayloadOptions = {},
): TransactItemPayload {
	const clientUuid =
		options.customClientUuid && isValidClientUuid(options.customClientUuid)
			? options.customClientUuid
			: generateClientUuid();

	const occurredAt = options.customOccurredAt ?? getOccurredAt();

	return {
		client_uuid: clientUuid,
		quantity: formData.quantity,
		occurred_at: occurredAt,
		notes: formData.notes,
		reference_number: formData.reference_number,
	};
}

export interface BuildOutboxItemParams {
	clientUuid?: string;
	employeeId: string;
	operation: OutboxOperation;
	itemId: string;
	loanId?: string | null;
	quantity: number;
	notes?: string | null;
	referenceNumber?: string | null;
	occurredAt?: string;
}

/**
 * Merakit entitas transaksi outbox (`OutboxItem`) untuk disimpan di IndexedDB (Dexie).
 * Memastikan setiap entri memiliki UUID unik, timestamp terkoreksi, dan status 'pending'.
 */
export function buildOutboxItem({
	clientUuid,
	employeeId,
	operation,
	itemId,
	loanId,
	quantity,
	notes,
	referenceNumber,
	occurredAt,
}: BuildOutboxItemParams): OutboxItem {
	const validUuid =
		clientUuid && isValidClientUuid(clientUuid)
			? clientUuid
			: generateClientUuid();

	const resolvedOccurredAt = occurredAt ?? getOccurredAt();

	return {
		clientUuid: validUuid,
		employeeId,
		operation,
		itemId,
		loanId: loanId ?? null,
		quantity,
		notes: notes ?? null,
		referenceNumber: referenceNumber ?? null,
		occurredAt: resolvedOccurredAt,
		status: "pending",
		attempts: 0,
		nextAttemptAt: null,
		lastError: null,
		createdAt: getCorrectedIsoString(),
	};
}
