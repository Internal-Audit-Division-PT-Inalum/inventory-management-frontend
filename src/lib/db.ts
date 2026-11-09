import Dexie, { type Table } from "dexie";
import type { InventoryItemType, Item, Location } from "@/types/api";

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
	loanId?: string | null;
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
	appliedDeltaStock?: number;
	appliedDeltaBorrowed?: number;
	createdAt: string;
}

export type DiagnosticLogLevel = "debug" | "info" | "warn" | "error";

export interface DiagnosticLog {
	id?: number;
	timestamp: string;
	level: DiagnosticLogLevel;
	category: string;
	message: string;
	details?: Record<string, unknown> | string | null;
	createdAt?: string;
}

export interface SyncMeta {
	key: string;
	value: string;
	updatedAt: string;
}

export interface CatalogQueryOptions {
	searchTerm?: string;
	locationId?: string;
	type?: InventoryItemType | "all";
	stockStatus?: "all" | "low_or_empty" | "available";
}

export const DB_NAME = "inventory_iia_pwa";

/**
 * Client-side IndexedDB engine managing offline inventory catalog caches,
 * transactional mutation outbox queues, and bounded diagnostic logging buffers.
 */
export class InventoryDatabase extends Dexie {
	locations!: Table<Location, string>;
	items!: Table<Item, string>;
	meta!: Table<SyncMeta, string>;
	outbox!: Table<OutboxItem, string>;
	diagnostic_logs!: Table<DiagnosticLog, number>;

	constructor() {
		super(DB_NAME);

		this.version(1).stores({
			locations: "id, code, name",
			items:
				"id, sku, name, type, location_id, current_stock, minimum_stock, updated_at",
			meta: "key, value, updatedAt",
			outbox: "clientUuid, employeeId, operation, itemId, status, createdAt",
		});

		this.version(2).stores({
			items:
				"id, sku, name, type, location_id, [location_id+type], current_stock, minimum_stock, updated_at",
		});

		this.version(3)
			.stores({
				outbox:
					"clientUuid, employeeId, operation, itemId, status, createdAt, nextAttemptAt, [status+createdAt], [itemId+status], [employeeId+status]",
				diagnostic_logs: "++id, timestamp, level, category, createdAt",
			})
			.upgrade(async (tx) => {
				await tx
					.table<OutboxItem>("outbox")
					.toCollection()
					.modify((item) => {
						if (typeof item.attempts !== "number") {
							item.attempts = 0;
						}
						if (item.nextAttemptAt === undefined) {
							item.nextAttemptAt = null;
						}
						if (item.lastError === undefined) {
							item.lastError = null;
						}
					});
			});
	}

	/**
	 * Retrieves synchronization metadata by key.
	 */
	async getMeta(key: string): Promise<string | undefined> {
		const entry = await this.meta.get(key);
		return entry?.value;
	}

	/**
	 * Persists synchronization metadata key-value pair.
	 */
	async setMeta(key: string, value: string): Promise<void> {
		await this.meta.put({
			key,
			value,
			updatedAt: new Date().toISOString(),
		});
	}

	/**
	 * Deletes synchronization metadata entry by key.
	 */
	async deleteMeta(key: string): Promise<void> {
		await this.meta.delete(key);
	}

	/**
	 * Atomically synchronizes catalog items and physical rack locations.
	 * Prunes obsolete local records not present in the incoming payload.
	 */
	async bulkUpsertCatalog(params: {
		items: Item[];
		locations?: Location[];
		etag?: string;
		syncedAt?: string;
	}): Promise<void> {
		const {
			items,
			locations,
			etag,
			syncedAt = new Date().toISOString(),
		} = params;

		await this.transaction(
			"rw",
			[this.items, this.locations, this.meta],
			async () => {
				if (locations && locations.length > 0) {
					await this.locations.bulkPut(locations);
				}

				if (items.length > 0) {
					await this.items.bulkPut(items);

					const incomingIds = new Set(items.map((i) => i.id));
					const allLocalIds = await this.items.toCollection().primaryKeys();
					const obsoleteIds = allLocalIds.filter((id) => !incomingIds.has(id));

					if (obsoleteIds.length > 0) {
						await this.items.bulkDelete(obsoleteIds);
					}
				} else {
					await this.items.clear();
				}

				if (etag) {
					await this.meta.put({
						key: "catalog_etag",
						value: etag,
						updatedAt: syncedAt,
					});
				}

				await this.meta.put({
					key: "catalog_last_synced_at",
					value: syncedAt,
					updatedAt: syncedAt,
				});
			},
		);
	}

