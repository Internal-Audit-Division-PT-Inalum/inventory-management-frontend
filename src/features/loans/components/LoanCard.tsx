import {
	ArrowRight,
	Calendar,
	CheckCircle2,
	ChevronDown,
	ChevronUp,
	Clock,
	History,
	RotateCcw,
	ShieldAlert,
} from "lucide-react";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { AssetLoan, ProjectedAssetLoan } from "../types";
import { LoanReturnTimeline } from "./LoanReturnTimeline";

export interface LoanCardProps {
	loan: AssetLoan | ProjectedAssetLoan;
	onReturnClick?: (loan: AssetLoan | ProjectedAssetLoan) => void;
	className?: string;
}

/**
 * Format tanggal dalam format resmi Indonesia (WIB)
 */
function formatWibDate(dateString: string): string {
	try {
		const date = new Date(dateString);
		if (Number.isNaN(date.getTime())) return dateString;
		return new Intl.DateTimeFormat("id-ID", {
			day: "numeric",
			month: "short",
			year: "numeric",
			hour: "2-digit",
			minute: "2-digit",
			timeZone: "Asia/Jakarta",
		}).format(date);
	} catch {
		return dateString;
	}
}

/**
 * Hitung durasi waktu peminjaman yang ramah pengguna
 */
function formatTimeAgo(dateString: string): string {
	try {
		const now = Date.now();
		const then = new Date(dateString).getTime();
		const diffMs = now - then;
		if (Number.isNaN(diffMs)) return "";

		const diffMinutes = Math.floor(diffMs / 60000);
		if (diffMinutes < 1) return "Baru saja";
		if (diffMinutes < 60) return `${diffMinutes} menit lalu`;

		const diffHours = Math.floor(diffMinutes / 60);
		if (diffHours < 24) return `${diffHours} jam lalu`;

		const diffDays = Math.floor(diffHours / 24);
		return `${diffDays} hari lalu`;
	} catch {
		return "";
	}
}

