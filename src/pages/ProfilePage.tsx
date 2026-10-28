import {
	Building2,
	Info,
	KeyRound,
	LogOut,
	Mail,
	Shield,
	User,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { LogoutConfirmDialog } from "@/features/auth/components/LogoutConfirmDialog";
import { useLogout } from "@/features/auth/hooks/useLogout";
import {
	selectCurrentEmployee,
	useAuthStore,
} from "@/features/auth/store/authStore";

export function ProfilePage() {
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

	return (
		<div className="flex flex-col gap-4">
			<div className="flex items-center justify-between">
				<div>
					<h2 className="text-lg font-bold text-slate-900">Profil Pegawai</h2>
					<p className="text-xs text-slate-500">
						Informasi akun & pengaturan keamanan sistem
					</p>
				</div>
			</div>

			{employee && (
				<Card className="border-slate-200/80 bg-white shadow-xs">
					<CardContent className="p-5">
						<div className="flex items-center gap-3.5 mb-4">
							<div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-[#004785] border border-blue-100 shadow-xs">
								<User className="h-6 w-6" />
							</div>
							<div className="min-w-0 flex-1">
								<h3 className="text-base font-bold text-slate-900 truncate">
									{employee.name}
								</h3>
								<div className="flex items-center gap-2 mt-0.5">
									<span className="inline-flex items-center rounded-md bg-[#004785]/10 px-2 py-0.5 font-mono text-xs font-bold text-[#004785]">
										{employee.namecode}
									</span>
									<span className="text-xs text-slate-500 capitalize">
										{employee.role}
									</span>
								</div>
							</div>
						</div>

						<div className="space-y-2.5 border-t border-slate-100 pt-3 text-xs text-slate-600">
							<div className="flex items-center gap-2.5">
								<Mail className="h-4 w-4 text-slate-400 shrink-0" />
								<span className="truncate">{employee.email}</span>
							</div>
							<div className="flex items-center gap-2.5">
								<Building2 className="h-4 w-4 text-slate-400 shrink-0" />
								<span>Divisi Internal Audit PT INALUM</span>
							</div>
							<div className="flex items-center gap-2.5">
								<Shield className="h-4 w-4 text-emerald-600 shrink-0" />
								<span className="text-emerald-700 font-medium">
									Akun Pegawai Terverifikasi & Aktif
								</span>
							</div>
						</div>
					</CardContent>
				</Card>
			)}

			<div className="space-y-2">
				<h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-1">
					Pengaturan Akun & Keamanan
				</h4>

				<Link
					to="/change-pin"
					className="flex items-center justify-between rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-xs transition-all hover:bg-slate-50 active:scale-98"
				>
					<div className="flex items-center gap-3">
						<div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-[#004785]">
							<KeyRound className="h-5 w-5" />
						</div>
						<div>
							<span className="text-xs font-bold text-slate-800 block">
								Ubah PIN Keamanan
							</span>
							<span className="text-[11px] text-slate-500">
								Perbarui 6 digit PIN numerik akun Anda
							</span>
						</div>
					</div>
					<span className="text-xs font-semibold text-[#004785]">Buka</span>
				</Link>

				<button
					type="button"
					onClick={() => requestLogout()}
					disabled={isChecking || isLoggingOut}
					aria-label="Keluar Akun"
					className="flex w-full items-center justify-between rounded-xl border border-red-200/80 bg-white p-3.5 shadow-xs transition-all hover:bg-red-50/60 active:scale-98 disabled:opacity-50"
				>
					<div className="flex items-center gap-3">
						<div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-50 text-red-600">
							<LogOut className="h-5 w-5" />
						</div>
						<div className="text-left">
							<span className="text-xs font-bold text-red-700 block">
								Keluar Akun (Logout)
							</span>
							<span className="text-[11px] text-slate-500">
								Keluar dari sesi perangkat ini secara aman
							</span>
						</div>
					</div>
					<span className="text-xs font-semibold text-red-600">
						{isChecking || isLoggingOut ? "Memeriksa..." : "Keluar"}
					</span>
				</button>
			</div>

			<Card className="border-slate-200/80 bg-white/70 shadow-xs">
				<CardContent className="p-3.5 flex items-center gap-2.5 text-xs text-slate-500">
					<Info className="h-4 w-4 shrink-0 text-slate-400" />
					<div className="text-[11px] leading-tight">
						<p className="font-semibold text-slate-700">
							Inventory System PWA v1.0.0
						</p>
						<p>Internal Audit PT Indonesia Asahan Aluminium © 2026</p>
					</div>
				</CardContent>
			</Card>

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

export default ProfilePage;
