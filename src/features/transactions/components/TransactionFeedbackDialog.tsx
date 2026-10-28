import {
	AlertTriangle,
	ArrowRight,
	CheckCircle2,
	Clock,
	Copy,
	FileText,
	KeyRound,
	Package,
} from "lucide-react";
import * as React from "react";
import { useNavigate } from "react-router-dom";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { formatWib } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { Item } from "@/types/api";
import {
	formatTransactionFeedback,
	type TransactionFeedbackDetails,
} from "../lib/feedbackHelper";
import type { TransactSubmitResult } from "../types";

export interface TransactionFeedbackDialogProps {
	result: TransactSubmitResult | null;
	item?: Item | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	className?: string;
}

export function TransactionFeedbackDialog({
	result,
	item,
	open,
	onOpenChange,
	className,
}: TransactionFeedbackDialogProps) {
	const navigate = useNavigate();
	const [copiedUuid, setCopiedUuid] = React.useState(false);

	if (!result) return null;

	const feedback: TransactionFeedbackDetails =
		formatTransactionFeedback(result);
	const outbox = result.outboxItem;
	const timestamp = outbox.occurredAt || new Date().toISOString();

	const handleCopyUuid = async () => {
		try {
			if (navigator.clipboard) {
				await navigator.clipboard.writeText(outbox.clientUuid);
				setCopiedUuid(true);
				setTimeout(() => setCopiedUuid(false), 2000);
			}
		} catch {
			// Fallback silent fail
		}
	};

	const handleViewOutbox = () => {
		onOpenChange(false);
		navigate("/outbox");
	};

	// Ikon semantik berdasarkan kind
	const renderStatusIcon = () => {
		switch (feedback.kind) {
			case "synced":
				return (
					<div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600 shadow-xs ring-8 ring-emerald-50">
						<CheckCircle2 className="h-8 w-8 stroke-[2.25]" />
					</div>
				);
			case "recorded_pending":
				return (
					<div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-600 shadow-xs ring-8 ring-amber-50">
						<Clock className="h-8 w-8 stroke-[2.25]" />
					</div>
				);
			case "auth_required":
				return (
					<div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-100 text-blue-600 shadow-xs ring-8 ring-blue-50">
						<KeyRound className="h-8 w-8 stroke-[2.25]" />
					</div>
				);
			default:
				return (
					<div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-100 text-rose-600 shadow-xs ring-8 ring-rose-50">
						<AlertTriangle className="h-8 w-8 stroke-[2.25]" />
					</div>
				);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				onClose={() => onOpenChange(false)}
				data-testid="transaction-feedback-dialog"
				className={cn(
					"sm:max-w-md p-6 text-center flex flex-col items-center",
					className,
				)}
			>
				<DialogHeader className="items-center text-center w-full">
					<div className="mb-3 flex justify-center">{renderStatusIcon()}</div>

					<div className="flex items-center justify-center gap-1.5 mb-1.5">
						<span
							data-testid="feedback-badge"
							className={cn(
								"inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider",
								feedback.colorScheme.badgeBg,
								feedback.colorScheme.badgeText,
							)}
						>
							{feedback.badgeLabel}
						</span>
					</div>

					<DialogTitle className="text-xl font-extrabold text-slate-900 leading-tight">
						{feedback.title}
					</DialogTitle>

					<DialogDescription className="text-xs text-slate-600 mt-1 max-w-sm leading-relaxed">
						{feedback.message}
					</DialogDescription>
				</DialogHeader>

				{feedback.subMessage && (
					<div
						className={cn(
							"w-full rounded-xl p-3 text-left text-xs my-3 border leading-relaxed",
							feedback.colorScheme.bg,
							feedback.colorScheme.border,
							feedback.colorScheme.text,
						)}
					>
						{feedback.subMessage}
					</div>
				)}

				<div className="w-full rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5 my-2 text-left flex flex-col gap-2.5">
					<div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
						<span>Ringkasan Transaksi</span>
						<span className="font-mono text-[10px] text-slate-400">
							{formatWib(timestamp)}
						</span>
					</div>

					<div className="flex items-center justify-between gap-2 border-b border-slate-200/80 pb-2">
						<div className="flex items-center gap-2 min-w-0">
							<Package className="h-4 w-4 text-[#004785] shrink-0" />
							<div className="min-w-0">
								<div className="text-xs font-bold text-slate-800 truncate">
									{item?.name || "Barang Inventaris"}
								</div>
								{item?.sku && (
									<div className="text-[10px] font-mono text-slate-500">
										SKU: {item.sku}
									</div>
								)}
							</div>
						</div>

						<div className="text-right shrink-0">
							<div className="text-xs font-extrabold text-slate-900">
								{outbox.quantity} {item?.unit || "unit"}
							</div>
							<div className="text-[10px] font-semibold text-[#004785]">
								{feedback.actionLabel}
							</div>
						</div>
					</div>

					{(outbox.referenceNumber || outbox.notes) && (
						<div className="flex flex-col gap-1 text-[11px] text-slate-600">
							{outbox.referenceNumber && (
								<div className="flex items-center gap-1 font-mono text-[#004785] text-[10px]">
									<FileText className="h-3 w-3" />
									<span>Ref: {outbox.referenceNumber}</span>
								</div>
							)}
							{outbox.notes && (
								<p className="italic text-slate-500">"{outbox.notes}"</p>
							)}
						</div>
					)}

					<div className="flex items-center justify-between pt-1 text-[10px] text-slate-400 border-t border-slate-200/60">
						<span className="font-mono truncate max-w-[200px]">
							ID: {outbox.clientUuid}
						</span>
						<button
							type="button"
							onClick={handleCopyUuid}
							aria-label="Salin Client UUID"
							className="inline-flex items-center gap-1 text-[#004785] hover:underline"
						>
							<Copy className="h-3 w-3" />
							<span>{copiedUuid ? "Tersalin" : "Salin ID"}</span>
						</button>
					</div>
				</div>

				<div className="mt-4 flex flex-col sm:flex-row w-full gap-2 pt-2 border-t border-slate-100">
					{feedback.kind === "recorded_pending" && (
						<button
							type="button"
							data-testid="btn-view-outbox"
							onClick={handleViewOutbox}
							className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-xs font-bold text-amber-900 hover:bg-amber-100 active:scale-98 transition-all touch-target"
						>
							<span>Lihat Antrean Outbox</span>
							<ArrowRight className="h-3.5 w-3.5" />
						</button>
					)}

					<button
						type="button"
						data-testid="btn-close-feedback"
						onClick={() => onOpenChange(false)}
						className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-[#004785] px-4 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-[#00386b] active:scale-98 transition-all touch-target"
					>
						<span>Selesai</span>
					</button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
