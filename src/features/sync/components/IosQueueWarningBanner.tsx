import {
	AlertTriangle,
	ExternalLink,
	RefreshCw,
	Smartphone,
	X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useOutboxAgingWarning } from "../hooks/useOutboxAgingWarning";
import type { OutboxAgingInfo } from "../lib/outboxAging";
import { IosInstallGuideModal } from "./IosInstallGuideModal";

export interface IosQueueWarningBannerProps {
	className?: string;
	forceShow?: boolean;
	onSyncNow?: () => void;
	overrideAgingInfo?: OutboxAgingInfo;
}

/**
 * Banner peringatan penuaan antrean outbox dan risiko penghapusan penyimpanan otomatis Safari iOS
 * (WebKit 7-day storage eviction policy).
 * Mendorong pengguna iPhone memasang PWA ke Layar Utama atau segera melakukan sinkronisasi online.
 */
export function IosQueueWarningBanner({
	className,
	forceShow = false,
	onSyncNow,
	overrideAgingInfo,
}: IosQueueWarningBannerProps) {
	const {
		agingInfo: hookAgingInfo,
		hasWarning,
		isDismissed,
		isGuideModalOpen,
		dismissWarning,
		openGuideModal,
		closeGuideModal,
	} = useOutboxAgingWarning();

	const agingInfo = overrideAgingInfo ?? hookAgingInfo;
	const isVisible =
		forceShow ||
		(overrideAgingInfo
			? overrideAgingInfo.warningLevel !== "none" && !isDismissed
			: hasWarning);

	if (!isVisible || agingInfo.warningLevel === "none") {
		return null;
	}

	const isDanger = agingInfo.warningLevel === "danger";

	return (
		<>
			<div
				role="alert"
				data-testid="ios-queue-warning-banner"
				className={cn(
					"relative w-full rounded-2xl border p-3.5 shadow-2xs transition-all animate-in fade-in duration-200 mb-3",
					isDanger
						? "border-red-300/90 bg-red-50/95 text-red-950"
						: "border-amber-300/90 bg-amber-50/95 text-amber-950",
					className,
				)}
			>
				{/* Tombol Tutup Banner */}
				<button
					type="button"
					onClick={dismissWarning}
					data-testid="dismiss-ios-warning-button"
					aria-label="Tutup peringatan"
					className="absolute top-3 right-3 flex h-6 w-6 items-center justify-center rounded-lg text-slate-400 hover:bg-black/5 hover:text-slate-700 active:scale-95 transition-all"
				>
					<X className="h-4 w-4" />
				</button>

				<div className="flex items-start gap-3 pr-6">
					<div
						className={cn(
							"flex h-9 w-9 shrink-0 items-center justify-center rounded-xl shadow-2xs",
							isDanger ? "bg-red-600 text-white" : "bg-amber-500 text-white",
						)}
					>
						{agingInfo.isIosBrowser ? (
							<Smartphone className="h-5 w-5" />
						) : (
							<AlertTriangle className="h-5 w-5" />
						)}
					</div>

					<div className="min-w-0 flex-1">
						<div className="flex items-center gap-2 flex-wrap">
							<h4 className="text-xs font-bold leading-tight tracking-tight">
								{isDanger
									? "Perhatian Kritis: Risiko Data Safari iOS"
									: agingInfo.isIosBrowser
										? "Tips Pengguna iPhone (Amankan Transaksi)"
										: "Peringatan Antrean Offline Tertunda"}
							</h4>
							{agingInfo.oldestAgeDays > 0 ? (
								<Badge
									variant={isDanger ? "destructive" : "warning"}
									className="text-[9px] px-1.5 py-0 font-bold"
								>
									{agingInfo.oldestAgeDays} Hari Lalu
								</Badge>
							) : agingInfo.oldestAgeHours > 0 ? (
								<Badge
									variant={isDanger ? "destructive" : "warning"}
									className="text-[9px] px-1.5 py-0 font-bold"
								>
									{agingInfo.oldestAgeHours} Jam Lalu
								</Badge>
							) : null}
						</div>

						<p className="text-[11px] leading-relaxed mt-1 text-slate-800">
							{agingInfo.message}
						</p>

						{/* Baris Tombol Aksi */}
						<div className="flex items-center gap-2 mt-2.5 flex-wrap">
							{agingInfo.shouldInstallToHomeScreen && (
								<Button
									type="button"
									size="sm"
									variant="default"
									onClick={openGuideModal}
									data-testid="open-ios-guide-button"
									className="h-7 px-2.5 text-[11px] font-semibold bg-[#004785] hover:bg-[#00386b] rounded-lg shadow-2xs"
								>
									<ExternalLink className="h-3 w-3 mr-1" />
									<span>Pasang ke Layar Utama</span>
								</Button>
							)}

							{onSyncNow && (
								<Button
									type="button"
									size="sm"
									variant="outline"
									onClick={onSyncNow}
									data-testid="warning-sync-now-button"
									className="h-7 px-2.5 text-[11px] font-semibold border-slate-300 text-slate-800 hover:bg-white rounded-lg shadow-2xs"
								>
									<RefreshCw className="h-3 w-3 mr-1" />
									<span>Sinkronkan Sekarang</span>
								</Button>
							)}
						</div>
					</div>
				</div>
			</div>

			{/* Modal Dialog Panduan iOS */}
			<IosInstallGuideModal
				open={isGuideModalOpen}
				onOpenChange={(open) => {
					if (!open) closeGuideModal();
				}}
			/>
		</>
	);
}
