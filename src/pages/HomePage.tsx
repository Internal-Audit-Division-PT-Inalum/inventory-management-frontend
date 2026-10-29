import { KeyRound, LogOut, ShieldCheck, User } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { LogoutConfirmDialog } from "@/features/auth/components/LogoutConfirmDialog";
import { useLogout } from "@/features/auth/hooks/useLogout";
import {
	selectCurrentEmployee,
	useAuthStore,
} from "@/features/auth/store/authStore";
import { CatalogView } from "@/features/catalog/components/CatalogView";

export function HomePage() {
	const employee = useAuthStore(selectCurrentEmployee);
	const {
		isChecking,
		isLoggingOut,
		isSyncingBeforeLogout,
		showWarningDialog,
		myPendingCount,
		otherPendingCount,
		requestLogout,
		cancelLogout,
		confirmLogout,
		syncBeforeLogout,
	} = useLogout();

	return (
		<div className="flex flex-col gap-4">
			{employee && (
				<Card className="border-slate-200/80 bg-white shadow-xs">
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

			<div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
				<div className="flex items-center gap-3">
					<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-blue-100 bg-blue-50 text-[#004785] shadow-xs">
						<ShieldCheck className="h-5 w-5" />
					</div>
					<div className="min-w-0 flex-1">
						<h2 className="text-xs font-bold text-slate-800 leading-tight">
							PWA Mobile Inventory Foundation
						</h2>
						<p className="text-[11px] text-slate-500 mt-0.5">
							Sistem Autentikasi Pegawai & Sesi Offline PWA Aktif.
						</p>
					</div>
					<Badge variant="default" className="text-[10px] shrink-0">
						Inisialisasi Fondasi
					</Badge>
				</div>
			</div>

			<section aria-label="Katalog Inventaris">
				<CatalogView />
			</section>

			<LogoutConfirmDialog
				open={showWarningDialog}
				onOpenChange={cancelLogout}
				employee={employee}
				myPendingCount={myPendingCount}
				otherPendingCount={otherPendingCount}
				onConfirm={confirmLogout}
				onSyncBeforeLogout={syncBeforeLogout}
				isPending={isLoggingOut}
				isSyncing={isSyncingBeforeLogout}
			/>
		</div>
	);
}

export default HomePage;
