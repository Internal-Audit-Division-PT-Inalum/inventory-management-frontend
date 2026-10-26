import Dexie, { type Table } from "dexie";
import type { Item, Location } from "@/types/api";

// --- Schema Interface for Offline Outbox Transaction Queue ---
export type OutboxOperation = "take" | "add" | "borrow" | "return";

export type OutboxStatus =
	| "pending"
	| "syncing"
	| "synced"
	| "rejected"
	| "failed";

export interface OutboxItem {
	clientUuid: string;
	employeeId: string;
	operation: OutboxOperation;
	itemId: string;
	quantity: number;
	notes?: string | null;
	referenceNumber?: string | null;
	occurredAt: string;
	status: OutboxStatus;
	attempts: number;
	nextAttemptAt?: string | null;
	lastError?: {
		code?: string;
		message: string;
	} | null;
	createdAt: string;
}

export interface SyncMeta {
	key: string;
	value: string;
	updatedAt: string;
}

// --- Dexie Database Class ---
export class InventoryDatabase extends Dexie {
	locations!: Table<Location, string>;
	items!: Table<Item, string>;
	meta!: Table<SyncMeta, string>;
	outbox!: Table<OutboxItem, string>;

	constructor() {
		super("inventory_iia_pwa");

		this.version(1).stores({
			locations: "id, code, name",
			items:
				"id, sku, name, type, location_id, current_stock, minimum_stock, updated_at",
			meta: "key, value, updatedAt",
			outbox: "clientUuid, employeeId, operation, itemId, status, createdAt",
		});
	}
}

export const db = new InventoryDatabase();
