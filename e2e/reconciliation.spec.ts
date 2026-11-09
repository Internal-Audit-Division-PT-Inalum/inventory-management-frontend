import { expect, test } from "@playwright/test";
import { setupApiMocks } from "./helpers/setupMocks";

test.describe("E2E Reconnection & Outbox Reconciliation Journey", () => {
	let capturedTransactions: Array<{ operation: string; payload: unknown }> = [];

	test.beforeEach(async ({ page }) => {
		capturedTransactions = [];
		await setupApiMocks(page, {
			onTransaction: (operation, payload) => {
				capturedTransactions.push({ operation, payload });
			},
		});
	});

	test("memulihkan koneksi dan menyinkronkan antrean transaksi ke backend secara otomatis", async ({
		page,
		context,
	}) => {
		// 1. Login
		await page.goto("/login");
		await page.fill("#login-namecode", "MRA");
		await page.fill("#login-pin", "123456");
		await page.click('button[type="submit"]');

		await expect(page).toHaveURL("/");
		await expect(
			page.locator("text=Spidol Whiteboard Snowman Hitam"),
		).toBeVisible();

		// 2. Offline mutation
		await context.setOffline(true);
		await page.click("text=Spidol Whiteboard Snowman Hitam");

		const takeBtn = page.locator('[data-testid="action-take-btn"]');
		await expect(takeBtn).toBeVisible();
		await takeBtn.click();

		const submitBtn = page.locator('[data-testid="transaction-submit-btn"]');
		await expect(submitBtn).toBeVisible();
		await submitBtn.click();

		// Tutup dialog feedback transaksi
		const closeFeedbackBtn = page.locator('[data-testid="btn-close-feedback"]');
		await expect(closeFeedbackBtn).toBeVisible();
		await closeFeedbackBtn.click();

		// Verifikasi 1 item antrean di bottom nav
		const outboxBadge = page.locator('[data-testid="outbox-badge-count"]');
		await expect(outboxBadge).toBeVisible();
		await expect(outboxBadge).toHaveText("1");

		// 3. Pulihkan koneksi online
		await context.setOffline(false);

		// 4. Buka halaman outbox
		await page.click('[data-testid="bottom-nav-outbox"]');
		await expect(page).toHaveURL(/\/outbox/);

		// 5. Klik tombol Sinkronkan Sekarang jika antrean belum otomatis terkirim
		const syncBtn = page.locator('button:has-text("Sinkronkan")');
		if (await syncBtn.isVisible()) {
			await syncBtn.click();
		}

		// 6. Tunggu hingga transaksi berhasil terkirim ke backend mock
		await expect
			.poll(() => capturedTransactions.length, { timeout: 10000 })
			.toBeGreaterThan(0);
		expect(capturedTransactions[0].operation).toBe("take");

		// 7. Verifikasi badge antrean outbox bersih (0 item)
		await expect(outboxBadge).not.toBeVisible({ timeout: 10000 });
	});
});
