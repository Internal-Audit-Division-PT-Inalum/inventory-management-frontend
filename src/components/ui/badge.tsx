import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
	"inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
	{
		variants: {
			variant: {
				default:
					"border-transparent bg-[#004785] text-white shadow-2xs hover:bg-[#00386b]",
				secondary:
					"border-transparent bg-slate-100 text-slate-800 hover:bg-slate-200",
				destructive:
					"border-transparent bg-red-600 text-white shadow-2xs hover:bg-red-700",
				outline: "border-slate-200 text-slate-700",
				// Inventory domain-specific status badges
				ok: "border-emerald-200/80 bg-emerald-50 text-emerald-700",
				warning: "border-amber-200/80 bg-amber-50 text-amber-700",
				critical: "border-red-200/80 bg-red-50 text-red-700",
				info: "border-blue-200/80 bg-blue-50 text-blue-700",
			},
		},
		defaultVariants: {
			variant: "default",
		},
	},
);

export interface BadgeProps
	extends React.HTMLAttributes<HTMLDivElement>,
		VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
	return (
		<div className={cn(badgeVariants({ variant }), className)} {...props} />
	);
}

export { Badge, badgeVariants };
