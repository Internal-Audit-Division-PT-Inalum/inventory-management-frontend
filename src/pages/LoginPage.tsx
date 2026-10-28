import { Info, WifiOff } from "lucide-react";
import * as React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { LoginForm } from "@/features/auth/components/LoginForm";
import {
	selectIsAuthenticated,
	selectMustChangePin,
	useAuthStore,
} from "@/features/auth/store/authStore";
import { getAndClearPostLoginRedirect } from "@/features/catalog";
import type { AuthSession } from "@/types/api";

export function LoginPage() {
	const navigate = useNavigate();
	const location = useLocation();

	const isAuthenticated = useAuthStore(selectIsAuthenticated);
	const mustChangePin = useAuthStore(selectMustChangePin);

	const [isOnline, setIsOnline] = React.useState(
		typeof navigator !== "undefined" ? navigator.onLine : true,
	);

	React.useEffect(() => {
		const handleOnline = () => setIsOnline(true);
		const handleOffline = () => setIsOnline(false);

		window.addEventListener("online", handleOnline);
		window.addEventListener("offline", handleOffline);

		return () => {
			window.removeEventListener("online", handleOnline);
			window.removeEventListener("offline", handleOffline);
		};
	}, []);

	// Jika pegawai sudah terautentikasi, arahkan langsung
	React.useEffect(() => {
		if (isAuthenticated) {
			if (mustChangePin) {
				navigate("/change-pin", { replace: true });
			} else {
				const searchParams = new URLSearchParams(location.search);
				const redirectParam = searchParams.get("redirect");
				const from = getAndClearPostLoginRedirect(
					redirectParam || (location.state as { from?: unknown })?.from,
				);
				navigate(from, { replace: true });
			}
		}
	}, [isAuthenticated, mustChangePin, navigate, location]);

	const handleLoginSuccess = (session: AuthSession) => {
		if (session.must_change_pin) {
			navigate("/change-pin", { replace: true });
		} else {
			const searchParams = new URLSearchParams(location.search);
			const redirectParam = searchParams.get("redirect");
			const from = getAndClearPostLoginRedirect(
				redirectParam || (location.state as { from?: unknown })?.from,
			);
			navigate(from, { replace: true });
		}
	};

	return (
		<div className="flex min-h-screen flex-col justify-between bg-gradient-to-b from-slate-100 via-slate-50 to-white px-4 py-8 pt-safe pb-safe sm:px-6">
			<header className="mx-auto w-full max-w-md pt-4 text-center sm:pt-8">
				<div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white p-2.5 shadow-md ring-1 ring-slate-200/80">
					<img
						src="/inalum-logo.png"
						alt="Logo PT INALUM"
						className="h-full w-full object-contain"
					/>
				</div>
				<div className="inline-flex items-center gap-1.5 rounded-full border border-blue-200/60 bg-blue-50/80 px-3 py-1 text-xs font-semibold text-[#004785]">
					Divisi Internal Audit
				</div>
				<h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
					Inventory Management
				</h1>
				<p className="mt-1 text-xs text-slate-600 sm:text-sm">
					Sistem PWA Pengambilan & Peminjaman Barang
				</p>
			</header>

			<main className="mx-auto my-6 w-full max-w-md">
				{!isOnline && (
					<div
						role="status"
						className="mb-4 flex items-center gap-2.5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-900 shadow-xs"
					>
						<WifiOff className="h-4 w-4 shrink-0 text-amber-600" />
						<span>
							<strong>Mode Offline:</strong> Anda memerlukan koneksi internet
							untuk melakukan proses login awal.
						</span>
					</div>
				)}

				<Card className="border-slate-200/80 shadow-lg shadow-slate-200/50 backdrop-blur-xs">
					<CardHeader className="space-y-1.5 pb-4">
						<div className="flex items-center justify-between">
							<CardTitle className="text-lg font-bold text-slate-900">
								Masuk Pegawai
							</CardTitle>
							<Badge variant="outline" className="text-[11px] font-medium">
								PT Inalum
							</Badge>
						</div>
						<CardDescription className="text-xs text-slate-500">
							Gunakan Namecode inisial dan 6 digit PIN terdaftar Anda untuk
							mengakses inventaris.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<LoginForm onSuccess={handleLoginSuccess} />
					</CardContent>
				</Card>

				<div className="mt-5 flex items-start gap-2.5 rounded-xl border border-slate-200/60 bg-white/60 p-3.5 text-xs text-slate-600 backdrop-blur-xs">
					<Info className="mt-0.5 h-4 w-4 shrink-0 text-[#004785]" />
					<p className="leading-relaxed">
						Lupa PIN atau pertama kali menggunakan sistem? Hubungi{" "}
						<span className="font-semibold text-slate-800">
							Administrator Divisi Internal Audit
						</span>{" "}
						untuk pengaturan PIN baru.
					</p>
				</div>
			</main>

			<footer className="mx-auto w-full max-w-md pb-2 text-center text-[11px] text-slate-400">
				<p>© {new Date().getFullYear()} PT Indonesia Asahan Aluminium</p>
				<p className="mt-0.5">Sistem Internal Visual Board & Inventaris v1.0</p>
			</footer>
		</div>
	);
}
export default LoginPage;
