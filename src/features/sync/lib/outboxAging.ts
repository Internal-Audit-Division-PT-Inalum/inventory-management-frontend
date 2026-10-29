import type { OutboxItem } from "@/lib/db";

/**
 * Batas ambang umur antrean outbox (dalam jam) untuk memicu peringatan tingkat peringatan (warning).
 * Default: 24 jam (1 hari).
 */
export const STALE_OUTBOX_WARNING_HOURS = 24;

/**
 * Batas ambang umur antrean outbox (dalam jam) untuk memicu peringatan tingkat bahaya (danger).
 * Default: 72 jam (3 hari).
 */
export const STALE_OUTBOX_DANGER_HOURS = 72;

/**
 * Batas hari penghapusan penyimpanan otomatis WebKit iOS Safari (ITP 7-day storage eviction).
 */
export const IOS_EVICTION_MAX_DAYS = 7;

export type OutboxWarningLevel = "none" | "warning" | "danger";

export interface OutboxAgingOptions {
	/**
	 * Apakah perangkat saat ini terdeteksi sebagai iOS (iPhone / iPad / iPod).
	 */
	isIos?: boolean;
	/**
	 * Apakah aplikasi berjalan dalam mode standalone (terpasang di Layar Utama / Home Screen).
	 */
	isStandalone?: boolean;
	/**
	 * Ambang batas jam untuk peringatan tingkat warning (default: 24).
	 */
	warningHours?: number;
	/**
	 * Ambang batas jam untuk peringatan tingkat danger (default: 72).
	 */
	dangerHours?: number;
}

export interface OutboxAgingInfo {
	/** Total transaksi tertunda yang belum tersinkron (pending, syncing, failed, rejected) */
	pendingCount: number;
	/** Apakah terdapat item antrean tua yang melampaui batas ambang */
	hasStaleItems: boolean;
	/** Umur item tertua dalam jam */
	oldestAgeHours: number;
	/** Umur item tertua dalam hari */
	oldestAgeDays: number;
	/** Waktu pembuatan item tertua (ISO string) */
	oldestCreatedAt: string | null;
	/** Tingkat keseriusan peringatan */
	warningLevel: OutboxWarningLevel;
	/** Apakah pengguna berada di Safari iOS biasa (bukan PWA terpasang) */
	isIosBrowser: boolean;
	/** Rekomendasi memasang aplikasi ke Layar Utama untuk menghindari Safari eviction */
	shouldInstallToHomeScreen: boolean;
	/** Rekomendasi sinkronisasi segera */
	shouldSyncImmediately: boolean;
	/** Estimasi sisa hari sebelum potensi eviction 7-hari WebKit Safari (maksimal 7, minimal 0) */
	estimatedDaysUntilIosEviction: number;
	/** Pesan penjelasan yang ramah pengguna */
	message: string | null;
}

/**
 * Menghitung analisis penuaan antrean outbox dan mendeteksi risiko penghapusan data
 * lokal oleh WebKit Safari iOS (7-day storage eviction policy).
 */
export function calculateOutboxAging(
	items: OutboxItem[],
	now: Date = new Date(),
	options: OutboxAgingOptions = {},
): OutboxAgingInfo {
	const {
		isIos = false,
		isStandalone = false,
		warningHours = STALE_OUTBOX_WARNING_HOURS,
		dangerHours = STALE_OUTBOX_DANGER_HOURS,
	} = options;

	const isIosBrowser = isIos && !isStandalone;

	// Saring hanya item yang belum berhasil disinkronkan ke server
	const unsyncedItems = items.filter((item) => item.status !== "synced");

	if (unsyncedItems.length === 0) {
		return {
			pendingCount: 0,
			hasStaleItems: false,
			oldestAgeHours: 0,
			oldestAgeDays: 0,
			oldestCreatedAt: null,
			warningLevel: "none",
			isIosBrowser,
			shouldInstallToHomeScreen: false,
			shouldSyncImmediately: false,
			estimatedDaysUntilIosEviction: IOS_EVICTION_MAX_DAYS,
			message: null,
		};
	}

	// Cari entri tertua berdasarkan createdAt
	let oldestTime = Number.POSITIVE_INFINITY;
	let oldestIso: string | null = null;

	for (const item of unsyncedItems) {
		const createdTime = new Date(item.createdAt).getTime();
		if (!Number.isNaN(createdTime) && createdTime < oldestTime) {
			oldestTime = createdTime;
			oldestIso = item.createdAt;
		}
	}

	const currentTime = now.getTime();
	const ageMs = Math.max(0, currentTime - oldestTime);
	const oldestAgeHours = Math.floor(ageMs / (1000 * 60 * 60));
	const oldestAgeDays = Math.floor(oldestAgeHours / 24);

	const estimatedDaysUntilIosEviction = Math.max(
		0,
		IOS_EVICTION_MAX_DAYS - oldestAgeDays,
	);

	const hasStaleItems = oldestAgeHours >= warningHours;

	// Tentukan tingkat peringatan (warning level)
	let warningLevel: OutboxWarningLevel = "none";
	let shouldInstallToHomeScreen = false;
	let shouldSyncImmediately = false;
	let message: string | null = null;

	if (isIosBrowser) {
		shouldInstallToHomeScreen = true;

		if (oldestAgeDays >= 3 || oldestAgeHours >= dangerHours) {
			// Bahaya kritis: mendekati batas 7 hari WebKit eviction di iOS browser
			warningLevel = "danger";
			shouldSyncImmediately = true;
			message = `Perhatian Kritis (Safari iOS): Terdapat transaksi offline sejak ${oldestAgeDays > 0 ? `${oldestAgeDays} hari` : `${oldestAgeHours} jam`} yang lalu. Safari dapat menghapus data lokal dalam ${estimatedDaysUntilIosEviction} hari jika aplikasi tidak dipasang ke Layar Utama.`;
		} else if (hasStaleItems) {
			warningLevel = "warning";
			shouldSyncImmediately = true;
			message = `Peringatan (Safari iOS): Antrean offline berumur ${oldestAgeHours} jam. Pasang aplikasi ke Layar Utama iPhone untuk mencegah penghapusan data otomatis oleh Safari.`;
		} else {
			// Ada antrean baru di iOS browser yang belum diinstal
			warningLevel = "warning";
			message =
				"Pengguna iPhone: Pasang aplikasi ke Layar Utama agar transaksi offline tersimpan permanen dan tidak terhapus otomatis oleh Safari.";
		}
	} else {
		// Non-iOS atau iOS Standalone PWA
		if (oldestAgeHours >= dangerHours) {
			warningLevel = "danger";
			shouldSyncImmediately = true;
			message = `Antrean transaksi tertunda telah berumur ${oldestAgeDays > 0 ? `${oldestAgeDays} hari` : `${oldestAgeHours} jam`}. Segera lakukan sinkronisasi untuk mencegah ketidaksesuaian stok di server.`;
		} else if (hasStaleItems) {
			warningLevel = "warning";
			shouldSyncImmediately = true;
			message = `Terdapat transaksi offline yang belum tersinkronisasi lebih dari ${oldestAgeHours} jam. Hubungkan ke jaringan dan sinkronkan segera.`;
		}
	}

	return {
		pendingCount: unsyncedItems.length,
		hasStaleItems,
		oldestAgeHours,
		oldestAgeDays,
		oldestCreatedAt: oldestIso,
		warningLevel,
		isIosBrowser,
		shouldInstallToHomeScreen,
		shouldSyncImmediately,
		estimatedDaysUntilIosEviction,
		message,
	};
}
