import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { OutboxPage } from "./OutboxPage";

describe("OutboxPage Integration Tests (Task P5.9)", () => {
	beforeEach(async () => {
		await db.items.clear();
		await db.outbox.clear();
		vi.clearAllMocks();
	});

	afterEach(async () => {
		vi.restoreAllMocks();
		await db.items.clear();
		await db.outbox.clear();
	});

	it("renders OutboxPage with default 'all' tab", async () => {
		render(
			<MemoryRouter initialEntries={["/outbox"]}>
				<OutboxPage />
			</MemoryRouter>,
		);

		await waitFor(() => {
			expect(
				screen.getByRole("heading", { name: /Antrean Transaksi \(Outbox\)/i }),
			).toBeDefined();
			const tabAll = screen.getByTestId("tab-all");
			expect(tabAll.getAttribute("aria-selected")).toBe("true");
		});
	});

	it("activates 'needs_action' tab when ?tab=needs_action query param is provided", async () => {
		render(
			<MemoryRouter initialEntries={["/outbox?tab=needs_action"]}>
				<OutboxPage />
			</MemoryRouter>,
		);

		await waitFor(() => {
			const tabNeedsAction = screen.getByTestId("tab-needs-action");
			expect(tabNeedsAction.getAttribute("aria-selected")).toBe("true");
			const tabAll = screen.getByTestId("tab-all");
			expect(tabAll.getAttribute("aria-selected")).toBe("false");
		});
	});

	it("activates 'pending' tab when ?tab=pending query param is provided", async () => {
		render(
			<MemoryRouter initialEntries={["/outbox?tab=pending"]}>
				<OutboxPage />
			</MemoryRouter>,
		);

		await waitFor(() => {
			const tabPending = screen.getByTestId("tab-pending");
			expect(tabPending.getAttribute("aria-selected")).toBe("true");
			const tabAll = screen.getByTestId("tab-all");
			expect(tabAll.getAttribute("aria-selected")).toBe("false");
		});
	});
});
