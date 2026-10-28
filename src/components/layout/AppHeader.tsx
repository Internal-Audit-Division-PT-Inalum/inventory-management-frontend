import { User } from "lucide-react";
import * as React from "react";
import { Link } from "react-router-dom";
import {
	selectCurrentEmployee,
	useAuthStore,
} from "@/features/auth/store/authStore";
import { cn } from "@/lib/utils";

export interface AppHeaderProps {
	title?: string;
	subtitle?: string;
	showNetworkStatus?: boolean;
	showEmployeeBadge?: boolean;
	rightAction?: React.ReactNode;
	className?: string;
}

/**
 * Header Aplikasi Mobile PWA Inventaris PT INALUM:
 * - Menampilkan identitas korporat Divisi Internal Audit
 * - Indikator status jaringan real-time (Online/Offline)
 * - Badge Namecode pegawai terautentikasi dengan akses cepat ke Profil
 */
export function AppHeader({
	title = "INVENTORY SYSTEM",
	subtitle = "Internal Audit PT INALUM",
	showNetworkStatus = true,
	showEmployeeBadge = true,
	rightAction,
	className,
}: AppHeaderProps) {
	const employee = useAuthStore(selectCurrentEmployee);

	const [isOnline, setIsOnline] = React.useState<boolean>(
		typeof navigator !== "undefined" ? navigator.onLine : true,
	);

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

	return (
		<header
			className={cn(
				"sticky top-0 z-30 flex h-14 w-full items-center justify-between border-b border-slate-200/80 bg-white/95 px-4 backdrop-blur-md pt-safe transition-all",
				className,
			)}
		>
			<div className="flex items-center gap-2.5 min-w-0">
				<Link
					to="/"
					className="flex items-center gap-2.5 select-none transition-transform active:scale-95"
					aria-label="Beranda Inventaris"
				>
					<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#004785] text-xs font-bold text-white shadow-xs">
						IIA
					</div>
					<div className="min-w-0">
						<h1 className="text-sm font-bold leading-tight tracking-tight text-slate-900 truncate">
							{title}
						</h1>
						<p className="text-[10px] font-medium tracking-wider text-slate-500 uppercase truncate">
							{subtitle}
						</p>
					</div>
				</Link>
			</div>

			<div className="flex items-center gap-2 shrink-0">
				{rightAction}

				{showNetworkStatus && (
					<div
						className={cn(
							"flex items-center gap-1.5 rounded-full px-2.5 py-0.5 border text-[11px] font-semibold transition-colors",
							isOnline
								? "bg-emerald-50 border-emerald-200/70 text-emerald-800"
								: "bg-amber-50 border-amber-200/70 text-amber-800",
						)}
					>
						<span
							className={cn(
								"h-2 w-2 rounded-full",
								isOnline ? "bg-emerald-500 animate-pulse" : "bg-amber-500",
							)}
						/>
						<span>{isOnline ? "Online" : "Offline"}</span>
					</div>
				)}

				{showEmployeeBadge && employee && (
					<Link
						to="/profile"
						aria-label={`Profil ${employee.name} (${employee.namecode})`}
						title={`Profil ${employee.name}`}
						className="flex items-center gap-1 rounded-full border border-blue-200/80 bg-blue-50/80 px-2 py-0.5 text-xs font-semibold text-[#004785] transition-all hover:bg-blue-100/70 active:scale-95"
					>
						<User className="h-3.5 w-3.5 text-[#004785]" />
						<span className="font-mono">{employee.namecode}</span>
					</Link>
				)}
			</div>
		</header>
	);
}
