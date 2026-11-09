import { expect, test } from "@playwright/test";
import { setupApiMocks } from "./helpers/setupMocks";

test.describe("E2E Offline Mutation & Optimistic Stock Journey", () => {
	test.beforeEach(async ({ page }) => {
		await setupApiMocks(page);
	});

	test("melakukan pengambilan barang saat jaringan terputus (mode pesawat) dengan stok optimistik", async ({
		page,
		context,
	}) => {
		// 1. Login awal secara online
		await page.goto("/login");
		await page.fill("#login-namecode", "MRA");
		await page.fill("#login-pin", "123456");
		await page.click('button[type="submit"]');

		await expect(page).toHaveURL("/");
		await expect(
			page.locator("text=Spidol Whiteboard Snowman Hitam"),
		).toBeVisible();

		// 2. Putus koneksi jaringan browser (simulasi offline / gudang bawah tanah)
		await context.setOffline(true);

		// 3. Pilih item barang habis pakai
		await page.click("text=Spidol Whiteboard Snowman Hitam");

		// 4. Buka lembar aksi pengambilan barang
		const takeActionBtn = page.locator('[data-testid="action-take-btn"]');
		await expect(takeActionBtn).toBeVisible();
		await takeActionBtn.click();

		// 5. Submit pengambilan 1 pcs
		const submitBtn = page.locator('[data-testid="transaction-submit-btn"]');
		await expect(submitBtn).toBeVisible();
		await submitBtn.click();

		// 6. Tutup dialog feedback transaksi
		const closeFeedbackBtn = page.locator('[data-testid="btn-close-feedback"]');
		await expect(closeFeedbackBtn).toBeVisible();
		await closeFeedbackBtn.click();

		// 7. Verifikasi badge antrean outbox di BottomNav bertambah menjadi 1
		const outboxBadge = page.locator('[data-testid="outbox-badge-count"]');
		await expect(outboxBadge).toBeVisible();
		await expect(outboxBadge).toHaveText("1");

		// 8. Buka halaman Antrean Outbox via BottomNav
		await page.click('[data-testid="bottom-nav-outbox"]');
		await expect(page).toHaveURL(/\/outbox/);

		// 9. Verifikasi terdapat entri pending di antrean outbox
		await expect(
			page.locator("text=Spidol Whiteboard Snowman Hitam").first(),
		).toBeVisible();
	});
});
