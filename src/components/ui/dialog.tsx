import { X } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

interface DialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	children: React.ReactNode;
}

function Dialog({ open, onOpenChange, children }: DialogProps) {
	React.useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape" && open) {
				onOpenChange(false);
			}
		};

		if (open) {
			document.body.style.overflow = "hidden";
			window.addEventListener("keydown", handleKeyDown);
		} else {
			document.body.style.overflow = "unset";
		}

		return () => {
			document.body.style.overflow = "unset";
			window.removeEventListener("keydown", handleKeyDown);
		};
	}, [open, onOpenChange]);

	if (!open) return null;

	return (
		<div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
			{/* Backdrop */}
			<div
				className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity"
				onClick={() => onOpenChange(false)}
				aria-hidden="true"
			/>
			{/* Dialog Container */}
			<div className="relative z-50 w-full sm:max-w-lg">{children}</div>
		</div>
	);
}

const DialogContent = React.forwardRef<
	HTMLDivElement,
	React.HTMLAttributes<HTMLDivElement> & { onClose?: () => void }
>(({ className, children, onClose, ...props }, ref) => (
	<div
		ref={ref}
		role="dialog"
		aria-modal="true"
		className={cn(
			"relative w-full rounded-t-3xl sm:rounded-2xl border border-slate-200 bg-white p-6 shadow-xl max-h-[90dvh] overflow-y-auto pb-safe sm:pb-6 animate-in slide-in-from-bottom duration-250",
			className,
		)}
		{...props}
	>
		{onClose && (
			<button
				type="button"
				onClick={onClose}
				className="absolute right-4 top-4 rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
				aria-label="Tutup Dialog"
			>
				<X className="h-5 w-5" />
			</button>
		)}
		{children}
	</div>
));
DialogContent.displayName = "DialogContent";

const DialogHeader = ({
	className,
	...props
}: React.HTMLAttributes<HTMLDivElement>) => (
	<div
		className={cn(
			"flex flex-col space-y-1.5 text-center sm:text-left mb-4",
			className,
		)}
		{...props}
	/>
);
DialogHeader.displayName = "DialogHeader";

const DialogTitle = React.forwardRef<
	HTMLHeadingElement,
	React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
	<h2
		ref={ref}
		className={cn(
			"text-lg font-bold leading-none tracking-tight text-slate-900",
			className,
		)}
		{...props}
	/>
));
DialogTitle.displayName = "DialogTitle";

const DialogDescription = React.forwardRef<
	HTMLParagraphElement,
	React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
	<p
		ref={ref}
		className={cn("text-xs text-slate-500 leading-normal", className)}
		{...props}
	/>
));
DialogDescription.displayName = "DialogDescription";

const DialogFooter = ({
	className,
	...props
}: React.HTMLAttributes<HTMLDivElement>) => (
	<div
		className={cn(
			"flex flex-col-reverse sm:flex-row sm:justify-end gap-2 mt-6",
			className,
		)}
		{...props}
	/>
);
DialogFooter.displayName = "DialogFooter";

export {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
};
