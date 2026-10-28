import {
	AlertCircle,
	ArrowDownLeft,
	ArrowUpRight,
	Calendar,
	ChevronLeft,
	ChevronRight,
	FileText,
	History,
	Plus,
	RefreshCw,
	RotateCcw,
	SlidersHorizontal,
	User,
} from "lucide-react";
import * as React from "react";
import { formatRelative, formatWib } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { InventoryLedger, LedgerTransactionType } from "@/types/api";
import { useItemLedger } from "../hooks/useItemLedger";

export interface ItemLedgerHistoryProps {
	itemId: string;
	itemUnit?: string;
	className?: string;
	retry?: boolean | number;
}

interface TypeConfig {
	label: string;
	signPrefix: string;
	badgeClass: string;
	icon: React.ComponentType<{ className?: string }>;
}

const LEDGER_TYPE_CONFIGS: Record<LedgerTransactionType, TypeConfig> = {
	in: {
		label: "Tambah Stok",
		signPrefix: "+",
		badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
		icon: Plus,
	},
	out: {
		label: "Ambil Barang",
		signPrefix: "-",
		badgeClass: "bg-blue-50 text-blue-700 border-blue-200",
		icon: ArrowUpRight,
	},
	borrow: {
		label: "Pinjam Aset",
		signPrefix: "Dipinjam ",
		badgeClass: "bg-indigo-50 text-indigo-700 border-indigo-200",
		icon: ArrowDownLeft,
	},
	return: {
		label: "Kembalikan Aset",
		signPrefix: "Dikembalikan ",
		badgeClass: "bg-teal-50 text-teal-700 border-teal-200",
		icon: RotateCcw,
	},
	adjustment: {
		label: "Koreksi Stok",
		signPrefix: "Penyesuaian ",
		badgeClass: "bg-amber-50 text-amber-700 border-amber-200",
		icon: SlidersHorizontal,
	},
};

export function ItemLedgerHistory({
	itemId,
	itemUnit = "unit",
	className,
	retry,
}: ItemLedgerHistoryProps) {
	const [page, setPage] = React.useState(1);

	const { ledgers, meta, isLoading, isError, refetch, isFetching } =
		useItemLedger(itemId, {
			page,
			perPage: 10,
			retry,
		});

	// biome-ignore lint/correctness/useExhaustiveDependencies: reset page to 1 when itemId changes
	React.useEffect(() => {
		setPage(1);
	}, [itemId]);

	const totalPages = meta?.last_page ?? 1;
	const totalItems = meta?.total ?? ledgers.length;

	return (
		<div
			data-testid="item-ledger-history"
			className={cn("flex flex-col gap-3", className)}
		>
			<div className="flex items-center justify-between pb-1">
				<div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
					<History className="h-4 w-4 text-[#004785]" />
					<span>Riwayat Transaksi (Ledger)</span>
					{totalItems > 0 && (
						<span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
							{totalItems}
						</span>
					)}
				</div>

				<button
					type="button"
					onClick={() => void refetch()}
					disabled={isFetching}
					aria-label="Segarkan riwayat"
					className="flex items-center gap-1 text-[11px] font-semibold text-[#004785] hover:underline disabled:opacity-50"
				>
					<RefreshCw
						className={cn("h-3 w-3", isFetching ? "animate-spin" : "")}
					/>
					<span>Segarkan</span>
				</button>
			</div>

			{isLoading ? (
				<div data-testid="ledger-skeleton" className="flex flex-col gap-2.5">
					{[1, 2, 3].map((n) => (
						<div
							key={n}
							className="h-20 w-full animate-pulse rounded-xl border border-slate-100 bg-slate-100/70 p-3"
						/>
					))}
				</div>
			) : isError ? (
				<div
					data-testid="ledger-error"
					className="flex flex-col items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50/60 p-4 text-center text-xs text-red-800"
				>
					<AlertCircle className="h-5 w-5 text-red-600" />
					<p className="font-semibold">
						Gagal memuat riwayat transaksi dari server.
					</p>
					<p className="text-[11px] text-red-600/90">
						Pastikan perangkat terhubung dengan koneksi jaringan.
					</p>
					<button
						type="button"
						onClick={() => void refetch()}
						className="mt-1 rounded-lg bg-red-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-red-700 active:scale-95 transition-all"
					>
						Coba Lagi
					</button>
				</div>
			) : ledgers.length === 0 ? (
				<div
					data-testid="ledger-empty"
					className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 py-8 px-4 text-center"
				>
					<div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400">
						<History className="h-5 w-5 stroke-[1.5]" />
					</div>
					<div className="text-xs font-semibold text-slate-700">
						Belum ada riwayat transaksi
					</div>
					<p className="text-[11px] text-slate-500 max-w-xs">
						Seluruh transaksi ambil, tambah stok, pinjam, dan kembalikan barang
						akan tercatat otomatis di sini.
					</p>
				</div>
			) : (
				<div className="flex flex-col gap-2.5">
					{ledgers.map((ledger) => (
						<LedgerEntryCard
							key={ledger.id}
							ledger={ledger}
							itemUnit={itemUnit}
						/>
					))}

					{totalPages > 1 && (
						<div className="flex items-center justify-between border-t border-slate-100 pt-2 text-xs">
							<span className="text-[11px] text-slate-500">
								Hal. {page} dari {totalPages}
							</span>

							<div className="flex items-center gap-1">
								<button
									type="button"
									disabled={page <= 1 || isFetching}
									onClick={() => setPage((p) => Math.max(1, p - 1))}
									className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
									aria-label="Halaman sebelumnya"
								>
									<ChevronLeft className="h-3.5 w-3.5" />
								</button>
								<button
									type="button"
									disabled={page >= totalPages || isFetching}
									onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
									className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
									aria-label="Halaman berikutnya"
								>
									<ChevronRight className="h-3.5 w-3.5" />
								</button>
							</div>
						</div>
					)}
				</div>
			)}
		</div>
	);
}

