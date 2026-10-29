import {
	AlertTriangle,
	CheckCircle2,
	Clock,
	RefreshCw,
	WifiOff,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { LowStockReconciliationResult } from "../types";

export interface ReconciliationBadgeProps {
	reconciliation: LowStockReconciliationResult;
	isChecking?: boolean;
	onRefreshCatalog?: () => void;
	className?: string;
}

/**
 * Komponen Indikator Status Rekonsiliasi Stok Rendah (Task P6.3):
 * - Memvisualisasikan hasil verifikasi antara perhitungan stok lokal vs endpoint /reports/low-stock backend.
 * - Menangani 4 kondisi: Reconciled (100% cocok), Divergensi Outbox, Butuh Sync Katalog, dan Mode Offline.
 */
export function ReconciliationBadge({
	reconciliation,
	isChecking = false,
	onRefreshCatalog,
	className,
}: ReconciliationBadgeProps) {
	const { status } = reconciliation;

	if (status === "reconciled") {
		return (
			<div
				role="status"
				aria-live="polite"
				className={cn(
					"flex items-center justify-between gap-3 p-3 rounded-2xl border border-emerald-200/80 bg-emerald-50/60 transition-all",
					className,
				)}
			>
				<div className="flex items-center gap-2.5 min-w-0">
					<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
						<CheckCircle2 className="h-4 w-4" />
					</div>
					<div className="min-w-0">
						<div className="flex items-center gap-2">
							<h4 className="text-xs font-bold text-emerald-950 truncate">
								Stok Rendah Terverifikasi Server
							</h4>
							<Badge variant="ok" className="text-[10px] px-1.5 py-0">
								100% Cocok
							</Badge>
						</div>
						<p className="text-[11px] text-emerald-800/80 mt-0.5 truncate">
							{reconciliation.localCount === 0
								? "Seluruh stok barang aman dan selaras dengan laporan backend."
								: `Sebanyak ${reconciliation.localCount} barang stok rendah cocok persis dengan server.`}
						</p>
					</div>
				</div>

				{isChecking && (
					<RefreshCw className="h-3.5 w-3.5 shrink-0 text-emerald-600 animate-spin" />
				)}
			</div>
		);
	}

	if (status === "divergent_pending_mutations") {
		return (
			<div
				role="status"
				aria-live="polite"
				className={cn(
					"flex items-center justify-between gap-3 p-3 rounded-2xl border border-blue-200/80 bg-blue-50/60 transition-all",
					className,
				)}
			>
				<div className="flex items-center gap-2.5 min-w-0">
					<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-[#004785]">
						<Clock className="h-4 w-4" />
					</div>
					<div className="min-w-0">
						<div className="flex items-center gap-2">
							<h4 className="text-xs font-bold text-blue-950 truncate">
								Divergensi Terkendali
							</h4>
							<Badge variant="info" className="text-[10px] px-1.5 py-0">
								Mutasi Antre
							</Badge>
						</div>
						<p className="text-[11px] text-blue-800/80 mt-0.5 truncate">
							Perbedaan angka terproyeksi akibat transaksi offline di outbox
							yang belum terunggah.
						</p>
					</div>
				</div>

				{isChecking && (
					<RefreshCw className="h-3.5 w-3.5 shrink-0 text-[#004785] animate-spin" />
				)}
			</div>
		);
	}

	if (status === "divergent_outdated_cache") {
		return (
			<div
				role="status"
				aria-live="polite"
				className={cn(
					"flex items-center justify-between gap-3 p-3 rounded-2xl border border-amber-200/90 bg-amber-50/70 transition-all",
					className,
				)}
			>
				<div className="flex items-center gap-2.5 min-w-0">
					<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
						<AlertTriangle className="h-4 w-4" />
					</div>
					<div className="min-w-0">
						<div className="flex items-center gap-2">
							<h4 className="text-xs font-bold text-amber-950 truncate">
								Perlu Sinkronisasi Katalog
							</h4>
							<Badge variant="warning" className="text-[10px] px-1.5 py-0">
								Selisih Terdeteksi
							</Badge>
						</div>
						<p className="text-[11px] text-amber-800/80 mt-0.5 truncate">
							Laporan server memiliki pembaruan stok terkini. Silakan segarkan
							katalog.
						</p>
					</div>
				</div>

				{onRefreshCatalog && (
					<Button
						variant="outline"
						size="sm"
						onClick={onRefreshCatalog}
						disabled={isChecking}
						className="shrink-0 h-7 text-xs border-amber-300 text-amber-900 bg-white hover:bg-amber-100/60"
					>
						<RefreshCw
							className={cn(
								"h-3 w-3 mr-1 text-amber-700",
								isChecking && "animate-spin",
							)}
						/>
						Segarkan
					</Button>
				)}
			</div>
		);
	}

	// Mode Offline Fallback
	return (
		<div
			role="status"
			aria-live="polite"
			className={cn(
				"flex items-center justify-between gap-3 p-3 rounded-2xl border border-slate-200 bg-slate-50/70 transition-all",
				className,
			)}
		>
			<div className="flex items-center gap-2.5 min-w-0">
				<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-200 text-slate-600">
					<WifiOff className="h-4 w-4" />
				</div>
				<div className="min-w-0">
					<div className="flex items-center gap-2">
						<h4 className="text-xs font-bold text-slate-800 truncate">
							Perhitungan Mandiri Lokal
						</h4>
						<Badge
							variant="outline"
							className="text-[10px] px-1.5 py-0 text-slate-600 bg-white"
						>
							Mode Offline
						</Badge>
					</div>
					<p className="text-[11px] text-slate-500 mt-0.5 truncate">
						Monitoring beroperasi penuh berdasarkan data lokal IndexedDB di
						gudang.
					</p>
				</div>
			</div>
		</div>
	);
}

