import { ArrowLeft, KeyRound, ShieldAlert, ShieldCheck } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { ChangePinForm } from "@/features/auth/components/ChangePinForm";
import {
	selectCurrentEmployee,
	selectMustChangePin,
	useAuthStore,
} from "@/features/auth/store/authStore";

export function ChangePinPage() {
	const navigate = useNavigate();
	const mustChangePin = useAuthStore(selectMustChangePin);
	const employee = useAuthStore(selectCurrentEmployee);

	const handleSuccess = () => {
		// Arahkan ke beranda setelah berhasil mengubah PIN
		navigate("/", { replace: true });
	};

	return (
		<div className="flex min-h-screen flex-col justify-between bg-gradient-to-b from-slate-100 via-slate-50 to-white px-4 py-8 pt-safe pb-safe sm:px-6">
			<header className="mx-auto w-full max-w-md pt-2">
				{!mustChangePin && (
					<Link
						to="/"
						className="mb-4 inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 transition-colors hover:text-[#004785]"
					>
						<ArrowLeft className="h-3.5 w-3.5" />
						Kembali ke Beranda
					</Link>
				)}

				<div className="text-center">
					<div
						className={`mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl p-2.5 shadow-md ring-1 ${
							mustChangePin
								? "bg-amber-50 text-amber-600 ring-amber-200"
								: "bg-blue-50 text-[#004785] ring-blue-200"
						}`}
					>
						{mustChangePin ? (
							<ShieldAlert className="h-7 w-7" />
						) : (
							<KeyRound className="h-7 w-7" />
						)}
					</div>

					<div className="inline-flex items-center gap-1.5 rounded-full border border-blue-200/60 bg-blue-50/80 px-3 py-1 text-xs font-semibold text-[#004785]">
						Divisi Internal Audit PT INALUM
					</div>

					<h1 className="mt-2.5 text-2xl font-bold tracking-tight text-slate-900">
						{mustChangePin ? "Pembaruan PIN Wajib" : "Ubah PIN Keamanan"}
					</h1>
					<p className="mt-1 text-xs text-slate-600 sm:text-sm">
						{mustChangePin
							? "Akun Anda baru pertama kali login. Buat PIN baru untuk melanjutkan."
							: "Perbarui 6 digit PIN akun Anda secara berkala."}
					</p>
				</div>
			</header>

			<main className="mx-auto my-6 w-full max-w-md">
				{employee && (
					<div className="mb-4 flex items-center justify-between rounded-xl border border-slate-200/80 bg-white/80 px-4 py-2.5 text-xs shadow-2xs backdrop-blur-xs">
						<span className="text-slate-500">Pegawai Aktif:</span>
						<span className="font-semibold text-slate-900">
							{employee.name} ({employee.namecode})
						</span>
					</div>
				)}

				<Card className="border-slate-200/80 shadow-lg shadow-slate-200/50 backdrop-blur-xs">
					<CardHeader className="space-y-1 pb-4">
						<div className="flex items-center justify-between">
							<CardTitle className="text-base font-bold text-slate-900">
								Formulir PIN
							</CardTitle>
							<Badge
								variant={mustChangePin ? "warning" : "default"}
								className="text-[11px] font-medium"
							>
								{mustChangePin ? "Wajib Diganti" : "Pengaturan PIN"}
							</Badge>
						</div>
						<CardDescription className="text-xs text-slate-500">
							PIN digunakan saat autentikasi dan pencatatan transaksi di rack
							barang.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<ChangePinForm
							onSuccess={handleSuccess}
							isMandatory={mustChangePin}
						/>
					</CardContent>
				</Card>

				<div className="mt-5 rounded-xl border border-slate-200/60 bg-white/70 p-4 text-xs text-slate-600 shadow-2xs">
					<div className="mb-2 flex items-center gap-1.5 font-semibold text-slate-800">
						<ShieldCheck className="h-4 w-4 text-teal-600" />
						Ketentuan PIN Aman:
					</div>
					<ul className="space-y-1.5 pl-5 text-[11px] list-disc leading-relaxed text-slate-600">
						<li>Harus berupa 6 digit angka numerik.</li>
						<li>
							Hindari kombinasi berulang (misal: <code>000000</code>,{" "}
							<code>111111</code>) atau berurutan (misal: <code>123456</code>).
						</li>
						<li>
							PIN bersifat rahasia dan merupakan identitas penanggung jawab
							transaksi Anda.
						</li>
					</ul>
				</div>
			</main>

			<footer className="mx-auto w-full max-w-md pb-2 text-center text-[11px] text-slate-400">
				<p>© {new Date().getFullYear()} PT Indonesia Asahan Aluminium</p>
			</footer>
		</div>
	);
}
export default ChangePinPage;
