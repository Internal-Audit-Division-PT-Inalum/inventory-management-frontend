import {
	MapPin,
	PackageSearch,
	QrCode,
	RotateCcw,
	Search,
	X,
} from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";
import type { InventoryItemType, Item } from "@/types/api";
import {
	type UseCatalogItemsOptions,
	useCatalogItems,
} from "../hooks/useCatalogItems";
import { useCatalogLocations } from "../hooks/useCatalogLocations";
import { useQrLanding } from "../lib/qrLanding";
import { ItemCard, ItemCardSkeleton } from "./ItemCard";
import { SyncStatusBar } from "./SyncStatusBar";

export type CatalogTypeFilter = InventoryItemType | "all";
export type CatalogStockFilter = "all" | "low_or_empty" | "available";
export type CatalogSortOption =
	| "name"
	| "sku"
	| "stock_asc"
	| "stock_desc"
	| "updated_at";

export interface CatalogViewProps {
	className?: string;
	onItemClick?: (item: Item) => void;
}

/**
 * Tampilan Utama Katalog Barang Inventaris PT INALUM:
 * - Search bar instan (nama/SKU) < 100ms berbasis IndexedDB.
 * - Filter chip lokasi rak fisik secara horizontal scrollable.
 * - Filter tipe (Semua / Habis Pakai / Aset) & status stok (Semua / Tersedia / Menipis-Habis).
 * - Pengurutan cerdas (Nama A-Z, SKU, Stok Terendah, Stok Tertinggi).
 * - Deteksi QR landing fisik dengan auto-select lokasi rak & banner informasi.
 * - Indikator kesegaran data SyncStatusBar terintegrasi.
 */
