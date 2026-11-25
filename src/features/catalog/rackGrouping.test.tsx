import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import type { Item, Location } from "@/types/api";
import { CatalogView } from "./components/CatalogView";
import { ItemCard } from "./components/ItemCard";
import {
	compareRackCodes,
	extractOrderedRacks,
	formatItemLocationLabel,
} from "./lib/rackOrder";

vi.mock("./api/syncCatalog", async (importOriginal) => {
	const actual = await importOriginal<typeof import("./api/syncCatalog")>();
	return {
		...actual,
		syncCatalog: vi.fn().mockResolvedValue({
			success: true,
			notModified: true,
			itemsCount: 3,
			locationsCount: 2,
			lastSyncedAt: new Date().toISOString(),
		}),
	};
});

const cabinetLocations: Location[] = [
	{ id: "loc-a", code: "LEMARI-A", name: "Lemari A" },
	{ id: "loc-b", code: "LEMARI-B", name: "Lemari B" },
];

const cabinetItems: Item[] = [
	{
		id: "item-a1",
		sku: "LMA-SNK-A1",
		name: "Snack (A1)",
		type: "consumable",
		unit: "Lot",
		location_id: "loc-a",
		rack_code: "A1",
		current_stock: 1,
		minimum_stock: 0,
		image_url: null,
		updated_at: "2026-11-23T09:00:00Z",
	},
	{
		id: "item-b2i",
		sku: "LMB-TPX-01",
		name: "Tipex",
		type: "consumable",
		unit: "Pcs",
		location_id: "loc-b",
		rack_code: "B2-I",
		current_stock: 3,
		minimum_stock: 3,
		image_url: null,
		updated_at: "2026-11-23T09:00:00Z",
	},
	{
		id: "item-b3a",
		sku: "LMB-TSU-01",
		name: "Tisu",
		type: "consumable",
		unit: "Pcs",
		location_id: "loc-b",
		rack_code: "B3-A",
		current_stock: 3,
		minimum_stock: 3,
		image_url: null,
		updated_at: "2026-11-23T09:00:00Z",
	},
];

describe("PWA Cabinet -> Multi-Rack Architecture", () => {
	beforeEach(async () => {
		await db.clearCatalog();
	});

	afterEach(async () => {
		await db.clearCatalog();
	});

	it("orders IIA rack codes physically with -I preceding -A", () => {
		const unsorted = ["B3-A", "A2-A", "B2-I", "A1", "A2-I", "B2-A", "B3-I"];
		expect([...unsorted].sort(compareRackCodes)).toEqual([
			"A1",
			"A2-I",
			"A2-A",
			"B2-I",
			"B2-A",
			"B3-I",
			"B3-A",
		]);
		expect(extractOrderedRacks(cabinetItems)).toEqual(["A1", "B2-I", "B3-A"]);
	});

	it("prunes obsolete local locations atomically on bulkUpsertCatalog", async () => {
		await db.bulkUpsertCatalog({
			items: cabinetItems,
			locations: [
				{ id: "old-loc-1", code: "RAK-1-B1", name: "Rak 1 - Baris 1" },
				{ id: "old-loc-2", code: "RAK-2-B1", name: "Rak 2 - Baris 1" },
			],
		});
		expect(await db.locations.count()).toBe(2);

		await db.bulkUpsertCatalog({
			items: cabinetItems,
			locations: cabinetLocations,
		});

		const stored = await db.locations.toArray();
		expect(stored.map((l) => l.code).sort()).toEqual(["LEMARI-A", "LEMARI-B"]);
	});

	it("filters catalog items by rackCode and matches rack_code in search query", async () => {
		await db.bulkUpsertCatalog({
			items: cabinetItems,
			locations: cabinetLocations,
		});

		const rackB2I = await db.getCatalogItems({
			locationId: "loc-b",
			rackCode: "B2-I",
		});
		expect(rackB2I.map((i) => i.sku)).toEqual(["LMB-TPX-01"]);

		const searched = await db.getCatalogItems({ searchTerm: "b3-a" });
		expect(searched.map((i) => i.sku)).toEqual(["LMB-TSU-01"]);
	});

	it("renders Rak badge and cabinet+rack label on ItemCard when rack_code exists", () => {
		const itemWithRack: Item = {
			...cabinetItems[1],
			location: cabinetLocations[1],
		};

		render(<ItemCard item={itemWithRack} />);

		expect(screen.getByTestId("item-rack-badge").textContent).toBe("Rak B2-I");
		expect(screen.getByText("Lemari B • Rak B2-I")).toBeDefined();
		expect(formatItemLocationLabel(itemWithRack)).toBe("Lemari B • Rak B2-I");
	});

	it("filters by cabinet QR location and sub-rack chips inside CatalogView", async () => {
		await db.bulkUpsertCatalog({
			items: cabinetItems,
			locations: cabinetLocations,
		});

		const user = userEvent.setup();

		render(
			<MemoryRouter initialEntries={["/?src=qr&location_id=loc-b"]}>
				<CatalogView />
			</MemoryRouter>,
		);

		await waitFor(() => {
			expect(screen.getByTestId("qr-landing-banner")).toBeDefined();
			expect(screen.getByText("Tipex")).toBeDefined();
			expect(screen.getByText("Tisu")).toBeDefined();
		});

		expect(screen.queryByText("Snack (A1)")).toBeNull();

		// Tap sub-rack chip Rak B2-I
		await user.click(screen.getByTestId("rack-chip-B2-I"));

		await waitFor(() => {
			expect(screen.getByText("Tipex")).toBeDefined();
			expect(screen.queryByText("Tisu")).toBeNull();
		});
	});
});
