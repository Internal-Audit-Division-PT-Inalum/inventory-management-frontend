import { ChevronRight, MapPin, Package, Wrench } from "lucide-react";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { cn, resolveMediaUrl } from "@/lib/utils";
import type { Item } from "@/types/api";

export interface ItemCardProps {
	item: Item;
	onSelect?: (item: Item) => void;
	className?: string;
}

export function ItemCard({ item, onSelect, className }: ItemCardProps) {
	const [imgFailed, setImgFailed] = React.useState(false);

	const rawImageUrl = item.image_thumb_url || item.image_url;
	const resolvedImg = resolveMediaUrl(rawImageUrl);

	const handleClick = () => {
		onSelect?.(item);
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
		if (e.key === "Enter" || e.key === " ") {
			e.preventDefault();
			onSelect?.(item);
		}
	};

	// Logika badge stok adaptif berdasarkan tipe barang dan ketersediaan
	const renderStockBadge = () => {
		if (item.type === "consumable") {
			if (item.current_stock === 0) {
				return (
					<Badge variant="critical" className="font-medium text-xs">
						Habis (0 {item.unit})
					</Badge>
				);
			}
			if (item.current_stock <= item.minimum_stock) {
				return (
					<Badge variant="warning" className="font-medium text-xs">
						Sisa {item.current_stock} {item.unit} (Menipis)
					</Badge>
				);
			}
			return (
				<Badge variant="ok" className="font-medium text-xs">
					Tersedia: {item.current_stock} {item.unit}
				</Badge>
			);
		}

		// Logika tipe Aset (Keputusan D8: Tersedia X · Dipinjam Y)
		const borrowed = item.borrowed_quantity || 0;
		if (item.current_stock > 0) {
			return (
				<Badge variant="ok" className="font-medium text-xs">
					Tersedia {item.current_stock} · Dipinjam {borrowed} {item.unit}
				</Badge>
			);
		}
		if (borrowed > 0) {
			return (
				<Badge variant="warning" className="font-medium text-xs">
					Semua Dipinjam ({borrowed} {item.unit})
				</Badge>
			);
		}
		return (
			<Badge variant="critical" className="font-medium text-xs">
				Stok Kosong (0 {item.unit})
			</Badge>
		);
	};

	return (
		<button
			type="button"
			onClick={handleClick}
			onKeyDown={handleKeyDown}
			aria-label={`Pilih ${item.name}, SKU ${item.sku}`}
			className={cn(
				"w-full group relative flex items-center gap-3.5 p-3.5 bg-white rounded-xl border border-slate-200/80 shadow-2xs hover:shadow-md hover:border-slate-300 active:scale-[0.99] transition-all cursor-pointer text-left focus:outline-none focus:ring-2 focus:ring-[#004785]/20 focus:border-[#004785]",
				className,
			)}
		>
			<div className="w-20 h-20 rounded-lg bg-slate-100 border border-slate-200/60 overflow-hidden shrink-0 flex items-center justify-center relative">
				{resolvedImg && !imgFailed ? (
					<img
						src={resolvedImg}
						alt={item.name}
						loading="lazy"
						className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
						onError={() => setImgFailed(true)}
					/>
				) : (
					<div className="flex flex-col items-center justify-center text-slate-400">
						{item.type === "consumable" ? (
							<Package className="w-8 h-8 stroke-[1.5]" />
						) : (
							<Wrench className="w-8 h-8 stroke-[1.5]" />
						)}
					</div>
				)}
			</div>

			<div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
				<div>
					<div className="flex items-center gap-1.5 flex-wrap">
						<span
							className={cn(
								"text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider",
								item.type === "consumable"
									? "bg-slate-100 text-slate-600 border border-slate-200/60"
									: "bg-blue-50 text-blue-700 border border-blue-200/60",
							)}
						>
							{item.type === "consumable" ? "Habis Pakai" : "Peralatan"}
						</span>
						<span className="text-[11px] font-mono text-slate-400 font-medium tracking-wide">
							{item.sku}
						</span>
					</div>

					<h3 className="font-semibold text-slate-900 text-sm leading-snug line-clamp-2 mt-1 group-hover:text-[#004785] transition-colors">
						{item.name}
					</h3>
				</div>

				<div className="mt-2 flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
					<div className="flex items-center gap-1 text-xs text-slate-500">
						<MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
						<span className="truncate max-w-[160px] sm:max-w-[200px]">
							{item.location
								? `${item.location.code} • ${item.location.name}`
								: "Lokasi belum ditentukan"}
						</span>
					</div>

					<div className="shrink-0">{renderStockBadge()}</div>
				</div>
			</div>

			<div className="hidden xs:flex items-center justify-center pl-1 text-slate-300 group-hover:text-slate-500 transition-colors">
				<ChevronRight className="w-4 h-4 shrink-0" />
			</div>
		</button>
	);
}

export function ItemCardSkeleton() {
	return (
		<div className="flex items-center gap-3.5 p-3.5 bg-white rounded-xl border border-slate-200/80 shadow-2xs animate-pulse">
			<div className="w-20 h-20 rounded-lg bg-slate-200 shrink-0" />
			<div className="flex-1 min-w-0 space-y-2 py-1">
				<div className="flex items-center gap-2">
					<div className="w-16 h-4 bg-slate-200 rounded-full" />
					<div className="w-20 h-4 bg-slate-200 rounded" />
				</div>
				<div className="w-3/4 h-4 bg-slate-200 rounded" />
				<div className="flex items-center justify-between pt-1">
					<div className="w-28 h-3.5 bg-slate-200 rounded" />
					<div className="w-24 h-5 bg-slate-200 rounded-full" />
				</div>
			</div>
		</div>
	);
}
