import {
	AlertTriangle,
	CheckCircle2,
	Clock,
	FileText,
	Hash,
	Loader2,
	Package,
	RefreshCw,
	Trash2,
	XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatRelative, formatWib } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { EnrichedOutboxItem } from "../hooks/useOutboxQueue";

export interface OutboxItemCardProps {
	item: EnrichedOutboxItem;
	onRetry?: (clientUuid: string) => Promise<void> | void;
	onDiscard?: (item: EnrichedOutboxItem) => void;
	isRetrying?: boolean;
}

const OPERATION_CONFIG = {
	take: {
		label: "Ambil",
		badgeClass: "bg-blue-50 text-blue-700 border-blue-200",
	},
	add: {
		label: "Tambah",
		badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
	},
	borrow: {
		label: "Pinjam",
		badgeClass: "bg-amber-50 text-amber-700 border-amber-200",
	},
	return: {
		label: "Kembali",
		badgeClass: "bg-teal-50 text-teal-700 border-teal-200",
	},
};

/**
 * Kartu komponen untuk menampilkan satu entri transaksi antrean offline outbox:
 * - Menampilkan detail barang, jumlah, jenis mutasi, dan waktu transaksi.
 * - Indikator status sinkronisasi yang jelas.
 * - Wadah "Perlu Tindakan" dengan rincian galat dan tombol Aksi Coba Lagi & Hapus Antrean (Rollback).
 */
