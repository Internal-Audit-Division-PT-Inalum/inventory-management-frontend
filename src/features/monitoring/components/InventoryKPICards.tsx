import {
	AlertCircle,
	AlertTriangle,
	CheckCircle2,
	Package,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { StockMetricsSummary } from "../types";

export type KPICardFilterType = "all" | "healthy" | "low" | "critical_or_empty";

export interface InventoryKPICardsProps {
	metrics: StockMetricsSummary;
	isLoading?: boolean;
	onCardClick?: (filterType: KPICardFilterType) => void;
	className?: string;
}

/**
 * Kartu Ringkasan KPI Inventaris Gudang PT INALUM:
 * - Menampilkan 4 metrik esensial: Total Barang, Stok Aman (% Rasio), Stok Menipis, dan Kritis & Habis.
 * - Berfungsi 100% offline dari agregasi IndexedDB lokal.
 * - Memiliki state skeleton responsif dan mendukung interaksi klik untuk filter langsung ke katalog.
 */
export function InventoryKPICards({
	metrics,
	isLoading = false,
	onCardClick,
	className,
}: InventoryKPICardsProps) {
	if (isLoading) {
		return (
			<div
				role="status"
				className={cn(
					"grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4",
					className,
				)}
				aria-label="Memuat Metrik Inventaris"
			>
				{Array.from({ length: 4 }).map((_, idx) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: Static array for skeleton loading placeholders
					<Card key={idx} className="border-slate-200/80 bg-white shadow-2xs">
						<CardContent className="p-3.5 sm:p-4">
							<Skeleton className="h-4 w-16 mb-2 rounded-md" />
							<Skeleton className="h-7 w-12 mb-1.5 rounded-lg" />
							<Skeleton className="h-3 w-24 rounded-sm" />
						</CardContent>
					</Card>
				))}
			</div>
		);
	}

	const criticalAndOutOfStockCount =
		metrics.outOfStockCount + metrics.criticalCount;
	const isClickable = Boolean(onCardClick);

	return (
		<section
			aria-label="Ringkasan Metrik Inventaris"
			className={cn(
				"grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4",
				className,
			)}
		>
			{/* 1. Total Barang */}
			<Card
				role={isClickable ? "button" : undefined}
				tabIndex={isClickable ? 0 : undefined}
				onClick={() => onCardClick?.("all")}
				onKeyDown={(e) => {
					if (isClickable && (e.key === "Enter" || e.key === " ")) {
						e.preventDefault();
						onCardClick?.("all");
					}
				}}
				className={cn(
					"border-slate-200/90 bg-white shadow-2xs transition-all",
					isClickable &&
						"cursor-pointer hover:border-slate-300 hover:shadow-xs active:scale-[0.99]",
				)}
			>
				<CardContent className="flex flex-col justify-between p-3.5 sm:p-4">
					<div className="flex items-center justify-between gap-1 mb-2">
						<span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
							Total Barang
						</span>
						<div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-[#004785]">
							<Package className="h-3.5 w-3.5" />
						</div>
					</div>
					<div className="flex items-baseline gap-2">
						<span className="text-2xl font-black tracking-tight text-slate-900">
							{metrics.totalActiveItems}
						</span>
						<span className="text-[11px] font-medium text-slate-400">item</span>
					</div>
					<p className="mt-1.5 text-[11px] text-slate-500 truncate">
						{metrics.consumablesCount} Habis Pakai • {metrics.assetsCount} Aset
					</p>
				</CardContent>
			</Card>

			{/* 2. Stok Aman */}
			<Card
				role={isClickable ? "button" : undefined}
				tabIndex={isClickable ? 0 : undefined}
				onClick={() => onCardClick?.("healthy")}
				onKeyDown={(e) => {
					if (isClickable && (e.key === "Enter" || e.key === " ")) {
						e.preventDefault();
						onCardClick?.("healthy");
					}
				}}
				className={cn(
					"border-emerald-200/80 bg-emerald-50/20 shadow-2xs transition-all",
					isClickable &&
						"cursor-pointer hover:border-emerald-300 hover:shadow-xs active:scale-[0.99]",
				)}
			>
				<CardContent className="flex flex-col justify-between p-3.5 sm:p-4">
					<div className="flex items-center justify-between gap-1 mb-2">
						<span className="text-[11px] font-semibold text-emerald-800 uppercase tracking-wider">
							Stok Aman
						</span>
						<div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
							<CheckCircle2 className="h-3.5 w-3.5" />
						</div>
					</div>
					<div className="flex items-baseline justify-between gap-1">
						<span className="text-2xl font-black tracking-tight text-emerald-700">
							{metrics.healthyCount}
						</span>
						<Badge variant="ok" className="text-[10px] px-1.5 py-0">
							{metrics.healthRatioPercent}% Sehat
						</Badge>
					</div>
					<p className="mt-1.5 text-[11px] text-emerald-600/90 truncate">
						Di atas kuota minimum
					</p>
				</CardContent>
			</Card>

			{/* 3. Stok Menipis */}
			<Card
				role={isClickable ? "button" : undefined}
				tabIndex={isClickable ? 0 : undefined}
				onClick={() => onCardClick?.("low")}
				onKeyDown={(e) => {
					if (isClickable && (e.key === "Enter" || e.key === " ")) {
						e.preventDefault();
						onCardClick?.("low");
					}
				}}
				className={cn(
					"border-amber-200/80 bg-amber-50/20 shadow-2xs transition-all",
					isClickable &&
						"cursor-pointer hover:border-amber-300 hover:shadow-xs active:scale-[0.99]",
				)}
			>
				<CardContent className="flex flex-col justify-between p-3.5 sm:p-4">
					<div className="flex items-center justify-between gap-1 mb-2">
						<span className="text-[11px] font-semibold text-amber-800 uppercase tracking-wider">
							Stok Menipis
						</span>
						<div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
							<AlertTriangle className="h-3.5 w-3.5" />
						</div>
					</div>
					<div className="flex items-baseline justify-between gap-1">
						<span className="text-2xl font-black tracking-tight text-amber-700">
							{metrics.lowStockCount}
						</span>
						<Badge variant="warning" className="text-[10px] px-1.5 py-0">
							Perlu Order
						</Badge>
					</div>
					<p className="mt-1.5 text-[11px] text-amber-600/90 truncate">
						Mendekati titik restock
					</p>
				</CardContent>
			</Card>

			{/* 4. Kritis & Habis */}
			<Card
				role={isClickable ? "button" : undefined}
				tabIndex={isClickable ? 0 : undefined}
				onClick={() => onCardClick?.("critical_or_empty")}
				onKeyDown={(e) => {
					if (isClickable && (e.key === "Enter" || e.key === " ")) {
						e.preventDefault();
						onCardClick?.("critical_or_empty");
					}
				}}
				className={cn(
					"border-red-200/90 bg-red-50/25 shadow-2xs transition-all",
					criticalAndOutOfStockCount > 0 && "ring-1 ring-red-200/50",
					isClickable &&
						"cursor-pointer hover:border-red-300 hover:shadow-xs active:scale-[0.99]",
				)}
			>
				<CardContent className="flex flex-col justify-between p-3.5 sm:p-4">
					<div className="flex items-center justify-between gap-1 mb-2">
						<span className="text-[11px] font-semibold text-red-800 uppercase tracking-wider">
							Kritis & Habis
						</span>
						<div className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-100 text-red-700">
							<AlertCircle className="h-3.5 w-3.5" />
						</div>
					</div>
					<div className="flex items-baseline justify-between gap-1">
						<span className="text-2xl font-black tracking-tight text-red-700">
							{criticalAndOutOfStockCount}
						</span>
						{metrics.outOfStockCount > 0 ? (
							<Badge variant="critical" className="text-[10px] px-1.5 py-0">
								{metrics.outOfStockCount} Habis
							</Badge>
						) : (
							<Badge variant="critical" className="text-[10px] px-1.5 py-0">
								{metrics.criticalCount} Kritis
							</Badge>
						)}
					</div>
					<p className="mt-1.5 text-[11px] text-red-600/90 truncate font-medium">
						{criticalAndOutOfStockCount > 0
							? "Tindakan mendesak!"
							: "Kondisi terkendali"}
					</p>
				</CardContent>
			</Card>
		</section>
	);
}
