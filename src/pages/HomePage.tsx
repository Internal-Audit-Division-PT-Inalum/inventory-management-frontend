import {
	Boxes,
	ClipboardList,
	HandMetal,
	History,
	KeyRound,
	LogOut,
	ShieldCheck,
	User,
} from "lucide-react";
import * as React from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { LogoutConfirmDialog } from "@/features/auth/components/LogoutConfirmDialog";
import { useLogout } from "@/features/auth/hooks/useLogout";
import {
	selectCurrentEmployee,
	useAuthStore,
} from "@/features/auth/store/authStore";

export function HomePage() {
	const employee = useAuthStore(selectCurrentEmployee);
	const {
		isChecking,
		isLoggingOut,
		showWarningDialog,
		pendingCount,
		requestLogout,
		cancelLogout,
		confirmLogout,
	} = useLogout();

	const [isOnline, setIsOnline] = React.useState(
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
		<div className="flex min-h-screen flex-col bg-slate-50 text-slate-900 pt-safe pb-safe">
			{/* Header Mobile Brand */}
			<header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur-md">
				<div className="flex items-center gap-2.5">
					<div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#004785] text-xs font-bold text-white shadow-xs">
						IIA
					</div>
					<div>
						<h1 className="text-sm font-bold leading-tight tracking-tight text-slate-900">
							INVENTORY SYSTEM
						</h1>
						<p className="text-[10px] font-medium tracking-wider text-slate-500 uppercase">
							Internal Audit PT INALUM
						</p>
					</div>
				</div>

				<div className="flex items-center gap-2">
					<div
						className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 border ${
							isOnline
								? "bg-emerald-50 border-emerald-200/60"
								: "bg-amber-50 border-amber-200/60"
						}`}
					>
						<span
							className={`h-1.5 w-1.5 rounded-full ${
								isOnline ? "bg-emerald-500 animate-pulse" : "bg-amber-500"
							}`}
						/>
						<span
							className={`text-[10px] font-semibold ${
								isOnline ? "text-emerald-700" : "text-amber-700"
							}`}
						>
							{isOnline ? "Online" : "Offline"}
						</span>
					</div>
				</div>
			</header>

			{/* Main Content Area */}
			<main className="mx-auto flex w-full max-w-md flex-1 flex-col p-4 sm:p-6">
				{/* Employee Welcome Card */}
				{employee && (
					<Card className="mb-4 border-slate-200/80 bg-white shadow-xs">
						<CardContent className="flex items-center justify-between p-4">
							<div className="flex items-center gap-3">
								<div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-[#004785]">
									<User className="h-5 w-5" />
								</div>
								<div>
									<h2 className="text-sm font-bold text-slate-900">
										{employee.name}
									</h2>
									<p className="text-xs font-medium text-slate-500">
										Namecode:{" "}
										<span className="font-mono font-semibold text-[#004785]">
											{employee.namecode}
										</span>
									</p>
								</div>
							</div>
							<div className="flex items-center gap-1.5">
								<Link
									to="/change-pin"
									aria-label="Ubah PIN"
									className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition-colors hover:bg-slate-100"
									title="Ubah PIN Keamanan"
								>
									<KeyRound className="h-4 w-4" />
								</Link>
								<button
									type="button"
									onClick={() => requestLogout()}
									disabled={isChecking || isLoggingOut}
									aria-label="Keluar"
									className="flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
									title="Keluar Akun"
								>
									<LogOut className="h-4 w-4" />
								</button>
							</div>
						</CardContent>
					</Card>
				)}

				{/* Foundation Status Card (P0 & P1 Status) */}
				<div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-xs">
					<div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border border-blue-100 bg-blue-50 text-[#004785] shadow-xs">
						<ShieldCheck className="h-7 w-7" />
					</div>

					<h2 className="mb-1 text-base font-bold text-slate-800">
						PWA Mobile Inventory Foundation
					</h2>
					<p className="mx-auto mb-4 max-w-xs text-xs text-slate-500">
						Sistem Autentikasi Pegawai & Sesi Offline PWA Divisi Internal Audit
						PT INALUM telah aktif.
					</p>

					<div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3.5 text-left text-xs">
						<div className="mb-2 flex items-center justify-between font-semibold text-slate-700">
							<span>Status Progres:</span>
							<Badge variant="default" className="text-[10px]">
								Inisialisasi Fondasi
							</Badge>
						</div>
						<div className="space-y-1.5 text-[11px] text-slate-600">
							<div className="flex items-center gap-2">
								<span className="font-bold text-emerald-600">✓</span> Fondasi
								PWA, Design System & Dexie DB (Fase P0)
							</div>
							<div className="flex items-center gap-2">
								<span className="font-bold text-emerald-600">✓</span>{" "}
								Autentikasi Pegawai, PIN & Route Guards (Fase P1)
							</div>
							<div className="flex items-center gap-2">
								<span className="font-bold text-blue-600">⏳</span> Katalog &
								Pencarian Barang (Fase P2)
							</div>
						</div>
					</div>
				</div>

				{/* Quick Actions Grid Preview */}
				<div className="grid grid-cols-2 gap-3">
					<div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white/60 p-4 text-center transition-all hover:bg-white hover:shadow-xs">
						<div className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
							<Boxes className="h-4 w-4" />
						</div>
						<span className="text-xs font-semibold text-slate-800">
							Katalog
						</span>
						<span className="text-[10px] text-slate-400">Siap di Fase P2</span>
					</div>

					<div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white/60 p-4 text-center transition-all hover:bg-white hover:shadow-xs">
						<div className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
							<HandMetal className="h-4 w-4" />
						</div>
						<span className="text-xs font-semibold text-slate-800">
							Ambil Barang
						</span>
						<span className="text-[10px] text-slate-400">Siap di Fase P3</span>
					</div>

					<div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white/60 p-4 text-center transition-all hover:bg-white hover:shadow-xs">
						<div className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
							<ClipboardList className="h-4 w-4" />
						</div>
						<span className="text-xs font-semibold text-slate-800">
							Pinjaman Saya
						</span>
						<span className="text-[10px] text-slate-400">Siap di Fase P4</span>
					</div>

					<div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white/60 p-4 text-center transition-all hover:bg-white hover:shadow-xs">
						<div className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
							<History className="h-4 w-4" />
						</div>
						<span className="text-xs font-semibold text-slate-800">
							Riwayat Transaksi
						</span>
						<span className="text-[10px] text-slate-400">Siap di Fase P3</span>
					</div>
				</div>
			</main>

			{/* Mobile Footer */}
			<footer className="border-t border-slate-200 bg-white py-3 text-center text-[10px] text-slate-400">
				PT Indonesia Asahan Aluminium © 2026 — Internal Audit Division
			</footer>

			{/* Dialog Konfirmasi Logout bila Ada Antrean Offline */}
			<LogoutConfirmDialog
				open={showWarningDialog}
				onOpenChange={cancelLogout}
				pendingCount={pendingCount}
				onConfirm={confirmLogout}
				isPending={isLoggingOut}
			/>
		</div>
	);
}

export default HomePage;
