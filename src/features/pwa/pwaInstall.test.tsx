import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InstallPromptBanner } from "./components/InstallPromptBanner";
import {
	type BeforeInstallPromptEvent,
	PWA_DISMISSED_KEY,
	usePwaInstall,
} from "./hooks/usePwaInstall";
import {
	checkStoragePersistence,
	requestPersistentStorage,
} from "./lib/persistentStorage";

function TestHookComponent() {
	const pwa = usePwaInstall();
	return (
		<div>
			<span data-testid="can-install">{String(pwa.canInstall)}</span>
			<span data-testid="is-standalone">{String(pwa.isStandalone)}</span>
			<span data-testid="is-dismissed">{String(pwa.isDismissed)}</span>
			<button
				type="button"
				onClick={() => pwa.promptInstall()}
				data-testid="btn-prompt"
			>
				Prompt
			</button>
			<button
				type="button"
				onClick={() => pwa.dismissPrompt()}
				data-testid="btn-dismiss"
			>
				Dismiss
			</button>
			<button
				type="button"
				onClick={() => pwa.resetDismissed()}
				data-testid="btn-reset"
			>
				Reset
			</button>
		</div>
	);
}

describe("PWA Install & Persistent Storage Suite (Task P2.7)", () => {
	beforeEach(() => {
		localStorage.clear();
		vi.restoreAllMocks();
	});

	afterEach(() => {
		localStorage.clear();
		vi.restoreAllMocks();
	});

	describe("Persistent Storage Module", () => {
		it("checks storage persistence status correctly when supported", async () => {
			const persistedMock = vi.fn().mockResolvedValue(true);
			Object.defineProperty(navigator, "storage", {
				value: { persisted: persistedMock },
				configurable: true,
				writable: true,
			});

			const status = await checkStoragePersistence();
			expect(status.isSupported).toBe(true);
			expect(status.isPersisted).toBe(true);
			expect(persistedMock).toHaveBeenCalledTimes(1);
		});

		it("returns isSupported false when navigator.storage is undefined", async () => {
			Object.defineProperty(navigator, "storage", {
				value: undefined,
				configurable: true,
				writable: true,
			});

			const status = await checkStoragePersistence();
			expect(status.isSupported).toBe(false);
			expect(status.isPersisted).toBe(false);

			const persistResult = await requestPersistentStorage();
			expect(persistResult).toBe(false);
		});

		it("requests persistent storage successfully", async () => {
			const persistMock = vi.fn().mockResolvedValue(true);
			Object.defineProperty(navigator, "storage", {
				value: { persist: persistMock },
				configurable: true,
				writable: true,
			});

			const result = await requestPersistentStorage();
			expect(result).toBe(true);
			expect(persistMock).toHaveBeenCalledTimes(1);
		});
	});

	describe("usePwaInstall Hook", () => {
		it("catches beforeinstallprompt event and triggers native prompt", async () => {
			const promptMock = vi.fn().mockResolvedValue(undefined);
			const mockEvent = new Event(
				"beforeinstallprompt",
			) as BeforeInstallPromptEvent;
			Object.assign(mockEvent, {
				prompt: promptMock,
				userChoice: Promise.resolve({
					outcome: "accepted",
					platform: "chromium",
				}),
				platforms: ["chromium"],
			});

			render(<TestHookComponent />);
			expect(screen.getByTestId("can-install").textContent).toBe("false");

			// Pemicu event beforeinstallprompt
			fireEvent(window, mockEvent);

			await waitFor(() => {
				expect(screen.getByTestId("can-install").textContent).toBe("true");
			});

			// Klik tombol trigger prompt
			fireEvent.click(screen.getByTestId("btn-prompt"));

			await waitFor(() => {
				expect(promptMock).toHaveBeenCalledTimes(1);
			});
		});

		it("saves dismiss cooldown to localStorage and resets cleanly", async () => {
			render(<TestHookComponent />);

			expect(screen.getByTestId("is-dismissed").textContent).toBe("false");

			// Dismiss
			fireEvent.click(screen.getByTestId("btn-dismiss"));
			expect(screen.getByTestId("is-dismissed").textContent).toBe("true");
			expect(localStorage.getItem(PWA_DISMISSED_KEY)).toBeTruthy();

			// Reset
			fireEvent.click(screen.getByTestId("btn-reset"));
			expect(screen.getByTestId("is-dismissed").textContent).toBe("false");
			expect(localStorage.getItem(PWA_DISMISSED_KEY)).toBeNull();
		});
	});

	describe("InstallPromptBanner Component", () => {
		it("renders Android native install prompt banner in forceMode android", async () => {
			const onInstalledMock = vi.fn();

			render(
				<InstallPromptBanner
					forceShow={true}
					forceMode="android"
					onInstalled={onInstalledMock}
				/>,
			);

			expect(screen.getByText("Pasang Aplikasi Inventaris")).toBeDefined();
			expect(screen.getByText(/Akses instan dari layar utama/i)).toBeDefined();

			const installBtn = screen.getByRole("button", { name: /^pasang$/i });
			expect(installBtn).toBeDefined();

			const laterBtn = screen.getByRole("button", {
				name: /tutup penawaran pasang/i,
			});
			fireEvent.click(laterBtn);

			expect(localStorage.getItem(PWA_DISMISSED_KEY)).toBeTruthy();
		});

		it("renders iOS Safari guidance card in forceMode ios", async () => {
			const user = userEvent.setup();

			render(<InstallPromptBanner forceShow={true} forceMode="ios" />);

			expect(screen.getByText("Pasang di Layar Utama iPhone")).toBeDefined();
			expect(screen.getByText(/Bagikan \(Share\)/i)).toBeDefined();
			expect(screen.getByText(/Tambah ke Layar Utama/i)).toBeDefined();

			const understandBtn = screen.getByRole("button", {
				name: /saya mengerti/i,
			});
			await user.click(understandBtn);

			expect(localStorage.getItem(PWA_DISMISSED_KEY)).toBeTruthy();
		});

		it("does not render when standalone mode is active and forceShow is false", () => {
			// Mock media query standalone = true
			window.matchMedia = vi.fn().mockImplementation((query: string) => ({
				matches: query === "(display-mode: standalone)",
				media: query,
				onchange: null,
				addListener: vi.fn(),
				removeListener: vi.fn(),
				addEventListener: vi.fn(),
				removeEventListener: vi.fn(),
				dispatchEvent: vi.fn(),
			}));

			render(<InstallPromptBanner forceShow={false} />);
			expect(screen.queryByText("Pasang Aplikasi Inventaris")).toBeNull();
			expect(screen.queryByText("Pasang di Layar Utama iPhone")).toBeNull();
		});
	});
});
