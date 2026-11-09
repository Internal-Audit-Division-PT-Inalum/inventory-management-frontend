import { expect, test } from "@playwright/test";

test.describe("E2E PWA Hardening & Metadata Compliance", () => {
	test("memiliki metadata PWA, manifest, dan konfigurasi viewport yang sesuai standar Lighthouse", async ({
		page,
	}) => {
		await page.goto("/login");

		// 1. Meta Theme-Color
		const themeColor = await page
			.locator('meta[name="theme-color"]')
			.getAttribute("content");
		expect(themeColor?.toLowerCase()).toBe("#004785");

		// 2. Viewport a11y (tidak boleh mematikan zoom user)
		const viewport = await page
			.locator('meta[name="viewport"]')
			.getAttribute("content");
		expect(viewport).toContain("width=device-width");
		expect(viewport).toContain("initial-scale=1.0");
		expect(viewport).not.toContain("user-scalable=no");
		expect(viewport).not.toContain("maximum-scale=1");

		// 3. Web App Manifest link
		const manifestLink = await page
			.locator('link[rel="manifest"]')
			.getAttribute("href");
		expect(manifestLink).toBeTruthy();

		// 4. Unduh dan verifikasi isi file manifest
		const manifestResponse = await page.request.get(
			manifestLink || "/manifest.webmanifest",
		);
		expect(manifestResponse.status()).toBe(200);

		const manifestJson = await manifestResponse.json();
		expect(manifestJson.name).toContain("Inventory");
		expect(manifestJson.theme_color?.toLowerCase()).toBe("#004785");
		expect(manifestJson.display).toBe("standalone");
		expect(Array.isArray(manifestJson.icons)).toBe(true);
		expect(manifestJson.icons.length).toBeGreaterThan(0);
	});
});
