import {
	AlertTriangle,
	ArrowDownLeft,
	ArrowLeft,
	ArrowUpRight,
	Check,
	Copy,
	History,
	Info,
	MapPin,
	Package,
	Plus,
	RotateCcw,
	Tag,
	Wrench,
} from "lucide-react";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { cn, resolveMediaUrl } from "@/lib/utils";
import type { ItemDetailSheetProps, TransactionAction } from "../types";
import { ItemLedgerHistory } from "./ItemLedgerHistory";
import { TransactionForm } from "./TransactionForm";

export function ItemDetailSheet({
	item,
	open,
	onOpenChange,
	onActionSelect,
	onTransactSubmit,
	enableInternalForm = false,
	isSubmitting = false,
	className,
}: ItemDetailSheetProps) {
	const [imgFailed, setImgFailed] = React.useState(false);
	const [copiedSku, setCopiedSku] = React.useState(false);
	const [activeAction, setActiveAction] =
		React.useState<TransactionAction | null>(null);
	const [activeTab, setActiveTab] = React.useState<"detail" | "history">(
		"detail",
	);

	const itemId = item?.id;

	// Reset error gambar, form aksi, dan tab saat item berubah
	React.useEffect(() => {
		if (itemId) {
			setImgFailed(false);
			setCopiedSku(false);
			setActiveAction(null);
			setActiveTab("detail");
		}
	}, [itemId]);

	// Reset aksi form dan tab saat sheet ditutup
	React.useEffect(() => {
		if (!open) {
			setActiveAction(null);
			setActiveTab("detail");
		}
	}, [open]);

	if (!item) return null;

	const isConsumable = item.type === "consumable";
	const isAsset = item.type === "asset";
	const rawImageUrl = item.image_url || item.image_thumb_url;
	const resolvedImg = resolveMediaUrl(rawImageUrl);
	const borrowedCount = item.borrowed_quantity || 0;
	const isOutOfStock = item.current_stock <= 0;

	const handleCopySku = async () => {
		try {
			if (navigator.clipboard) {
				await navigator.clipboard.writeText(item.sku);
				setCopiedSku(true);
				setTimeout(() => setCopiedSku(false), 2000);
			}
		} catch {
			// Fallback silent fail
		}
	};

	const handleAction = (action: TransactionAction) => {
		if (enableInternalForm) {
			setActiveAction(action);
		}
		onActionSelect?.(item, action);
	};

	// Logika badge status stok (selaras dengan Keputusan D8 & ItemCard)
	const renderStockBadge = () => {
		if (isConsumable) {
			if (item.current_stock === 0) {
				return (
					<Badge variant="critical" className="font-semibold text-xs">
						Habis (0 {item.unit})
					</Badge>
				);
			}
			if (item.current_stock <= item.minimum_stock) {
				return (
					<Badge variant="warning" className="font-semibold text-xs">
						Sisa {item.current_stock} {item.unit} (Menipis)
					</Badge>
				);
			}
			return (
				<Badge variant="ok" className="font-semibold text-xs">
					Tersedia: {item.current_stock} {item.unit}
				</Badge>
			);
		}

		// Aset (Keputusan D8: Tersedia X · Dipinjam Y tanpa nama peminjam)
		if (item.current_stock > 0) {
			return (
				<Badge variant="ok" className="font-semibold text-xs">
					Tersedia {item.current_stock} · Dipinjam {borrowedCount} {item.unit}
				</Badge>
			);
		}
		if (borrowedCount > 0) {
			return (
				<Badge variant="warning" className="font-semibold text-xs">
					Semua Dipinjam ({borrowedCount} {item.unit})
				</Badge>
			);
		}
		return (
			<Badge variant="critical" className="font-semibold text-xs">
				Aset Tidak Tersedia
			</Badge>
		);
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				onClose={() => onOpenChange(false)}
				data-testid="item-detail-sheet"
				className={cn("sm:max-w-lg p-5 pb-8", className)}
			>
				{activeAction ? (
					<div className="flex flex-col gap-3">
						<button
							type="button"
							onClick={() => setActiveAction(null)}
							data-testid="back-to-detail-btn"
							className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#004785] hover:underline w-fit self-start mb-1 touch-target"
						>
							<ArrowLeft className="h-3.5 w-3.5" />
							<span>Kembali ke Detail Barang</span>
						</button>

						<TransactionForm
							item={item}
							action={activeAction}
							onCancel={() => setActiveAction(null)}
							isSubmitting={isSubmitting}
							onSubmit={async (data) => {
								if (onTransactSubmit) {
									await onTransactSubmit(item, activeAction, data);
								}
								onOpenChange(false);
							}}
						/>
					</div>
				) : (
					<>
						<DialogHeader className="text-left mb-3">
							<div className="flex items-center gap-2 mb-1.5 flex-wrap">
								<span
									className={cn(
										"inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase",
										isConsumable
											? "bg-blue-50 text-blue-700"
											: "bg-purple-50 text-purple-700",
									)}
								>
									{isConsumable ? (
										<Package className="h-3 w-3" />
									) : (
										<Wrench className="h-3 w-3" />
									)}
									<span>{isConsumable ? "Habis Pakai" : "Aset"}</span>
								</span>

								{item.location?.code && (
									<span className="inline-flex items-center gap-1 text-[11px] text-slate-500 bg-slate-100 rounded-md px-2 py-0.5 font-mono">
										<Tag className="h-3 w-3" />
										<span>{item.location.code}</span>
									</span>
								)}
							</div>

							<DialogTitle className="text-lg font-bold text-slate-900 leading-snug">
								{item.name}
							</DialogTitle>

							<DialogDescription className="sr-only">
								Detail informasi barang inventaris dan aksi transaksi:{" "}
								{item.name}
							</DialogDescription>
						</DialogHeader>

						<div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 mb-4 text-xs font-semibold">
							<button
								type="button"
								data-testid="tab-detail-btn"
								onClick={() => setActiveTab("detail")}
								className={cn(
									"flex items-center justify-center gap-1.5 rounded-lg py-1.5 transition-all touch-target",
									activeTab === "detail"
										? "bg-white text-slate-900 shadow-2xs font-bold"
										: "text-slate-600 hover:text-slate-900",
								)}
							>
								<Package className="h-3.5 w-3.5" />
								<span>Detail Barang</span>
							</button>
							<button
								type="button"
								data-testid="tab-history-btn"
								onClick={() => setActiveTab("history")}
								className={cn(
									"flex items-center justify-center gap-1.5 rounded-lg py-1.5 transition-all touch-target",
									activeTab === "history"
										? "bg-white text-slate-900 shadow-2xs font-bold"
										: "text-slate-600 hover:text-slate-900",
								)}
							>
								<History className="h-3.5 w-3.5" />
								<span>Riwayat Transaksi</span>
							</button>
						</div>

						{activeTab === "history" ? (
							<div className="mb-4">
								<ItemLedgerHistory itemId={item.id} itemUnit={item.unit} />
							</div>
						) : (
							<>
								<div className="relative mb-4 h-44 w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 flex items-center justify-center">
									{resolvedImg && !imgFailed ? (
										<img
											src={resolvedImg}
											alt={item.name}
											onError={() => setImgFailed(true)}
											className="h-full w-full object-cover"
											loading="lazy"
										/>
									) : (
										<div className="flex flex-col items-center justify-center gap-2 text-slate-400">
											{isConsumable ? (
												<Package className="h-12 w-12 stroke-[1.25]" />
											) : (
												<Wrench className="h-12 w-12 stroke-[1.25]" />
											)}
											<span className="text-xs font-medium">
												Tidak ada foto barang
											</span>
										</div>
									)}

									<div className="absolute bottom-3 left-3 shadow-md">
										{renderStockBadge()}
									</div>
								</div>

								<div className="grid grid-cols-2 gap-2.5 mb-4">
									<div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
										<div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider mb-1">
											Nomor SKU
										</div>
										<div className="flex items-center justify-between gap-1.5">
											<span className="font-mono text-xs font-bold text-slate-800 truncate">
												{item.sku}
											</span>
											<button
												type="button"
												onClick={handleCopySku}
												aria-label="Salin SKU"
												className="p-1 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-200/80 active:scale-95 transition-all shrink-0"
											>
												{copiedSku ? (
													<Check className="h-3.5 w-3.5 text-emerald-600" />
												) : (
													<Copy className="h-3.5 w-3.5" />
												)}
											</button>
										</div>
									</div>

									<div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
										<div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider mb-1">
											Lokasi Rak
										</div>
										<div className="flex items-center gap-1.5 text-xs text-slate-800">
											<MapPin className="h-3.5 w-3.5 text-[#004785] shrink-0" />
											<span className="font-semibold truncate">
												{item.location?.name || "Belum ditentukan"}
											</span>
										</div>
									</div>
								</div>

								<div className="rounded-xl border border-slate-200 p-3.5 mb-4 bg-white">
									<div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-2.5">
										Informasi Ketersediaan
									</div>

									{isConsumable ? (
										<div className="grid grid-cols-2 gap-3 text-center">
											<div className="rounded-lg bg-slate-50 p-2.5 border border-slate-100">
												<div className="text-[11px] text-slate-500 mb-0.5">
													Stok Saat Ini
												</div>
												<div className="text-xl font-bold text-slate-900">
													{item.current_stock}{" "}
													<span className="text-xs font-normal text-slate-500">
														{item.unit}
													</span>
												</div>
											</div>
											<div className="rounded-lg bg-slate-50 p-2.5 border border-slate-100">
												<div className="text-[11px] text-slate-500 mb-0.5">
													Stok Minimum
												</div>
												<div className="text-xl font-bold text-slate-600">
													{item.minimum_stock}{" "}
													<span className="text-xs font-normal text-slate-500">
														{item.unit}
													</span>
												</div>
											</div>
										</div>
									) : isAsset ? (
										<div className="grid grid-cols-2 gap-3 text-center">
											<div className="rounded-lg bg-emerald-50/70 p-2.5 border border-emerald-100">
												<div className="text-[11px] text-emerald-800 mb-0.5 font-medium">
													Aset Tersedia
												</div>
												<div className="text-xl font-bold text-emerald-700">
													{item.current_stock}{" "}
													<span className="text-xs font-normal text-emerald-600">
														{item.unit}
													</span>
												</div>
											</div>
											<div className="rounded-lg bg-blue-50/70 p-2.5 border border-blue-100">
												<div className="text-[11px] text-blue-800 mb-0.5 font-medium">
													Sedang Dipinjam
												</div>
												<div className="text-xl font-bold text-blue-700">
													{borrowedCount}{" "}
													<span className="text-xs font-normal text-blue-600">
														{item.unit}
													</span>
												</div>
											</div>
										</div>
									) : null}

									{isConsumable && item.current_stock <= item.minimum_stock && (
										<div className="mt-3 flex items-center gap-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-800 border border-amber-200/80">
											<AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
											<span>
												Stok telah mencapai atau di bawah batas minimum (
												{item.minimum_stock} {item.unit}). Segera lakukan
												restock.
											</span>
										</div>
									)}
								</div>

								{item.description && (
									<div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3.5 mb-4 text-xs">
										<div className="flex items-center gap-1.5 font-bold text-slate-700 mb-1">
											<Info className="h-3.5 w-3.5 text-slate-500" />
											<span>Deskripsi & Spesifikasi</span>
										</div>
										<p className="text-slate-600 leading-relaxed">
											{item.description}
										</p>
									</div>
								)}
							</>
						)}

						<div className="pt-2 border-t border-slate-200">
							<div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
								Pilih Aksi Transaksi
							</div>

							{isConsumable ? (
								<div className="grid grid-cols-2 gap-2.5">
									<button
										type="button"
										data-testid="action-take-btn"
										disabled={isOutOfStock}
										onClick={() => handleAction("take")}
										className="flex items-center justify-center gap-2 rounded-xl bg-[#004785] px-4 py-3 text-xs font-bold text-white shadow-xs hover:bg-[#00386b] active:scale-98 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100 touch-target"
									>
										<ArrowUpRight className="h-4 w-4" />
										<span>Ambil Barang</span>
									</button>

									<button
										type="button"
										data-testid="action-add-btn"
										onClick={() => handleAction("add")}
										className="flex items-center justify-center gap-2 rounded-xl border border-emerald-600/40 bg-emerald-50 px-4 py-3 text-xs font-bold text-emerald-800 shadow-2xs hover:bg-emerald-100 active:scale-98 transition-all touch-target"
									>
										<Plus className="h-4 w-4 text-emerald-700" />
										<span>Tambah Stok</span>
									</button>
								</div>
							) : isAsset ? (
								<div className="grid grid-cols-2 gap-2.5">
									<button
										type="button"
										data-testid="action-borrow-btn"
										disabled={isOutOfStock}
										onClick={() => handleAction("borrow")}
										className="flex items-center justify-center gap-2 rounded-xl bg-[#004785] px-4 py-3 text-xs font-bold text-white shadow-xs hover:bg-[#00386b] active:scale-98 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100 touch-target"
									>
										<ArrowDownLeft className="h-4 w-4" />
										<span>Pinjam Aset</span>
									</button>

									<button
										type="button"
										data-testid="action-return-btn"
										onClick={() => handleAction("return")}
										className="flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-xs font-bold text-slate-800 shadow-2xs hover:bg-slate-50 active:scale-98 transition-all touch-target"
									>
										<RotateCcw className="h-4 w-4 text-slate-600" />
										<span>Kembalikan</span>
									</button>
								</div>
							) : null}
						</div>
					</>
				)}
			</DialogContent>
		</Dialog>
	);
}