export function LoanCard({ loan, onReturnClick, className }: LoanCardProps) {
	const [imageError, setImageError] = React.useState(false);
	const [isHistoryOpen, setIsHistoryOpen] = React.useState(false);

	const projected = loan as Partial<ProjectedAssetLoan>;
	const isPendingSync = projected.effective_status === "pending_sync";
	const hasPendingReturn = Boolean(projected.has_pending_return);
	const pendingReturnQty = projected.pending_return_quantity ?? 0;

	const isFullyReturned =
		loan.status === "returned" ||
		isPendingSync ||
		(loan.outstanding_quantity ?? 0) <= 0;

	const isPartiallyReturned =
		!isFullyReturned && (loan.returned_quantity ?? 0) > 0;

	const returnProgress =
		loan.quantity > 0
			? Math.min(
					100,
					Math.round((loan.returned_quantity / loan.quantity) * 100),
				)
			: 0;

	const itemName = loan.item_name || loan.item?.name || "Barang Aset";
	const itemSku = loan.item_sku || loan.item?.sku || "SKU-AST";
	const timeAgo = formatTimeAgo(loan.borrowed_at);
	const hasReturnHistory = Boolean(loan.returns && loan.returns.length > 0);

	return (
		<Card
			data-testid={`loan-card-${loan.id}`}
			className={cn(
				"overflow-hidden border-slate-200/80 bg-white shadow-xs transition-all hover:border-slate-300 hover:shadow-sm",
				isFullyReturned && !isPendingSync && "bg-slate-50/50 opacity-90",
				isPendingSync && "border-amber-200/90 bg-amber-50/20",
				className,
			)}
		>
			<CardContent className="p-4 sm:p-5">
				<div className="flex items-start gap-3.5">
					<div className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200/80 bg-slate-100/80 shadow-2xs">
						{loan.image_thumb_url && !imageError ? (
							<img
								src={loan.image_thumb_url}
								alt={itemName}
								className="h-full w-full object-cover"
								onError={() => setImageError(true)}
								loading="lazy"
							/>
						) : (
							<div className="flex h-full w-full items-center justify-center bg-blue-50/80 text-[#004785]">
								<ShieldAlert className="h-6 w-6 stroke-[1.8]" />
							</div>
						)}
					</div>

					<div className="flex-1 min-w-0">
						<div className="flex items-center justify-between gap-2 mb-1">
							<span className="font-mono text-[11px] font-semibold text-slate-500 uppercase tracking-wider truncate">
								{itemSku}
							</span>

							{isPendingSync ? (
								<Badge
									variant="outline"
									className="border-amber-300 bg-amber-50 text-amber-800 text-[11px] font-semibold shrink-0"
								>
									<Clock className="mr-1 h-3 w-3 animate-pulse text-amber-600" />
									Lunas (Menunggu Sinkron)
								</Badge>
							) : isFullyReturned ? (
								<Badge
									variant="outline"
									className="border-emerald-200 bg-emerald-50 text-emerald-700 text-[11px] font-semibold shrink-0"
								>
									<CheckCircle2 className="mr-1 h-3 w-3" />
									Lunas
								</Badge>
							) : isPartiallyReturned ? (
								<Badge
									variant="outline"
									className="border-amber-200 bg-amber-50 text-amber-700 text-[11px] font-semibold shrink-0"
								>
									<Clock className="mr-1 h-3 w-3" />
									Sisa {loan.outstanding_quantity} Unit
								</Badge>
							) : (
								<Badge
									variant="outline"
									className="border-blue-200 bg-blue-50 text-[#004785] text-[11px] font-semibold shrink-0"
								>
									{loan.quantity} Unit
								</Badge>
							)}
						</div>

						<h3 className="text-sm font-bold text-slate-900 leading-snug line-clamp-2">
							{itemName}
						</h3>

						<div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
							<div className="flex items-center gap-1">
								<Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0" />
								<span>{formatWibDate(loan.borrowed_at)} WIB</span>
							</div>
							{timeAgo && (
								<span className="text-slate-400 font-medium">({timeAgo})</span>
							)}
						</div>
					</div>
				</div>

				{hasPendingReturn && (
					<div
						data-testid={`pending-return-notice-${loan.id}`}
						className="mt-3 flex items-center gap-2 rounded-xl bg-amber-50/90 px-3 py-2 text-xs text-amber-900 border border-amber-200/70"
					>
						<Clock className="h-4 w-4 shrink-0 text-amber-600 animate-pulse" />
						<div className="flex-1 min-w-0">
							<span className="font-semibold">
								{pendingReturnQty} unit pengembalian
							</span>{" "}
							<span className="text-amber-800/90">
								sedang dalam antrean perangkat dan menunggu sinkronisasi.
							</span>
						</div>
					</div>
				)}

				{isPartiallyReturned && (
					<div className="mt-3.5 pt-3 border-t border-slate-100">
						<div className="flex items-center justify-between text-xs mb-1.5">
							<span className="text-slate-500">Progres Pengembalian:</span>
							<span className="font-semibold text-slate-700">
								{loan.returned_quantity} dari {loan.quantity} unit (
								{returnProgress}%)
							</span>
						</div>
						<div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
							<div
								className="h-full bg-amber-500 transition-all duration-300 rounded-full"
								style={{ width: `${returnProgress}%` }}
							/>
						</div>
					</div>
				)}

				{isPendingSync && (
					<div className="mt-3.5 pt-3 border-t border-amber-200/60 flex items-center justify-between text-xs text-amber-800">
						<span className="flex items-center gap-1.5 font-medium">
							<Clock className="h-3.5 w-3.5 text-amber-600" />
							Pengembalian lunas dalam antrean sinkronisasi
						</span>
					</div>
				)}

				{!isFullyReturned &&
					(loan.outstanding_quantity ?? 0) > 0 &&
					onReturnClick && (
						<div className="mt-3.5 pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
							<div className="text-xs text-slate-600">
								<span className="text-slate-400">Harus Kembali: </span>
								<strong className="text-slate-900 font-bold">
									{loan.outstanding_quantity} unit
								</strong>
							</div>

							<Button
								type="button"
								size="sm"
								onClick={() => onReturnClick(loan)}
								className="bg-[#004785] hover:bg-[#00386b] text-white text-xs font-semibold h-9 px-3.5 rounded-xl shadow-2xs active:scale-95 transition-all"
							>
								<RotateCcw className="mr-1.5 h-3.5 w-3.5" />
								<span>Kembalikan</span>
								<ArrowRight className="ml-1 h-3 w-3 opacity-60" />
							</Button>
						</div>
					)}

				{isFullyReturned && !isPendingSync && loan.fully_returned_at && (
					<div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
						<span>Selesai & Lunas:</span>
						<span className="font-semibold text-emerald-700">
							{formatWibDate(loan.fully_returned_at)} WIB
						</span>
					</div>
				)}

				{hasReturnHistory && (
					<div className="mt-3.5 pt-3 border-t border-slate-100">
						<button
							type="button"
							onClick={() => setIsHistoryOpen((prev) => !prev)}
							className="flex items-center justify-between w-full text-xs font-semibold text-[#004785] hover:text-[#00386b] py-1 transition-colors"
						>
							<div className="flex items-center gap-1.5">
								<History className="h-3.5 w-3.5" />
								<span>
									Riwayat Pengembalian ({loan.returns?.length || 0} Tahap)
								</span>
							</div>
							{isHistoryOpen ? (
								<ChevronUp className="h-4 w-4" />
							) : (
								<ChevronDown className="h-4 w-4" />
							)}
						</button>

						{isHistoryOpen && (
							<LoanReturnTimeline
								returns={loan.returns || []}
								totalBorrowedQuantity={loan.quantity}
							/>
						)}
					</div>
				)}
			</CardContent>
		</Card>
	);
}
