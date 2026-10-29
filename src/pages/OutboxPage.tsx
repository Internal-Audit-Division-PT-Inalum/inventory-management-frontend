import { useSearchParams } from "react-router-dom";
import { type OutboxQueueTab, OutboxQueueView } from "@/features/sync";

/**
 * Halaman Layar Antrian Offline (Outbox) Mobile PWA Inventaris:
 * - Menampilkan daftar antrean transaksi offline lokal dari IndexedDB.
 * - Tab penyaringan: Semua, Menunggu Sinkronisasi, Perlu Tindakan (failed/rejected), dan Tersinkron.
 * - Aksi Coba Lagi (Retry) dan Pembatalan Transaksi dengan Rollback Stok lokal.
 * - Mendukung deep link tab melalui query parameter URL (?tab=needs_action).
 */
export function OutboxPage() {
	const [searchParams] = useSearchParams();
	const tabParam = searchParams.get("tab") as OutboxQueueTab | null;

	const initialTab: OutboxQueueTab =
		tabParam === "needs_action" ||
		tabParam === "pending" ||
		tabParam === "synced"
			? tabParam
			: "all";

	return (
		<div className="flex flex-col gap-4 pb-6">
			<OutboxQueueView initialTab={initialTab} />
		</div>
	);
}

export default OutboxPage;
