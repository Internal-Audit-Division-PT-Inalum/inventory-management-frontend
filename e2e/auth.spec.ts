import { expect, test } from "@playwright/test";
import { setupApiMocks } from "./helpers/setupMocks";

test.describe("E2E Authentication Journey", () => {
	test.beforeEach(async ({ page }) => {
		await setupApiMocks(page);
	});

	test("menolak login jika PIN salah dan menampilkan pesan peringatan", async ({
		page,
	}) => {
		await page.goto("/login");

		await page.fill("#login-namecode", "MRA");
		await page.fill("#login-pin", "999999");
		await page.click('button[type="submit"]');

		const alert = page.locator('div[role="alert"]');
		await expect(alert).toBeVisible();
		await expect(alert).toContainText("Namecode atau PIN salah");
	});

	test("berhasil login dengan kredensial sah dan menampilkan nama pegawai di dashboard", async ({
		page,
	}) => {
		await page.goto("/login");

		await page.fill("#login-namecode", "MRA");
		await page.fill("#login-pin", "123456");
		await page.click('button[type="submit"]');

		// Redirect ke dashboard home
		await expect(page).toHaveURL("/");
		await expect(page.locator("text=MRA").first()).toBeVisible();
		await expect(
			page.locator("text=Muhammad Ridwan Auditor").first(),
		).toBeVisible();
	});

	test("menjalankan alur logout langsung ketika tidak ada antrean tertunda", async ({
		page,
	}) => {
		await page.goto("/login");
		await page.fill("#login-namecode", "MRA");
		await page.fill("#login-pin", "123456");
		await page.click('button[type="submit"]');

		await expect(page).toHaveURL("/");

		// Klik tombol logout di kartu profil
		const logoutBtn = page.locator('button[aria-label="Keluar"]');
		await expect(logoutBtn).toBeVisible();
		await logoutBtn.click();

		// Kembali ke halaman login
		await expect(page).toHaveURL("/login");
	});

	test("menampilkan dialog konfirmasi logout aman saat terdapat antrean outbox offline", async ({
		page,
		context,
	}) => {
		await page.goto("/login");
		await page.fill("#login-namecode", "MRA");
		await page.fill("#login-pin", "123456");
		await page.click('button[type="submit"]');

		await expect(page).toHaveURL("/");

		// Pastikan katalog terisi saat online terlebih dahulu
		await expect(
			page.locator("text=Spidol Whiteboard Snowman Hitam"),
		).toBeVisible();

		// Putus jaringan & lakukan transaksi agar ada antrean tertunda
		await context.setOffline(true);
		await page.click("text=Spidol Whiteboard Snowman Hitam");

		await page.click('[data-testid="action-take-btn"]');
		await page.click('[data-testid="transaction-submit-btn"]');

		// Tutup dialog feedback transaksi
		const closeFeedbackBtn = page.locator('[data-testid="btn-close-feedback"]');
		await expect(closeFeedbackBtn).toBeVisible();
		await closeFeedbackBtn.click();

		// Klik tombol logout
		const logoutBtn = page.locator('button[aria-label="Keluar"]');
		await expect(logoutBtn).toBeVisible();
		await logoutBtn.click();

		// Dialog konfirmasi Zero Data Loss muncul
		const dialog = page.locator('div[role="dialog"]');
		await expect(dialog).toBeVisible();
		await expect(dialog).toContainText("Transaksi Belum Tersinkron");

		// Konfirmasi keluar paksa
		await page.click('button:has-text("Tetap Keluar")');
		await expect(page).toHaveURL("/login");
	});
});
