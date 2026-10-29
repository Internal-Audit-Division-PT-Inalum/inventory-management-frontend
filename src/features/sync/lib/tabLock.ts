/**
 * Modul Penguncian Antar-Tab (Cross-Tab Synchronization Lock)
 *
 * Mencegah race condition ketika pengguna membuka beberapa tab sekaligus di peramban
 * yang sama. Memastikan hanya ada 1 (satu) tab yang mengeksekusi siklus sync engine
 * pada satu waktu.
 *
 * Menggunakan Web Locks API (navigator.locks) sebagai mekanisme primer modern,
 * dengan fallback berbasis timestamp lock di localStorage + heartbeat untuk
 * lingkungan peramban lawas atau ketika Web Locks API tidak didukung.
 */

export const SYNC_TAB_LOCK_NAME = "inventory-outbox-sync-lock";
export const FALLBACK_STORAGE_LOCK_KEY_PREFIX = "inventory_tab_lock:";
export const DEFAULT_TAB_LOCK_TIMEOUT_MS = 30_000; // 30 detik TTL fallback
export const DEFAULT_HEARTBEAT_INTERVAL_MS = 10_000; // 10 detik heartbeat

export interface FallbackLockRecord {
	lockId: string;
	tabId: string;
	acquiredAt: number;
	expiresAt: number;
}

export interface TabLockOptions {
	/**
	 * Nama kunci sinkronisasi (default: SYNC_TAB_LOCK_NAME).
	 */
	lockName?: string;

	/**
	 * Batas waktu kadaluarsa (TTL) fallback lock dalam milidetik jika tab tertutup tiba-tiba.
	 * Default: 30.000 ms (30 detik).
	 */
	timeoutMs?: number;

	/**
	 * Interval perpanjangan masa berlaku fallback lock selama pemrosesan masih berlangsung.
	 * Default: 10.000 ms (10 detik).
	 */
	heartbeatIntervalMs?: number;

	/**
	 * Paksa penggunaan fallback localStorage (berguna untuk pengujian unit & integrasi).
	 */
	forceFallback?: boolean;
}

export interface TabLockResult<T> {
	/**
	 * Bernilai true jika lock berhasil didapatkan dan fungsi fn() dieksekusi.
	 */
	acquired: boolean;

	/**
	 * Hasil return dari fungsi fn(), atau null jika lock tidak didapatkan.
	 */
	result: T | null;

	/**
	 * Alasan penolakan jika lock tidak berhasil diperoleh.
	 */
	reason?: "held_by_other_tab" | "storage_unavailable" | "aborted" | "error";

	/**
	 * Jenis mekanisme locking yang digunakan.
	 */
	lockType: "web-locks" | "fallback-localstorage" | "none";
}

