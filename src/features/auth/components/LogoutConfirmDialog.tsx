import { AlertTriangle, Loader2 } from "lucide-react";
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

interface LogoutConfirmDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	pendingCount: number;
	onConfirm: () => void;
	isPending?: boolean;
}

export function LogoutConfirmDialog({
	open,
	onOpenChange,
	pendingCount,
	onConfirm,
	isPending = false,
}: LogoutConfirmDialogProps) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent onClose={() => onOpenChange(false)}>
				<DialogHeader>
					<div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 ring-1 ring-amber-200 sm:mx-0">
						<AlertTriangle className="h-6 w-6" />
					</div>
					<div className="flex items-center justify-between">
						<DialogTitle className="text-base font-bold text-slate-900">
							Transaksi Belum Tersinkronisasi
						</DialogTitle>
						<Badge variant="warning" className="text-[10px] font-semibold">
							{pendingCount} Antrean
						</Badge>
					</div>
					<DialogDescription className="mt-2 text-xs leading-relaxed text-slate-600">
						Terdapat{" "}
						<strong className="text-slate-900">
							{pendingCount} transaksi offline
						</strong>{" "}
						pada perangkat ini yang belum tersinkronisasi ke server pusat.
					</DialogDescription>
				</DialogHeader>

				<div className="rounded-xl border border-amber-200/80 bg-amber-50/70 p-3.5 text-xs text-amber-900">
					<p className="font-semibold">Keamanan Data Terjamin:</p>
					<p className="mt-0.5 text-[11px] leading-relaxed text-amber-800">
						Data transaksi Anda{" "}
						<span className="font-semibold underline">tidak akan hilang</span>{" "}
						dan tetap tersimpan aman di memori lokal ponsel ini. Transaksi akan
						otomatis diproses saat Anda masuk kembali.
					</p>
				</div>

				<DialogFooter>
					<Button
						type="button"
						variant="outline"
						size="touch"
						onClick={() => onOpenChange(false)}
						disabled={isPending}
						className="w-full sm:w-auto"
					>
						Batal
					</Button>
					<Button
						type="button"
						variant="destructive"
						size="touch"
						onClick={onConfirm}
						disabled={isPending}
						className="w-full sm:w-auto"
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
