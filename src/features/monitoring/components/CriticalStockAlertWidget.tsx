import {
	AlertCircle,
	ArrowRight,
	CheckCircle2,
	Clock,
	MapPin,
	Sparkles,
} from "lucide-react";
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
import type { Item } from "@/types/api";
import type { ItemStockHealth, StockHealthCategory } from "../types";

export interface CriticalStockAlertWidgetProps {
	urgentItems: ItemStockHealth[];
	totalAttentionCount: number;
	isLoading?: boolean;
	onViewAllClick?: () => void;
	onItemClick?: (item: Item) => void;
	maxItems?: number;
	className?: string;
}

function getStatusBadge(status: StockHealthCategory) {
	switch (status) {
		case "out_of_stock":
			return (
				<Badge
					variant="destructive"
					className="text-[10px] font-bold tracking-wider px-2 py-0.5"
				>
					HABIS
				</Badge>
			);
		case "critical":
			return (
				<Badge
					variant="critical"
					className="text-[10px] font-bold tracking-wider px-2 py-0.5"
				>
					KRITIS
				</Badge>
			);
		case "low":
			return (
				<Badge
					variant="warning"
					className="text-[10px] font-bold tracking-wider px-2 py-0.5"
				>
					MENIPIS
				</Badge>
			);
		default:
			return (
				<Badge variant="ok" className="text-[10px] px-2 py-0.5">
					AMAN
				</Badge>
			);
	}
}

/**
 * Widget Peringatan Stok Kritis & Menipis (Task P6.1):
 * - Menampilkan daftar barang paling mendesak yang stoknya menipis, kritis, atau habis.
 * - Berfungsi 100% offline dengan data terproyeksi dari IndexedDB lokal.
 * - Menyertakan indikator lokasi rak fisik dan badge perkiraan lokal jika ada transaksi outbox.
 * - Memiliki tautan cepat untuk menyaring katalog ke 'low_or_empty'.
 */
