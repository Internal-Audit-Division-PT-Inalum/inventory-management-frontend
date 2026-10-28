import {
	AlertCircle,
	CheckCircle2,
	Minus,
	Plus,
	RotateCcw,
} from "lucide-react";
import * as React from "react";
import { Input, Textarea } from "@/components/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	createReturnLoanSchema,
	type ReturnLoanFormData,
} from "../lib/returnLoanSchema";
import type { AssetLoan } from "../types";

export interface ReturnLoanDialogProps {
	loan: AssetLoan | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSubmit: (data: ReturnLoanFormData) => Promise<void> | void;
	isSubmitting?: boolean;
}

export function ReturnLoanDialog({
	loan,
	open,
	onOpenChange,
	onSubmit,
	isSubmitting = false,
}: ReturnLoanDialogProps) {
	const maxOutstanding = loan?.outstanding_quantity ?? 1;

	const [quantity, setQuantity] = React.useState(1);
	const [notes, setNotes] = React.useState("");
	const [referenceNumber, setReferenceNumber] = React.useState("");
	const [validationError, setValidationError] = React.useState<string | null>(
		null,
	);

	// Reset form setiap kali dialog dibuka dengan pinjaman baru
	React.useEffect(() => {
		if (open && loan) {
			setQuantity(1);
			setNotes("");
			setReferenceNumber("");
			setValidationError(null);
		}
	}, [open, loan]);

	if (!loan) return null;

	const remainingAfterReturn = Math.max(0, maxOutstanding - quantity);
	const isFullReturn = remainingAfterReturn === 0;

	function handleQuantityChange(nextQty: number) {
		const clamped = Math.max(1, Math.min(maxOutstanding, nextQty));
		setQuantity(clamped);
		setValidationError(null);
	}

	function handleSetAll() {
		setQuantity(maxOutstanding);
		setValidationError(null);
	}

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setValidationError(null);

		const schema = createReturnLoanSchema({ maxOutstanding });
		const result = schema.safeParse({
			quantity,
			notes,
			reference_number: referenceNumber,
		});

		if (!result.success) {
			const firstError =
				result.error.issues[0]?.message || "Data formulir tidak valid.";
			setValidationError(firstError);
			return;
		}

		try {
			await onSubmit(result.data);
		} catch (err) {
			const errorMsg =
				err instanceof Error
					? err.message
					: "Terjadi kesalahan saat memproses pengembalian.";
			setValidationError(errorMsg);
		}
	}

	const itemName = loan.item_name || loan.item?.name || "Barang Aset";
	const itemSku = loan.item_sku || loan.item?.sku || "SKU-AST";

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-md rounded-2xl p-5 sm:p-6 bg-white shadow-xl">
				<DialogHeader className="space-y-1.5 text-left">
					<div className="flex items-center justify-between gap-2">
						<span className="font-mono text-xs font-semibold text-slate-500 uppercase tracking-wider">
							{itemSku}
						</span>
						<Badge
							variant="outline"
							className="border-amber-200 bg-amber-50 text-amber-700 text-xs font-semibold"
						>
							Sisa: {maxOutstanding} Unit
						</Badge>
					</div>

					<DialogTitle className="text-base sm:text-lg font-bold text-slate-900 leading-snug">
						Kembalikan {itemName}
					</DialogTitle>
				</DialogHeader>

				<form onSubmit={handleSubmit} className="space-y-4 mt-2">
					{validationError && (
						<div
							data-testid="return-loan-error"
							className="rounded-xl border border-rose-200 bg-rose-50/80 p-3 flex items-start gap-2.5 text-xs text-rose-700"
						>
							<AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
							<div className="leading-relaxed flex-1">{validationError}</div>
						</div>
					)}

					<div className="space-y-2">
						<label
							htmlFor="quantity-input"
							className="text-xs font-semibold text-slate-700 flex items-center justify-between"
						>
							<span>Jumlah Pengembalian</span>
							<span className="text-[11px] font-normal text-slate-500">
								Maks. {maxOutstanding} unit
							</span>
						</label>

						<div className="flex items-center gap-2">
							<div className="flex items-center rounded-xl border border-slate-200 bg-slate-50/60 p-1 flex-1 shadow-2xs">
								<Button
									type="button"
									variant="ghost"
									size="icon"
									onClick={() => handleQuantityChange(quantity - 1)}
									disabled={quantity <= 1 || isSubmitting}
									className="h-11 w-11 rounded-lg text-slate-600 hover:bg-white hover:text-slate-900 disabled:opacity-30 active:scale-95"
									aria-label="Kurangi jumlah pengembalian"
								>
									<Minus className="h-4 w-4" />
								</Button>

								<Input
									id="quantity-input"
									type="number"
									min={1}
									max={maxOutstanding}
									value={quantity}
									onChange={(e) => handleQuantityChange(Number(e.target.value))}
									disabled={isSubmitting}
									className="h-11 flex-1 border-0 bg-transparent text-center font-bold text-base text-slate-900 focus-visible:ring-0 shadow-none"
								/>

								<Button
									type="button"
									variant="ghost"
									size="icon"
									onClick={() => handleQuantityChange(quantity + 1)}
									disabled={quantity >= maxOutstanding || isSubmitting}
									className="h-11 w-11 rounded-lg text-slate-600 hover:bg-white hover:text-slate-900 disabled:opacity-30 active:scale-95"
									aria-label="Tambah jumlah pengembalian"
								>
									<Plus className="h-4 w-4" />
								</Button>
							</div>

							{maxOutstanding > 1 && (
								<Button
									type="button"
									variant="outline"
									onClick={handleSetAll}
									disabled={quantity === maxOutstanding || isSubmitting}
									className="h-13 px-3 rounded-xl border-slate-200 text-xs font-semibold text-[#004785] hover:bg-blue-50/60 hover:border-blue-200 shrink-0"
								>
									Semua ({maxOutstanding})
								</Button>
							)}
						</div>
					</div>

					<div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3 text-xs space-y-1.5">
						<div className="flex items-center justify-between text-slate-600">
							<span>Sisa pinjaman saat ini:</span>
							<span className="font-semibold">{maxOutstanding} unit</span>
						</div>
						<div className="flex items-center justify-between text-slate-600">
							<span>Akan dikembalikan:</span>
							<span className="font-semibold text-[#004785]">
								{quantity} unit
							</span>
						</div>
						<div className="pt-1.5 border-t border-slate-200/60 flex items-center justify-between font-bold">
							<span className="text-slate-700">Sisa setelah pengembalian:</span>
							{isFullReturn ? (
								<span className="text-emerald-700 flex items-center gap-1">
									<CheckCircle2 className="h-3.5 w-3.5" />
									LUNAS (0 unit)
								</span>
							) : (
								<span className="text-amber-700">
									{remainingAfterReturn} unit
								</span>
							)}
						</div>
					</div>

					<div className="space-y-1.5">
						<label
							htmlFor="notes-input"
							className="text-xs font-semibold text-slate-700"
						>
							Catatan Pengembalian (Opsional)
						</label>
						<Textarea
							id="notes-input"
							placeholder="Kondisi barang, lokasi penyimpanan kembali, atau catatan audit..."
							value={notes}
							onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
								setNotes(e.target.value)
							}
							disabled={isSubmitting}
							rows={2}
							className="rounded-xl border-slate-200 text-xs focus-visible:ring-[#004785]"
						/>
					</div>

					<div className="space-y-1.5">
						<label
							htmlFor="ref-input"
							className="text-xs font-semibold text-slate-700"
						>
							Nomor Referensi / Berita Acara (Opsional)
						</label>
						<Input
							id="ref-input"
							placeholder="Contoh: BA-RET-2026-001"
							value={referenceNumber}
							onChange={(e) => setReferenceNumber(e.target.value)}
							disabled={isSubmitting}
							className="h-9 rounded-xl border-slate-200 text-xs focus-visible:ring-[#004785]"
						/>
					</div>

					<DialogFooter className="pt-2 flex flex-row items-center justify-end gap-2">
						<Button
							type="button"
							variant="outline"
							onClick={() => onOpenChange(false)}
							disabled={isSubmitting}
							className="rounded-xl h-10 px-4 text-xs font-semibold border-slate-200 text-slate-700 hover:bg-slate-100"
						>
							Batal
						</Button>

						<Button
							type="submit"
							disabled={isSubmitting}
							className="rounded-xl h-10 px-5 text-xs font-bold bg-[#004785] hover:bg-[#00386b] text-white shadow-xs active:scale-95 transition-all"
						>
							{isSubmitting ? (
								<div className="flex items-center gap-2">
									<RotateCcw className="h-3.5 w-3.5 animate-spin" />
									<span>Memproses...</span>
								</div>
							) : (
								<div className="flex items-center gap-1.5">
									<RotateCcw className="h-3.5 w-3.5" />
									<span>Kembalikan {quantity} Unit</span>
								</div>
							)}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
