import {
	AlertTriangle,
	Database,
	Loader2,
	RefreshCw,
	User,
	Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import type { Employee } from "@/types/api";

export interface LogoutConfirmDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** Jumlah antrean tertunda (mendukung backward compatibility) */
	pendingCount?: number;
	myPendingCount?: number;
	otherPendingCount?: number;
	employee?: Employee | null;
	onConfirm: () => void;
	onSyncBeforeLogout?: () => Promise<boolean | undefined>;
	isPending?: boolean;
	isSyncing?: boolean;
}

/**
 * Dialog konfirmasi logout final terpadu dengan penegakan isolasi antrean per employeeId (Task P5.11):
 * - Memberi peringatan jelas jika akun aktif memiliki transaksi offline yang belum tersinkronisasi.
 * - Menampilkan rincian identitas akun auditor (Namecode & Nama).
 * - Menjelaskan jaminan integritas Zero Data Loss (antrean tetap tersimpan aman di IndexedDB dan terikat akun).
 * - Menyediakan aksi "Sinkronkan Sekarang" jika perangkat terhubung ke internet.
 */
export function LogoutConfirmDialog({
	open,
	onOpenChange,
	pendingCount,
	myPendingCount,
	otherPendingCount = 0,
	employee,
	onConfirm,
	onSyncBeforeLogout,
	isPending = false,
	isSyncing = false,
}: LogoutConfirmDialogProps) {
	const activeCount =
		myPendingCount && myPendingCount > 0
			? myPendingCount
			: (pendingCount ?? (otherPendingCount > 0 ? otherPendingCount : 0));

	const [isOnline, setIsOnline] = useState<boolean>(
		typeof navigator !== "undefined" ? navigator.onLine : true,
	);

	useEffect(() => {
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
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				className="sm:max-w-md"
				onClose={() => !isPending && !isSyncing && onOpenChange(false)}
			>
				<DialogHeader>
					<div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 ring-1 ring-amber-200 sm:mx-0">
						<AlertTriangle className="h-6 w-6" />
					</div>
					<div className="flex items-center justify-between gap-2">
						<DialogTitle className="text-base font-bold text-slate-900">
							Transaksi Belum Tersinkronisasi
						</DialogTitle>
						<Badge
							variant="warning"
							className="text-[10px] font-semibold shrink-0"
						>
							{activeCount} Antrean
						</Badge>
					</div>
					<DialogDescription className="mt-1 text-xs leading-relaxed text-slate-600">
						Terdapat{" "}
						<strong className="text-slate-900 font-bold">
							{activeCount} transaksi offline
						</strong>{" "}
						pada perangkat ini yang belum tersinkronisasi ke server pusat
						INALUM.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-2.5 my-1 text-xs">
					{/* Kartu Identitas Akun Auditor */}
					{employee && (
						<div className="flex items-center gap-2.5 rounded-xl border border-slate-200/80 bg-slate-50 p-2.5">
							<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-[#004785]">
								<User className="h-4 w-4" />
							</div>
							<div className="min-w-0 flex-1">
								<p className="font-bold text-slate-900 truncate">
									{employee.name}
								</p>
								<p className="text-[10px] text-slate-500 font-mono">
									Namecode: <strong>{employee.namecode}</strong>
								</p>
							</div>
						</div>
					)}

					{/* Penjelasan Keamanan & Isolasi Data Akun (Zero Data Loss) */}
					<div className="rounded-xl border border-amber-200/80 bg-amber-50/70 p-3 text-amber-900 space-y-1">
						<div className="flex items-center gap-1.5 font-bold text-[11px]">
							<Database className="h-3.5 w-3.5 text-amber-700" />
							<span>Keamanan Data Terjamin (Isolasi Akun):</span>
						</div>
						<p className="text-[11px] leading-relaxed text-amber-800">
							Transaksi Anda{" "}
							<span className="font-semibold underline">tidak akan hilang</span>{" "}
							dan tetap tersimpan aman di memori lokal ponsel ini. Antrean
							terisolasi khusus untuk akun Anda dan tidak dapat diunggah oleh
							pegawai lain yang masuk ke perangkat ini.
						</p>
					</div>

					{/* Catatan Jika Ada Antrean Milik Pegawai Lain */}
					{otherPendingCount > 0 && (
						<div className="flex items-start gap-2 rounded-xl border border-blue-100 bg-blue-50/60 p-2.5 text-[11px] text-blue-900">
							<Users className="h-3.5 w-3.5 text-[#004785] shrink-0 mt-0.5" />
							<span>
								Catatan: Terdapat juga{" "}
								<strong>{otherPendingCount} transaksi offline</strong> milik
								akun lain yang tetap tersimpan aman di perangkat ini.
							</span>
						</div>
					)}
				</div>

				<DialogFooter className="mt-4 flex flex-col-reverse sm:flex-row gap-2">
					<Button
						type="button"
						variant="outline"
						size="touch"
						onClick={() => onOpenChange(false)}
						disabled={isPending || isSyncing}
						className="w-full sm:w-auto"
					>
						Batal
					</Button>

					{onSyncBeforeLogout && isOnline && (
						<Button
							type="button"
							variant="default"
							size="touch"
							onClick={() => void onSyncBeforeLogout()}
							disabled={isPending || isSyncing}
							className="w-full sm:w-auto bg-[#004785] hover:bg-[#00386b]"
							data-testid="sync-before-logout-button"
						>
							{isSyncing ? (
								<>
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									Menyinkronkan...
								</>
							) : (
								<>
									<RefreshCw className="mr-2 h-4 w-4" />
									Sinkronkan Sekarang
								</>
							)}
						</Button>
					)}

					<Button
						type="button"
						variant="destructive"
						size="touch"
						onClick={onConfirm}
						disabled={isPending || isSyncing}
						className="w-full sm:w-auto"
						data-testid="confirm-logout-button"
					>
						{isPending ? (
							<>
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								Memproses Keluar...
							</>
						) : (
							"Tetap Keluar"
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

export default LogoutConfirmDialog;