export function CriticalStockAlertWidget({
	urgentItems,
	totalAttentionCount,
	isLoading = false,
	onViewAllClick,
	onItemClick,
	maxItems = 5,
	className,
}: CriticalStockAlertWidgetProps) {
	if (isLoading) {
		return (
			<Card
				className={cn("border-slate-200/90 bg-white shadow-2xs", className)}
			>
				<CardHeader className="p-4 pb-2">
					<div className="flex items-center justify-between">
						<Skeleton className="h-5 w-48 rounded-md" />
						<Skeleton className="h-5 w-20 rounded-full" />
					</div>
					<Skeleton className="h-3 w-64 rounded-sm mt-1" />
				</CardHeader>
				<CardContent className="p-4 pt-2 flex flex-col gap-2.5">
					{Array.from({ length: 3 }).map((_, idx) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: Static array for skeleton items
						<div key={idx} className="p-3 rounded-xl border border-slate-100">
							<Skeleton className="h-4 w-3/4 rounded-md mb-2" />
							<div className="flex justify-between items-center">
								<Skeleton className="h-3 w-32 rounded-sm" />
								<Skeleton className="h-4 w-16 rounded-full" />
							</div>
						</div>
					))}
				</CardContent>
			</Card>
		);
	}

	const displayItems = urgentItems.slice(0, maxItems);

	return (
		<Card
			className={cn(
				"border-slate-200/90 bg-white shadow-2xs transition-shadow duration-200",
				totalAttentionCount > 0 && "border-red-200/80",
				className,
			)}
			aria-label="Peringatan Stok Kritis dan Menipis"
		>
			<CardHeader className="p-4 pb-2.5 sm:p-5 sm:pb-3">
				<div className="flex items-center justify-between gap-2">
					<div className="flex items-center gap-2">
						<div
							className={cn(
								"flex h-8 w-8 items-center justify-center rounded-xl",
								totalAttentionCount > 0
									? "bg-red-50 text-red-600"
									: "bg-emerald-50 text-emerald-600",
							)}
						>
							{totalAttentionCount > 0 ? (
								<AlertCircle className="h-4 w-4" />
							) : (
								<CheckCircle2 className="h-4 w-4" />
							)}
						</div>
						<div>
							<CardTitle className="text-sm sm:text-base font-bold text-slate-900">
								Peringatan Stok Kritis
							</CardTitle>
							<CardDescription className="text-[11px] text-slate-500">
								{totalAttentionCount > 0
									? `${totalAttentionCount} barang memerlukan restock atau atensi audit`
									: "Kondisi persediaan barang gudang prima"}
							</CardDescription>
						</div>
					</div>

					{totalAttentionCount > 0 ? (
						<Badge variant="critical" className="text-[10px] px-2 py-0.5">
							{totalAttentionCount} Perlu Atensi
						</Badge>
					) : (
						<Badge variant="ok" className="text-[10px] px-2 py-0.5">
							Semua Aman
						</Badge>
					)}
				</div>
			</CardHeader>

			<CardContent className="p-4 pt-0 sm:p-5 sm:pt-0">
				{displayItems.length === 0 ? (
					/* Positive Empty State */
					<div className="flex flex-col items-center justify-center p-6 text-center rounded-xl border border-emerald-100 bg-emerald-50/30">
						<div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 mb-2">
							<Sparkles className="h-5 w-5" />
						</div>
						<h4 className="text-xs font-bold text-emerald-900">
							Seluruh Stok Dalam Kondisi Aman
						</h4>
						<p className="text-[11px] text-emerald-700/80 mt-1 max-w-xs">
							Tidak ada barang inventaris yang berada di bawah kuota minimum.
							Operasional gudang berjalan optimal.
						</p>
					</div>
				) : (
					<div className="flex flex-col gap-2">
						{displayItems.map((health) => {
							const item = health.item;
							const locationName =
								health.location?.name ||
								(item.location ? item.location.name : null) ||
								"Lokasi Belum Ditentukan";

							const cardContent = (
								<>
									<div className="min-w-0 flex-1">
										<div className="flex items-center gap-1.5 flex-wrap">
											<span className="text-xs font-bold text-slate-900 truncate">
												{item.name}
											</span>
											<span className="font-mono text-[10px] text-slate-500 font-semibold">
												({item.sku})
											</span>
											{health.isEstimated && (
												<span
													className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.2 text-[9px] font-medium bg-blue-50 text-blue-700 border border-blue-200/80"
													title="Diperbarui oleh transaksi offline lokal"
												>
													<Clock className="h-2.5 w-2.5" />
													Perkiraan Lokal
												</span>
											)}
										</div>

										<div className="flex items-center gap-3 mt-1 text-[11px] text-slate-500">
											<span className="flex items-center gap-1 truncate max-w-[160px]">
												<MapPin className="h-3 w-3 shrink-0 text-slate-400" />
												<span className="truncate">{locationName}</span>
											</span>

											<span className="font-medium">
												Sisa:{" "}
												<strong
													className={cn(
														health.effectiveStock <= 0
															? "text-red-700 font-bold"
															: "text-slate-800 font-bold",
													)}
												>
													{health.effectiveStock} {item.unit}
												</strong>{" "}
												<span className="text-slate-400">
													(Min: {health.minimumStock})
												</span>
											</span>
										</div>
									</div>

									<div className="shrink-0 flex flex-col items-end gap-1">
										{getStatusBadge(health.status)}
										{health.deficit > 0 && (
											<span className="text-[10px] font-medium text-red-600/90">
												- {health.deficit} {item.unit}
											</span>
										)}
									</div>
								</>
							);

							const baseStyles = cn(
								"flex items-center justify-between gap-3 p-3 rounded-xl border transition-all text-left w-full",
								health.status === "out_of_stock" &&
									"border-red-200 bg-red-50/20 hover:bg-red-50/40",
								health.status === "critical" &&
									"border-red-100 bg-red-50/10 hover:bg-red-50/25",
								health.status === "low" &&
									"border-amber-100 bg-amber-50/15 hover:bg-amber-50/30",
							);

							if (onItemClick) {
								return (
									<button
										key={item.id}
										type="button"
										onClick={() => onItemClick(item)}
										className={cn(
											baseStyles,
											"cursor-pointer active:scale-[0.99]",
										)}
									>
										{cardContent}
									</button>
								);
							}

							return (
								<div key={item.id} className={baseStyles}>
									{cardContent}
								</div>
							);
						})}

						{onViewAllClick && (
							<Button
								variant="ghost"
								size="sm"
								onClick={onViewAllClick}
								className="mt-1 w-full justify-center text-xs font-semibold text-[#004785] hover:bg-blue-50/80 hover:text-[#00386b]"
							>
								Lihat Semua Barang Menipis di Katalog
								<ArrowRight className="h-3.5 w-3.5 ml-1.5" />
							</Button>
						)}
					</div>
				)}
			</CardContent>
		</Card>
	);
}
