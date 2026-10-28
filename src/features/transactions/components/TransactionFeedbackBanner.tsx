import { AlertTriangle, CheckCircle2, Clock, KeyRound, X } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";
import {
	formatTransactionFeedback,
	type TransactionFeedbackDetails,
} from "../lib/feedbackHelper";
import type { TransactSubmitResult } from "../types";

export interface TransactionFeedbackBannerProps {
	result: TransactSubmitResult | null;
	onDismiss?: () => void;
	className?: string;
	autoDismissMs?: number;
}

export function TransactionFeedbackBanner({
	result,
	onDismiss,
	className,
	autoDismissMs = 5000,
}: TransactionFeedbackBannerProps) {
	React.useEffect(() => {
		if (!result || !onDismiss || autoDismissMs <= 0) return;

		const timer = setTimeout(() => {
			onDismiss();
		}, autoDismissMs);

		return () => clearTimeout(timer);
	}, [result, onDismiss, autoDismissMs]);

	if (!result) return null;

	const feedback: TransactionFeedbackDetails =
		formatTransactionFeedback(result);

	const renderIcon = () => {
		switch (feedback.kind) {
			case "synced":
				return <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />;
			case "recorded_pending":
				return <Clock className="h-4 w-4 text-amber-600 shrink-0" />;
			case "auth_required":
				return <KeyRound className="h-4 w-4 text-blue-600 shrink-0" />;
			default:
				return <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />;
		}
	};

	return (
		<div
			data-testid="transaction-feedback-banner"
			role="alert"
			className={cn(
				"relative flex items-start justify-between gap-3 rounded-2xl border p-3.5 shadow-sm transition-all duration-300 animate-in fade-in slide-in-from-top-2",
				feedback.colorScheme.bg,
				feedback.colorScheme.border,
				className,
			)}
		>
			<div className="flex items-start gap-2.5 min-w-0">
				<div className="mt-0.5">{renderIcon()}</div>
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-1.5 flex-wrap">
						<span
							data-testid="feedback-badge"
							className={cn(
								"inline-flex items-center px-2 py-0.2 rounded-full text-[10px] font-bold tracking-wide uppercase",
								feedback.colorScheme.badgeBg,
								feedback.colorScheme.badgeText,
							)}
						>
							{feedback.badgeLabel}
						</span>
						<span className="text-xs font-bold text-slate-900">
							{feedback.title}
						</span>
					</div>
					<p
						className={cn(
							"text-xs leading-relaxed mt-1 font-medium",
							feedback.colorScheme.text,
						)}
					>
						{feedback.message}
					</p>
				</div>
			</div>

			{onDismiss && (
				<button
					type="button"
					onClick={onDismiss}
					aria-label="Tutup notifikasi"
					className="rounded-lg p-1 text-slate-500 hover:bg-black/5 hover:text-slate-800 transition-all shrink-0 -mr-1 -mt-1 touch-target"
				>
					<X className="h-4 w-4" />
				</button>
			)}
		</div>
	);
}
