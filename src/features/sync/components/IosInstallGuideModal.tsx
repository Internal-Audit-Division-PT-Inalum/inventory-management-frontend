import {
	CheckCircle2,
	PlusSquare,
	Share,
	Smartphone,
	Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";

export interface IosInstallGuideModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

/**
 * Modal dialog panduan visual langkah-demi-langkah "Tambah ke Layar Utama" (Add to Home Screen)
 * khusus untuk pengguna Apple iPhone / iPad Safari.
 */
export function IosInstallGuideModal({
	open,
	onOpenChange,
}: IosInstallGuideModalProps) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				className="sm:max-w-md"
				onClose={() => onOpenChange(false)}
			>
				<DialogHeader>
					<div className="mx-auto sm:mx-0 mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-[#004785] border border-blue-100 shadow-2xs">
						<Smartphone className="h-6 w-6" />
					</div>
					<DialogTitle>Pasang ke Layar Utama iPhone</DialogTitle>
					<DialogDescription>
						Ikuti 3 langkah cepat di bawah ini untuk mengamankan penyimpanan
						transaksi offline Anda di iOS Safari:
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-3 py-1">
					{/* Langkah 1 */}
					<div className="flex items-start gap-3 rounded-xl border border-slate-200/80 bg-slate-50/70 p-3 text-xs">
						<div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#004785] text-[11px] font-bold text-white shadow-2xs">
							1
						</div>
						<div className="flex-1 min-w-0">
							<p className="font-bold text-slate-900">
								Ketuk Tombol Bagikan (Share)
							</p>
							<p className="text-slate-600 mt-0.5 leading-relaxed">
								Pada bilah navigasi bawah Safari, ketuk ikon{" "}
								<strong className="inline-flex items-center gap-1 font-semibold text-blue-600">
									Bagikan <Share className="inline h-3.5 w-3.5" />
								</strong>
								.
							</p>
						</div>
					</div>

					{/* Langkah 2 */}
					<div className="flex items-start gap-3 rounded-xl border border-slate-200/80 bg-slate-50/70 p-3 text-xs">
						<div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#004785] text-[11px] font-bold text-white shadow-2xs">
							2
						</div>
						<div className="flex-1 min-w-0">
							<p className="font-bold text-slate-900">
								Pilih "Tambah ke Layar Utama"
							</p>
							<p className="text-slate-600 mt-0.5 leading-relaxed">
								Gulir menu tindakan ke bawah dan ketuk opsi{" "}
								<strong className="inline-flex items-center gap-1 font-semibold text-slate-900">
									Tambah ke Layar Utama{" "}
									<PlusSquare className="inline h-3.5 w-3.5" />
								</strong>
								.
							</p>
						</div>
					</div>

					{/* Langkah 3 */}
					<div className="flex items-start gap-3 rounded-xl border border-slate-200/80 bg-slate-50/70 p-3 text-xs">
						<div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-[11px] font-bold text-white shadow-2xs">
							<CheckCircle2 className="h-4 w-4" />
						</div>
						<div className="flex-1 min-w-0">
							<p className="font-bold text-slate-900">
								Buka dari Ikon Layar Utama
							</p>
							<p className="text-slate-600 mt-0.5 leading-relaxed">
								Ketuk tombol <strong>Tambah (Add)</strong> di pojok kanan atas,
								lalu buka aplikasi melalui ikon baru di Layar Utama iPhone Anda.
							</p>
						</div>
					</div>
				</div>

				{/* Kotak Manfaat & Garansi Integritas */}
				<div className="rounded-xl border border-blue-100 bg-blue-50/70 p-3 text-[11px] leading-relaxed text-blue-900 space-y-1">
					<div className="flex items-center gap-1.5 font-bold">
						<Sparkles className="h-3.5 w-3.5 text-[#004785]" />
						<span>Manfaat PWA Terpasang di iOS:</span>
					</div>
					<ul className="list-disc list-inside space-y-0.5 text-blue-800 pl-1">
						<li>Menonaktifkan batas penghapusan penyimpanan 7 hari Safari.</li>
						<li>
							Data antrean offline & sesi login tersimpan secara persisten.
						</li>
						<li>Tampilan layar penuh tanpa bilah alamat browser.</li>
					</ul>
				</div>

				<DialogFooter className="mt-4">
					<Button
						type="button"
						variant="default"
						size="sm"
						onClick={() => onOpenChange(false)}
						className="w-full bg-[#004785] hover:bg-[#00386b]"
					>
						Saya Mengerti
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
