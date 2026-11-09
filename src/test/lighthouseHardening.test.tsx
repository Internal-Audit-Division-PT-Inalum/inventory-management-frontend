import fs from "node:fs";
import path from "node:path";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { AppHeader } from "@/components/layout/AppHeader";
import { BottomNav } from "@/components/layout/BottomNav";
import { useAuthStore } from "@/features/auth/store/authStore";

describe("Lighthouse & PWA Hardening Suite (Task P7.1)", () => {
	const projectRoot = path.resolve(__dirname, "../../");
	const indexHtmlPath = path.resolve(projectRoot, "index.html");
	const viteConfigPath = path.resolve(projectRoot, "vite.config.ts");
	const publicDir = path.resolve(projectRoot, "public");

	describe("1. Lighthouse PWA & HTML Quality Standards", () => {
		it("ensures index.html defines a valid ISO language attribute", () => {
			const htmlContent = fs.readFileSync(indexHtmlPath, "utf-8");
			expect(htmlContent).toMatch(/<html\s+lang=["']id["']/i);
		});

		it("ensures viewport does NOT restrict user zoom (eliminates Lighthouse A11y penalty)", () => {
			const htmlContent = fs.readFileSync(indexHtmlPath, "utf-8");
			// Lighthouse flags maximum-scale < 5 or user-scalable=no
			expect(htmlContent).not.toMatch(/user-scalable\s*=\s*no/i);
			expect(htmlContent).not.toMatch(/maximum-scale\s*=\s*1(\.0)?/i);
			expect(htmlContent).toMatch(
				/<meta\s+name=["']viewport["']\s+content=["'][^"']*width=device-width[^"']*["']/i,
			);
		});

		it("ensures mobile theme-color matches INALUM brand identity (#004785)", () => {
			const htmlContent = fs.readFileSync(indexHtmlPath, "utf-8");
			expect(htmlContent).toMatch(
				/<meta\s+name=["']theme-color["']\s+content=["']#004785["']/i,
			);
		});

		it("ensures a meaningful description is present for SEO and PWA install prompts", () => {
			const htmlContent = fs.readFileSync(indexHtmlPath, "utf-8");
			expect(htmlContent).toMatch(
				/<meta\s+name=["']description["']\s+content=["'][^"']{20,}["']/i,
			);
		});

		it("ensures apple-touch-icon and favicon are properly linked in head", () => {
			const htmlContent = fs.readFileSync(indexHtmlPath, "utf-8");
			expect(htmlContent).toMatch(
				/<link\s+rel=["']apple-touch-icon["']\s+href=["']\/apple-touch-icon\.png["']/i,
			);
			expect(htmlContent).toMatch(/<link\s+rel=["']icon["']/i);
		});

		it("ensures noscript fallback exists for environments without JavaScript", () => {
			const htmlContent = fs.readFileSync(indexHtmlPath, "utf-8");
			expect(htmlContent).toMatch(/<noscript>[\s\S]*?<\/noscript>/i);
		});
	});

	describe("2. Web App Manifest & Service Worker Specifications", () => {
		it("ensures vite.config.ts configures PWA manifest with rich metadata", () => {
			const configContent = fs.readFileSync(viteConfigPath, "utf-8");

			// Standalone mode & start URL
			expect(configContent).toContain('display: "standalone"');
			expect(configContent).toContain('start_url: "/"');
			expect(configContent).toContain('id: "/"');
			expect(configContent).toContain('theme_color: "#004785"');
			expect(configContent).toContain('background_color: "#ffffff"');

			// Categories & shortcuts
			expect(configContent).toContain("categories:");
			expect(configContent).toContain("shortcuts:");
			expect(configContent).toContain("cleanupOutdatedCaches: true");
		});

		it("verifies all required PWA icon assets exist in the public directory", () => {
			const icon192 = path.resolve(publicDir, "icons/icon-192x192.png");
			const icon512 = path.resolve(publicDir, "icons/icon-512x512.png");
			const maskable192 = path.resolve(
				publicDir,
				"icons/icon-maskable-192x192.png",
			);
			const maskable512 = path.resolve(
				publicDir,
				"icons/icon-maskable-512x512.png",
			);
			const appleTouchIcon = path.resolve(publicDir, "apple-touch-icon.png");

			expect(fs.existsSync(icon192)).toBe(true);
			expect(fs.existsSync(icon512)).toBe(true);
			expect(fs.existsSync(maskable192)).toBe(true);
			expect(fs.existsSync(maskable512)).toBe(true);
			expect(fs.existsSync(appleTouchIcon)).toBe(true);
		});
	});

	describe("3. Mobile Accessibility (A11y) & Touch Target Ergonomics", () => {
		it("ensures BottomNav tabs meet WCAG minimum touch target standards (>= 44px)", () => {
			render(
				<MemoryRouter>
					<BottomNav />
				</MemoryRouter>,
			);

			const catalogTab = screen.getByTestId("bottom-nav-catalog");
			const loansTab = screen.getByTestId("bottom-nav-loans");
			const outboxTab = screen.getByTestId("bottom-nav-outbox");
			const profileTab = screen.getByTestId("bottom-nav-profile");

			// Check class list for touch target utilities
			expect(catalogTab.className).toContain("min-h-[48px]");
			expect(loansTab.className).toContain("min-h-[48px]");
			expect(outboxTab.className).toContain("min-h-[48px]");
			expect(profileTab.className).toContain("min-h-[48px]");
		});

		it("ensures AppHeader employee profile badge has accessible label and touch sizing", () => {
			useAuthStore.setState({
				token: "mock-valid-token",
				employee: {
					id: "emp-test-01",
					user_id: "usr-test-01",
					namecode: "MRA",
					name: "Muhammad Raihan Auditor",
					email: "raihan@inalum.id",
					is_active: true,
					must_change_pin: false,
				},
				mustChangePin: false,
			});

			render(
				<MemoryRouter>
					<AppHeader />
				</MemoryRouter>,
			);

			const profileLink = screen.getByLabelText(/Profil Muhammad Raihan/i);
			expect(profileLink).toBeDefined();
			expect(profileLink.className).toContain("touch-target");
		});
	});
});
