import { Card, CardContent } from "@/components/ui/card";

export function LoanCardSkeleton() {
	return (
		<Card className="border-slate-200/80 bg-white shadow-xs animate-pulse">
			<CardContent className="p-4 sm:p-5">
				<div className="flex items-start gap-3.5">
					<div className="h-14 w-14 shrink-0 rounded-xl bg-slate-200" />
					<div className="flex-1 min-w-0 space-y-2">
						<div className="flex items-center justify-between gap-2">
							<div className="h-4 w-20 rounded-md bg-slate-200" />
							<div className="h-5 w-16 rounded-full bg-slate-200" />
						</div>
						<div className="h-5 w-44 rounded-md bg-slate-200" />
						<div className="h-3.5 w-32 rounded-md bg-slate-100" />
					</div>
				</div>

				<div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
					<div className="h-4 w-28 rounded-md bg-slate-100" />
					<div className="h-8 w-24 rounded-lg bg-slate-200" />
				</div>
			</CardContent>
		</Card>
	);
}
