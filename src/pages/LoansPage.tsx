import { CheckCircle2, Clock, Package, RefreshCw } from "lucide-react";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	type AssetLoan,
	LoanList,
	type ProjectedAssetLoan,
	ReturnLoanDialog,
	type ReturnLoanFormData,
	useMyLoans,
} from "@/features/loans";
import { TransactionFeedbackBanner } from "@/features/transactions/components/TransactionFeedbackBanner";
import { enqueueAndProcessTransaction } from "@/features/transactions/lib/outboxQueue";
import type { TransactSubmitResult } from "@/features/transactions/types";
import { db } from "@/lib/db";
import { cn } from "@/lib/utils";
import type { Item } from "@/types/api";

export function LoansPage() {
	const [activeTab, setActiveTab] = React.useState<"active" | "history">(
		"active",
	);

	// Fetch semua pinjaman (status: "all") agar kedua tab aktif & riwayat selalu sinkron
	const { loans, isLoading, error, refetch, isFetching, stats } = useMyLoans({
		status: "all",
	});

	const [selectedLoan, setSelectedLoan] = React.useState<
		ProjectedAssetLoan | AssetLoan | null
	>(null);
	const [isReturnOpen, setIsReturnOpen] = React.useState(false);
	const [isSubmitting, setIsSubmitting] = React.useState(false);
	const [feedbackResult, setFeedbackResult] =
		React.useState<TransactSubmitResult | null>(null);

	// Pisahkan pinjaman aktif vs riwayat selesai dengan memperhitungkan proyeksi outbox
	const activeLoans = React.useMemo(
		() =>
			loans.filter((l) => {
				const serverOutstanding =
					l.server_outstanding_quantity ?? l.outstanding_quantity ?? 0;
				return serverOutstanding > 0 || l.has_pending_return;
			}),
		[loans],
	);

	const historyLoans = React.useMemo(
		() =>
			loans.filter((l) => {
				const serverOutstanding =
					l.server_outstanding_quantity ?? l.outstanding_quantity ?? 0;
				return (
					(l.status === "returned" || serverOutstanding <= 0) &&
					!l.has_pending_return
				);
			}),
		[loans],
	);

	const displayedLoans = activeTab === "active" ? activeLoans : historyLoans;

	const handleReturnClick = React.useCallback(
		(loan: ProjectedAssetLoan | AssetLoan) => {
			setSelectedLoan(loan);
			setIsReturnOpen(true);
		},
		[],
	);

	const handleReturnSubmit = React.useCallback(
		async (formData: ReturnLoanFormData) => {
			if (!selectedLoan) return;

			setIsSubmitting(true);
			try {
				const localItem = await db.items.get(selectedLoan.item_id);
				const itemToTransact: Item = localItem || {
					id: selectedLoan.item_id,
					name:
						selectedLoan.item_name || selectedLoan.item?.name || "Barang Aset",
					sku: selectedLoan.item_sku || selectedLoan.item?.sku || "AST-001",
					type: "asset",
					unit: selectedLoan.item?.unit || "unit",
					location_id: selectedLoan.item?.location_id || "",
					current_stock: selectedLoan.item?.current_stock ?? 0,
					minimum_stock: 0,
					borrowed_quantity: selectedLoan.quantity,
					image_url: selectedLoan.image_thumb_url || null,
					updated_at: new Date().toISOString(),
				};

				const result = await enqueueAndProcessTransaction({
					item: itemToTransact,
					action: "return",
					loanId: selectedLoan.id,
					formData: {
						quantity: formData.quantity,
						notes: formData.notes,
						reference_number: formData.reference_number,
					},
				});

				setFeedbackResult(result);
				setIsReturnOpen(false);
				await refetch();
			} finally {
				setIsSubmitting(false);
			}
		},
		[selectedLoan, refetch],
	);

	return (
		<div className="flex flex-col gap-4">
			<div className="flex items-center justify-between gap-3">
				<div>
					<h2 className="text-lg font-bold text-slate-900 tracking-tight">
						Pinjaman Saya
					</h2>
					<p className="text-xs text-slate-500">
						Aset & peralatan operasional yang sedang Anda gunakan
					</p>
				</div>

				<div className="flex items-center gap-2 shrink-0">
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => refetch()}
						disabled={isLoading || isFetching}
						className="h-8 w-8 p-0 rounded-xl border-slate-200 text-slate-600 hover:text-slate-900"
						title="Segarkan data pinjaman"
					>
						<RefreshCw
							className={`h-3.5 w-3.5 ${isFetching ? "animate-spin text-[#004785]" : ""}`}
						/>
					</Button>

					{stats.totalPendingReturns > 0 && (
						<Badge
							variant="secondary"
							className="bg-amber-50 text-amber-800 border-amber-300 text-xs font-semibold px-2.5 py-0.5"
							title={`${stats.totalPendingReturns} unit dalam antrean sinkronisasi`}
						>
							<Clock className="mr-1 h-3 w-3 animate-pulse text-amber-600" />
							{stats.totalPendingReturns} Pending
						</Badge>
					)}

					{stats.totalOpenLoans > 0 && (
						<Badge
							variant="secondary"
							className="bg-blue-50 text-[#004785] border-blue-200 text-xs font-semibold px-2.5 py-0.5"
						>
							<Package className="mr-1 h-3 w-3" />
							{stats.totalOutstandingItems} Unit
						</Badge>
					)}
				</div>
			</div>

			{feedbackResult && (
				<TransactionFeedbackBanner
					result={feedbackResult}
					onDismiss={() => setFeedbackResult(null)}
				/>
			)}

			<div className="flex items-center rounded-xl border border-slate-200 bg-slate-100/70 p-1 text-xs font-semibold">
				<button
					type="button"
					onClick={() => setActiveTab("active")}
					className={cn(
						"flex-1 flex items-center justify-center gap-2 py-2 rounded-lg transition-all",
						activeTab === "active"
							? "bg-white text-[#004785] font-bold shadow-2xs"
							: "text-slate-600 hover:text-slate-900",
					)}
				>
					<Clock className="h-3.5 w-3.5" />
					<span>Pinjaman Aktif</span>
					<Badge
						variant="secondary"
						className={cn(
							"px-1.5 py-0 text-[10px] rounded-full",
							activeTab === "active"
								? "bg-blue-100 text-[#004785]"
								: "bg-slate-200 text-slate-600",
						)}
					>
						{activeLoans.length}
					</Badge>
				</button>

				<button
					type="button"
					onClick={() => setActiveTab("history")}
					className={cn(
						"flex-1 flex items-center justify-center gap-2 py-2 rounded-lg transition-all",
						activeTab === "history"
							? "bg-white text-[#004785] font-bold shadow-2xs"
							: "text-slate-600 hover:text-slate-900",
					)}
				>
					<CheckCircle2 className="h-3.5 w-3.5" />
					<span>Riwayat Selesai</span>
					<Badge
						variant="secondary"
						className={cn(
							"px-1.5 py-0 text-[10px] rounded-full",
							activeTab === "history"
								? "bg-emerald-100 text-emerald-800"
								: "bg-slate-200 text-slate-600",
						)}
					>
						{historyLoans.length}
					</Badge>
				</button>
			</div>

			<LoanList
				loans={displayedLoans}
				isLoading={isLoading}
				error={error}
				onRetry={() => refetch()}
				onReturnClick={activeTab === "active" ? handleReturnClick : undefined}
				emptyTitle={
					activeTab === "active"
						? "Tidak Ada Pinjaman Aktif"
						: "Belum Ada Riwayat Pinjaman"
				}
				emptyMessage={
					activeTab === "active"
						? "Tidak ada pinjaman aset yang sedang aktif saat ini."
						: "Belum ada riwayat pinjaman aset yang telah selesai dikembalikan."
				}
				emptyDescription={
					activeTab === "active"
						? "Peralatan atau aset yang Anda pinjam dari inventaris akan tercatat dan ditampilkan di sini."
						: "Seluruh catatan peminjaman aset yang telah dikembalikan lunas akan diarsipkan di sini."
				}
				emptyAction={
					activeTab === "active" ? (
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={() => {
								window.location.hash = "#/";
							}}
							className="mt-2 text-xs font-semibold text-[#004785] border-blue-200 bg-blue-50/50 hover:bg-blue-100/60"
						>
							<Package className="mr-1.5 h-3.5 w-3.5" />
							<span>Buka Katalog & Pinjam Aset</span>
						</Button>
					) : undefined
				}
			/>

			{selectedLoan && (
				<ReturnLoanDialog
					open={isReturnOpen}
					onOpenChange={setIsReturnOpen}
					loan={selectedLoan}
					onSubmit={handleReturnSubmit}
					isSubmitting={isSubmitting}
				/>
			)}
		</div>
	);
}
