import { useCallback, useEffect, useRef, useState } from "react";
import { db } from "@/lib/db";
import type { Location } from "@/types/api";
import { CATALOG_SYNC_EVENT } from "../api/syncCatalog";

export interface UseCatalogLocationsResult {
	locations: Location[];
	locationMap: Map<string, Location>;
	isLoading: boolean;
	refetch: () => Promise<void>;
}

/**
 * Hook reaktif untuk memuat seluruh master lokasi penyimpanan barang dari IndexedDB.
 */
export function useCatalogLocations(): UseCatalogLocationsResult {
	const [locations, setLocations] = useState<Location[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const isMountedRef = useRef(true);
	const loadRequestIdRef = useRef(0);

	const loadLocations = useCallback(async () => {
		const requestId = ++loadRequestIdRef.current;

		try {
			const allLocations = await db.locations.orderBy("name").toArray();
			if (!isMountedRef.current || requestId !== loadRequestIdRef.current) {
				return;
			}
			setLocations(allLocations);
		} catch (err) {
			if (!isMountedRef.current || requestId !== loadRequestIdRef.current) {
				return;
			}
			console.error("Gagal memuat daftar lokasi:", err);
		} finally {
			if (isMountedRef.current && requestId === loadRequestIdRef.current) {
				setIsLoading(false);
			}
		}
	}, []);

	useEffect(() => {
		isMountedRef.current = true;

		loadLocations();

		// Dengarkan event sinkronisasi katalog untuk pembaruan otomatis
		const handleCatalogSynced = () => {
			if (isMountedRef.current) {
				loadLocations();
			}
		};

		if (typeof window !== "undefined") {
			window.addEventListener(CATALOG_SYNC_EVENT, handleCatalogSynced);
		}

		return () => {
			isMountedRef.current = false;
			if (typeof window !== "undefined") {
				window.removeEventListener(CATALOG_SYNC_EVENT, handleCatalogSynced);
			}
		};
	}, [loadLocations]);

	const locationMap = new Map<string, Location>(
		locations.map((loc) => [loc.id, loc]),
	);

	return {
		locations,
		locationMap,
		isLoading,
		refetch: loadLocations,
	};
}
