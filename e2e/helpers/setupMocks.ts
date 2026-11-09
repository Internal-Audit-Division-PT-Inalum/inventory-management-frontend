import type { Page } from "@playwright/test";
import {
	MOCK_AUTH_SESSION,
	MOCK_ITEMS,
	MOCK_LOCATIONS,
} from "../fixtures/mockData";

export interface SetupMockOptions {
	items?: typeof MOCK_ITEMS;
	onTransaction?: (operation: string, payload: unknown) => void;
}

export async function setupApiMocks(
	page: Page,
	options: SetupMockOptions = {},
) {
	const currentItems = [...(options.items || MOCK_ITEMS)];

	// Mock Login
	await page.route("**/api/v1/auth/login", async (route) => {
		const request = route.request();
		const body = request.postDataJSON() as { namecode?: string; pin?: string };

		if (body.namecode === "MRA" && body.pin === "123456") {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					success: true,
					data: MOCK_AUTH_SESSION,
				}),
			});
		} else {
			await route.fulfill({
				status: 401,
				contentType: "application/json",
				body: JSON.stringify({
					success: false,
					message: "Namecode atau PIN salah. Silakan periksa kembali.",
				}),
			});
		}
	});

	// Mock Change PIN
	await page.route("**/api/v1/auth/pin/change", async (route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({
				success: true,
				message: "PIN berhasil diubah.",
			}),
		});
	});

	// Mock Logout
	await page.route("**/api/v1/auth/logout", async (route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({
				success: true,
			}),
		});
	});

	// Mock Catalog
	await page.route("**/api/v1/inventory/catalog", async (route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			headers: {
				etag: '"mock-catalog-etag-v1"',
			},
			body: JSON.stringify({
				success: true,
				data: currentItems,
			}),
		});
	});

	// Mock Locations
	await page.route("**/api/v1/inventory/locations", async (route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({
				success: true,
				data: MOCK_LOCATIONS,
			}),
		});
	});

	// Mock Loans
	await page.route("**/api/v1/inventory/loans/mine*", async (route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({
				success: true,
				data: [],
			}),
		});
	});

	// Mock Low-Stock Report
	await page.route("**/api/v1/inventory/reports/low-stock", async (route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({
				success: true,
				data: [],
			}),
		});
	});

	// Mock Items Transaction (take, add, borrow, return)
	await page.route(
		/.*\/api\/v1\/inventory\/items\/([^/]+)\/(take|add|borrow|return)/,
		async (route) => {
			const url = route.request().url();
			const match = url.match(/\/items\/([^/]+)\/(take|add|borrow|return)/);
			const itemId = match ? match[1] : "itm-001";
			const operation = match ? match[2] : "take";
			const body = route.request().postDataJSON();

			options.onTransaction?.(operation, body);

			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					success: true,
					data: {
						id: `tx-mock-${Date.now()}`,
						item_id: itemId,
						operation,
						quantity: body?.quantity ?? 1,
						client_uuid: body?.client_uuid,
						created_at: new Date().toISOString(),
					},
				}),
			});
		},
	);
}
