import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SyncStatusBar } from "./components/SyncStatusBar";

describe("SyncStatusBar Component (Task P2.5)", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it("renders Online status indicator when connected", () => {
		render(
			<SyncStatusBar
				isOffline={false}
				isSyncing={false}
				lastSyncedAt="2026-10-26T13:30:00Z"
			/>,
		);

		expect(screen.getByText("Online")).toBeDefined();
		expect(screen.queryByText("Mode Offline")).toBeNull();
	});

	it("renders Mode Offline status indicator when offline", () => {
		render(
			<SyncStatusBar
				isOffline={true}
				isSyncing={false}
				lastSyncedAt="2026-10-26T13:30:00Z"
			/>,
		);

		expect(screen.getByText("Mode Offline")).toBeDefined();
		expect(screen.queryByText("Online")).toBeNull();
	});

	it("renders relative sync time accurately", () => {
		const now = new Date();
		render(
			<SyncStatusBar
				isOffline={false}
				isSyncing={false}
				lastSyncedAt={now.toISOString()}
			/>,
		);

		expect(screen.getByText("Baru saja")).toBeDefined();
	});

	it("renders fallback message when never synced before", () => {
		render(
			<SyncStatusBar isOffline={false} isSyncing={false} lastSyncedAt={null} />,
		);

		expect(screen.getByText("Belum disinkronkan")).toBeDefined();
	});

	it("renders syncing spinner and disables button when isSyncing is true", () => {
		const onSyncSpy = vi.fn();
		render(
			<SyncStatusBar
				isOffline={false}
				isSyncing={true}
				lastSyncedAt="2026-10-26T13:30:00Z"
				onSync={onSyncSpy}
			/>,
		);

		const button = screen.getByRole("button", {
			name: /Sedang menyinkronkan/i,
		});
		expect(button.hasAttribute("disabled")).toBe(true);

		fireEvent.click(button);
		expect(onSyncSpy).not.toHaveBeenCalled();
	});

	it("disables refresh button when in offline mode", () => {
		const onSyncSpy = vi.fn();
		render(
			<SyncStatusBar
				isOffline={true}
				isSyncing={false}
				lastSyncedAt="2026-10-26T13:30:00Z"
				onSync={onSyncSpy}
			/>,
		);

		const button = screen.getByRole("button", { name: /Segarkan/i });
		expect(button.hasAttribute("disabled")).toBe(true);

		fireEvent.click(button);
		expect(onSyncSpy).not.toHaveBeenCalled();
	});

	it("triggers onSync callback when Segarkan button is clicked while online", () => {
		const onSyncSpy = vi.fn();
		render(
			<SyncStatusBar
				isOffline={false}
				isSyncing={false}
				lastSyncedAt="2026-10-26T13:30:00Z"
				onSync={onSyncSpy}
			/>,
		);

		const button = screen.getByRole("button", { name: /Segarkan/i });
		expect(button.hasAttribute("disabled")).toBe(false);

		fireEvent.click(button);
		expect(onSyncSpy).toHaveBeenCalledTimes(1);
	});

	it("displays error banner when error prop is present and allows retry", () => {
		const onSyncSpy = vi.fn();
		render(
			<SyncStatusBar
				isOffline={false}
				isSyncing={false}
				lastSyncedAt="2026-10-26T13:30:00Z"
				error="Koneksi server gagal (503)"
				onSync={onSyncSpy}
			/>,
		);

		expect(screen.getByText("Koneksi server gagal (503)")).toBeDefined();

		const retryBtn = screen.getByRole("button", { name: /Coba lagi/i });
		fireEvent.click(retryBtn);
		expect(onSyncSpy).toHaveBeenCalledTimes(1);
	});
});
