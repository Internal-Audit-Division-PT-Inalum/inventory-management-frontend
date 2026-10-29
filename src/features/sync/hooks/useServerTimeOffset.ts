import { useEffect, useState } from "react";
import {
	type ClockSkewInfo,
	getClockSkewInfo,
	SERVER_TIME_SYNCED_EVENT,
} from "@/lib/time";

export interface UseServerTimeOffsetResult extends ClockSkewInfo {
	/** Tanggal dan waktu terkoreksi jam server saat ini */
	correctedNow: Date;
	/** Memperbarui status pembacaan offset secara manual */
	refresh: () => void;
}

/**
 * Hook reaktif untuk memantau pergeseran jam antara perangkat pengguna dan server.
 * Otomatis ter-update saat respons HTTP server diterima dengan header 'Date' baru.
 */
export function useServerTimeOffset(): UseServerTimeOffsetResult {
	const [info, setInfo] = useState<ClockSkewInfo>(() => getClockSkewInfo());

	const refresh = () => {
		setInfo(getClockSkewInfo());
	};

	useEffect(() => {
		const handleSynced = () => {
			setInfo(getClockSkewInfo());
		};

		if (typeof window !== "undefined") {
			window.addEventListener(SERVER_TIME_SYNCED_EVENT, handleSynced);
			return () => {
				window.removeEventListener(SERVER_TIME_SYNCED_EVENT, handleSynced);
			};
		}
	}, []);

	return {
		...info,
		correctedNow: new Date(Date.now() + info.offsetMs),
		refresh,
	};
}
