/**
 * Utilitas Penyimpanan Persisten (Persistent Storage API) untuk PWA Inventaris PT INALUM:
 * - Meminta peramban menandai penyimpanan IndexedDB aplikasi sebagai 'persisted'.
 * - Mencegah browser (khususnya Safari iOS dengan batas 7-day storage cap dan Android low-storage)
 *   menghapus cache atau antrean transaksi outbox IndexedDB secara otomatis.
 */

export interface StoragePersistenceStatus {
	isSupported: boolean;
	isPersisted: boolean;
}

/**
 * Memeriksa apakah penyimpanan aplikasi sudah berstatus persisten.
 */
export async function checkStoragePersistence(): Promise<StoragePersistenceStatus> {
	if (typeof navigator === "undefined" || !navigator.storage?.persisted) {
		return { isSupported: false, isPersisted: false };
	}

	try {
		const isPersisted = await navigator.storage.persisted();
		return { isSupported: true, isPersisted };
	} catch {
		return { isSupported: false, isPersisted: false };
	}
}

/**
 * Meminta izin penyimpanan persisten dari browser.
 * Mengembalikan true jika browser mengabulkan izin, atau false jika ditolak/tidak didukung.
 */
export async function requestPersistentStorage(): Promise<boolean> {
	if (typeof navigator === "undefined" || !navigator.storage?.persist) {
		return false;
	}

	try {
		const isPersisted = await navigator.storage.persist();
		return isPersisted;
	} catch {
		return false;
	}
}
