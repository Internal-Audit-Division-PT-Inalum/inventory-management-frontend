import * as React from "react";
import { Outlet } from "react-router-dom";
import { InstallPromptBanner } from "@/features/pwa/components/InstallPromptBanner";
import { requestPersistentStorage } from "@/features/pwa/lib/persistentStorage";
import { cn } from "@/lib/utils";
import { AppHeader, type AppHeaderProps } from "./AppHeader";
import { BottomNav, type BottomNavProps } from "./BottomNav";

export interface AppShellProps {
	children?: React.ReactNode;
	showHeader?: boolean;
	showBottomNav?: boolean;
	showInstallPrompt?: boolean;
	headerProps?: AppHeaderProps;
	bottomNavProps?: BottomNavProps;
	className?: string;
	contentClassName?: string;
}

/**
 * Shell layout utama untuk PWA Mobile Inventaris PT INALUM:
 * - Menyediakan AppHeader terpadu dengan status online/offline dan identitas korporat.
 * - Wadah konten fleksibel (mendukung Outlet React Router maupun children langsung).
 * - BottomNav tetap di bagian bawah dengan kompensasi padding safe area.
 * - Banner prompt instalasi PWA (Android / iOS) dan aktivasi persistent storage otomatis.
 */
export function AppShell({
	children,
	showHeader = true,
	showBottomNav = true,
	showInstallPrompt = true,
	headerProps,
	bottomNavProps,
	className,
	contentClassName,
}: AppShellProps) {
	// Minta penyimpanan persisten di peramban saat inisialisasi layout
	React.useEffect(() => {
		void requestPersistentStorage();
	}, []);

	return (
		<div
			className={cn(
				"flex min-h-screen flex-col bg-slate-50 text-slate-900 selection:bg-[#004785]/20",
				className,
			)}
		>
			{/* Top Header */}
			{showHeader && <AppHeader {...headerProps} />}

			{/* Main Scrollable Content */}
			<main
				className={cn(
					"mx-auto flex w-full max-w-md flex-1 flex-col px-4 pt-3 sm:px-6 transition-all",
					showBottomNav ? "pb-24" : "pb-6",
					contentClassName,
				)}
			>
				{/* Banner PWA Install (Android / iOS) */}
				{showInstallPrompt && <InstallPromptBanner />}

				{children ?? <Outlet />}
			</main>

			{/* Bottom Navigation */}
			{showBottomNav && <BottomNav {...bottomNavProps} />}
		</div>
	);
}
