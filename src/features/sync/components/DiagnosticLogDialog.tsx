import {
	AlertCircle,
	AlertTriangle,
	Check,
	ChevronDown,
	ChevronRight,
	Copy,
	Download,
	Info,
	RefreshCw,
	Search,
	Terminal,
	Trash2,
	X,
} from "lucide-react";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useDiagnosticLogs } from "../hooks/useDiagnosticLogs";
import {
	DEFAULT_DIAGNOSTIC_LOG_CAP,
	formatDiagnosticTimestamp,
} from "../lib/diagnostics";

export interface DiagnosticLogDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function DiagnosticLogDialog({
	open,
	onOpenChange,
}: DiagnosticLogDialogProps) {
	const {
		filteredLogs,
		totalCount,
		isLoading,
		stats,
		availableCategories,
		levelFilter,
		setLevelFilter,
		categoryFilter,
		setCategoryFilter,
		searchQuery,
		setSearchQuery,
		isCopied,
		refreshLogs,
		clearLogs,
		copyToClipboard,
		downloadLogs,
	} = useDiagnosticLogs({ limit: DEFAULT_DIAGNOSTIC_LOG_CAP });

	const [expandedLogIds, setExpandedLogIds] = React.useState<Set<number>>(
		new Set(),
	);
	const [showClearConfirm, setShowClearConfirm] =
		React.useState<boolean>(false);
	const [exportFormat, setExportFormat] = React.useState<"text" | "json">(
		"text",
	);

	const toggleExpand = (id: number) => {
		setExpandedLogIds((prev) => {
			const next = new Set(prev);
			if (next.has(id)) {
				next.delete(id);
			} else {
				next.add(id);
			}
			return next;
		});
	};

	const handleCopy = async () => {
		await copyToClipboard(exportFormat);
	};

	const handleDownload = async () => {
		await downloadLogs(exportFormat);
	};

	const handleConfirmClear = async () => {
		await clearLogs();
		setShowClearConfirm(false);
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				className="max-w-2xl max-h-[92vh] flex flex-col p-0 gap-0 overflow-hidden sm:rounded-2xl"
				data-testid="diagnostic-log-dialog"
			>
				{/* Dialog Header */}
				<DialogHeader className="p-4 sm:p-5 border-b border-slate-100 bg-slate-50/80">
					<div className="flex items-center justify-between gap-3">
						<div className="flex items-center gap-2.5">
							<div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-white shadow-xs">
								<Terminal className="h-4 w-4 text-emerald-400" />
							</div>
							<div>
								<div className="flex items-center gap-2">
									<DialogTitle className="text-base font-bold text-slate-900">
										Log Diagnostik Sistem
									</DialogTitle>
									<Badge
										variant="outline"
										className="text-[10px] font-mono font-semibold px-2 py-0.5 bg-white border-slate-200 text-slate-700"
										data-testid="log-counter-badge"
									>
										{totalCount} / {DEFAULT_DIAGNOSTIC_LOG_CAP} Entri
									</Badge>
								</div>
								<DialogDescription className="text-xs text-slate-500 mt-0.5">
									Audit trail aktivitas offline engine & riwayat sinkronisasi
									katalog
								</DialogDescription>
							</div>
						</div>

						<div className="flex items-center gap-1.5">
							<Button
								type="button"
								variant="ghost"
								size="sm"
								onClick={refreshLogs}
								disabled={isLoading}
								aria-label="Segarkan Log"
								className="h-8 w-8 p-0 text-slate-600 hover:text-slate-900"
							>
								<RefreshCw
									className={cn("h-3.5 w-3.5", isLoading && "animate-spin")}
								/>
							</Button>
						</div>
					</div>

					{/* Toolbar Filter & Pencarian */}
					<div className="mt-3.5 flex flex-col sm:flex-row gap-2 pt-1">
						{/* Search Input */}
						<div className="relative flex-1">
							<Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
							<Input
								type="text"
								placeholder="Cari pesan atau payload log..."
								value={searchQuery}
								onChange={(e) => setSearchQuery(e.target.value)}
								className="h-8 pl-8 pr-7 text-xs bg-white rounded-lg border-slate-200"
								data-testid="diagnostic-search-input"
							/>
							{searchQuery && (
								<button
									type="button"
									onClick={() => setSearchQuery("")}
									className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
								>
									<X className="h-3 w-3" />
								</button>
							)}
						</div>

						{/* Category Filter Select */}
						{availableCategories.length > 0 && (
							<select
								value={categoryFilter}
								onChange={(e) => setCategoryFilter(e.target.value)}
								className="h-8 px-2.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-700 outline-none focus:ring-1 focus:ring-blue-500"
								data-testid="diagnostic-category-filter"
							>
								<option value="all">Semua Kategori</option>
								{availableCategories.map((cat) => (
									<option key={cat} value={cat}>
										{cat}
									</option>
								))}
							</select>
						)}
					</div>

					{/* Filter Level Chips */}
					<div className="flex items-center gap-1.5 mt-2 overflow-x-auto text-xs pb-0.5">
						<button
							type="button"
							onClick={() => setLevelFilter("all")}
							className={cn(
								"px-2.5 py-1 rounded-md font-medium text-[11px] transition-all whitespace-nowrap",
								levelFilter === "all"
									? "bg-slate-900 text-white shadow-2xs"
									: "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100",
							)}
							data-testid="filter-level-all"
						>
							Semua ({stats.total})
						</button>
						<button
							type="button"
							onClick={() => setLevelFilter("error")}
							className={cn(
								"px-2.5 py-1 rounded-md font-medium text-[11px] transition-all flex items-center gap-1 whitespace-nowrap",
								levelFilter === "error"
									? "bg-red-600 text-white shadow-2xs"
									: "bg-white text-red-700 border border-red-200 hover:bg-red-50",
							)}
							data-testid="filter-level-error"
						>
							<AlertCircle className="h-3 w-3" />
							<span>Error ({stats.errorCount})</span>
						</button>
						<button
							type="button"
							onClick={() => setLevelFilter("warn")}
							className={cn(
								"px-2.5 py-1 rounded-md font-medium text-[11px] transition-all flex items-center gap-1 whitespace-nowrap",
								levelFilter === "warn"
									? "bg-amber-600 text-white shadow-2xs"
									: "bg-white text-amber-800 border border-amber-200 hover:bg-amber-50",
							)}
							data-testid="filter-level-warn"
						>
							<AlertTriangle className="h-3 w-3" />
							<span>Warning ({stats.warnCount})</span>
						</button>
						<button
							type="button"
							onClick={() => setLevelFilter("info")}
							className={cn(
								"px-2.5 py-1 rounded-md font-medium text-[11px] transition-all flex items-center gap-1 whitespace-nowrap",
								levelFilter === "info"
									? "bg-blue-600 text-white shadow-2xs"
									: "bg-white text-blue-800 border border-blue-200 hover:bg-blue-50",
							)}
							data-testid="filter-level-info"
						>
							<Info className="h-3 w-3" />
							<span>Info ({stats.infoCount})</span>
						</button>
					</div>
				</DialogHeader>

				{/* Log Content Area (Terminal/Console View) */}
				<div className="flex-1 overflow-y-auto p-4 bg-slate-950 font-mono text-[11px] text-slate-200 space-y-2 max-h-[420px] select-text">
					{filteredLogs.length === 0 ? (
						<div className="py-12 text-center text-slate-500">
							<Terminal className="h-8 w-8 mx-auto mb-2 opacity-40" />
							<p className="font-sans font-medium text-xs">
								{searchQuery ||
								levelFilter !== "all" ||
								categoryFilter !== "all"
									? "Tidak ada entri log yang cocok dengan filter."
									: "Belum ada entri log diagnostik tercatat."}
							</p>
						</div>
					) : (
						filteredLogs.map((log) => {
							const logId = log.id ?? 0;
							const isExpanded = expandedLogIds.has(logId);
							const hasDetails = Boolean(log.details);

							return (
								<div
									key={log.id ?? `${log.timestamp}-${log.message}`}
									className="rounded-lg border border-slate-800/80 bg-slate-900/90 p-2.5 hover:border-slate-700 transition-colors"
									data-testid="diagnostic-log-entry"
								>
									<div className="flex items-start justify-between gap-2">
										<div className="flex flex-wrap items-center gap-1.5 min-w-0">
											<span className="text-slate-400 text-[10px]">
												{formatDiagnosticTimestamp(log.timestamp)}
											</span>
											<span
												className={cn(
													"px-1.5 py-0.2 rounded text-[9px] font-bold uppercase tracking-wider",
													log.level === "error" &&
														"bg-red-950/80 text-red-400 border border-red-800/60",
													log.level === "warn" &&
														"bg-amber-950/80 text-amber-300 border border-amber-800/60",
													log.level === "info" &&
														"bg-blue-950/80 text-blue-300 border border-blue-800/60",
													log.level === "debug" &&
														"bg-slate-800 text-slate-400 border border-slate-700",
												)}
											>
												{log.level}
											</span>
											<span className="text-emerald-400 text-[10px] font-semibold">
												[{log.category}]
											</span>
										</div>

										{hasDetails && (
											<button
												type="button"
												onClick={() => toggleExpand(logId)}
												className="text-slate-400 hover:text-slate-200 text-[10px] flex items-center gap-0.5 shrink-0"
												aria-label={
													isExpanded ? "Sembunyikan payload" : "Lihat payload"
												}
											>
												<span>Payload</span>
												{isExpanded ? (
													<ChevronDown className="h-3 w-3" />
												) : (
													<ChevronRight className="h-3 w-3" />
												)}
											</button>
										)}
									</div>

									<p className="mt-1 text-slate-100 break-words leading-relaxed">
										{log.message}
									</p>

									{/* Collapsible JSON details payload */}
									{hasDetails && isExpanded && (
										<div className="mt-2 p-2 rounded bg-black/60 border border-slate-800 text-[10px] text-slate-300 overflow-x-auto whitespace-pre">
											{typeof log.details === "object"
												? JSON.stringify(log.details, null, 2)
												: String(log.details)}
										</div>
									)}
								</div>
							);
						})
					)}
				</div>

				{/* Dialog Footer Actions */}
				<DialogFooter className="p-3.5 sm:p-4 border-t border-slate-100 bg-white flex flex-col sm:flex-row items-center justify-between gap-2.5">
					<div className="flex items-center gap-2 self-start sm:self-auto">
						{showClearConfirm ? (
							<div className="flex items-center gap-1.5">
								<span className="text-xs text-red-600 font-semibold">
									Hapus semua?
								</span>
								<Button
									type="button"
									variant="destructive"
									size="sm"
									onClick={handleConfirmClear}
									className="h-8 px-2.5 text-xs font-semibold"
									data-testid="confirm-clear-logs-button"
								>
									Ya, Hapus
								</Button>
								<Button
									type="button"
									variant="ghost"
									size="sm"
									onClick={() => setShowClearConfirm(false)}
									className="h-8 px-2 text-xs"
								>
									Batal
								</Button>
							</div>
						) : (
							<Button
								type="button"
								variant="ghost"
								size="sm"
								onClick={() => setShowClearConfirm(true)}
								disabled={totalCount === 0}
								className="h-8 px-2.5 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
								data-testid="clear-logs-button"
							>
								<Trash2 className="h-3.5 w-3.5 mr-1.5" />
								<span>Bersihkan Log</span>
							</Button>
						)}
					</div>

					<div className="flex items-center gap-2 w-full sm:w-auto justify-end">
						<select
							value={exportFormat}
							onChange={(e) =>
								setExportFormat(e.target.value as "text" | "json")
							}
							aria-label="Format Ekspor"
							className="h-8 px-2 text-xs bg-white border border-slate-200 rounded-lg text-slate-700 outline-none"
							data-testid="export-format-select"
						>
							<option value="text">Format .TXT</option>
							<option value="json">Format .JSON</option>
						</select>

						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={handleCopy}
							disabled={totalCount === 0}
							className="h-8 px-2.5 text-xs font-medium"
							data-testid="copy-logs-button"
						>
							{isCopied ? (
								<>
									<Check className="h-3.5 w-3.5 mr-1 text-emerald-600" />
									<span className="text-emerald-700 font-semibold">
										Tersalin!
									</span>
								</>
							) : (
								<>
									<Copy className="h-3.5 w-3.5 mr-1" />
									<span>Salin</span>
								</>
							)}
						</Button>

						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={handleDownload}
							disabled={totalCount === 0}
							className="h-8 px-2.5 text-xs font-medium"
							data-testid="download-logs-button"
						>
							<Download className="h-3.5 w-3.5 mr-1" />
							<span>Unduh</span>
						</Button>

						<Button
							type="button"
							variant="default"
							size="sm"
							onClick={() => onOpenChange(false)}
							className="h-8 px-3 text-xs bg-[#004785] hover:bg-[#003868] text-white"
						>
							Tutup
						</Button>
					</div>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
