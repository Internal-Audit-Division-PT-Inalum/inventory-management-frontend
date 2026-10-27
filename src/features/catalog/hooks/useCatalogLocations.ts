import { useCallback, useEffect, useState } from "react";
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

	const loadLocations = useCallback(async () => {
		try {
			const allLocations = await db.locations.orderBy("name").toArray();
			setLocations(allLocations);
		} catch (err) {
			console.error("Gagal memuat daftar lokasi:", err);
		} finally {
			setIsLoading(false);
		}
	}, []);

	useEffect(() => {
		let isMounted = true;

		loadLocations();

		// Dengarkan event sinkronisasi katalog untuk pembaruan otomatis
		const handleCatalogSynced = () => {
			if (isMounted) {
				loadLocations();
			}
		};

		if (typeof window !== "undefined") {
			window.addEventListener(CATALOG_SYNC_EVENT, handleCatalogSynced);
		}

		return () => {
			isMounted = false;
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