export function OutboxItemCard({
	item,
	onRetry,
	onDiscard,
	isRetrying = false,
}: OutboxItemCardProps) {
	const opConfig = OPERATION_CONFIG[item.operation] ?? {
		label: item.operation,
		badgeClass: "bg-slate-50 text-slate-700 border-slate-200",
	};

	const isNeedsAction = item.status === "failed" || item.status === "rejected";

	return (
		<Card
			data-testid={`outbox-card-${item.clientUuid}`}
			className={cn(
				"border transition-all bg-white shadow-2xs overflow-hidden",
				isNeedsAction
					? "border-red-200/90 ring-1 ring-red-100"
					: item.status === "syncing"
						? "border-blue-200 ring-1 ring-blue-50"
						: "border-slate-200/80 hover:border-slate-300",
			)}
		>
			<CardContent className="p-4 space-y-3">
				{/* Baris Atas: Operasi + Status Badge */}
				<div className="flex items-center justify-between gap-2">
					<div className="flex items-center gap-1.5 flex-wrap">
						<Badge
							variant="outline"
							className={cn(
								"font-bold text-[11px] px-2 py-0.5",
								opConfig.badgeClass,
							)}
						>
							{opConfig.label}
						</Badge>
						<span className="text-xs font-bold text-slate-900 font-mono">
							{item.quantity} {item.itemUnit}
						</span>
					</div>

					<div>
						{item.status === "pending" && (
							<Badge
								variant="warning"
								className="text-[10px] gap-1 px-2 py-0.5 font-semibold"
							>
								<Clock className="h-3 w-3 shrink-0" />
								<span>Menunggu</span>
							</Badge>
						)}
						{item.status === "syncing" && (
							<Badge
								variant="info"
								className="text-[10px] gap-1 px-2 py-0.5 font-semibold animate-pulse"
							>
								<RefreshCw className="h-3 w-3 shrink-0 animate-spin" />
								<span>Sinkronisasi...</span>
							</Badge>
						)}
						{item.status === "failed" && (
							<Badge
								variant="warning"
								className="text-[10px] gap-1 px-2 py-0.5 font-semibold bg-amber-100 text-amber-900 border-amber-300"
							>
								<AlertTriangle className="h-3 w-3 shrink-0" />
								<span>Gagal Sementara</span>
							</Badge>
						)}
						{item.status === "rejected" && (
							<Badge
								variant="destructive"
								className="text-[10px] gap-1 px-2 py-0.5 font-semibold"
							>
								<XCircle className="h-3 w-3 shrink-0" />
								<span>Ditolak Server</span>
							</Badge>
						)}
						{item.status === "synced" && (
							<Badge
								variant="ok"
								className="text-[10px] gap-1 px-2 py-0.5 font-semibold"
							>
								<CheckCircle2 className="h-3 w-3 shrink-0" />
								<span>Tersinkron</span>
							</Badge>
						)}
					</div>
				</div>

				{/* Detail Nama Barang & SKU */}
				<div className="min-w-0">
					<h4 className="text-sm font-bold text-slate-900 leading-snug line-clamp-2">
						{item.itemName}
					</h4>
					<div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-500 font-mono">
						<span className="flex items-center gap-1">
							<Package className="h-3 w-3" />
							{item.itemSku}
						</span>
						<span>•</span>
						<span>{formatRelative(item.occurredAt)}</span>
					</div>
				</div>

				{/* Catatan / Keterangan Transaksi jika ada */}
				{(item.notes || item.referenceNumber) && (
					<div className="rounded-lg bg-slate-50 p-2 text-[11px] text-slate-600 space-y-1 border border-slate-100">
						{item.notes && (
							<div className="flex items-start gap-1.5">
								<FileText className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-0.5" />
								<span className="line-clamp-2 italic">{item.notes}</span>
							</div>
						)}
						{item.referenceNumber && (
							<div className="flex items-center gap-1.5 font-mono text-[10px]">
								<Hash className="h-3.5 w-3.5 text-slate-400 shrink-0" />
								<span>Ref: {item.referenceNumber}</span>
							</div>
						)}
					</div>
				)}

				{/* Footer Info Waktu WIB */}
				<div className="text-[10px] text-slate-400 flex items-center justify-between border-t border-slate-100 pt-2">
					<span>Waktu: {formatWib(item.occurredAt)}</span>
					{item.attempts > 0 && (
						<span className="font-mono">Coba: {item.attempts}x</span>
					)}
				</div>

				{/* SECTION KHUSUS: "Perlu Tindakan" (Failed / Rejected) */}
				{isNeedsAction && (
					<div
						data-testid={`needs-action-box-${item.clientUuid}`}
						className={cn(
							"rounded-xl p-3 text-xs space-y-2.5 border",
							item.status === "rejected"
								? "bg-red-50/90 border-red-200 text-red-900"
								: "bg-amber-50/90 border-amber-200 text-amber-900",
						)}
					>
						<div className="flex items-start gap-2">
							{item.status === "rejected" ? (
								<XCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
							) : (
								<AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
							)}
							<div className="flex-1 min-w-0">
								<p className="font-bold text-[11px] uppercase tracking-wide">
									{item.status === "rejected"
										? "Ditolak oleh Server"
										: "Gagal Mengunggah"}
								</p>
								<p className="text-xs mt-0.5 text-slate-700 leading-relaxed break-words">
									{item.lastError?.message ||
										(item.status === "rejected"
											? "Validasi server menolak transaksi ini (misal stok tidak mencukupi atau konflik data)."
											: "Koneksi ke server terputus atau terjadi kesalahan jaringan.")}
								</p>
								{item.lastError?.code && (
									<p className="text-[10px] font-mono text-slate-500 mt-0.5">
										Kode Galat: {item.lastError.code}
									</p>
								)}
							</div>
						</div>

						{/* Tombol Aksi: Coba Lagi & Hapus Antrean */}
						<div className="flex items-center gap-2 pt-1 border-t border-slate-200/60">
							{onRetry && (
								<Button
									type="button"
									variant="default"
									size="sm"
									disabled={isRetrying || item.status === "syncing"}
									onClick={() => onRetry(item.clientUuid)}
									className="flex-1 bg-[#004785] hover:bg-[#00386b] h-8 text-xs font-semibold"
									data-testid={`retry-button-${item.clientUuid}`}
								>
									{isRetrying ? (
										<>
											<Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
											<span>Mencoba...</span>
										</>
									) : (
										<>
											<RefreshCw className="h-3.5 w-3.5 mr-1" />
											<span>Coba Lagi</span>
										</>
									)}
								</Button>
							)}

							{onDiscard && (
								<Button
									type="button"
									variant="outline"
									size="sm"
									disabled={item.status === "syncing"}
									onClick={() => onDiscard(item)}
									className="flex-1 border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800 h-8 text-xs font-semibold"
									data-testid={`discard-button-${item.clientUuid}`}
								>
									<Trash2 className="h-3.5 w-3.5 mr-1 text-red-600" />
									<span>Hapus Antrean</span>
								</Button>
							)}
						</div>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
