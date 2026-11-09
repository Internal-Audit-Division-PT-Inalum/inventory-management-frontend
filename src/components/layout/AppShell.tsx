import * as React from "react";
import { Outlet, useLocation } from "react-router-dom";
import { InstallPromptBanner } from "@/features/pwa/components/InstallPromptBanner";
import { requestPersistentStorage } from "@/features/pwa/lib/persistentStorage";
import { IosQueueWarningBanner, useSyncScheduler } from "@/features/sync";
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
 * Primary application shell layout for PT INALUM Mobile Inventory PWA.
 * Provides responsive viewport containment, sticky corporate header,
 * safe-area padded bottom navigation, and automated background sync scheduling.
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
	useSyncScheduler();

	React.useEffect(() => {
		void requestPersistentStorage();
	}, []);

	const location = useLocation();
	const isOutboxPage = location.pathname.startsWith("/outbox");

	return (
		<div
			className={cn(
				"flex min-h-screen flex-col bg-slate-50 text-slate-900 selection:bg-[#004785]/20",
				className,
			)}
		>
			{showHeader && <AppHeader {...headerProps} />}

			<main
				className={cn(
					"mx-auto flex w-full max-w-md flex-1 flex-col px-4 pt-3 sm:px-6 transition-all",
					showBottomNav ? "pb-24" : "pb-6",
					contentClassName,
				)}
			>
				{showInstallPrompt && <InstallPromptBanner />}
				{!isOutboxPage && <IosQueueWarningBanner />}

				{children ?? <Outlet />}
			</main>

			{showBottomNav && <BottomNav {...bottomNavProps} />}
		</div>
	);
}
