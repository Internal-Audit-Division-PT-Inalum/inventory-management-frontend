import type { Item, Location } from "../../src/types/api";

export const MOCK_EMPLOYEE = {
	id: "emp-001",
	namecode: "MRA",
	name: "Muhammad Ridwan Auditor",
	email: "mra@inalum.id",
	role: "auditor",
	division: "Internal Audit",
	must_change_pin: false,
};

export const MOCK_AUTH_SESSION = {
	token: "1|mockSanctumTokenForE2ETestExecution1234567890",
	must_change_pin: false,
	employee: MOCK_EMPLOYEE,
};

export const MOCK_LOCATIONS: Location[] = [
	{
		id: "loc-001",
		name: "RAK-ATK-01",
		code: "RAK-ATK-01",
		description: "Lemari ATK Utama Gudang Internal Audit Paritohan",
	},
	{
		id: "loc-002",
		name: "RAK-ELK-02",
		code: "RAK-ELK-02",
		description:
			"Rak Elektronik & Perangkat IT Gudang Internal Audit Paritohan",
	},
];

export const MOCK_ITEMS: Item[] = [
	{
		id: "itm-001",
		sku: "ATK-SPD-001",
		name: "Spidol Whiteboard Snowman Hitam",
		type: "consumable",
		unit: "Pcs",
		location_id: "loc-001",
		current_stock: 24,
		minimum_stock: 5,
		image_url: null,
		description: "Spidol whiteboard warna hitam refillable",
		location: MOCK_LOCATIONS[0],
		created_at: "2026-01-01T08:00:00Z",
		updated_at: "2026-01-01T08:00:00Z",
	},
	{
		id: "itm-002",
		sku: "AST-LPT-001",
		name: "Laptop ThinkPad L14 Gen 4",
		type: "asset",
		unit: "Unit",
		location_id: "loc-002",
		current_stock: 2,
		borrowed_quantity: 1,
		minimum_stock: 1,
		image_url: null,
		description: "Laptop audit lapangan core i7 16GB",
		location: MOCK_LOCATIONS[1],
		created_at: "2026-01-01T08:00:00Z",
		updated_at: "2026-01-01T08:00:00Z",
	},
];
