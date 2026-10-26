import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps
	extends React.InputHTMLAttributes<HTMLInputElement> {
	error?: boolean;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
	({ className, type = "text", error, ...props }, ref) => {
		return (
			<input
				type={type}
				className={cn(
					"flex min-h-[44px] w-full rounded-xl border bg-white px-3.5 py-2 text-sm text-slate-900 transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50",
					error
						? "border-red-500 focus-visible:border-red-500 focus-visible:ring-red-500/20"
						: "border-slate-200 hover:border-slate-300 focus-visible:border-[#004785] focus-visible:ring-[#004785]/20",
					className,
				)}
				ref={ref}
				{...props}
			/>
		);
	},
);
Input.displayName = "Input";

export { Input };
