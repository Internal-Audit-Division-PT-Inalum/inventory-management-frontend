import {
	AlertTriangle,
	ArrowRight,
	CheckCircle2,
	Clock,
	RotateCcw,
	Wrench,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { AuditorLoansSummary } from "../types";

export interface LoanSummaryWidgetProps {
	summary: AuditorLoansSummary;
	isLoading?: boolean;
	onManageLoansClick?: () => void;
	maxLoans?: number;
	className?: string;
}

/**
 * Widget Ringkasan Pinjaman Auditor Aktif (Task P6.2):
 * - Menampilkan status peminjaman peralatan auditor yang sedang terbuka.
 * - Mendeteksi dan memperingatkan aging pinjaman yang melebihi batas (overdue >= 7 hari).
 * - Menampilkan indikator jika terdapat pengembalian parsial yang sedang antre di outbox offline.
 * - Menyediakan shortcut navigasi cepat ke halaman /loans.
 */
export function LoanSummaryWidget({
	summary,
	isLoading = false,
	onManageLoansClick,
	maxLoans = 3,
	className,
}: LoanSummaryWidgetProps) {
	if (isLoading) {
		return (
			<Card
				className={cn("border-slate-200/90 bg-white shadow-2xs", className)}
			>
				<CardHeader className="p-4 pb-2">
					<div className="flex items-center justify-between">
						<Skeleton className="h-5 w-44 rounded-md" />
						<Skeleton className="h-5 w-20 rounded-full" />
					</div>
					<Skeleton className="h-3 w-56 rounded-sm mt-1" />
				</CardHeader>
				<CardContent className="p-4 pt-2 flex flex-col gap-2">
					{Array.from({ length: 2 }).map((_, idx) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: Static array for skeleton items
						<div key={idx} className="p-3 rounded-xl border border-slate-100">
							<Skeleton className="h-4 w-1/2 rounded-md mb-2" />
							<div className="flex justify-between items-center">
								<Skeleton className="h-3 w-28 rounded-sm" />
								<Skeleton className="h-4 w-16 rounded-full" />
							</div>
						</div>
					))}
				</CardContent>
			</Card>
		);
	}

	const displayLoans = summary.loans.slice(0, maxLoans);

	return (
		<Card
			className={cn(
				"border-slate-200/90 bg-white shadow-2xs transition-shadow duration-200",
				summary.overdueCount > 0 && "border-amber-200/90",
				className,
			)}
			aria-label="Ringkasan Pinjaman Aset Saya"
		>
			<CardHeader className="p-4 pb-2.5 sm:p-5 sm:pb-3">
				<div className="flex items-center justify-between gap-2">
					<div className="flex items-center gap-2">
						<div
							className={cn(
								"flex h-8 w-8 items-center justify-center rounded-xl",
								summary.overdueCount > 0
									? "bg-amber-100 text-amber-700"
									: summary.totalOpenLoans > 0
										? "bg-blue-50 text-[#004785]"
										: "bg-emerald-50 text-emerald-600",
							)}
						>
							{summary.overdueCount > 0 ? (
								<AlertTriangle className="h-4 w-4" />
							) : summary.totalOpenLoans > 0 ? (
								<Wrench className="h-4 w-4" />
							) : (
								<CheckCircle2 className="h-4 w-4" />
							)}
						</div>
						<div>
							<CardTitle className="text-sm sm:text-base font-bold text-slate-900">
								Pinjaman Aset Saya
							</CardTitle>
							<CardDescription className="text-[11px] text-slate-500">
								{summary.totalOpenLoans > 0
									? `${summary.totalOpenLoans} aset (${summary.totalOutstandingUnits} unit) dalam tanggungan`
									: "Tidak ada pinjaman peralatan yang aktif"}
							</CardDescription>
						</div>
					</div>

					{summary.overdueCount > 0 ? (
						<Badge variant="warning" className="text-[10px] px-2 py-0.5">
							{summary.overdueCount} Perlu Dikembalikan
						</Badge>
					) : summary.totalOpenLoans > 0 ? (
						<Badge variant="default" className="text-[10px] px-2 py-0.5">
							{summary.totalOpenLoans} Aktif
						</Badge>
					) : (
						<Badge variant="ok" className="text-[10px] px-2 py-0.5">
							Bebas Tanggungan
						</Badge>
					)}
				</div>
			</CardHeader>

			<CardContent className="p-4 pt-0 sm:p-5 sm:pt-0">
				{displayLoans.length === 0 ? (
					/* Positive Empty State */
					<div className="flex flex-col items-center justify-center p-5 text-center rounded-xl border border-slate-100 bg-slate-50/50">
						<div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 mb-1.5">
							<CheckCircle2 className="h-4 w-4" />
						</div>
						<h4 className="text-xs font-bold text-slate-800">
							Tidak Ada Tanggungan Peralatan
						</h4>
						<p className="text-[11px] text-slate-500 mt-0.5 max-w-xs">
							Semua aset yang pernah dipinjam telah dikembalikan ke gudang
							secara lengkap.
						</p>
					</div>
				) : (
					<div className="flex flex-col gap-2">
						{displayLoans.map((loan) => (
							<div
								key={loan.id}
								className={cn(
									"flex items-center justify-between gap-3 p-3 rounded-xl border transition-all",
									loan.isOverdue
										? "border-amber-200 bg-amber-50/20"
										: "border-slate-100 bg-slate-50/30",
								)}
							>
								<div className="min-w-0 flex-1">
									<div className="flex items-center gap-1.5 flex-wrap">
										<span className="text-xs font-bold text-slate-900 truncate">
											{loan.itemName}
										</span>
										<span className="font-mono text-[10px] text-slate-500 font-semibold">
											({loan.itemSku})
										</span>
										{loan.hasPendingReturn && (
											<span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.2 text-[9px] font-medium bg-blue-50 text-blue-700 border border-blue-200/80">
												<RotateCcw className="h-2.5 w-2.5" />
												Pengembalian Antre
											</span>
										)}
									</div>

									<div className="flex items-center gap-3 mt-1 text-[11px] text-slate-500">
										<span className="flex items-center gap-1">
											<Clock className="h-3 w-3 text-slate-400" />
											<span>Dipinjam {loan.agingDays} hari lalu</span>
										</span>

										<span className="font-medium text-slate-700">
											Tanggungan:{" "}
											<strong className="text-slate-900 font-bold">
												{loan.effectiveOutstandingQuantity} {loan.itemUnit}
											</strong>
										</span>
									</div>
								</div>

								<div className="shrink-0 flex flex-col items-end gap-1">
									{loan.isOverdue ? (
										<Badge
											variant="warning"
											className="text-[10px] px-1.5 py-0"
										>
											&gt; 7 Hari
										</Badge>
									) : (
										<Badge
											variant="outline"
											className="text-[10px] px-1.5 py-0 text-slate-600 bg-white"
										>
											Aktif
										</Badge>
									)}
								</div>
							</div>
						))}

						<div className="mt-1">
							{onManageLoansClick ? (
								<Button
									variant="ghost"
									size="sm"
									onClick={onManageLoansClick}
									className="w-full justify-center text-xs font-semibold text-[#004785] hover:bg-blue-50/80 hover:text-[#00386b]"
								>
									Kelola Pinjaman Saya di Tab Pinjaman
									<ArrowRight className="h-3.5 w-3.5 ml-1.5" />
								</Button>
							) : (
								<Link
									to="/loans"
									className="flex w-full items-center justify-center py-2 text-xs font-semibold text-[#004785] transition-colors hover:text-[#00386b]"
								>
									Kelola Pinjaman Saya di Tab Pinjaman
									<ArrowRight className="h-3.5 w-3.5 ml-1.5" />
								</Link>
							)}
						</div>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
