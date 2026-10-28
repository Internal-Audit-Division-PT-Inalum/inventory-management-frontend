import { Calendar, CheckCircle2, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { AssetLoanReturn } from "../types";

export interface LoanReturnTimelineProps {
	returns: AssetLoanReturn[];
	totalBorrowedQuantity?: number;
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
 * Format relatif waktu (time-ago)
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

export function LoanReturnTimeline({
	returns,
	totalBorrowedQuantity,
	className,
}: LoanReturnTimelineProps) {
	if (!returns || returns.length === 0) {
		return (
			<div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-4 text-center text-xs text-slate-500">
				Belum ada riwayat pengembalian untuk pinjaman ini.
			</div>
		);
	}

	// Urutkan pengembalian dari yang terlama ke yang terbaru untuk kalkulasi kumulatif
	const sortedReturns = [...returns].sort(
		(a, b) =>
			new Date(a.returned_at).getTime() - new Date(b.returned_at).getTime(),
	);

	let cumulative = 0;

	return (
		<div className={cn("space-y-3 pt-2", className)}>
			<div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
				{sortedReturns.map((ret, index) => {
					cumulative += ret.quantity;
					const isFinal =
						totalBorrowedQuantity !== undefined &&
						cumulative >= totalBorrowedQuantity;
					const timeAgo = formatTimeAgo(ret.returned_at);

					return (
						<div
							key={ret.id || index}
							data-testid={`return-timeline-item-${ret.id || index}`}
							className="relative text-xs"
						>
							<div
								className={cn(
									"absolute -left-6 top-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 bg-white shadow-2xs",
									isFinal
										? "border-emerald-600 text-emerald-600"
										: "border-[#004785] text-[#004785]",
								)}
							>
								{isFinal ? (
									<CheckCircle2 className="h-3 w-3 stroke-[2.5]" />
								) : (
									<RotateCcw className="h-2.5 w-2.5 stroke-[2.5]" />
								)}
							</div>

							<div className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-2xs space-y-1.5">
								<div className="flex items-center justify-between gap-2">
									<span className="font-semibold text-slate-800">
										Tahap {index + 1}: Kembalikan {ret.quantity} Unit
									</span>

									{isFinal ? (
										<Badge
											variant="outline"
											className="border-emerald-200 bg-emerald-50 text-emerald-700 text-[10px] font-semibold"
										>
											Pelunasan
										</Badge>
									) : (
										<Badge
											variant="outline"
											className="border-slate-200 bg-slate-50 text-slate-600 text-[10px] font-medium"
										>
											Parsial
										</Badge>
									)}
								</div>

								<div className="flex flex-wrap items-center gap-x-2 text-[11px] text-slate-500">
									<div className="flex items-center gap-1">
										<Calendar className="h-3 w-3 text-slate-400 shrink-0" />
										<span>{formatWibDate(ret.returned_at)} WIB</span>
									</div>
									{timeAgo && (
										<span className="text-slate-400">({timeAgo})</span>
									)}
								</div>

								{totalBorrowedQuantity !== undefined && (
									<div className="text-[11px] text-slate-500 pt-1 border-t border-slate-100 flex items-center justify-between">
										<span>Total dikembalikan hingga tahap ini:</span>
										<strong className="text-slate-700 font-semibold">
											{cumulative} dari {totalBorrowedQuantity} unit
										</strong>
									</div>
								)}
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}