// In-memory Tab ID unik per instance tab browser (diinisialisasi sekali per sesi)
let tabInstanceId = `tab_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

/**
 * Mendapatkan ID unik tab saat ini.
 */
export function getTabId(): string {
	return tabInstanceId;
}

/**
 * Mengubah ID unik tab (khusus keperluan unit test untuk mensimulasikan multi-tab).
 */
export function _setTabIdForTest(id: string): void {
	tabInstanceId = id;
}

/**
 * Memeriksa apakah browser mendukung Web Locks API secara native.
 */
export function isWebLocksSupported(): boolean {
	return (
		typeof navigator !== "undefined" &&
		Boolean(navigator.locks) &&
		typeof navigator.locks.request === "function"
	);
}

/**
 * Helper aman untuk mengakses localStorage tanpa crash pada lingkungan dengan batasan sekuritas.
 */
function getSafeLocalStorage(): Storage | null {
	try {
		if (typeof window !== "undefined" && window.localStorage) {
			return window.localStorage;
		}
	} catch {
		// Akses storage ditolak (misal sandbox / private browsing ketat)
	}
	return null;
}

/**
 * Menghasilkan kunci storage untuk nama lock tertentu.
 */
function getStorageKey(lockName: string): string {
	return `${FALLBACK_STORAGE_LOCK_KEY_PREFIX}${lockName}`;
}

/**
 * Membaca dan memvalidasi record lock fallback dari localStorage.
 */
export function readFallbackLockRecord(
	lockName: string = SYNC_TAB_LOCK_NAME,
): FallbackLockRecord | null {
	const storage = getSafeLocalStorage();
	if (!storage) return null;

	try {
		const raw = storage.getItem(getStorageKey(lockName));
		if (!raw) return null;

		const parsed = JSON.parse(raw) as FallbackLockRecord;
		if (
			parsed &&
			typeof parsed.lockId === "string" &&
			typeof parsed.tabId === "string" &&
			typeof parsed.acquiredAt === "number" &&
			typeof parsed.expiresAt === "number"
		) {
			return parsed;
		}
	} catch {
		// Parsing JSON gagal atau korup, abaikan
	}
	return null;
}

/**
 * Memeriksa apakah kunci fallback saat ini sedang dipegang dan masih aktif (belum expired).
 */
export function isStorageLockHeld(
	lockName: string = SYNC_TAB_LOCK_NAME,
	now = Date.now(),
): boolean {
	const record = readFallbackLockRecord(lockName);
	if (!record) return false;
	return record.expiresAt > now;
}

/**
 * Menghapus paksa fallback lock (berguna untuk testing atau pembersihan darurat).
 */
export function releaseFallbackLock(
	lockName: string = SYNC_TAB_LOCK_NAME,
): boolean {
	const storage = getSafeLocalStorage();
	if (!storage) return false;
	try {
		storage.removeItem(getStorageKey(lockName));
		return true;
	} catch {
		return false;
	}
}

/**
 * Membungkus eksekusi fungsi dengan Kunci Antar-Tab (Mutual Exclusion).
 *
 * Jika lock berhasil didapatkan: fungsi fn() dijalankan dan hasilnya dikembalikan.
 * Jika lock sedang dipegang tab lain: eksekusi langsung dilewati tanpa memblokir tab.
 */
export async function withTabLock<T>(
	fn: () => Promise<T>,
	options: TabLockOptions = {},
): Promise<TabLockResult<T>> {
	const lockName = options.lockName ?? SYNC_TAB_LOCK_NAME;
	const timeoutMs = options.timeoutMs ?? DEFAULT_TAB_LOCK_TIMEOUT_MS;
	const heartbeatIntervalMs =
		options.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS;

	// 1. Mekanisme Utama: Web Locks API
	if (!options.forceFallback && isWebLocksSupported()) {
		return await executeWithWebLocks(lockName, fn);
	}

	// 2. Mekanisme Fallback: LocalStorage Heartbeat Lock
	return await executeWithFallbackLock(
		lockName,
		timeoutMs,
		heartbeatIntervalMs,
		fn,
	);
}

/**
 * Menjalankan fungsi di bawah perlindungan Web Locks API.
 */
async function executeWithWebLocks<T>(
	lockName: string,
	fn: () => Promise<T>,
): Promise<TabLockResult<T>> {
	let acquired = false;
	let result: T | null = null;

	try {
		await navigator.locks.request(
			lockName,
			{ ifAvailable: true },
			async (lock) => {
				if (!lock) {
					// Lock sedang dipegang oleh tab/worker lain
					return;
				}

				acquired = true;
				result = await fn();
			},
		);

		if (!acquired) {
			return {
				acquired: false,
				result: null,
				reason: "held_by_other_tab",
				lockType: "web-locks",
			};
		}

		return {
			acquired: true,
			result,
			lockType: "web-locks",
		};
	} catch (err) {
		console.warn(
			"[tabLock] Galat saat meminta Web Locks API, beralih ke unhandled error:",
			err,
		);
		throw err;
	}
}

/**
 * Menjalankan fungsi di bawah perlindungan Fallback LocalStorage Heartbeat Lock.
 */
async function executeWithFallbackLock<T>(
	lockName: string,
	timeoutMs: number,
	heartbeatIntervalMs: number,
	fn: () => Promise<T>,
): Promise<TabLockResult<T>> {
	const storage = getSafeLocalStorage();
	if (!storage) {
		// Jika localStorage tidak tersedia sama sekali, jalankan fn secara toleran
		console.warn(
			"[tabLock] LocalStorage tidak dapat diakses; mengeksekusi tanpa lock antar-tab.",
		);
		try {
			const result = await fn();
			return {
				acquired: true,
				result,
				lockType: "none",
			};
		} catch {
			return {
				acquired: false,
				result: null,
				reason: "error",
				lockType: "none",
			};
		}
	}

	const storageKey = getStorageKey(lockName);
	const now = Date.now();
	const existing = readFallbackLockRecord(lockName);

	// Periksa apakah ada tab lain yang memegang lock dan belum expired
	if (existing && existing.expiresAt > now) {
		return {
			acquired: false,
			result: null,
			reason: "held_by_other_tab",
			lockType: "fallback-localstorage",
		};
	}

	// Akuisisi lock: Tulis record baru dengan TTL
	const lockId = `lock_${now}_${Math.random().toString(36).substring(2, 9)}`;
	const currentTabId = getTabId();
	const newRecord: FallbackLockRecord = {
		lockId,
		tabId: currentTabId,
		acquiredAt: now,
		expiresAt: now + timeoutMs,
	};

	try {
		storage.setItem(storageKey, JSON.stringify(newRecord));
	} catch (err) {
		console.warn("[tabLock] Gagal menulis fallback lock ke localStorage:", err);
		return {
			acquired: false,
			result: null,
			reason: "storage_unavailable",
			lockType: "fallback-localstorage",
		};
	}

	// Double-check verification: cegah tab lain yang menulis bersamaan
	const verify = readFallbackLockRecord(lockName);
	if (!verify || verify.lockId !== lockId) {
		return {
			acquired: false,
			result: null,
			reason: "held_by_other_tab",
			lockType: "fallback-localstorage",
		};
	}

	// Pasang Heartbeat Timer untuk memperbarui masa kadaluarsa jika proses lama
	let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
	if (heartbeatIntervalMs > 0 && heartbeatIntervalMs < timeoutMs) {
		heartbeatTimer = setInterval(() => {
			try {
				const current = readFallbackLockRecord(lockName);
				if (current && current.lockId === lockId) {
					current.expiresAt = Date.now() + timeoutMs;
					storage.setItem(storageKey, JSON.stringify(current));
				} else {
					// Lock sudah dicuri atau ditimpa
					if (heartbeatTimer) clearInterval(heartbeatTimer);
				}
			} catch {
				// Abaikan error heartbeat
			}
		}, heartbeatIntervalMs);
	}

	// Pasang penanganan pembersihan darurat jika tab ditutup di tengah jalan
	const cleanupOnUnload = () => {
		try {
			const current = readFallbackLockRecord(lockName);
			if (current && current.lockId === lockId) {
				storage.removeItem(storageKey);
			}
		} catch {
			// Abaikan
		}
	};

	if (typeof window !== "undefined") {
		window.addEventListener("beforeunload", cleanupOnUnload);
		window.addEventListener("pagehide", cleanupOnUnload);
	}

	try {
		const result = await fn();
		return {
			acquired: true,
			result,
			lockType: "fallback-localstorage",
		};
	} finally {
		// Bersihkan heartbeat timer
		if (heartbeatTimer) {
			clearInterval(heartbeatTimer);
			heartbeatTimer = null;
		}

		// Lepaskan event listener unload
		if (typeof window !== "undefined") {
			window.removeEventListener("beforeunload", cleanupOnUnload);
			window.removeEventListener("pagehide", cleanupOnUnload);
		}

		// Lepaskan lock hanya jika lock ini masih milik kita
		try {
			const current = readFallbackLockRecord(lockName);
			if (current && current.lockId === lockId) {
				storage.removeItem(storageKey);
			}
		} catch {
			// Abaikan error saat pelepasan storage
		}
	}
}