	/**
	 * Queries cached catalog items supporting multi-dimensional filtering and search.
	 */
	async getCatalogItems(options: CatalogQueryOptions = {}): Promise<Item[]> {
		const { searchTerm, locationId, type, stockStatus } = options;

		let collection = this.items.toCollection();

		if (locationId && type && type !== "all") {
			collection = this.items
				.where("[location_id+type]")
				.equals([locationId, type]);
		} else if (locationId) {
			collection = this.items.where("location_id").equals(locationId);
		} else if (type && type !== "all") {
			collection = this.items.where("type").equals(type);
		}

		let results = await collection.toArray();

		if (searchTerm && searchTerm.trim() !== "") {
			const normalized = searchTerm.trim().toLowerCase();
			results = results.filter(
				(item) =>
					item.name.toLowerCase().includes(normalized) ||
					item.sku.toLowerCase().includes(normalized),
			);
		}

		if (stockStatus && stockStatus !== "all") {
			if (stockStatus === "low_or_empty") {
				results = results.filter(
					(item) => item.current_stock <= item.minimum_stock,
				);
			} else if (stockStatus === "available") {
				results = results.filter((item) => item.current_stock > 0);
			}
		}

		return results;
	}

	/**
	 * Clears cached catalog data without affecting the offline outbox transaction queue.
	 */
	async clearCatalog(): Promise<void> {
		await this.transaction(
			"rw",
			[this.items, this.locations, this.meta],
			async () => {
				await this.items.clear();
				await this.locations.clear();
				await this.meta.delete("catalog_etag");
				await this.meta.delete("catalog_last_synced_at");
			},
		);
	}

	/**
	 * Counts pending outbox items awaiting server synchronization.
	 */
	async getPendingOutboxCount(params?: {
		employeeId?: string;
		includeFailed?: boolean;
	}): Promise<number> {
		const statuses: OutboxStatus[] = params?.includeFailed
			? ["pending", "syncing", "failed"]
			: ["pending", "syncing"];

		if (params?.employeeId) {
			const employeeId = params.employeeId;
			const pairs: [string, string][] = statuses.map((s) => [employeeId, s]);
			return await this.outbox
				.where("[employeeId+status]")
				.anyOf(pairs)
				.count();
		}
		return await this.outbox.where("status").anyOf(statuses).count();
	}

	/**
	 * Retrieves pending outbox transaction queue records.
	 */
	async getPendingOutboxItems(params?: {
		employeeId?: string;
		includeFailed?: boolean;
	}): Promise<OutboxItem[]> {
		const statuses: OutboxStatus[] = params?.includeFailed
			? ["pending", "syncing", "failed"]
			: ["pending", "syncing"];

		if (params?.employeeId) {
			const employeeId = params.employeeId;
			const pairs: [string, string][] = statuses.map((s) => [employeeId, s]);
			return await this.outbox
				.where("[employeeId+status]")
				.anyOf(pairs)
				.sortBy("createdAt");
		}
		return await this.outbox
			.where("status")
			.anyOf(statuses)
			.sortBy("createdAt");
	}

	/**
	 * Recovers stalled syncing items back to pending status following unexpected application restarts.
	 */
	async resetAbandonedSyncingItems(): Promise<number> {
		return await this.outbox
			.where("status")
			.equals("syncing")
			.modify({ status: "pending" });
	}

	/**
	 * Retrieves outbox transaction queue records targeting a specific item.
	 */
	async getOutboxItemsByItem(
		itemId: string,
		status?: OutboxStatus,
	): Promise<OutboxItem[]> {
		if (status) {
			return await this.outbox
				.where("[itemId+status]")
				.equals([itemId, status])
				.sortBy("createdAt");
		}
		return await this.outbox.where("itemId").equals(itemId).sortBy("createdAt");
	}

	/**
	 * Atomically enqueues an offline transaction record into the outbox.
	 */
	async enqueueOutboxItem(item: OutboxItem): Promise<void> {
		await this.outbox.put(item);
	}

	/**
	 * Updates outbox item status and metadata.
	 */
	async updateOutboxItem(
		clientUuid: string,
		changes: Partial<OutboxItem>,
	): Promise<void> {
		await this.outbox.update(clientUuid, changes);
	}

	/**
	 * Retrieves a single outbox record by clientUuid.
	 */
	async getOutboxItemByUuid(
		clientUuid: string,
	): Promise<OutboxItem | undefined> {
		return await this.outbox.get(clientUuid);
	}

