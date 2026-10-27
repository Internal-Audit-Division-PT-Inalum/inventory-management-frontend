import * as React from "react";
import { requestPersistentStorage } from "../lib/persistentStorage";

export interface BeforeInstallPromptEvent extends Event {
	readonly platforms: string[];
	readonly userChoice: Promise<{
		outcome: "accepted" | "dismissed";
		platform: string;
	}>;
	prompt(): Promise<void>;
}

export const PWA_DISMISSED_KEY = "pwa_install_prompt_dismissed_at";
export const PWA_DISMISS_COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000; // 3 hari cooldown

/**
 * Mendeteksi apakah aplikasi saat ini berjalan dalam mode standalone (terpasang sebagai PWA).
 */
export function isRunningStandalone(): boolean {
	if (typeof window === "undefined") return false;

	const isStandaloneMedia = window.matchMedia?.(
		"(display-mode: standalone)",
	).matches;
	const isIosStandalone =
		"standalone" in window.navigator &&
		Boolean(
			(window.navigator as unknown as { standalone?: boolean }).standalone,
		);

	return Boolean(isStandaloneMedia || isIosStandalone);
}

/**
 * Mendeteksi apakah perangkat saat ini menggunakan iOS Safari.
 */
export function isIosDevice(): { isIos: boolean; isIosSafari: boolean } {
	if (typeof window === "undefined" || typeof navigator === "undefined") {
		return { isIos: false, isIosSafari: false };
	}

	const ua = navigator.userAgent || "";
	const isIos =
		/iPhone|iPad|iPod/i.test(ua) ||
		(navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

	// Deteksi Safari asli di iOS (bukan Chrome/Firefox/Edge iOS)
	const isIosSafari =
		isIos &&
		/Safari/i.test(ua) &&
		!/CriOS|FxiOS|OPiOS|EdgiOS|mercury/i.test(ua);

	return { isIos, isIosSafari };
}

/**
 * Hook untuk mengelola siklus hidup pemasangan PWA (Android prompt & petunjuk iOS Safari).
 */
export function usePwaInstall() {
	const [deferredPrompt, setDeferredPrompt] =
		React.useState<BeforeInstallPromptEvent | null>(null);
	const [isStandalone, setIsStandalone] = React.useState<boolean>(() =>
		isRunningStandalone(),
	);
	const [isInstalled, setIsInstalled] = React.useState<boolean>(false);
	const [isDismissed, setIsDismissed] = React.useState<boolean>(() => {
		if (typeof window === "undefined") return false;
		try {
			const dismissedAt = localStorage.getItem(PWA_DISMISSED_KEY);
			if (!dismissedAt) return false;
			const timePassed = Date.now() - Number(dismissedAt);
			return timePassed < PWA_DISMISS_COOLDOWN_MS;
		} catch {
			return false;
		}
	});

	const { isIos, isIosSafari } = React.useMemo(() => isIosDevice(), []);

	React.useEffect(() => {
		// Sinkronkan status standalone saat media query berubah
		if (typeof window !== "undefined" && window.matchMedia) {
			const mediaQuery = window.matchMedia("(display-mode: standalone)");
			const handleChange = (e: MediaQueryListEvent) => {
				setIsStandalone(e.matches);
			};
			mediaQuery.addEventListener?.("change", handleChange);

			return () => {
				mediaQuery.removeEventListener?.("change", handleChange);
			};
		}
	}, []);

	React.useEffect(() => {
		const handleBeforeInstallPrompt = (e: Event) => {
			// Cegah banner otomatis bawaan browser agar dikendalikan banner Inalum
			e.preventDefault();
			setDeferredPrompt(e as BeforeInstallPromptEvent);
		};

		const handleAppInstalled = () => {
			setIsInstalled(true);
			setDeferredPrompt(null);
			// Otomatis minta persistent storage saat aplikasi terpasang
			void requestPersistentStorage();
		};

		window.addEventListener(
			"beforeinstallprompt",
			handleBeforeInstallPrompt as EventListener,
		);
		window.addEventListener("appinstalled", handleAppInstalled);

		return () => {
			window.removeEventListener(
				"beforeinstallprompt",
				handleBeforeInstallPrompt as EventListener,
			);
			window.removeEventListener("appinstalled", handleAppInstalled);
		};
	}, []);

	// Pemicu pemasangan PWA native (Android / Chromium Desktop)
	const promptInstall = React.useCallback(async (): Promise<
		"accepted" | "dismissed" | null
	> => {
		if (!deferredPrompt) {
			return null;
		}

		try {
			await deferredPrompt.prompt();
			const choiceResult = await deferredPrompt.userChoice;

			if (choiceResult.outcome === "accepted") {
				setIsInstalled(true);
				void requestPersistentStorage();
			}

			setDeferredPrompt(null);
			return choiceResult.outcome;
		} catch {
			setDeferredPrompt(null);
			return null;
		}
	}, [deferredPrompt]);

	// Menyimpan penolakan prompt sementara waktu (cooldown)
	const dismissPrompt = React.useCallback(() => {
		setIsDismissed(true);
		try {
			localStorage.setItem(PWA_DISMISSED_KEY, Date.now().toString());
		} catch {
			// Ignore localStorage write error
		}
	}, []);

	// Mengatur ulang status penolakan (misal untuk testing)
	const resetDismissed = React.useCallback(() => {
		setIsDismissed(false);
		try {
			localStorage.removeItem(PWA_DISMISSED_KEY);
		} catch {
			// Ignore localStorage remove error
		}
	}, []);

	return {
		isStandalone,
		canInstall: Boolean(deferredPrompt) && !isStandalone,
		isIos,
		isIosSafari,
		isDismissed,
		isInstalled,
		promptInstall,
		dismissPrompt,
		resetDismissed,
	};
}
