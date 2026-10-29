import {
	Activity,
	ArrowDownLeft,
	ArrowRight,
	ArrowUpRight,
	Clock,
	RotateCcw,
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
import type { OutboxOperation, OutboxStatus } from "@/lib/db";
import { cn } from "@/lib/utils";
import type { RecentActivityItem } from "../types";

export interface RecentActivityFeedProps {
	activities: RecentActivityItem[];
	isLoading?: boolean;
	onViewAllClick?: () => void;
	maxItems?: number;
	className?: string;
}

function getOperationVisuals(operation: OutboxOperation) {
	switch (operation) {
		case "take":
			return {
				icon: ArrowUpRight,
				iconColor: "text-amber-600 bg-amber-50",
				badgeText: "Ambil",
			};
		case "add":
			return {
				icon: ArrowDownLeft,
				iconColor: "text-emerald-600 bg-emerald-50",
				badgeText: "Restok",
			};
		case "borrow":
			return {
				icon: Clock,
				iconColor: "text-blue-600 bg-blue-50",
				badgeText: "Pinjam",
			};
		case "return":
			return {
				icon: RotateCcw,
				iconColor: "text-teal-600 bg-teal-50",
				badgeText: "Kembali",
			};
		default:
			return {
				icon: Activity,
				iconColor: "text-slate-600 bg-slate-50",
				badgeText: "Mutasi",
			};
	}
}

function getStatusBadge(status: OutboxStatus) {
	switch (status) {
		case "synced":
			return (
				<Badge variant="ok" className="text-[10px] px-1.5 py-0 font-normal">
					Tersinkron
				</Badge>
			);
		case "pending":
			return (
				<Badge
					variant="warning"
					className="text-[10px] px-1.5 py-0 font-normal"
				>
					Menunggu
				</Badge>
			);
		case "syncing":
			return (
				<Badge variant="info" className="text-[10px] px-1.5 py-0 font-normal">
					Sinkron...
				</Badge>
			);
		case "rejected":
			return (
				<Badge
					variant="critical"
					className="text-[10px] px-1.5 py-0 font-normal"
				>
					Ditolak
				</Badge>
			);
		case "failed":
			return (
				<Badge
					variant="destructive"
					className="text-[10px] px-1.5 py-0 font-normal"
				>
					Gagal
				</Badge>
			);
		default:
			return (
				<Badge variant="outline" className="text-[10px] px-1.5 py-0">
					{status}
				</Badge>
			);
	}
}

/**
 * Feed Aktivitas Transaksi Terbaru (Task P6.2):
 * - Menampilkan daftar riwayat mutasi transaksi terkini pada perangkat ini.
 * - Bersumber dari antrean IndexedDB outbox terintegrasi (offline maupun online).
 * - Menampilkan status sinkronisasi, kuantitas mutasi, dan waktu relatif.
 */
export function RecentActivityFeed({
	activities,
	isLoading = false,
	onViewAllClick,
	maxItems = 5,
	className,
}: RecentActivityFeedProps) {
	if (isLoading) {
		return (
			<Card
				className={cn("border-slate-200/90 bg-white shadow-2xs", className)}
			>
				<CardHeader className="p-4 pb-2">
					<div className="flex items-center justify-between">
						<Skeleton className="h-5 w-48 rounded-md" />
						<Skeleton className="h-5 w-16 rounded-full" />
					</div>
					<Skeleton className="h-3 w-56 rounded-sm mt-1" />
				</CardHeader>
				<CardContent className="p-4 pt-2 flex flex-col gap-2.5">
					{Array.from({ length: 3 }).map((_, idx) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: Static array for skeleton placeholders
						<div key={idx} className="flex items-center gap-3 p-3">
							<Skeleton className="h-9 w-9 rounded-xl" />
							<div className="flex-1">
								<Skeleton className="h-4 w-3/4 rounded-md mb-1.5" />
								<Skeleton className="h-3 w-1/2 rounded-sm" />
							</div>
						</div>
					))}
				</CardContent>
			</Card>
		);
	}

	const displayActivities = activities.slice(0, maxItems);

	return (
		<Card
			className={cn(
				"border-slate-200/90 bg-white shadow-2xs transition-shadow duration-200",
				className,
			)}
			aria-label="Aktivitas Transaksi Terbaru"
		>
			<CardHeader className="p-4 pb-2.5 sm:p-5 sm:pb-3">
				<div className="flex items-center justify-between gap-2">
					<div className="flex items-center gap-2">
						<div className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
							<Activity className="h-4 w-4" />
						</div>
						<div>
							<CardTitle className="text-sm sm:text-base font-bold text-slate-900">
								Aktivitas Terakhir
							</CardTitle>
							<CardDescription className="text-[11px] text-slate-500">
								Transaksi offline & mutasi sinkron perangkat ini
							</CardDescription>
						</div>
					</div>

					{displayActivities.length > 0 && (
						<Badge variant="outline" className="text-[10px] px-2 py-0.5">
							{activities.length} Transaksi
						</Badge>
					)}
				</div>
			</CardHeader>

			<CardContent className="p-4 pt-0 sm:p-5 sm:pt-0">
				{displayActivities.length === 0 ? (
					/* Empty State */
					<div className="flex flex-col items-center justify-center p-6 text-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50">
						<div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-400 mb-1.5">
							<Clock className="h-4 w-4" />
						</div>
						<h4 className="text-xs font-bold text-slate-800">
							Belum Ada Transaksi Terbaru
						</h4>
						<p className="text-[11px] text-slate-500 mt-0.5 max-w-xs">
							Mutasi pengambilan, restok, atau peminjaman barang yang Anda
							lakukan akan muncul di sini.
						</p>
					</div>
				) : (
					<div className="flex flex-col divide-y divide-slate-100">
						{displayActivities.map((act) => {
							const visual = getOperationVisuals(act.operation);
							const IconComponent = visual.icon;

							return (
								<div
									key={act.id}
									className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
								>
									<div className="flex items-center gap-3 min-w-0 flex-1">
										<div
											className={cn(
												"flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
												visual.iconColor,
											)}
										>
											<IconComponent className="h-4 w-4" />
										</div>

										<div className="min-w-0 flex-1">
											<div className="flex items-center gap-1.5 truncate">
												<span className="text-xs font-bold text-slate-900 truncate">
													{act.itemName}
												</span>
												<span className="font-mono text-[10px] text-slate-400">
													({act.itemSku})
												</span>
											</div>

											<div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-500">
												<span className="font-medium text-slate-700">
													{act.operationLabel}:{" "}
													<strong>
														{act.quantity} {act.itemUnit}
													</strong>
												</span>
												<span className="text-slate-300">•</span>
												<span className="text-[10px] text-slate-400">
													{act.relativeTime}
												</span>
											</div>
										</div>
									</div>

									<div className="shrink-0 flex flex-col items-end gap-1">
										{getStatusBadge(act.status)}
									</div>
								</div>
							);
						})}

						<div className="pt-2">
							{onViewAllClick ? (
								<Button
									variant="ghost"
									size="sm"
									onClick={onViewAllClick}
									className="w-full justify-center text-xs font-semibold text-[#004785] hover:bg-blue-50/80 hover:text-[#00386b]"
								>
									Lihat Antrean Outbox Lengkap
									<ArrowRight className="h-3.5 w-3.5 ml-1.5" />
								</Button>
							) : (
								<Link
									to="/outbox"
									className="flex w-full items-center justify-center py-2 text-xs font-semibold text-[#004785] transition-colors hover:text-[#00386b]"
								>
									Lihat Antrean Outbox Lengkap
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