	/**
	 * Retrieves all outbox records ordered by creation timestamp with optional filtering.
	 */
	async getOutboxItems(
		params?:
			| {
					status?: OutboxStatus;
					employeeId?: string;
			  }
			| OutboxStatus,
	): Promise<OutboxItem[]> {
		const status = typeof params === "string" ? params : params?.status;
		const employeeId =
			typeof params === "object" && params !== null
				? params.employeeId
				: undefined;

		if (employeeId && status) {
			return await this.outbox
				.where("[employeeId+status]")
				.equals([employeeId, status])
				.reverse()
				.sortBy("createdAt");
		}

		if (employeeId) {
			const items = await this.outbox
				.where("employeeId")
				.equals(employeeId)
				.sortBy("createdAt");
			return items.reverse();
		}

		if (status) {
			const items = await this.outbox
				.where("status")
				.equals(status)
				.sortBy("createdAt");
			return items.reverse();
		}

		return await this.outbox.orderBy("createdAt").reverse().toArray();
	}

	/**
	 * Appends a diagnostic log entry capped within a bounded ring buffer (default 100 entries).
	 */
	async addDiagnosticLog(
		log: Omit<DiagnosticLog, "id">,
		maxEntries = 100,
	): Promise<number> {
		const id = await this.diagnostic_logs.add({
			...log,
			createdAt: log.createdAt ?? new Date().toISOString(),
		});

		const count = await this.diagnostic_logs.count();
		if (count > maxEntries) {
			const excess = count - maxEntries;
			const oldestKeys = await this.diagnostic_logs.limit(excess).primaryKeys();
			await this.diagnostic_logs.bulkDelete(oldestKeys);
		}

		if (typeof window !== "undefined") {
			window.dispatchEvent(
				new CustomEvent("inventory:diagnostic-log-updated", {
					detail: { id, level: log.level, category: log.category },
				}),
			);
		}

		return id;
	}

	/**
	 * Returns the total count of diagnostic log records.
	 */
	async getDiagnosticLogCount(): Promise<number> {
		return await this.diagnostic_logs.count();
	}

	/**
	 * Retrieves diagnostic logs sorted descending by creation order.
	 */
	async getDiagnosticLogs(
		params?:
			| number
			| {
					limit?: number;
					level?: DiagnosticLogLevel | "all";
					category?: string | "all";
			  },
	): Promise<DiagnosticLog[]> {
		const limit = typeof params === "number" ? params : (params?.limit ?? 100);
		const level = typeof params === "object" ? params.level : undefined;
		const category = typeof params === "object" ? params.category : undefined;

		let collection = this.diagnostic_logs.orderBy("id").reverse();

		if (level && level !== "all") {
			collection = collection.filter((log) => log.level === level);
		}

		if (category && category !== "all") {
			collection = collection.filter((log) => log.category === category);
		}

		return await collection.limit(limit).toArray();
	}

	/**
	 * Purges all diagnostic log records.
	 */
	async clearDiagnosticLogs(): Promise<void> {
		await this.diagnostic_logs.clear();
		if (typeof window !== "undefined") {
			window.dispatchEvent(
				new CustomEvent("inventory:diagnostic-log-updated", {
					detail: { action: "clear" },
				}),
			);
		}
	}

	/**
	 * Exports diagnostic log records as formatted plain text for technical troubleshooting.
	 */
	async exportDiagnosticLogsAsText(limit = 100): Promise<string> {
		const logs = await this.getDiagnosticLogs(limit);
		if (logs.length === 0) {
			return "=== TIDAK ADA LOG DIAGNOSTIK ===";
		}

		const header = [
			"============================================================",
			"   INVENTORY PWA - LOG DIAGNOSTIK SISTEM (PT INALUM)       ",
			`   Tanggal Ekspor: ${new Date().toISOString()}                  `,
			`   Jumlah Entri: ${logs.length} entri                           `,
			"============================================================",
			"",
		].join("\n");

		const body = logs
			.reverse()
			.map((l) => {
				const detailStr = l.details
					? `\n    Payload: ${typeof l.details === "object" ? JSON.stringify(l.details, null, 2).replace(/\n/g, "\n    ") : l.details}`
					: "";
				return `[${l.timestamp}] [${l.level.toUpperCase()}] [${l.category}] ${l.message}${detailStr}`;
			})
			.join("\n\n");

		return `${header}${body}`;
	}

	/**
	 * Exports diagnostic logs as structured JSON with execution environment metadata.
	 */
	async exportDiagnosticLogsAsJson(limit = 100): Promise<string> {
		const logs = await this.getDiagnosticLogs(limit);
		const payload = {
			exportedAt: new Date().toISOString(),
			application: "Inventory PWA PT Inalum",
			version: "1.0.0",
			environment: {
				userAgent:
					typeof navigator !== "undefined" ? navigator.userAgent : "unknown",
				onLine: typeof navigator !== "undefined" ? navigator.onLine : true,
			},
			totalLogs: logs.length,
			logs: logs.reverse(),
		};

		return JSON.stringify(payload, null, 2);
	}
}

export const db = new InventoryDatabase();
