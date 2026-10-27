import { db } from "@/lib/db";
import type { Item, Location } from "@/types/api";
import { getCatalog } from "./getCatalog";
import { getLocations } from "./getLocations";

export interface CatalogSyncResult {
	success: boolean;
	notModified: boolean;
	itemsCount: number;
	locationsCount: number;
	etag?: string;
	lastSyncedAt: string;
	isOffline?: boolean;
	error?: string;
}

export const CATALOG_SYNC_EVENT = "inventory:catalog-synced";

/**
 * Menyelaraskan katalog lokal IndexedDB dengan backend.
 *
 * Skenario:
 * 1. HTTP 304 (Not Modified): Zero write churn, hanya memperbarui waktu sinkronisasi.
 * 2. HTTP 200 (OK): Atomic bulk upsert ke Dexie (items, locations, etag).
 * 3. Offline / Gangguan Jaringan: Fallback ke cache IndexedDB tanpa melempar error unhandled.
 */
export async function syncCatalog(
	options: { forceLocations?: boolean } = {},
): Promise<CatalogSyncResult> {
	// Ambil ETag terakhir yang tersimpan di IndexedDB
	const storedEtag = await db.getMeta("catalog_etag");
	const storedLastSynced = await db.getMeta("catalog_last_synced_at");

	// Jika offline secara eksplisit menurut navigator
	if (typeof navigator !== "undefined" && !navigator.onLine) {
		const localItemsCount = await db.items.count();
		const localLocationsCount = await db.locations.count();

		return {
			success: true,
			notModified: true,
			itemsCount: localItemsCount,
			locationsCount: localLocationsCount,
			etag: storedEtag,
			lastSyncedAt: storedLastSynced || new Date().toISOString(),
			isOffline: true,
		};
	}

	try {
		// Jalankan fetch katalog dan locations
		const shouldFetchLocations =
			options.forceLocations || (await db.locations.count()) === 0;

		const [catalogRes, locationsRes] = await Promise.all([
			getCatalog({ etag: storedEtag }),
			shouldFetchLocations
				? getLocations().catch(() => [])
				: Promise.resolve<Location[]>([]),
		]);

		const nowIso = new Date().toISOString();

		if (catalogRes.notModified) {
			// Perbarui hanya timestamp sinkronisasi
			await db.setMeta("catalog_last_synced_at", nowIso);

			// Jika ada lokasi baru yang diambil
			if (locationsRes.length > 0) {
				await db.locations.bulkPut(locationsRes);
			}

			const localItemsCount = await db.items.count();
			const localLocationsCount = await db.locations.count();

			const result: CatalogSyncResult = {
				success: true,
				notModified: true,
				itemsCount: localItemsCount,
				locationsCount: localLocationsCount,
				etag: storedEtag,
				lastSyncedAt: nowIso,
			};

			if (typeof window !== "undefined") {
				window.dispatchEvent(
					new CustomEvent(CATALOG_SYNC_EVENT, { detail: result }),
				);
			}

			return result;
		}

		// Respons 200 OK — Ada pembaruan katalog
		const items: Item[] = catalogRes.items;
		const newEtag = catalogRes.etag;

		await db.bulkUpsertCatalog({
			items,
			locations: locationsRes.length > 0 ? locationsRes : undefined,
			etag: newEtag,
			syncedAt: nowIso,
		});

		const currentLocationsCount = await db.locations.count();

		const result: CatalogSyncResult = {
			success: true,
			notModified: false,
			itemsCount: items.length,
			locationsCount: currentLocationsCount,
			etag: newEtag,
			lastSyncedAt: nowIso,
		};

		if (typeof window !== "undefined") {
			window.dispatchEvent(
				new CustomEvent(CATALOG_SYNC_EVENT, { detail: result }),
			);
		}

		return result;
	} catch (err: unknown) {
		// Tangani error jaringan secara aman dan fallback ke cache lokal
		const localItemsCount = await db.items.count();
		const localLocationsCount = await db.locations.count();
		const errorMessage =
			err instanceof Error ? err.message : "Gagal menyinkronkan katalog";

		return {
			success: false,
			notModified: true,
			itemsCount: localItemsCount,
			locationsCount: localLocationsCount,
			etag: storedEtag,
			lastSyncedAt: storedLastSynced || new Date().toISOString(),
			isOffline: true,
			error: errorMessage,
		};
	}
}
