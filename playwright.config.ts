import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
	testDir: "./e2e",
	timeout: 30000,
	expect: {
		timeout: 8000,
	},
	fullyParallel: false,
	forbidOnly: Boolean(process.env.CI),
	retries: process.env.CI ? 2 : 0,
	workers: 1,
	reporter: [["list"]],
	use: {
		baseURL: "http://127.0.0.1:5174",
		trace: "on-first-retry",
		screenshot: "only-on-failure",
	},
	projects: [
		{
			name: "Mobile Chrome",
			use: {
				...devices["Pixel 7"],
			},
		},
	],
	webServer: {
		command: process.env.CI
			? "npm run preview -- --host 127.0.0.1 --port 5174"
			: "npm run dev -- --host 127.0.0.1 --port 5174",
		url: "http://127.0.0.1:5174",
		reuseExistingServer: !process.env.CI,
		timeout: 30000,
	},
});
