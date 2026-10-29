import {
	AlertTriangle,
	ArrowLeft,
	CheckCircle2,
	Clock,
	Database,
	Layers,
	RefreshCw,
	Sparkles,
	Terminal,
	Users,
	WifiOff,
} from "lucide-react";
import * as React from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
	type EnrichedOutboxItem,
	type OutboxQueueTab,
	useOutboxQueue,
} from "../hooks/useOutboxQueue";
import { DiagnosticLogDialog } from "./DiagnosticLogDialog";
import { DiscardConfirmDialog } from "./DiscardConfirmDialog";
import { IosQueueWarningBanner } from "./IosQueueWarningBanner";
import { OutboxItemCard } from "./OutboxItemCard";

export type { OutboxQueueTab };

export interface OutboxQueueViewProps {
	employeeId?: string;
	initialTab?: OutboxQueueTab;
	className?: string;
}

/**
 * Komponen utama Layar Antrian Outbox Offline:
 * - Menampilkan daftar antrean transaksi offline dari IndexedDB.
 * - Tab penyaringan: Semua, Menunggu Sinkronisasi, Perlu Tindakan (failed/rejected), dan Tersinkron.
 * - Tombol Sinkronisasi Manual dengan animasi status.
 * - Penanganan penuh aksi Coba Lagi (Retry) dan Hapus Antrean (Discard) dengan rollback stok.
 */
