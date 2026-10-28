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
	 */
	async getPendingOutboxCount(): Promise<number> {
		return await this.outbox
			.where("status")
			.anyOf(["pending", "syncing"])
			.count();
	}

	/**
	 * Ambil semua transaksi outbox yang sedang pending atau syncing.
	 */
	async getPendingOutboxItems(): Promise<OutboxItem[]> {
		return await this.outbox
			.where("status")
			.anyOf(["pending", "syncing"])
			.toArray();
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
	 */
	async getOutboxItems(status?: OutboxStatus): Promise<OutboxItem[]> {
		if (status) {
			return await this.outbox
				.where("status")
				.equals(status)
				.sortBy("createdAt");
		}
		return await this.outbox.orderBy("createdAt").reverse().toArray();
	}
}

export const db = new InventoryDatabase();
