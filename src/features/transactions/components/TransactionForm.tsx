import { zodResolver } from "@hookform/resolvers/zod";
import {
	AlertTriangle,
	ArrowDownLeft,
	ArrowUpRight,
	FileText,
	Loader2,
	Minus,
	Plus,
	RotateCcw,
} from "lucide-react";
import * as React from "react";
import { useForm } from "react-hook-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
	createTransactionSchema,
	isLargeQuantityTransaction,
	MAX_TRANSACTION_QUANTITY,
	sanitizeTransactionFormData,
	type TransactionFormData,
} from "../lib/transactionSchema";
import type { TransactionFormProps } from "../types";

export function TransactionForm({
	item,
	action,
	onSubmit,
	onCancel,
	isSubmitting = false,
	className,
}: TransactionFormProps) {
	const [pendingData, setPendingData] =
		React.useState<TransactionFormData | null>(null);
	const [showWarningModal, setShowWarningModal] = React.useState(false);

	const isTakeOrBorrow = action === "take" || action === "borrow";
	const maxStock = isTakeOrBorrow
		? item.current_stock
		: MAX_TRANSACTION_QUANTITY;

	const schema = React.useMemo(
		() => createTransactionSchema(item.current_stock, action),
		[item.current_stock, action],
	);

	const {
		register,
		handleSubmit,
		setValue,
		watch,
		formState: { errors },
	} = useForm<TransactionFormData>({
		resolver: zodResolver(schema),
		defaultValues: {
			quantity: 1,
			notes: "",
			reference_number: "",
		},
	});

	const currentQuantity = watch("quantity") || 1;
	const currentNotes = watch("notes") || "";
	const currentRef = watch("reference_number") || "";

	const handleStepDecrement = () => {
		if (currentQuantity > 1) {
			setValue("quantity", currentQuantity - 1, { shouldValidate: true });
		}
	};

	const handleStepIncrement = () => {
		if (currentQuantity < maxStock) {
			setValue("quantity", currentQuantity + 1, { shouldValidate: true });
		}
	};

	const handleQuickAdd = (amount: number) => {
		const nextQty = Math.min(currentQuantity + amount, maxStock);
		setValue("quantity", nextQty, { shouldValidate: true });
	};

	const handleSetMax = () => {
		if (maxStock > 0) {
			setValue("quantity", maxStock, { shouldValidate: true });
		}
	};

	const handleFormSubmit = async (data: TransactionFormData) => {
		const cleanData = sanitizeTransactionFormData(data);

		// Evaluasi apakah transaksi memerlukan modal konfirmasi jumlah besar
		const needsWarning = isLargeQuantityTransaction({
			quantity: cleanData.quantity,
			currentStock: item.current_stock,
			action,
		});

		if (needsWarning) {
			setPendingData(cleanData);
			setShowWarningModal(true);
			return;
		}

		await onSubmit(cleanData);
	};

	const handleConfirmWarning = async () => {
		if (pendingData) {
			setShowWarningModal(false);
			const dataToSubmit = pendingData;
			setPendingData(null);
			await onSubmit(dataToSubmit);
		}
	};

	const handleCancelWarning = () => {
		setShowWarningModal(false);
		setPendingData(null);
	};

	const renderActionHeader = () => {
		switch (action) {
			case "take":
				return {
					title: "Ambil Barang Habis Pakai",
					badge: "Pengambilan Stok",
					badgeVariant: "critical" as const,
					icon: <ArrowUpRight className="h-4 w-4 text-red-600" />,
					submitLabel: "Konfirmasi Pengambilan",
				};
			case "add":
				return {
					title: "Tambah Stok (Restock)",
					badge: "Penambahan Stok",
					badgeVariant: "ok" as const,
					icon: <Plus className="h-4 w-4 text-emerald-600" />,
					submitLabel: "Konfirmasi Tambah Stok",
				};
			case "borrow":
				return {
					title: "Pinjam Aset Inventaris",
					badge: "Peminjaman",
					badgeVariant: "default" as const,
					icon: <ArrowDownLeft className="h-4 w-4 text-[#004785]" />,
					submitLabel: "Konfirmasi Peminjaman",
				};
			case "return":
				return {
					title: "Kembalikan Aset Inventaris",
					badge: "Pengembalian",
					badgeVariant: "secondary" as const,
					icon: <RotateCcw className="h-4 w-4 text-slate-600" />,
					submitLabel: "Konfirmasi Pengembalian",
				};
		}
	};

	const actionMeta = renderActionHeader();

	return (
		<div className={cn("flex flex-col gap-4", className)}>
			<div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3.5">
				<div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
					<span className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
						{actionMeta.icon}
						<span>{actionMeta.title}</span>
					</span>
					<Badge variant={actionMeta.badgeVariant} className="text-[10px]">
						{actionMeta.badge}
					</Badge>
				</div>

				<div className="flex items-baseline justify-between gap-2 text-xs text-slate-600 pt-1 border-t border-slate-200/60">
					<div className="truncate">
						<span className="font-semibold text-slate-800">{item.name}</span>{" "}
						<span className="font-mono text-[11px] text-slate-500">
							({item.sku})
						</span>
					</div>
					<div className="shrink-0 font-medium text-slate-700">
						{isTakeOrBorrow ? (
							<>
								Sisa: <strong>{item.current_stock}</strong> {item.unit}
							</>
						) : action === "return" ? (
							<>
								Dipinjam: <strong>{item.borrowed_quantity || 0}</strong>{" "}
								{item.unit}
							</>
						) : (
							<>
								Saat Ini: <strong>{item.current_stock}</strong> {item.unit}
							</>
						)}
					</div>
				</div>
			</div>

			<form
				onSubmit={handleSubmit(handleFormSubmit)}
				noValidate
				className="flex flex-col gap-4"
			>
				<div className="flex flex-col gap-1.5">
					<label
						htmlFor="quantity-stepper"
						className="text-xs font-bold uppercase tracking-wider text-slate-700"
					>
						Jumlah ({item.unit}) <span className="text-red-500">*</span>
					</label>

					<div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-2 shadow-2xs">
						<button
							type="button"
							data-testid="stepper-decrement-btn"
							aria-label="Kurangi Jumlah"
							disabled={currentQuantity <= 1 || isSubmitting}
							onClick={handleStepDecrement}
							className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700 shadow-2xs hover:bg-slate-100 active:scale-95 transition-all disabled:opacity-30 disabled:cursor-not-allowed touch-target"
						>
							<Minus className="h-5 w-5 stroke-[2.5]" />
						</button>

						<div className="flex flex-col items-center justify-center flex-1 min-w-0">
							<input
								id="quantity-stepper"
								type="number"
								inputMode="numeric"
								min={1}
								max={maxStock}
								data-testid="stepper-quantity-input"
								{...register("quantity", { valueAsNumber: true })}
								disabled={isSubmitting}
								className="w-full text-center text-3xl font-black text-slate-900 bg-transparent outline-none focus:ring-0"
							/>
							<span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
								{item.unit}
							</span>
						</div>

						<button
							type="button"
							data-testid="stepper-increment-btn"
							aria-label="Tambah Jumlah"
							disabled={currentQuantity >= maxStock || isSubmitting}
							onClick={handleStepIncrement}
							className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700 shadow-2xs hover:bg-slate-100 active:scale-95 transition-all disabled:opacity-30 disabled:cursor-not-allowed touch-target"
						>
							<Plus className="h-5 w-5 stroke-[2.5]" />
						</button>
					</div>

					<div className="flex items-center gap-1.5 pt-1 overflow-x-auto scrollbar-none">
						<button
							type="button"
							onClick={() => handleQuickAdd(1)}
							disabled={currentQuantity + 1 > maxStock || isSubmitting}
							className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 active:scale-95 transition-all disabled:opacity-40"
						>
							+1
						</button>
						<button
							type="button"
							onClick={() => handleQuickAdd(5)}
							disabled={currentQuantity + 5 > maxStock || isSubmitting}
							className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 active:scale-95 transition-all disabled:opacity-40"
						>
							+5
						</button>
						<button
							type="button"
							onClick={() => handleQuickAdd(10)}
							disabled={currentQuantity + 10 > maxStock || isSubmitting}
							className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 active:scale-95 transition-all disabled:opacity-40"
						>
							+10
						</button>
						{isTakeOrBorrow && maxStock > 0 && (
							<button
								type="button"
								onClick={handleSetMax}
								disabled={currentQuantity === maxStock || isSubmitting}
								className="rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-bold text-[#004785] hover:bg-blue-100 active:scale-95 transition-all disabled:opacity-40 shrink-0"
							>
								Semua ({maxStock})
							</button>
						)}
					</div>

					{errors.quantity && (
						<p
							role="alert"
							className="text-[11px] font-medium text-red-600 mt-0.5"
						>
							{errors.quantity.message}
						</p>
					)}
				</div>

				<div className="flex flex-col gap-1.5">
					<div className="flex items-center justify-between text-xs">
						<label
							htmlFor="reference_number"
							className="font-bold uppercase tracking-wider text-slate-700"
						>
							No. Dokumen / Surat Tugas (Opsional)
						</label>
						<span className="text-[11px] text-slate-400 font-mono">
							{currentRef.length}/100
						</span>
					</div>
					<div className="relative">
						<FileText className="absolute left-3 top-3 h-4 w-4 text-slate-400 pointer-events-none" />
						<Input
							id="reference_number"
							data-testid="transaction-reference-input"
							placeholder="Misal: AUD/2026/X/012 atau ND-89"
							maxLength={100}
							{...register("reference_number")}
							disabled={isSubmitting}
							className="pl-9 text-xs placeholder:text-slate-400"
						/>
					</div>
					{errors.reference_number && (
						<p
							role="alert"
							className="text-[11px] font-medium text-red-600 mt-0.5"
						>
							{errors.reference_number.message}
						</p>
					)}
				</div>

				<div className="flex flex-col gap-1.5">
					<div className="flex items-center justify-between text-xs">
						<label
							htmlFor="transaction_notes"
							className="font-bold uppercase tracking-wider text-slate-700"
						>
							Catatan Keperluan (Opsional)
						</label>
						<span className="text-[11px] text-slate-400 font-mono">
							{currentNotes.length}/1000
						</span>
					</div>
					<textarea
						id="transaction_notes"
						data-testid="transaction-notes-input"
						rows={3}
						maxLength={1000}
						placeholder="Misal: Keperluan audit investigasi PLTA Siguragura..."
						{...register("notes")}
						disabled={isSubmitting}
						className="w-full rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-800 placeholder:text-slate-400 shadow-2xs focus:border-[#004785] focus:ring-1 focus:ring-[#004785] outline-none transition-all disabled:bg-slate-100"
					/>
					{errors.notes && (
						<p
							role="alert"
							className="text-[11px] font-medium text-red-600 mt-0.5"
						>
							{errors.notes.message}
						</p>
					)}
				</div>

				<div className="flex items-center gap-2.5 pt-2">
					{onCancel && (
						<Button
							type="button"
							variant="outline"
							onClick={onCancel}
							disabled={isSubmitting}
							className="flex-1 rounded-xl py-3 text-xs font-semibold text-slate-700"
						>
							Batal
						</Button>
					)}

					<Button
						type="submit"
						disabled={isSubmitting}
						data-testid="transaction-submit-btn"
						className={cn(
							"flex-1 rounded-xl py-3 text-xs font-bold text-white shadow-xs touch-target",
							action === "take"
								? "bg-[#004785] hover:bg-[#00386b]"
								: action === "add"
									? "bg-emerald-700 hover:bg-emerald-800"
									: action === "borrow"
										? "bg-[#004785] hover:bg-[#00386b]"
										: "bg-slate-800 hover:bg-slate-900",
						)}
					>
						{isSubmitting ? (
							<span className="flex items-center justify-center gap-2">
								<Loader2 className="h-4 w-4 animate-spin" />
								<span>Memproses...</span>
							</span>
						) : (
							<span>{actionMeta.submitLabel}</span>
						)}
					</Button>
				</div>
			</form>

			{showWarningModal && pendingData && (
				<div
					role="dialog"
					aria-modal="true"
					data-testid="large-quantity-warning-modal"
					className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in"
				>
					<div className="w-full max-w-sm rounded-2xl border border-amber-200 bg-white p-5 shadow-2xl animate-in zoom-in-95">
						<div className="flex items-center gap-3 mb-3">
							<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
								<AlertTriangle className="h-5 w-5" />
							</div>
							<div>
								<h4 className="text-sm font-bold text-slate-900">
									Konfirmasi Jumlah Besar
								</h4>
								<p className="text-[11px] text-slate-500">
									Peringatan Pengawasan Stok Internal Audit
								</p>
							</div>
						</div>

						<p className="text-xs text-slate-600 leading-relaxed mb-4">
							Anda akan mengambil/meminjam{" "}
							<strong className="text-slate-900 font-bold">
								{pendingData.quantity} {item.unit}
							</strong>{" "}
							dari total sisa stok{" "}
							<strong className="text-slate-900 font-bold">
								{item.current_stock} {item.unit}
							</strong>
							. Pastikan kuantitas ini telah sesuai dengan penugasan audit
							lapangan Anda.
						</p>

						<div className="flex items-center gap-2">
							<button
								type="button"
								data-testid="warning-cancel-btn"
								onClick={handleCancelWarning}
								className="flex-1 rounded-xl border border-slate-200 bg-slate-100 px-3 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-200 active:scale-95 transition-all"
							>
								Ubah Jumlah
							</button>
							<button
								type="button"
								data-testid="warning-confirm-btn"
								onClick={handleConfirmWarning}
								className="flex-1 rounded-xl bg-[#004785] px-3 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-[#00386b] active:scale-95 transition-all"
							>
								Ya, Lanjutkan
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