export function CatalogView({ className, onItemClick }: CatalogViewProps) {
	const qr = useQrLanding();
	const { locations, locationMap } = useCatalogLocations();

	// State filter lokal
	const [searchQuery, setSearchQuery] = React.useState<string>("");
	const [selectedLocationId, setSelectedLocationId] = React.useState<
		string | undefined
	>(() => qr.locationId ?? undefined);
	const [typeFilter, setTypeFilter] = React.useState<CatalogTypeFilter>("all");
	const [stockFilter, setStockFilter] =
		React.useState<CatalogStockFilter>("all");
	const [sortBy, setSortBy] = React.useState<CatalogSortOption>("name");
	const [selectedItemToast, setSelectedItemToast] = React.useState<
		string | null
	>(null);

	// Sinkronkan lokasi jika QR landing parameter berubah
	React.useEffect(() => {
		if (qr.locationId) {
			setSelectedLocationId(qr.locationId);
		}
	}, [qr.locationId]);

	const queryOptions: UseCatalogItemsOptions = React.useMemo(
		() => ({
			searchTerm: searchQuery,
			locationId: selectedLocationId,
			type: typeFilter,
			stockStatus: stockFilter,
			sortBy,
		}),
		[searchQuery, selectedLocationId, typeFilter, stockFilter, sortBy],
	);

	// Hook query katalog reaktif dari Dexie
	const { items, stats, isLoading, refetch } = useCatalogItems(queryOptions);

	// Nama lokasi yang dipilih (jika ada)
	const selectedLocationName = React.useMemo(() => {
		if (!selectedLocationId) return null;
		return locationMap.get(selectedLocationId)?.name || selectedLocationId;
	}, [selectedLocationId, locationMap]);

	// Reset semua filter pencarian
	const handleResetFilters = () => {
		setSearchQuery("");
		setSelectedLocationId(undefined);
		setTypeFilter("all");
		setStockFilter("all");
		setSortBy("name");
	};

	const hasActiveFilters =
		searchQuery.trim().length > 0 ||
		Boolean(selectedLocationId) ||
		typeFilter !== "all" ||
		stockFilter !== "all";

	const handleItemSelect = (item: Item) => {
		if (onItemClick) {
			onItemClick(item);
		} else {
			setSelectedItemToast(`Memilih: ${item.name} (${item.sku})`);
			setTimeout(() => setSelectedItemToast(null), 3000);
		}
	};

	return (
		<div className={cn("flex flex-col gap-3.5", className)}>
			{/* Status Bar Kesegaran Data & Konektivitas */}
			<SyncStatusBar onSync={refetch} />

			{/* Banner Deteksi Landing dari QR Rak Fisik */}
			{qr.isQrLanding && selectedLocationId && (
				<div
					data-testid="qr-landing-banner"
					className="flex items-center justify-between gap-2.5 rounded-xl border border-blue-200 bg-blue-50/90 px-3.5 py-2 text-xs text-[#004785] shadow-xs"
				>
					<div className="flex items-center gap-2 min-w-0">
						<QrCode className="h-4 w-4 shrink-0 text-[#004785]" />
						<div className="truncate">
							<span className="font-semibold">Mode Pindai QR Rak:</span>{" "}
							<span className="font-medium">{selectedLocationName}</span>
						</div>
					</div>
					<button
						type="button"
						onClick={() => setSelectedLocationId(undefined)}
						className="rounded-md bg-white px-2 py-0.5 text-[11px] font-semibold text-[#004785] shadow-2xs hover:bg-blue-100 transition-colors shrink-0"
					>
						Tampilkan Semua
					</button>
				</div>
			)}

			{/* Toast Notifikasi Pemilihan Item (Stub Aksi Transaksi P3) */}
			{selectedItemToast && (
				<div
					role="status"
					className="rounded-xl border border-slate-200 bg-slate-900 px-3.5 py-2 text-xs text-white shadow-md animate-in fade-in slide-in-from-top-1"
				>
					{selectedItemToast}
					<span className="block text-[10px] text-slate-400 mt-0.5">
						Aksi Ambil/Pinjam barang akan aktif penuh pada Fase P3.
					</span>
				</div>
			)}

			{/* Search Bar Input */}
			<div className="relative w-full">
				<Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
				<input
					type="search"
					value={searchQuery}
					onChange={(e) => setSearchQuery(e.target.value)}
					placeholder="Cari nama barang atau SKU..."
					aria-label="Cari barang inventaris"
					data-testid="catalog-search-input"
					className={cn(
						"w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-10 text-xs text-slate-900 placeholder:text-slate-400 shadow-2xs transition-all",
						"focus:border-[#004785] focus:outline-none focus:ring-2 focus:ring-[#004785]/20",
					)}
				/>
				{searchQuery && (
					<button
						type="button"
						onClick={() => setSearchQuery("")}
						aria-label="Bersihkan pencarian"
						className="absolute right-3 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
					>
						<X className="h-3.5 w-3.5" />
					</button>
				)}
			</div>

			{/* Horizontal Location Filter Chips */}
			{locations.length > 0 && (
				<div className="flex flex-col gap-1.5">
					<div className="flex items-center justify-between px-0.5 text-[11px] font-semibold text-slate-600">
						<span className="flex items-center gap-1">
							<MapPin className="h-3 w-3 text-[#004785]" />
							<span>Lokasi Rak:</span>
						</span>
						{selectedLocationId && (
							<button
								type="button"
								onClick={() => setSelectedLocationId(undefined)}
								className="text-[10px] font-medium text-[#004785] hover:underline"
							>
								Reset Lokasi
							</button>
						)}
					</div>

					<div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
						<button
							type="button"
							onClick={() => setSelectedLocationId(undefined)}
							data-testid="location-chip-all"
							className={cn(
								"shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium transition-all select-none touch-target min-h-[32px]",
								!selectedLocationId
									? "bg-[#004785] text-white shadow-2xs font-semibold"
									: "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50",
							)}
						>
							Semua Lokasi ({stats.totalItems})
						</button>

						{locations.map((loc) => {
							const isSelected = selectedLocationId === loc.id;
							return (
								<button
									key={loc.id}
									type="button"
									onClick={() => setSelectedLocationId(loc.id)}
									data-testid={`location-chip-${loc.id}`}
									className={cn(
										"shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium transition-all select-none touch-target min-h-[32px] truncate max-w-[160px]",
										isSelected
											? "bg-[#004785] text-white shadow-2xs font-semibold"
											: "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50",
									)}
								>
									{loc.name}
								</button>
							);
						})}
					</div>
				</div>
			)}

			{/* Secondary Filters Bar: Type Tabs, Stock Status, and Sort Options */}
			<div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/70 pt-2.5 text-xs">
				{/* Type Toggle Tabs */}
				<div
					role="tablist"
					aria-label="Filter jenis barang"
					className="flex items-center rounded-lg bg-slate-200/70 p-0.5"
				>
					<button
						type="button"
						role="tab"
						aria-selected={typeFilter === "all"}
						onClick={() => setTypeFilter("all")}
						data-testid="type-tab-all"
						className={cn(
							"rounded-md px-2.5 py-1 text-[11px] font-medium transition-all select-none",
							typeFilter === "all"
								? "bg-white text-slate-900 shadow-2xs font-semibold"
								: "text-slate-600 hover:text-slate-900",
						)}
					>
						Semua
					</button>
					<button
						type="button"
						role="tab"
						aria-selected={typeFilter === "consumable"}
						onClick={() => setTypeFilter("consumable")}
						data-testid="type-tab-consumable"
						className={cn(
							"rounded-md px-2.5 py-1 text-[11px] font-medium transition-all select-none",
							typeFilter === "consumable"
								? "bg-white text-slate-900 shadow-2xs font-semibold"
								: "text-slate-600 hover:text-slate-900",
						)}
					>
						Habis Pakai ({stats.consumablesCount})
					</button>
					<button
						type="button"
						role="tab"
						aria-selected={typeFilter === "asset"}
						onClick={() => setTypeFilter("asset")}
						data-testid="type-tab-asset"
						className={cn(
							"rounded-md px-2.5 py-1 text-[11px] font-medium transition-all select-none",
							typeFilter === "asset"
								? "bg-white text-slate-900 shadow-2xs font-semibold"
								: "text-slate-600 hover:text-slate-900",
						)}
					>
						Aset ({stats.assetsCount})
					</button>
				</div>

				{/* Filter & Sort Controls */}
				<div className="flex items-center gap-1.5 ml-auto">
					{/* Status Stok Filter Dropdown */}
					<div className="relative">
						<select
							value={stockFilter}
							onChange={(e) =>
								setStockFilter(e.target.value as CatalogStockFilter)
							}
							aria-label="Filter status stok"
							data-testid="stock-filter-select"
							className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 shadow-2xs focus:border-[#004785] focus:outline-none"
						>
							<option value="all">Semua Stok</option>
							<option value="available">Tersedia</option>
							<option value="low_or_empty">
								Menipis / Habis ({stats.lowStockCount + stats.outOfStockCount})
							</option>
						</select>
					</div>

					{/* Sorting Dropdown */}
					<div className="relative">
						<select
							value={sortBy}
							onChange={(e) => setSortBy(e.target.value as CatalogSortOption)}
							aria-label="Urutan barang"
							data-testid="sort-by-select"
							className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 shadow-2xs focus:border-[#004785] focus:outline-none"
						>
							<option value="name">Nama (A-Z)</option>
							<option value="sku">SKU</option>
							<option value="stock_asc">Stok Terendah</option>
							<option value="stock_desc">Stok Tertinggi</option>
						</select>
					</div>
				</div>
			</div>

			{/* Item Results Count & Active Filter Reset */}
			<div className="flex items-center justify-between px-0.5 text-xs text-slate-500">
				<span>
					Menampilkan <strong className="text-slate-800">{items.length}</strong>{" "}
					barang
					{hasActiveFilters && (
						<span> (dari total {stats.totalItems} barang)</span>
					)}
				</span>

				{hasActiveFilters && (
					<button
						type="button"
						onClick={handleResetFilters}
						className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#004785] hover:underline"
					>
						<RotateCcw className="h-3 w-3" />
						<span>Reset Semua Filter</span>
					</button>
				)}
			</div>

			{/* Item List / Grid */}
			<div className="flex flex-col gap-2.5">
				{isLoading ? (
					Array.from({ length: 4 }).map((_, idx) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: Static array placeholder
						<ItemCardSkeleton key={idx} />
					))
				) : items.length === 0 ? (
					<div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center shadow-xs">
						<div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
							<PackageSearch className="h-6 w-6" />
						</div>
						<h3 className="text-sm font-bold text-slate-800">
							Tidak Ada Barang Ditemukan
						</h3>
						<p className="mt-1 max-w-xs text-xs text-slate-500">
							{hasActiveFilters
								? "Tidak ada barang yang cocok dengan kriteria pencarian atau filter yang diterapkan."
								: "Katalog lokal kosong. Tekan tombol 'Segarkan' di atas untuk mengunduh data katalog dari server."}
						</p>

						{hasActiveFilters && (
							<button
								type="button"
								onClick={handleResetFilters}
								className="mt-4 rounded-xl bg-[#004785] px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-[#00386b] active:scale-95 transition-all"
							>
								Reset Pencarian & Filter
							</button>
						)}
					</div>
				) : (
					items.map((item) => (
						<ItemCard
							key={item.id}
							item={item}
							onSelect={() => handleItemSelect(item)}
						/>
					))
				)}
			</div>
		</div>
	);
}
