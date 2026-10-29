import Dexie, { type Table } from "dexie";
import type { InventoryItemType, Item, Location } from "@/types/api";

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

// --- Schema Interface for Local Diagnostic Logs (Ring Buffer) ---
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

// --- Dexie Database Class ---
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

		// Version 2: Indeks gabungan [location_id+type] untuk query filter cepat
		this.version(2).stores({
			items:
				"id, sku, name, type, location_id, [location_id+type], current_stock, minimum_stock, updated_at",
		});

		// Version 3 (Task P5.1): Indeks gabungan outbox untuk FIFO & isolasi akun, serta tabel ring buffer diagnostik
		this.version(3)
			.stores({
				outbox:
					"clientUuid, employeeId, operation, itemId, status, createdAt, nextAttemptAt, [status+createdAt], [itemId+status], [employeeId+status]",
				diagnostic_logs: "++id, timestamp, level, category, createdAt",
			})
			.upgrade(async (tx) => {
				// Pastikan entri outbox lama memiliki default attempts, nextAttemptAt, dan lastError
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
	 * Ambil nilai metadata sinkronisasi berdasarkan kunci
	 */
	async getMeta(key: string): Promise<string | undefined> {
		const entry = await this.meta.get(key);
		return entry?.value;
	}

	/**
	 * Simpan nilai metadata sinkronisasi
	 */
	async setMeta(key: string, value: string): Promise<void> {
		await this.meta.put({
			key,
			value,
			updatedAt: new Date().toISOString(),
		});
	}

	/**
	 * Hapus nilai metadata sinkronisasi berdasarkan kunci
	 */
	async deleteMeta(key: string): Promise<void> {
		await this.meta.delete(key);
	}

	/**
	 * Atomic bulk upsert untuk katalog barang dan lokasi.
	 * Jika daftar item diberikan, item lokal yang tidak ada di data baru akan dibersihkan.
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
				// 1. Simpan / Perbarui Lokasi
				if (locations && locations.length > 0) {
					await this.locations.bulkPut(locations);
				}

				// 2. Simpan / Perbarui Item
				if (items.length > 0) {
					await this.items.bulkPut(items);

					// Bersihkan item lokal yang sudah tidak aktif / dihapus di backend
					const incomingIds = new Set(items.map((i) => i.id));
					const allLocalIds = await this.items.toCollection().primaryKeys();
					const obsoleteIds = allLocalIds.filter((id) => !incomingIds.has(id));

					if (obsoleteIds.length > 0) {
						await this.items.bulkDelete(obsoleteIds);
					}
				} else {
					await this.items.clear();
				}

				// 3. Catat ETag dan Waktu Sinkronisasi
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
	 * Query katalog barang dengan filter multi-dimensi dan pencarian cepat.
	 */
	async getCatalogItems(options: CatalogQueryOptions = {}): Promise<Item[]> {
		const { searchTerm, locationId, type, stockStatus } = options;

		let collection = this.items.toCollection();

		// Optimasi indeks kombinasi jika filter location & type ditentukan
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

		// Filter pencarian teks bebas (case-insensitive)
		if (searchTerm && searchTerm.trim() !== "") {
			const normalized = searchTerm.trim().toLowerCase();
			results = results.filter(
				(item) =>
					item.name.toLowerCase().includes(normalized) ||
					item.sku.toLowerCase().includes(normalized),
			);
		}

		// Filter status stok
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
	 * Bersihkan data cache katalog tanpa menyentuh antrean outbox (Zero data loss).
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
	 * Dapatkan jumlah antrean transaksi offline yang belum tersinkronisasi.
	 * Mendukung filter employeeId dan opsi includeFailed (retryable).
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
	 * Ambil semua transaksi outbox yang sedang pending atau syncing (dan optionally failed).
	 * Terisolasi per employeeId jika parameter diberikan.
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
	 * Reset item yang tertinggal dalam status 'syncing' saat aplikasi dibuka kembali (crash recovery).
	 */
	async resetAbandonedSyncingItems(): Promise<number> {
		return await this.outbox
			.where("status")
			.equals("syncing")
			.modify({ status: "pending" });
	}

	/**
	 * Ambil entri outbox untuk item tertentu (berguna untuk FIFO per item dan kalkulasi delta stok).
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
	 * Simpan transaksi ke dalam antrean outbox secara atomik (Zero Data Loss).
	 */
	async enqueueOutboxItem(item: OutboxItem): Promise<void> {
		await this.outbox.put(item);
	}

	/**
	 * Perbarui status dan metadata entri outbox.
	 */
	async updateOutboxItem(
		clientUuid: string,
		changes: Partial<OutboxItem>,
	): Promise<void> {
		await this.outbox.update(clientUuid, changes);
	}

	/**
	 * Dapatkan entri outbox berdasarkan clientUuid.
	 */
	async getOutboxItemByUuid(
		clientUuid: string,
	): Promise<OutboxItem | undefined> {
		return await this.outbox.get(clientUuid);
	}

	/**
	 * Ambil semua entri outbox terurut berdasarkan createdAt.
	 * Mendukung filter status dan isolasi per employeeId.
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
	 * Menambahkan catatan log diagnostik lokal dengan pembatasan ring buffer (default 100 entri).
	 */
	async addDiagnosticLog(
		log: Omit<DiagnosticLog, "id">,
		maxEntries = 100,
	): Promise<number> {
		const id = await this.diagnostic_logs.add({
			...log,
			createdAt: log.createdAt ?? new Date().toISOString(),
		});

		// Enforce ring-buffer cap
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
	 * Mengambil jumlah total entri log diagnostik saat ini.
	 */
	async getDiagnosticLogCount(): Promise<number> {
		return await this.diagnostic_logs.count();
	}

	/**
	 * Mengambil entri log diagnostik terbaru terurut dari yang paling baru.
	 * Mendukung overload angka (limit) atau objek opsi filter.
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
	 * Membersihkan seluruh log diagnostik.
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
	 * Mengekspor seluruh log diagnostik menjadi teks yang mudah dibaca/disalin untuk tim IT.
	 */
	async exportDiagnosticLogsAsText(limit = 100): Promise<string> {
		const logs = await this.getDiagnosticLogs(limit);
		if (logs.length === 0) {
			return "=== TIDAK ADA LOG DIAGNOSTIK ===";
		}

		const header = [
			"============================================================",
			"   INVENTORY PWA - LOG DIAGNOSTIK SISTEM (PT INALUM)        ",
			`   Diekspor Pada: ${new Date().toISOString()}                `,
			`   Jumlah Entri: ${logs.length} entri                       `,
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
	 * Mengekspor seluruh log diagnostik dalam format JSON terstruktur lengkap dengan metadata sistem.
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
