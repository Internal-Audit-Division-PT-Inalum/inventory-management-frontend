import {
	AlertTriangle,
	ArrowLeft,
	CheckCircle2,
	Database,
	RefreshCw,
	ShieldCheck,
} from "lucide-react";
import { Link } from "react-router-dom";
import { usePendingOutboxCount } from "@/components/layout/usePendingOutboxCount";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export function OutboxPage() {
	const pendingCount = usePendingOutboxCount();

	return (
		<div className="flex flex-col gap-4">
			{/* Page Header Info */}
			<div className="flex items-center justify-between">
				<div>
					<h2 className="text-lg font-bold text-slate-900">
						Antrean Offline (Outbox)
					</h2>
					<p className="text-xs text-slate-500">
						Status pengiriman transaksi lokal ke server INALUM
					</p>
				</div>
				<Badge
					variant="secondary"
					className="bg-blue-50 text-[#004785] border-blue-200"
				>
					Fase P5
				</Badge>
			</div>

			{/* Status Card */}
			<Card className="border-slate-200/80 bg-white shadow-xs">
				<CardContent className="flex flex-col items-center p-6 text-center">
					{pendingCount === 0 ? (
						<>
							<div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-100 shadow-xs">
								<CheckCircle2 className="h-7 w-7" />
							</div>
							<h3 className="mb-1 text-base font-bold text-slate-800">
								Semua Transaksi Tersinkronisasi
							</h3>
							<p className="mb-4 max-w-xs text-xs text-slate-500">
								Tidak ada transaksi offline yang menunggu pengiriman. Semua
								mutasi stok lokal telah tercatat sempurna di database server.
							</p>
						</>
					) : (
						<>
							<div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 border border-amber-100 shadow-xs">
								<AlertTriangle className="h-7 w-7" />
							</div>
							<h3 className="mb-1 text-base font-bold text-slate-800">
								{pendingCount} Transaksi Menunggu Sinkronisasi
							</h3>
							<p className="mb-4 max-w-xs text-xs text-slate-500">
								Transaksi tersimpan aman di IndexedDB perangkat ini dan akan
								otomatis diunggah saat koneksi server kembali normal.
							</p>
						</>
					)}

					{/* Enterprise Architecture Assurance */}
					<div className="w-full rounded-xl border border-slate-100 bg-slate-50/80 p-3.5 text-left text-xs space-y-2 mb-4">
						<div className="flex items-center gap-2 text-slate-700">
							<ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
							<span className="font-medium">
								Zero Data Loss Guaranteed (IndexedDB Outbox)
							</span>
						</div>
						<div className="flex items-center gap-2 text-slate-700">
							<Database className="h-4 w-4 text-blue-600 shrink-0" />
							<span>
								Isolasi antrean lokal per pegawai & pencegahan race condition
							</span>
						</div>
						<div className="flex items-center gap-2 text-slate-700">
							<RefreshCw className="h-4 w-4 text-slate-500 shrink-0" />
							<span>Sinkronisasi otomatis di latar belakang dengan jitter</span>
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

export default OutboxPage;