export function OutboxQueueView({
	employeeId,
	initialTab = "all",
	className,
}: OutboxQueueViewProps) {
	const {
		filteredItems,
		counters,
		activeTab,
		setActiveTab,
		scope,
		setScope,
		otherEmployeesPendingCount,
		isLoading,
		isSyncing,
		retryItem,
		discardItem,
		syncNow,
	} = useOutboxQueue({
		employeeId,
		initialTab,
	});

	const [isOnline, setIsOnline] = React.useState<boolean>(
		typeof navigator !== "undefined" ? navigator.onLine : true,
	);
	const [retryingUuid, setRetryingUuid] = React.useState<string | null>(null);
	const [discardItemTarget, setDiscardItemTarget] =
		React.useState<EnrichedOutboxItem | null>(null);
	const [isDiscardDialogOpen, setIsDiscardDialogOpen] =
		React.useState<boolean>(false);
	const [isDiscarding, setIsDiscarding] = React.useState<boolean>(false);
	const [isDiagnosticOpen, setIsDiagnosticOpen] =
		React.useState<boolean>(false);
	const [feedbackMessage, setFeedbackMessage] = React.useState<{
		type: "success" | "error";
		text: string;
	} | null>(null);

	// Pantau status online/offline
	React.useEffect(() => {
		const handleOnline = () => setIsOnline(true);
		const handleOffline = () => setIsOnline(false);

		window.addEventListener("online", handleOnline);
		window.addEventListener("offline", handleOffline);

		return () => {
			window.removeEventListener("online", handleOnline);
			window.removeEventListener("offline", handleOffline);
		};
	}, []);

	// Auto-clear feedback banner setelah 5 detik
	React.useEffect(() => {
		if (!feedbackMessage) return;
		const timer = setTimeout(() => {
			setFeedbackMessage(null);
		}, 5000);
		return () => clearTimeout(timer);
	}, [feedbackMessage]);

	// Handler Coba Lagi (Retry)
	const handleRetry = async (clientUuid: string) => {
		setRetryingUuid(clientUuid);
		try {
			await retryItem(clientUuid);
			setFeedbackMessage({
				type: "success",
				text: "Status transaksi berhasil direset ke antrean pengiriman.",
			});
		} catch (err) {
			setFeedbackMessage({
				type: "error",
				text:
					err instanceof Error
						? err.message
						: "Gagal memproses coba ulang transaksi.",
			});
		} finally {
			setRetryingUuid(null);
		}
	};

	// Handler Buka Dialog Discard
	const handleRequestDiscard = (item: EnrichedOutboxItem) => {
		setDiscardItemTarget(item);
		setIsDiscardDialogOpen(true);
	};

	// Handler Konfirmasi Discard & Rollback
	const handleConfirmDiscard = async (clientUuid: string) => {
		setIsDiscarding(true);
		try {
			await discardItem(clientUuid);
			setFeedbackMessage({
				type: "success",
				text: "Transaksi dibatalkan dan perubahan stok lokal berhasil di-rollback.",
			});
		} catch (err) {
			setFeedbackMessage({
				type: "error",
				text:
					err instanceof Error
						? err.message
						: "Gagal membatalkan transaksi dari antrean.",
			});
		} finally {
			setIsDiscarding(false);
			setIsDiscardDialogOpen(false);
			setDiscardItemTarget(null);
		}
	};

	// Handler Sinkronkan Sekarang
	const handleSyncAll = async () => {
		if (isSyncing || !isOnline) return;
		try {
			await syncNow();
		} catch (err) {
			setFeedbackMessage({
				type: "error",
				text:
					err instanceof Error
						? err.message
						: "Gagal menjalankan sinkronisasi.",
			});
		}
	};

	return (
		<div className={cn("flex flex-col gap-4 w-full", className)}>
			{/* Header Utama & Aksi Cepat */}
			<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
				<div>
					<div className="flex items-center gap-2">
						<h2 className="text-lg font-bold text-slate-900 tracking-tight">
							Antrean Transaksi (Outbox)
						</h2>
						{counters.needsAction > 0 && (
							<Badge
								variant="destructive"
								className="animate-pulse px-2 py-0.5 text-[10px] font-bold"
								data-testid="needs-action-indicator-badge"
							>
								{counters.needsAction} Perlu Tindakan
							</Badge>
						)}
					</div>
					<p className="text-xs text-slate-500 mt-0.5">
						Kelola transaksi offline lokal & sinkronisasi ke server INALUM
					</p>
				</div>

				<div className="flex items-center gap-2 self-start sm:self-auto">
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => setIsDiagnosticOpen(true)}
						aria-label="Buka Log Diagnostik"
						className="h-9 px-2.5 text-xs font-semibold shadow-2xs border-slate-200 text-slate-700 hover:text-slate-900"
						data-testid="open-diagnostic-logs-button"
					>
						<Terminal className="h-3.5 w-3.5 sm:mr-1.5 text-emerald-600" />
						<span className="hidden sm:inline">Log Diagnostik</span>
					</Button>

					<Button
						type="button"
						variant="outline"
						size="sm"
						disabled={isSyncing || !isOnline}
						onClick={handleSyncAll}
						className={cn(
							"h-9 px-3 text-xs font-semibold shadow-2xs border-slate-200",
							isSyncing && "bg-blue-50 text-blue-700 border-blue-200",
						)}
						data-testid="sync-now-button"
					>
						<RefreshCw
							className={cn(
								"h-3.5 w-3.5 mr-1.5",
								isSyncing && "animate-spin text-blue-600",
							)}
						/>
						<span>
							{isSyncing ? "Menyinkronkan..." : "Sinkronkan Sekarang"}
						</span>
					</Button>
				</div>
			</div>

			{/* Banner Peringatan Offline jika jaringan terputus */}
			{!isOnline && (
				<div className="flex items-center gap-2.5 rounded-xl border border-amber-200 bg-amber-50/90 p-3 text-xs text-amber-900 shadow-2xs">
					<WifiOff className="h-4 w-4 text-amber-600 shrink-0" />
					<div className="flex-1">
						<span className="font-semibold">Mode Offline:</span> Koneksi ke
						jaringan terputus. Transaksi baru tetap tersimpan aman di IndexedDB
						dan akan diunggah otomatis saat koneksi pulih.
					</div>
				</div>
			)}

			{/* Banner Feedback Operasi (Toast-like Alert) */}
			{feedbackMessage && (
				<div
					data-testid="outbox-feedback-alert"
					className={cn(
						"flex items-center gap-2 rounded-xl border p-3 text-xs shadow-2xs transition-all animate-in fade-in duration-200",
						feedbackMessage.type === "success"
							? "border-emerald-200 bg-emerald-50 text-emerald-900"
							: "border-red-200 bg-red-50 text-red-900",
					)}
				>
					{feedbackMessage.type === "success" ? (
						<CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
					) : (
						<AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
					)}
					<span className="flex-1 font-medium">{feedbackMessage.text}</span>
				</div>
			)}

			{/* Banner Peringatan Antrean Tua & iOS WebKit Eviction Guard */}
			<IosQueueWarningBanner onSyncNow={handleSyncAll} />

			{/* Banner Isolasi Akun Multi-Pegawai (Task P5.11) */}
			{otherEmployeesPendingCount > 0 && (
				<div
					data-testid="other-employees-queue-banner"
					className="flex items-center justify-between gap-2 rounded-xl border border-blue-200/80 bg-blue-50/70 p-3 text-xs text-blue-900 shadow-2xs"
				>
					<div className="flex items-center gap-2 min-w-0">
						<Users className="h-4 w-4 text-[#004785] shrink-0" />
						<span className="leading-snug">
							Terdapat{" "}
							<strong>{otherEmployeesPendingCount} transaksi offline</strong>{" "}
							milik akun lain yang tersimpan aman di perangkat ini.
						</span>
					</div>
					<button
						type="button"
						onClick={() =>
							setScope(
								scope === "current_employee" ? "all" : "current_employee",
							)
						}
						className="text-xs font-bold text-[#004785] hover:underline shrink-0 whitespace-nowrap"
						data-testid="toggle-outbox-scope-button"
					>
						{scope === "current_employee" ? "Lihat Semua" : "Hanya Akun Saya"}
					</button>
				</div>
			)}

			{/* Tab Filter Antrean */}
			<div
				role="tablist"
				aria-label="Filter Status Antrean"
				className="flex items-center gap-1.5 p-1 rounded-2xl bg-slate-100/90 border border-slate-200/60 overflow-x-auto text-xs"
			>
				<button
					type="button"
					role="tab"
					aria-selected={activeTab === "all"}
					onClick={() => setActiveTab("all")}
					data-testid="tab-all"
					className={cn(
						"flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-medium transition-all whitespace-nowrap min-h-[36px]",
						activeTab === "all"
							? "bg-white text-slate-900 font-bold shadow-2xs"
							: "text-slate-600 hover:text-slate-900",
					)}
				>
					<Layers className="h-3.5 w-3.5" />
					<span>Semua</span>
					<span className="rounded-full bg-slate-200/80 px-1.5 py-0.2 text-[10px] font-bold">
						{counters.total}
					</span>
				</button>

				<button
					type="button"
					role="tab"
					aria-selected={activeTab === "pending"}
					onClick={() => setActiveTab("pending")}
					data-testid="tab-pending"
					className={cn(
						"flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-medium transition-all whitespace-nowrap min-h-[36px]",
						activeTab === "pending"
							? "bg-white text-[#004785] font-bold shadow-2xs"
							: "text-slate-600 hover:text-slate-900",
					)}
				>
					<Clock className="h-3.5 w-3.5" />
					<span>Menunggu</span>
					{counters.pending > 0 && (
						<span className="rounded-full bg-amber-100 text-amber-800 px-1.5 py-0.2 text-[10px] font-bold">
							{counters.pending}
						</span>
					)}
				</button>

				<button
					type="button"
					role="tab"
					aria-selected={activeTab === "needs_action"}
					onClick={() => setActiveTab("needs_action")}
					data-testid="tab-needs-action"
					className={cn(
						"flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-medium transition-all whitespace-nowrap min-h-[36px]",
						activeTab === "needs_action"
							? "bg-white text-red-700 font-bold shadow-2xs"
							: "text-slate-600 hover:text-slate-900",
					)}
				>
					<AlertTriangle className="h-3.5 w-3.5 text-red-600" />
					<span>Perlu Tindakan</span>
					{counters.needsAction > 0 && (
						<span
							data-testid="needs-action-badge-count"
							className="rounded-full bg-red-600 text-white px-1.5 py-0.2 text-[10px] font-bold"
						>
							{counters.needsAction}
						</span>
					)}
				</button>

				<button
					type="button"
					role="tab"
					aria-selected={activeTab === "synced"}
					onClick={() => setActiveTab("synced")}
					data-testid="tab-synced"
					className={cn(
						"flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-medium transition-all whitespace-nowrap min-h-[36px]",
						activeTab === "synced"
							? "bg-white text-emerald-700 font-bold shadow-2xs"
							: "text-slate-600 hover:text-slate-900",
					)}
				>
					<CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
					<span>Tersinkron</span>
					{counters.synced > 0 && (
						<span className="rounded-full bg-emerald-100 text-emerald-800 px-1.5 py-0.2 text-[10px] font-bold">
							{counters.synced}
						</span>
					)}
				</button>
			</div>

			{/* Daftar Antrean Item atau State Loading/Empty */}
			{isLoading ? (
				<div className="space-y-3" data-testid="queue-loading-skeleton">
					<Skeleton className="h-28 w-full rounded-2xl" />
					<Skeleton className="h-28 w-full rounded-2xl" />
				</div>
			) : filteredItems.length === 0 ? (
				<Card className="border-slate-200/80 bg-white shadow-2xs">
					<CardContent className="flex flex-col items-center justify-center p-8 text-center">
						{activeTab === "needs_action" ? (
							<>
								<div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-100 shadow-2xs">
									<CheckCircle2 className="h-7 w-7" />
								</div>
								<h3 className="mb-1 text-base font-bold text-slate-800">
									Tidak Ada Transaksi Bermasalah
								</h3>
								<p className="max-w-xs text-xs text-slate-500 leading-relaxed">
									Semua transaksi offline berhasil diproses atau tidak ada entri
									yang memerlukan tindakan perbaikan manual.
								</p>
							</>
						) : activeTab === "pending" ? (
							<>
								<div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-[#004785] border border-blue-100 shadow-2xs">
									<Sparkles className="h-7 w-7" />
								</div>
								<h3 className="mb-1 text-base font-bold text-slate-800">
									Tidak Ada Antrean Menunggu
								</h3>
								<p className="max-w-xs text-xs text-slate-500 leading-relaxed">
									Semua mutasi stok offline telah berhasil dikirimkan atau belum
									ada antrean baru yang dibuat.
								</p>
							</>
						) : activeTab === "synced" ? (
							<>
								<div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-50 text-slate-500 border border-slate-200 shadow-2xs">
									<Clock className="h-7 w-7" />
								</div>
								<h3 className="mb-1 text-base font-bold text-slate-800">
									Belum Ada Riwayat Tersinkron
								</h3>
								<p className="max-w-xs text-xs text-slate-500 leading-relaxed">
									Transaksi yang telah berhasil diunggah ke server akan dicatat
									di sini.
								</p>
							</>
						) : (
							<>
								<div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-100 shadow-2xs">
									<Database className="h-7 w-7" />
								</div>
								<h3 className="mb-1 text-base font-bold text-slate-800">
									Antrean Offline Kosong
								</h3>
								<p className="mb-4 max-w-xs text-xs text-slate-500 leading-relaxed">
									Tidak ada transaksi offline yang tersimpan di perangkat ini.
									Seluruh data telah tersinkronisasi penuh dengan server.
								</p>
								<Link
									to="/"
									className="inline-flex items-center gap-2 rounded-xl bg-[#004785] px-4 py-2.5 text-xs font-semibold text-white shadow-2xs transition-transform hover:bg-[#00386b] active:scale-95"
								>
									<ArrowLeft className="h-4 w-4" />
									<span>Kembali ke Katalog Barang</span>
								</Link>
							</>
						)}
					</CardContent>
				</Card>
			) : (
				<div className="flex flex-col gap-3" data-testid="outbox-items-list">
					{filteredItems.map((item) => (
						<OutboxItemCard
							key={item.clientUuid}
							item={item}
							onRetry={handleRetry}
							onDiscard={handleRequestDiscard}
							isRetrying={retryingUuid === item.clientUuid}
						/>
					))}
				</div>
			)}

			{/* Dialog Konfirmasi Pembatalan & Rollback */}
			<DiscardConfirmDialog
				open={isDiscardDialogOpen}
				onOpenChange={setIsDiscardDialogOpen}
				item={discardItemTarget}
				onConfirm={handleConfirmDiscard}
				isDeleting={isDiscarding}
			/>

			{/* Dialog Log Diagnostik Ring-Buffer & Ekspor (Task P5.13) */}
			<DiagnosticLogDialog
				open={isDiagnosticOpen}
				onOpenChange={setIsDiagnosticOpen}
			/>
		</div>
	);
}
