import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import type { EnrichedOutboxItem } from "../hooks/useOutboxQueue";

export interface DiscardConfirmDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	item: EnrichedOutboxItem | null;
	onConfirm: (clientUuid: string) => Promise<void> | void;
	isDeleting?: boolean;
}

const OPERATION_LABELS: Record<string, string> = {
	take: "Pengambilan Barang",
	add: "Penambahan Barang",
	borrow: "Peminjaman Aset",
	return: "Pengembalian Aset",
};

/**
 * Dialog konfirmasi aman sebelum membatalkan antrean transaksi outbox.
 * Memberi peringatan jelas bahwa stok lokal akan di-rollback ke kondisi sebelum transaksi.
 */
export function DiscardConfirmDialog({
	open,
	onOpenChange,
	item,
	onConfirm,
	isDeleting = false,
}: DiscardConfirmDialogProps) {
	if (!item) return null;

	const operationLabel = OPERATION_LABELS[item.operation] ?? item.operation;

	const handleConfirm = async () => {
		await onConfirm(item.clientUuid);
		onOpenChange(false);
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				className="sm:max-w-md"
				onClose={() => !isDeleting && onOpenChange(false)}
			>
				<DialogHeader>
					<div className="mx-auto sm:mx-0 mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-600 border border-red-100 shadow-2xs">
						<AlertTriangle className="h-6 w-6" />
					</div>
					<DialogTitle>Batalkan Transaksi & Hapus Antrean?</DialogTitle>
					<DialogDescription>
						Transaksi berikut akan dihapus dari antrean offline perangkat ini:
					</DialogDescription>
				</DialogHeader>

				<div className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-3.5 space-y-2 text-xs text-slate-700">
					<div className="flex justify-between items-center">
						<span className="text-slate-500 font-medium">Barang:</span>
						<span className="font-semibold text-slate-900 text-right">
							{item.itemName}
						</span>
					</div>
					<div className="flex justify-between items-center">
						<span className="text-slate-500 font-medium">Jenis Operasi:</span>
						<span className="font-medium text-slate-800">{operationLabel}</span>
					</div>
					<div className="flex justify-between items-center">
						<span className="text-slate-500 font-medium">Jumlah:</span>
						<span className="font-mono font-bold text-slate-900">
							{item.quantity} {item.itemUnit}
						</span>
					</div>
					<div className="flex justify-between items-center">
						<span className="text-slate-500 font-medium">Status Saat Ini:</span>
						<span className="font-medium uppercase tracking-wider text-red-700">
							{item.status}
						</span>
					</div>
				</div>

				<div className="mt-3 rounded-xl border border-amber-200/90 bg-amber-50/80 p-3 text-[11px] leading-relaxed text-amber-900">
					<p className="font-semibold mb-0.5">
						Penting (Rollback Stok Otomatis):
					</p>
					<p>
						Perubahan mutasi stok optimistik lokal di perangkat ini akan
						otomatis dikembalikan ke kondisi awal sebelum transaksi dilakukan.
					</p>
				</div>

				<DialogFooter className="mt-5 sm:space-x-2">
					<Button
						type="button"
						variant="outline"
						size="sm"
						disabled={isDeleting}
						onClick={() => onOpenChange(false)}
						className="w-full sm:w-auto"
					>
						Batal
					</Button>
					<Button
						type="button"
						variant="destructive"
						size="sm"
						disabled={isDeleting}
						onClick={handleConfirm}
						className="w-full sm:w-auto"
						data-testid="confirm-discard-button"
					>
						{isDeleting ? (
							<>
								<Loader2 className="h-4 w-4 animate-spin mr-1.5" />
								<span>Menghapus...</span>
							</>
						) : (
							<span>Ya, Batalkan & Rollback</span>
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
