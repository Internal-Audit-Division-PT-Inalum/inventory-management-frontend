import { AlertCircle, PackageCheck, RefreshCw } from "lucide-react";
import type * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { AssetLoan, ProjectedAssetLoan } from "../types";
import { LoanCard } from "./LoanCard";
import { LoanCardSkeleton } from "./LoanCardSkeleton";

export interface LoanListProps {
	loans: (AssetLoan | ProjectedAssetLoan)[];
	isLoading?: boolean;
	error?: Error | null;
	onRefresh?: () => void;
	onRetry?: () => void;
	onReturnClick?: (loan: AssetLoan | ProjectedAssetLoan) => void;
	emptyTitle?: string;
	emptyMessage?: string;
	emptyDescription?: string;
	emptyIcon?: React.ReactNode;
	emptyAction?: React.ReactNode;
	className?: string;
}

export function LoanList({
	loans,
	isLoading,
	error,
	onRefresh,
	onRetry,
	onReturnClick,
	emptyTitle = "Semua Pinjaman Beres",
	emptyMessage = "Tidak ada barang aset yang sedang Anda pinjam saat ini.",
	emptyDescription,
	emptyIcon,
	emptyAction,
	className,
}: LoanListProps) {
	const handleRefresh = onRetry || onRefresh;

	if (isLoading) {
		return (
			<div className={cn("space-y-3", className)}>
				<LoanCardSkeleton />
				<LoanCardSkeleton />
				<LoanCardSkeleton />
			</div>
		);
	}

	if (error) {
		return (
			<Card className="border-rose-200 bg-rose-50/70 p-6 text-center">
				<CardContent className="flex flex-col items-center p-0">
					<div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-100 text-rose-600">
						<AlertCircle className="h-6 w-6" />
					</div>
					<h3 className="text-sm font-bold text-rose-950 mb-1">
						Gagal Memuat Daftar Pinjaman
					</h3>
					<p className="text-xs text-rose-700 max-w-sm mb-4">
						{error.message ||
							"Terjadi gangguan saat mengambil data pinjaman dari server."}
					</p>
					{handleRefresh && (
						<Button
							type="button"
							size="sm"
							onClick={handleRefresh}
							className="bg-rose-700 hover:bg-rose-800 text-white text-xs h-9 px-4 rounded-xl shadow-xs"
						>
							<RefreshCw className="mr-1.5 h-3.5 w-3.5" />
							<span>Coba Lagi</span>
						</Button>
					)}
				</CardContent>
			</Card>
		);
	}

	if (loans.length === 0) {
		return (
			<Card className="border-dashed border-slate-200 bg-slate-50/50 p-8 text-center">
				<CardContent className="flex flex-col items-center p-0">
					<div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-white border border-slate-200/80 text-emerald-600 shadow-2xs">
						{emptyIcon || <PackageCheck className="h-7 w-7" />}
					</div>
					<h3 className="text-sm font-bold text-slate-800 mb-1">
						{emptyTitle}
					</h3>
					<p className="text-xs text-slate-600 font-medium max-w-xs">
						{emptyMessage}
					</p>
					{emptyDescription && (
						<p className="text-xs text-slate-400 max-w-xs mt-1">
							{emptyDescription}
						</p>
					)}
					{emptyAction && <div className="mt-2">{emptyAction}</div>}
				</CardContent>
			</Card>
		);
	}

	return (
		<div className={cn("space-y-3", className)}>
			{loans.map((loan) => (
				<LoanCard key={loan.id} loan={loan} onReturnClick={onReturnClick} />
			))}
		</div>
	);
}
