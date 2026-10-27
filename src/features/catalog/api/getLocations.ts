import { api } from "@/lib/api";
import type { ApiResponse, Location } from "@/types/api";

/**
 * Mengambil daftar master lokasi penyimpanan barang inventaris.
 */
export async function getLocations(): Promise<Location[]> {
	const response = await api.get<ApiResponse<Location[]>>(
		"/inventory/locations",
	);
	return response.data?.data || [];
}
