import { ArrowLeft, Clock, PackageCheck, Shield } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export function LoansPage() {
	return (
		<div className="flex flex-col gap-4">
			{/* Page Header Info */}
			<div className="flex items-center justify-between">
				<div>
					<h2 className="text-lg font-bold text-slate-900">Pinjaman Saya</h2>
					<p className="text-xs text-slate-500">
						Aset & peralatan operasional yang sedang Anda gunakan
					</p>
				</div>
				<Badge
					variant="secondary"
					className="bg-blue-50 text-[#004785] border-blue-200"
				>
					Fase P4
				</Badge>
			</div>

			{/* Information Card */}
			<Card className="border-slate-200/80 bg-white shadow-xs">
				<CardContent className="flex flex-col items-center p-6 text-center">
					<div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-[#004785] border border-blue-100 shadow-xs">
						<PackageCheck className="h-7 w-7" />
					</div>

					<h3 className="mb-1 text-base font-bold text-slate-800">
						Modul Pinjaman Aktif
					</h3>
					<p className="mb-4 max-w-xs text-xs text-slate-500">
						Pelacakan peminjaman barang aset, riwayat per item, dan pengembalian
						parsial akan diaktifkan secara penuh pada Fase P4.
					</p>

					<div className="w-full rounded-xl border border-slate-100 bg-slate-50/80 p-3.5 text-left text-xs space-y-2 mb-4">
						<div className="flex items-center gap-2 text-slate-700">
							<Shield className="h-4 w-4 text-emerald-600 shrink-0" />
							<span>Daftar barang aset yang Anda bawa di area pabrik</span>
						</div>
						<div className="flex items-center gap-2 text-slate-700">
							<Clock className="h-4 w-4 text-blue-600 shrink-0" />
							<span>Pencatatan tanggal dan durasi peminjaman</span>
						</div>
					</div>

					<Link
						to="/"
						className="inline-flex items-center gap-2 rounded-xl bg-[#004785] px-4 py-2.5 text-xs font-semibold text-white shadow-xs transition-transform hover:bg-[#00386b] active:scale-95"
					>
						<ArrowLeft className="h-4 w-4" />
						<span>Kembali ke Katalog Barang</span>
					</Link>
				</CardContent>
			</Card>
		</div>
	);
}

export default LoansPage;
