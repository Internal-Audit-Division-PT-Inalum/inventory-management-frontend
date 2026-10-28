import type { OutboxItem } from "@/lib/db";
import type { AppError } from "@/lib/errors";
import type { TransactionAction, TransactSubmitResult } from "../types";

export type TransactionFeedbackKind =
	| "synced"
	| "recorded_pending"
	| "rejected"
	| "auth_required";

export interface TransactionFeedbackDetails {
	kind: TransactionFeedbackKind;
	badgeLabel: string;
	title: string;
	message: string;
	subMessage?: string;
	colorScheme: {
		bg: string;
		border: string;
		text: string;
		badgeBg: string;
		badgeText: string;
	};
	outboxItem: OutboxItem;
	error?: AppError;
	actionLabel: string;
}

const ACTION_LABELS: Record<TransactionAction, string> = {
	take: "Ambil Barang",
	add: "Tambah Stok",
	borrow: "Pinjam Aset",
	return: "Kembalikan Aset",
};

/**
 * Memformat dan mengklasifikasikan hasil pengiriman transaksi menjadi objek
 * detail umpan balik yang selaras dengan spesifikasi "Tercatat — menunggu sinkron" vs "Tersinkron" (Task P3.7).
 */
export function formatTransactionFeedback(
	result: TransactSubmitResult,
	actionOverride?: TransactionAction,
): TransactionFeedbackDetails {
	const outbox = result.outboxItem;
	const actionKey = actionOverride ?? (outbox.operation as TransactionAction);
	const actionLabel = ACTION_LABELS[actionKey] ?? "Transaksi";

	// 1. Berhasil Terkirim & Tersinkron Langsung ke Server
	if (result.synced) {
		return {
			kind: "synced",
			badgeLabel: "Tersinkron",
			title: "Transaksi Tersinkron",
			message:
				result.message ||
				`${actionLabel} berhasil diproses dan disinkronkan ke server.`,
			subMessage:
				"Stok barang di server dan basis data lokal telah diperbarui.",
			colorScheme: {
				bg: "bg-emerald-50/95",
				border: "border-emerald-200",
				text: "text-emerald-900",
				badgeBg: "bg-emerald-100",
				badgeText: "text-emerald-800",
			},
			outboxItem: outbox,
			actionLabel,
		};
	}

	// 2. Berhasil Dicatat di Perangkat (Offline / Jaringan Lambat / Antrean Outbox)
	if (result.queued && !result.rejected && !result.authError) {
		return {
			kind: "recorded_pending",
			badgeLabel: "Tercatat — Menunggu Sinkron",
			title: "Tercatat — Menunggu Sinkron",
			message:
				result.message ||
				`${actionLabel} berhasil dicatat di penyimpanan perangkat lokal.`,
			subMessage:
				"Aplikasi dalam mode offline atau jaringan tidak stabil. Transaksi akan otomatis terkirim begitu perangkat terhubung kembali.",
			colorScheme: {
				bg: "bg-amber-50/95",
				border: "border-amber-200",
				text: "text-amber-900",
				badgeBg: "bg-amber-100",
				badgeText: "text-amber-800",
			},
			outboxItem: outbox,
			actionLabel,
		};
	}

	// 3. Sesi Kedaluwarsa (401 Auth)
	if (result.authError) {
		return {
			kind: "auth_required",
			badgeLabel: "Perlu Login Ulang",
			title: "Sesi Berakhir",
			message:
				result.message ||
				"Sesi login Anda telah berakhir. Transaksi tetap tersimpan aman di antrean perangkat.",
			subMessage:
				"Silakan login kembali untuk menyelesaikan sinkronisasi ke server.",
			colorScheme: {
				bg: "bg-blue-50/95",
				border: "border-blue-200",
				text: "text-blue-900",
				badgeBg: "bg-blue-100",
				badgeText: "text-blue-800",
			},
			outboxItem: outbox,
			error: result.error,
			actionLabel,
		};
	}

	// 4. Ditolak Server (422 / 409 / Pelanggaran Aturan Bisnis)
	return {
		kind: "rejected",
		badgeLabel: "Ditolak",
		title: "Transaksi Ditolak",
		message:
			result.message ||
			"Transaksi tidak dapat diproses karena tidak memenuhi aturan validasi.",
		subMessage:
			"Stok perkiraan lokal telah dikembalikan ke kondisi semula secara otomatis.",
		colorScheme: {
			bg: "bg-rose-50/95",
			border: "border-rose-200",
			text: "text-rose-900",
			badgeBg: "bg-rose-100",
			badgeText: "text-rose-800",
		},
		outboxItem: outbox,
		error: result.error,
		actionLabel,
	};
}
