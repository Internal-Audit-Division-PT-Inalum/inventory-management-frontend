import { KeyRound, LogOut, User } from "lucide-react";
import * as React from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { LogoutConfirmDialog } from "@/features/auth/components/LogoutConfirmDialog";
import { useLogout } from "@/features/auth/hooks/useLogout";
import {
	selectCurrentEmployee,
	useAuthStore,
} from "@/features/auth/store/authStore";
import {
	type CatalogStockFilter,
	CatalogView,
} from "@/features/catalog/components/CatalogView";
import { useCatalogSync } from "@/features/catalog/hooks/useCatalogSync";
import {
	CriticalStockAlertWidget,
	InventoryKPICards,
	type KPICardFilterType,
	LoanSummaryWidget,
	RecentActivityFeed,
	ReconciliationBadge,
	useAuditorLoansSummary,
	useLowStockReconciliation,
	useRecentActivities,
	useStockMetrics,
} from "@/features/monitoring";

export function HomePage() {
	const employee = useAuthStore(selectCurrentEmployee);
	const {
		isChecking,
		isLoggingOut,
		isSyncingBeforeLogout,
		showWarningDialog,
		myPendingCount,
		otherPendingCount,
		requestLogout,
		cancelLogout,
		confirmLogout,
		syncBeforeLogout,
	} = useLogout();

	// Hook sinkronisasi katalog untuk aksi refresh rekonsiliasi
	const { syncNow: syncCatalogManual, isSyncing: isCatalogSyncing } =
		useCatalogSync({ autoSync: false });

	// Hook metrik kesehatan stok inventaris lokal (Task P6.1)
	const {
		metrics,
		urgentItems,
		isLoading: isMetricsLoading,
	} = useStockMetrics();

	// Hook rekonsiliasi stok rendah lokal vs endpoint backend /reports/low-stock (Task P6.3)
	const { reconciliation, isChecking: isReconciling } =
		useLowStockReconciliation({
			localUrgentItems: urgentItems,
		});

	// Hook ringkasan pinjaman & aktivitas terakhir (Task P6.2)
	const { summary: loanSummary, isLoading: isLoansLoading } =
		useAuditorLoansSummary();
	const { activities: recentActivities, isLoading: isActivitiesLoading } =
		useRecentActivities({ limit: 5 });

	const [catalogStockFilter, setCatalogStockFilter] =
		React.useState<CatalogStockFilter>("all");

	// Interaksi filter cepat dari kartu KPI ke tampilan katalog
	const handleKPICardClick = (filterType: KPICardFilterType) => {
		switch (filterType) {
			case "all":
				setCatalogStockFilter("all");
				break;
			case "healthy":
				setCatalogStockFilter("available");
				break;
			case "low":
			case "critical_or_empty":
				setCatalogStockFilter("low_or_empty");
				break;
		}

		if (typeof document !== "undefined") {
			const el = document.getElementById("catalog-section");
			if (el && typeof el.scrollIntoView === "function") {
				el.scrollIntoView({ behavior: "smooth" });
			}
		}
	};

	// Aksi filter cepat dari widget peringatan stok kritis
	const handleViewAllUrgentStock = () => {
		setCatalogStockFilter("low_or_empty");
		if (typeof document !== "undefined") {
			const el = document.getElementById("catalog-section");
			if (el && typeof el.scrollIntoView === "function") {
				el.scrollIntoView({ behavior: "smooth" });
			}
		}
	};

	return (
		<div className="flex flex-col gap-4">
			{employee && (
				<Card className="border-slate-200/80 bg-white shadow-xs">
					<CardContent className="flex items-center justify-between p-4">
						<div className="flex items-center gap-3">
							<div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-[#004785]">
								<User className="h-5 w-5" />
							</div>
							<div>
								<h2 className="text-sm font-bold text-slate-900">
									{employee.name}
								</h2>
								<p className="text-xs font-medium text-slate-500">
									Namecode:{" "}
									<span className="font-mono font-semibold text-[#004785]">
										{employee.namecode}
									</span>
								</p>
							</div>
						</div>
						<div className="flex items-center gap-1.5">
							<Link
								to="/change-pin"
								aria-label="Ubah PIN"
								className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition-colors hover:bg-slate-100"
								title="Ubah PIN Keamanan"
							>
								<KeyRound className="h-4 w-4" />
							</Link>
							<button
								type="button"
								onClick={() => requestLogout()}
								disabled={isChecking || isLoggingOut}
								aria-label="Keluar"
								className="flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
								title="Keluar Akun"
							>
								<LogOut className="h-4 w-4" />
							</button>
						</div>
					</CardContent>
				</Card>
			)}

			{/* Indikator Status Rekonsiliasi vs Laporan Server /reports/low-stock (Task P6.3) */}
			<ReconciliationBadge
				reconciliation={reconciliation}
				isChecking={isReconciling || isCatalogSyncing}
				onRefreshCatalog={
					reconciliation.canRefreshCatalog
						? () => syncCatalogManual()
						: undefined
				}
			/>

			{/* Kartu Ringkasan KPI Inventaris (Task P6.1) */}
			<InventoryKPICards
				metrics={metrics}
				isLoading={isMetricsLoading}
				onCardClick={handleKPICardClick}
			/>

			{/* Widget Peringatan Stok Kritis & Menipis (Task P6.1) */}
			<CriticalStockAlertWidget
				urgentItems={urgentItems}
				totalAttentionCount={metrics.attentionNeededCount}
				isLoading={isMetricsLoading}
				onViewAllClick={handleViewAllUrgentStock}
			/>

			{/* Widget Ringkasan Pinjaman & Aktivitas Terakhir (Task P6.2) */}
			<div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
				<LoanSummaryWidget summary={loanSummary} isLoading={isLoansLoading} />
				<RecentActivityFeed
					activities={recentActivities}
					isLoading={isActivitiesLoading}
				/>
			</div>

			<section id="catalog-section" aria-label="Katalog Inventaris">
				<CatalogView initialStockFilter={catalogStockFilter} />
			</section>

			<LogoutConfirmDialog
				open={showWarningDialog}
				onOpenChange={cancelLogout}
				employee={employee}
				myPendingCount={myPendingCount}
				otherPendingCount={otherPendingCount}
				onConfirm={confirmLogout}
				onSyncBeforeLogout={syncBeforeLogout}
				isPending={isLoggingOut}
				isSyncing={isSyncingBeforeLogout}
			/>
		</div>
	);
}

export default HomePage;
