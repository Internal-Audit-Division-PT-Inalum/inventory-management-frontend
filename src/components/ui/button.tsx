import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
	"inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-all duration-150 outline-none select-none active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-800/40",
	{
		variants: {
			variant: {
				default:
					"bg-[#004785] text-white shadow-sm hover:bg-[#00386b] active:bg-[#002f59]",
				teal: "bg-teal-600 text-white shadow-sm hover:bg-teal-700 active:bg-teal-800",
				secondary:
					"bg-slate-100 text-slate-800 hover:bg-slate-200/80 active:bg-slate-200",
				outline:
					"border border-slate-200 bg-white text-slate-800 hover:bg-slate-50 hover:border-slate-300 shadow-2xs",
				destructive:
					"bg-red-600 text-white shadow-sm hover:bg-red-700 active:bg-red-800",
				ghost: "text-slate-700 hover:bg-slate-100 hover:text-slate-900",
				link: "text-[#004785] underline-offset-4 hover:underline",
			},
			size: {
				default: "h-10 px-4 py-2",
				sm: "h-8 px-3 text-xs rounded-lg",
				lg: "h-12 px-6 text-base rounded-xl",
				touch: "min-h-[44px] px-5 py-2.5 text-sm rounded-xl",
				icon: "h-10 w-10",
				"icon-touch": "min-h-[44px] min-w-[44px]",
			},
		},
		defaultVariants: {
			variant: "default",
			size: "touch",
		},
	},
);

export interface ButtonProps
	extends React.ButtonHTMLAttributes<HTMLButtonElement>,
		VariantProps<typeof buttonVariants> {
	asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
	({ className, variant, size, type = "button", ...props }, ref) => {
		return (
			<button
				type={type}
				className={cn(buttonVariants({ variant, size, className }))}
				ref={ref}
				{...props}
			/>
		);
	},
);
Button.displayName = "Button";

export { Button, buttonVariants };
