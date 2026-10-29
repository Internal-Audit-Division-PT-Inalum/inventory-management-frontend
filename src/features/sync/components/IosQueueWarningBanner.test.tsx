import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { AGING_WARNING_DISMISSED_KEY } from "../hooks/useOutboxAgingWarning";
import type { OutboxAgingInfo } from "../lib/outboxAging";
import { IosQueueWarningBanner } from "./IosQueueWarningBanner";

describe("IosQueueWarningBanner Component & Guide Modal Suite (Task P5.10)", () => {
	beforeEach(async () => {
		localStorage.clear();
		await db.outbox.clear();
		vi.clearAllMocks();
	});

	afterEach(async () => {
		vi.restoreAllMocks();
		localStorage.clear();
		await db.outbox.clear();
	});

	it("does not render when there are no warnings and outbox is clean", async () => {
		render(
			<MemoryRouter>
				<IosQueueWarningBanner />
			</MemoryRouter>,
		);

		await waitFor(() => {
			expect(screen.queryByTestId("ios-queue-warning-banner")).toBeNull();
		});
	});

	it("renders stale outbox warning banner when item is older than 24 hours", async () => {
		const twoDaysAgoIso = new Date(
			Date.now() - 48 * 60 * 60 * 1000,
		).toISOString();

		await db.outbox.add({
			clientUuid: "uuid-stale-1",
			employeeId: "emp-1",
			operation: "take",
			itemId: "item-1",
			quantity: 2,
			occurredAt: twoDaysAgoIso,
			status: "pending",
			attempts: 0,
			createdAt: twoDaysAgoIso,
		});

		render(
			<MemoryRouter>
				<IosQueueWarningBanner />
			</MemoryRouter>,
		);

		await waitFor(() => {
			expect(screen.getByTestId("ios-queue-warning-banner")).toBeDefined();
			expect(
				screen.getByText(/Peringatan Antrean Offline Tertunda/i),
			).toBeDefined();
			expect(screen.getByText(/2 Hari Lalu/i)).toBeDefined();
		});
	});

	it("renders iOS-specific warning with Home Screen CTA when in iOS browser environment", async () => {
		const user = userEvent.setup();

		const mockIosAgingInfo: OutboxAgingInfo = {
			pendingCount: 2,
			hasStaleItems: false,
			oldestAgeHours: 2,
			oldestAgeDays: 0,
			oldestCreatedAt: new Date().toISOString(),
			warningLevel: "warning",
			isIosBrowser: true,
			shouldInstallToHomeScreen: true,
			shouldSyncImmediately: false,
			estimatedDaysUntilIosEviction: 7,
			message:
				"Pengguna iPhone: Pasang aplikasi ke Layar Utama agar transaksi offline tersimpan permanen dan tidak terhapus otomatis oleh Safari.",
		};

		render(
			<MemoryRouter>
				<IosQueueWarningBanner overrideAgingInfo={mockIosAgingInfo} />
			</MemoryRouter>,
		);

		// Verifikasi elemen banner
		expect(screen.getByTestId("ios-queue-warning-banner")).toBeDefined();
		expect(
			screen.getByText(/Tips Pengguna iPhone \(Amankan Transaksi\)/i),
		).toBeDefined();
		expect(
			screen.getByText(
				/Pasang aplikasi ke Layar Utama agar transaksi offline tersimpan permanen/i,
			),
		).toBeDefined();

		const openGuideBtn = screen.getByTestId("open-ios-guide-button");
		expect(openGuideBtn).toBeDefined();

		// Buka modal panduan iOS
		await user.click(openGuideBtn);

		// Modal panduan muncul
		expect(
			screen.getByRole("heading", { name: /Pasang ke Layar Utama iPhone/i }),
		).toBeDefined();
		expect(screen.getByText(/Ketuk Tombol Bagikan \(Share\)/i)).toBeDefined();
		expect(screen.getByText(/Pilih "Tambah ke Layar Utama"/i)).toBeDefined();
		expect(
			screen.getByText(
				/Menonaktifkan batas penghapusan penyimpanan 7 hari Safari/i,
			),
		).toBeDefined();

		// Tutup modal panduan
		await user.click(screen.getByRole("button", { name: "Saya Mengerti" }));
		await waitFor(() => {
			expect(
				screen.queryByRole("heading", {
					name: /Pasang ke Layar Utama iPhone/i,
				}),
			).toBeNull();
		});
	});

	it("renders critical danger banner for aging iOS items approaching 7-day eviction", async () => {
		const fourDaysAgoIso = new Date(
			Date.now() - 4 * 24 * 60 * 60 * 1000,
		).toISOString();

		const mockCriticalIosAgingInfo: OutboxAgingInfo = {
			pendingCount: 1,
			hasStaleItems: true,
			oldestAgeHours: 96,
			oldestAgeDays: 4,
			oldestCreatedAt: fourDaysAgoIso,
			warningLevel: "danger",
			isIosBrowser: true,
			shouldInstallToHomeScreen: true,
			shouldSyncImmediately: true,
			estimatedDaysUntilIosEviction: 3,
			message:
				"Perhatian Kritis (Safari iOS): Terdapat transaksi offline sejak 4 hari yang lalu. Safari dapat menghapus data lokal dalam 3 hari jika aplikasi tidak dipasang ke Layar Utama.",
		};

		const syncSpy = vi.fn();

		render(
			<MemoryRouter>
				<IosQueueWarningBanner
					overrideAgingInfo={mockCriticalIosAgingInfo}
					onSyncNow={syncSpy}
				/>
			</MemoryRouter>,
		);

		expect(
			screen.getByText(/Perhatian Kritis: Risiko Data Safari iOS/i),
		).toBeDefined();
		expect(
			screen.getByText(
				/Safari dapat menghapus data lokal dalam 3 hari jika aplikasi tidak dipasang ke Layar Utama/i,
			),
		).toBeDefined();
		expect(screen.getByText(/4 Hari Lalu/i)).toBeDefined();

		// Klik tombol Sinkronkan Sekarang
		const syncBtn = screen.getByTestId("warning-sync-now-button");
		await userEvent.click(syncBtn);
		expect(syncSpy).toHaveBeenCalledTimes(1);
	});

	it("hides warning when dismissed by user", async () => {
		const user = userEvent.setup();

		const mockAgingInfo: OutboxAgingInfo = {
			pendingCount: 1,
			hasStaleItems: true,
			oldestAgeHours: 25,
			oldestAgeDays: 1,
			oldestCreatedAt: new Date().toISOString(),
			warningLevel: "warning",
			isIosBrowser: false,
			shouldInstallToHomeScreen: false,
			shouldSyncImmediately: true,
			estimatedDaysUntilIosEviction: 6,
			message: "Antrean tua perlu disinkronkan",
		};

		render(
			<MemoryRouter>
				<IosQueueWarningBanner overrideAgingInfo={mockAgingInfo} />
			</MemoryRouter>,
		);

		expect(screen.getByTestId("ios-queue-warning-banner")).toBeDefined();

		// Klik tombol dismiss (X)
		const dismissBtn = screen.getByTestId("dismiss-ios-warning-button");
		await user.click(dismissBtn);

		// localStorage terisi timestamp dismiss
		expect(localStorage.getItem(AGING_WARNING_DISMISSED_KEY)).toBeDefined();
	});
});
