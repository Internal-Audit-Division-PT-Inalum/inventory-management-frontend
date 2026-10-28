import { ClipboardList, Clock, Package, User } from "lucide-react";
import * as React from "react";
import { NavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { usePendingOutboxCount } from "./usePendingOutboxCount";

export interface BottomNavProps {
	className?: string;
}

interface NavItemConfig {
	to: string;
	label: string;
	icon: React.ComponentType<{ className?: string }>;
	isActiveRoute: (pathname: string) => boolean;
	testId: string;
	showBadge?: boolean;
}

/**
 * Bottom Navigation Bar untuk Mobile PWA Inventaris:
 * - Mengakomodasi 4 navigasi utama: Katalog, Pinjaman, Antrean Offline, Profil.
 * - Indikator badge dinamis untuk antrean outbox transaksi offline yang belum tersinkronisasi.
 * - Optimalisasi safe-area-inset-bottom untuk perangkat iPhone & Android modern.
 */
export function BottomNav({ className }: BottomNavProps) {
	const location = useLocation();
	const pendingOutboxCount = usePendingOutboxCount();

	const navItems: NavItemConfig[] = React.useMemo(
		() => [
			{
				to: "/",
				label: "Katalog",
				icon: Package,
				isActiveRoute: (path: string) =>
					path === "/" ||
					path.startsWith("/catalog") ||
					path.startsWith("/location"),
				testId: "bottom-nav-catalog",
			},
			{
				to: "/loans",
				label: "Pinjaman",
				icon: ClipboardList,
				isActiveRoute: (path: string) => path.startsWith("/loans"),
				testId: "bottom-nav-loans",
			},
			{
				to: "/outbox",
				label: "Antrean",
				icon: Clock,
				isActiveRoute: (path: string) => path.startsWith("/outbox"),
				testId: "bottom-nav-outbox",
				showBadge: true,
			},
			{
				to: "/profile",
				label: "Profil",
				icon: User,
				isActiveRoute: (path: string) => path.startsWith("/profile"),
				testId: "bottom-nav-profile",
			},
		],
		[],
	);

	return (
		<nav
			aria-label="Navigasi Bawah Aplikasi"
			className={cn(
				"fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200/80 shadow-[0_-4px_12px_rgba(0,0,0,0.03)]",
				"pb-[max(0.35rem,env(safe-area-inset-bottom,0px))] transition-all",
				className,
			)}
		>
			<div
				role="tablist"
				className="mx-auto flex h-14 max-w-md items-center justify-around px-2"
			>
				{navItems.map((item) => {
					const isActive = item.isActiveRoute(location.pathname);
					const Icon = item.icon;

					return (
						<NavLink
							key={item.to}
							to={item.to}
							role="tab"
							aria-selected={isActive}
							aria-label={item.label}
							data-testid={item.testId}
							className={cn(
								"group flex flex-1 flex-col items-center justify-center py-1 px-1 rounded-xl transition-all duration-150 select-none touch-target min-h-[48px]",
								isActive
									? "text-[#004785] font-semibold"
									: "text-slate-500 hover:text-slate-900 active:scale-95",
							)}
						>
							<div
								className={cn(
									"relative flex items-center justify-center h-7 w-12 rounded-full transition-all",
									isActive
										? "bg-blue-50 text-[#004785]"
										: "text-slate-500 group-hover:bg-slate-100",
								)}
							>
								<Icon className="h-5 w-5 transition-transform" />

								{item.showBadge && pendingOutboxCount > 0 && (
									<span
										role="status"
										data-testid="outbox-badge-count"
										className="absolute -top-1 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[9px] font-bold text-white shadow-xs animate-pulse"
										aria-label={`${pendingOutboxCount} antrean transaksi tertunda`}
									>
										{pendingOutboxCount > 99 ? "99+" : pendingOutboxCount}
									</span>
								)}
							</div>

							<span
								className={cn(
									"text-[10px] tracking-tight mt-0.5 leading-none transition-colors",
									isActive ? "font-bold text-[#004785]" : "text-slate-500",
								)}
							>
								{item.label}
							</span>
						</NavLink>
					);
				})}
			</div>
		</nav>
	);
}
