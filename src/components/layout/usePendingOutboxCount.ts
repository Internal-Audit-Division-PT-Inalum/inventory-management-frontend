import * as React from "react";
import { db } from "@/lib/db";

export const OUTBOX_CHANGE_EVENT = "outbox_change";

/**
 * Hook reaktif untuk memantau jumlah antrean transaksi offline di IndexedDB.
 * Mendengarkan interval berkala serta event kustom `outbox_change`.
 */
export function usePendingOutboxCount(intervalMs = 5000): number {
	const [count, setCount] = React.useState<number>(0);

	React.useEffect(() => {
		let isMounted = true;

		const checkCount = async () => {
			try {
				const currentCount = await db.getPendingOutboxCount();
				if (isMounted) {
					setCount(currentCount);
				}
			} catch {
				// Abaikan galat akses IndexedDB pada transisi teardown
			}
		};

		checkCount();

		const interval = setInterval(checkCount, intervalMs);
		const handleEvent = () => {
			checkCount();
		};

		window.addEventListener(OUTBOX_CHANGE_EVENT, handleEvent);

		return () => {
			isMounted = false;
			clearInterval(interval);
			window.removeEventListener(OUTBOX_CHANGE_EVENT, handleEvent);
		};
	}, [intervalMs]);

	return count;
}
