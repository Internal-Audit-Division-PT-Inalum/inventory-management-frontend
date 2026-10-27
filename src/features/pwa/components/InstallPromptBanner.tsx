import { Download, PlusSquare, Share, Smartphone, X } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";
import { usePwaInstall } from "../hooks/usePwaInstall";

export interface InstallPromptBannerProps {
	className?: string;
	forceShow?: boolean;
	forceMode?: "android" | "ios";
	onInstalled?: () => void;
}

/**
 * Banner Pemasangan PWA Inventaris PT INALUM:
 * - Menangani prompt otomatis berbasis dialog native peramban untuk Android / Chromium.
 * - Memberikan kartu panduan visual intuitif "Tambah ke Layar Utama" khusus pengguna iOS Safari.
 * - Dilengkapi fitur cooldown penolakan (dismiss) dan auto-hide pada mode standalone.
 */
export function InstallPromptBanner({
	className,
	forceShow = false,
	forceMode,
	onInstalled,
}: InstallPromptBannerProps) {
	const {
		isStandalone,
		canInstall,
		isIosSafari,
		isDismissed,
		promptInstall,
		dismissPrompt,
	} = usePwaInstall();

	const [isInstalling, setIsInstalling] = React.useState(false);

	// Jangan tampilkan jika sudah standalone (kecuali mode forceShow aktif)
	if (isStandalone && !forceShow) {
		return null;
	}

	// Jangan tampilkan jika pengguna telah menutup prompt baru-baru ini (kecuali forceShow)
	if (isDismissed && !forceShow) {
		return null;
	}

	const isAndroidMode =
		forceMode === "android" || (canInstall && forceMode !== "ios");
	const isIosMode =
		forceMode === "ios" || (!canInstall && isIosSafari && !isStandalone);

	// Jika bukan skenario pemasangan yang didukung, sembunyikan banner
	if (!isAndroidMode && !isIosMode && !forceShow) {
		return null;
	}

	const handleInstallClick = async () => {
		setIsInstalling(true);
		try {
			const outcome = await promptInstall();
			if (outcome === "accepted") {
				onInstalled?.();
			}
		} finally {
			setIsInstalling(false);
		}
	};

	// ---------------------------------------------------------------------------
	// TAMPILAN KHUSUS IOS SAFARI (Panduan Tambah ke Layar Utama)
	// ---------------------------------------------------------------------------
	if (isIosMode) {
		return (
			<section
				aria-label="Panduan Pasang Aplikasi iOS"
				className={cn(
					"relative w-full rounded-2xl border border-blue-200/80 bg-linear-to-b from-blue-50/90 to-white p-4 shadow-xs mb-3 transition-all",
					className,
				)}
			>
				<button
					type="button"
					onClick={dismissPrompt}
					aria-label="Tutup panduan"
					className="absolute top-3 right-3 flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-blue-100/50 hover:text-slate-600 active:scale-95 transition-all"
				>
					<X className="h-4 w-4" />
				</button>

				<div className="flex items-start gap-3">
					<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#004785] text-white shadow-xs">
						<Smartphone className="h-5 w-5" />
					</div>

					<div className="min-w-0 flex-1 pr-6">
						<h3 className="text-xs font-bold text-slate-900 leading-tight">
							Pasang di Layar Utama iPhone
						</h3>
						<p className="text-[11px] text-slate-600 mt-0.5">
							Pasang aplikasi inventaris untuk akses cepat dan menjaga sesi
							tetap aktif tanpa batas 7 hari Safari.
						</p>

						{/* Langkah-langkah Visual */}
						<div className="mt-2.5 space-y-1.5 rounded-lg border border-blue-100 bg-white/90 p-2.5 text-[11px] text-slate-700">
							<div className="flex items-center gap-2">
								<span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-blue-100 font-bold text-[9px] text-[#004785]">
									1
								</span>
								<span>
									Ketuk tombol <strong>Bagikan (Share)</strong>{" "}
									<Share className="inline h-3.5 w-3.5 text-blue-600 align-text-bottom" />{" "}
									di bilah bawah Safari.
								</span>
							</div>

							<div className="flex items-center gap-2">
								<span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-blue-100 font-bold text-[9px] text-[#004785]">
									2
								</span>
								<span>
									Pilih menu <strong>Tambah ke Layar Utama</strong>{" "}
									<PlusSquare className="inline h-3.5 w-3.5 text-slate-700 align-text-bottom" />
									.
								</span>
							</div>
						</div>

						<div className="mt-3 flex justify-end">
							<button
								type="button"
								onClick={dismissPrompt}
								className="rounded-lg bg-[#004785] px-3.5 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-[#00386b] active:scale-95 transition-all"
							>
								Saya Mengerti
							</button>
						</div>
					</div>
				</div>
			</section>
		);
	}

	// ---------------------------------------------------------------------------
	// TAMPILAN ANDROID / CHROMIUM (Native Install Prompt)
	// ---------------------------------------------------------------------------
	return (
		<section
			aria-label="Prompt Pasang Aplikasi Android"
			className={cn(
				"relative w-full rounded-2xl border border-blue-200/80 bg-white p-3.5 shadow-xs mb-3 transition-all",
				className,
			)}
		>
			<div className="flex items-center justify-between gap-3">
				<div className="flex items-center gap-3 min-w-0">
					<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#004785] text-xs font-bold text-white shadow-xs">
						IIA
					</div>

					<div className="min-w-0">
						<h3 className="text-xs font-bold text-slate-900 leading-tight truncate">
							Pasang Aplikasi Inventaris
						</h3>
						<p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
							Akses instan dari layar utama & simpan stok offline.
						</p>
					</div>
				</div>

				<div className="flex items-center gap-2 shrink-0">
					<button
						type="button"
						onClick={dismissPrompt}
						aria-label="Tutup penawaran pasang"
						className="px-2.5 py-1 text-xs font-medium text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg active:scale-95 transition-all"
					>
						Nanti
					</button>

					<button
						type="button"
						onClick={handleInstallClick}
						disabled={isInstalling}
						className="inline-flex items-center gap-1.5 rounded-lg bg-[#004785] px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-[#00386b] active:scale-95 disabled:opacity-50 transition-all select-none"
					>
						<Download className="h-3.5 w-3.5" />
						<span>{isInstalling ? "Memasang..." : "Pasang"}</span>
					</button>
				</div>
			</div>
		</section>
	);
}
