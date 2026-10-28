import { AlertCircle, RotateCw, Wifi, WifiOff } from "lucide-react";
import * as React from "react";
import { formatRelative } from "@/lib/time";
import { cn } from "@/lib/utils";
import { useCatalogSync } from "../hooks/useCatalogSync";

export interface SyncStatusBarProps {
	isSyncing?: boolean;
	lastSyncedAt?: string | null;
	isOffline?: boolean;
	error?: string | null;
	onSync?: () => unknown;
	className?: string;
	showRefreshButton?: boolean;
	compact?: boolean;
}

/**
 * Bar status konektivitas real-time (Online/Offline), info kesegaran data ("Terakhir sinkron"),
 * dan tombol pemicu pembaruan katalog lokal.
 */
export function SyncStatusBar(props: SyncStatusBarProps) {
	// Dukung controlled mode (via props) atau uncontrolled mode (otomatis dari useCatalogSync)
	const internalSync = useCatalogSync({
		autoSync: false,
		syncOnMount: false,
	});

	const isSyncing = props.isSyncing ?? internalSync.isSyncing;
	const lastSyncedAt = props.lastSyncedAt ?? internalSync.lastSyncedAt;
	const isOffline = props.isOffline ?? internalSync.isOffline;
	const error = props.error ?? internalSync.error;
	const onSync = props.onSync ?? internalSync.syncNow;

	const { showRefreshButton = true, compact = false, className } = props;

	// Waktu relatif yang diperbarui berkala setiap 30 detik
	const [relativeTime, setRelativeTime] = React.useState<string>(() =>
		formatRelative(lastSyncedAt),
	);

	React.useEffect(() => {
		setRelativeTime(formatRelative(lastSyncedAt));

		const interval = setInterval(() => {
			setRelativeTime(formatRelative(lastSyncedAt));
		}, 30_000);

		return () => clearInterval(interval);
	}, [lastSyncedAt]);

	const handleRefresh = async () => {
		if (isSyncing || isOffline) return;
		await onSync?.();
	};

	return (
		<div
			className={cn(
				"w-full bg-slate-50/90 border border-slate-200/80 rounded-xl px-3.5 py-2.5 transition-all",
				compact && "py-1.5 px-3",
				className,
			)}
			aria-live="polite"
		>
			<div className="flex items-center justify-between gap-3">
				<div className="flex items-center gap-2.5 min-w-0">
					{isOffline ? (
						<span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200/70 shrink-0">
							<WifiOff className="w-3.5 h-3.5 text-amber-600" />
							<span>Mode Offline</span>
						</span>
					) : (
						<span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200/70 shrink-0">
							<span className="relative flex h-2 w-2">
								<span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
								<span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
							</span>
							<Wifi className="w-3.5 h-3.5 text-emerald-600" />
							<span>Online</span>
						</span>
					)}

					<div className="text-xs text-slate-500 truncate">
						{lastSyncedAt ? (
							<span>
								Disinkronkan:{" "}
								<span className="font-medium text-slate-700">
									{relativeTime}
								</span>
							</span>
						) : (
							<span className="italic text-slate-400">Belum disinkronkan</span>
						)}
					</div>
				</div>

				{showRefreshButton && (
					<button
						type="button"
						onClick={handleRefresh}
						disabled={isSyncing || isOffline}
						aria-label={
							isSyncing
								? "Sedang menyinkronkan data katalog"
								: "Segarkan data katalog"
						}
						className={cn(
							"inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all shrink-0 select-none",
							"bg-white border border-slate-200 text-slate-700 shadow-2xs",
							"hover:bg-slate-100 hover:text-slate-900 active:scale-95",
							"focus:outline-none focus:ring-2 focus:ring-[#004785]/20 focus:border-[#004785]",
							"disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100",
						)}
					>
						<RotateCw
							className={cn(
								"w-3.5 h-3.5 transition-transform",
								isSyncing && "animate-spin text-[#004785]",
							)}
						/>
						<span className="hidden xs:inline">
							{isSyncing ? "Menyinkronkan..." : "Segarkan"}
						</span>
					</button>
				)}
			</div>

			{error && (
				<div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-200/60 text-xs text-amber-800">
					<AlertCircle className="w-3.5 h-3.5 shrink-0 text-amber-600" />
					<span className="flex-1 truncate">{error}</span>
					{!isOffline && (
						<button
							type="button"
							onClick={handleRefresh}
							className="text-xs font-semibold text-amber-900 hover:underline shrink-0"
						>
							Coba lagi
						</button>
					)}
				</div>
			)}
		</div>
	);
}
