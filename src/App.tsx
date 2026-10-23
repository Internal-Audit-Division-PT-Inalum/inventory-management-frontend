export default function App() {
	return (
		<div className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
			{/* Header Mobile Brand */}
			<header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur-md">
				<div className="flex items-center gap-2.5">
					<div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-800 text-white font-bold text-xs shadow-sm">
						IIA
					</div>
					<div>
						<h1 className="text-sm font-bold tracking-tight text-slate-900 leading-tight">
							INVENTORY SYSTEM
						</h1>
						<p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">
							Internal Audit PT INALUM
						</p>
					</div>
				</div>

				<div className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 border border-emerald-200/60">
					<span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
					<span className="text-[10px] font-semibold text-emerald-700">
						Online
					</span>
				</div>
			</header>

			{/* Main Content Placeholder */}
			<main className="flex-1 flex flex-col items-center justify-center p-6 text-center">
				<div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 text-blue-800 border border-blue-100 shadow-sm mb-4">
					<svg
						className="h-8 w-8"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						role="img"
						aria-label="Logo Inventaris"
					>
						<title>Logo Inventaris</title>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth={2}
							d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
						/>
					</svg>
				</div>

				<h2 className="text-lg font-bold text-slate-800 mb-1">
					PWA Mobile Inventory Foundation
				</h2>
				<p className="text-xs text-slate-500 max-w-xs mb-6">
					Fondasi sistem inventaris Divisi Internal Audit PT INALUM sedang
					diinisialisasi.
				</p>

				<div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-4 shadow-xs text-left">
					<div className="text-xs font-semibold text-slate-700 mb-2 flex items-center justify-between">
						<span>Status Fase P0:</span>
						<span className="text-blue-700 font-bold">
							Inisialisasi Fondasi
						</span>
					</div>
					<div className="space-y-1.5 text-[11px] text-slate-600">
						<div className="flex items-center gap-2">
							<span className="text-emerald-600 font-bold">✓</span> Boilerplate
							dibersihkan (P0.1)
						</div>
						<div className="flex items-center gap-2">
							<span className="text-blue-600 font-bold">⏳</span> Dependensi
							runtime & PWA (P0.2 - P0.3)
						</div>
						<div className="flex items-center gap-2">
							<span className="text-slate-400 font-bold">○</span> Routing,
							Dexie, & Design System (P0.4 - P0.8)
						</div>
					</div>
				</div>
			</main>

			{/* Mobile Footer */}
			<footer className="border-t border-slate-200 bg-white py-3 text-center text-[10px] text-slate-400">
				PT Indonesia Asahan Aluminium © 2026 — Internal Audit Division
			</footer>
		</div>
	);
}