interface LedgerEntryCardProps {
	ledger: InventoryLedger;
	itemUnit: string;
}

function LedgerEntryCard({ ledger, itemUnit }: LedgerEntryCardProps) {
	const config = LEDGER_TYPE_CONFIGS[ledger.type] ?? LEDGER_TYPE_CONFIGS.out;
	const IconComponent = config.icon;

	// Sesuai D8 & §16 keputusan no 1: Tampilkan nama pelaku, bukan namecode
	const actorName =
		ledger.user?.employee_name || ledger.user?.name || "Pegawai";

	const timestamp = ledger.occurred_at || ledger.created_at;
	const formattedTime = formatWib(timestamp);
	const relativeTime = formatRelative(timestamp);

	return (
		<div
			data-testid={`ledger-entry-${ledger.id}`}
			className="rounded-xl border border-slate-200 bg-white p-3 shadow-2xs hover:border-slate-300 transition-all flex flex-col gap-2"
		>
			<div className="flex items-start justify-between gap-2">
				<div className="flex items-center gap-2">
					<div
						className={cn(
							"flex h-7 w-7 items-center justify-center rounded-lg border",
							config.badgeClass,
						)}
					>
						<IconComponent className="h-3.5 w-3.5" />
					</div>
					<div>
						<span
							className={cn(
								"inline-block rounded-md border px-1.5 py-0.5 text-[10px] font-bold tracking-wide uppercase",
								config.badgeClass,
							)}
						>
							{config.label}
						</span>
					</div>
				</div>

				<div className="text-right">
					<span className="text-xs font-bold text-slate-900">
						{config.signPrefix}
						{ledger.quantity} {itemUnit}
					</span>
					<div className="text-[10px] text-slate-500 font-mono">
						Stok: {ledger.stock_before} → {ledger.stock_after}
					</div>
				</div>
			</div>

			<div className="flex items-center justify-between text-[11px] text-slate-600 border-t border-slate-50 pt-1.5 flex-wrap gap-1">
				<div className="flex items-center gap-1 font-medium text-slate-700">
					<User className="h-3 w-3 text-slate-400" />
					<span>{actorName}</span>
				</div>

				<div
					className="flex items-center gap-1 text-[10px] text-slate-400"
					title={formattedTime}
				>
					<Calendar className="h-3 w-3" />
					<span>{relativeTime}</span>
				</div>
			</div>

			{(ledger.notes || ledger.reference_number) && (
				<div className="rounded-lg bg-slate-50 p-2 text-[11px] text-slate-600 flex flex-col gap-1 border border-slate-100">
					{ledger.reference_number && (
						<div className="flex items-center gap-1 text-[10px] font-mono text-[#004785] font-semibold">
							<FileText className="h-3 w-3" />
							<span>Ref: {ledger.reference_number}</span>
						</div>
					)}
					{ledger.notes && (
						<p className="text-[11px] leading-relaxed text-slate-600 italic">
							"{ledger.notes}"
						</p>
					)}
				</div>
			)}
		</div>
	);
}
