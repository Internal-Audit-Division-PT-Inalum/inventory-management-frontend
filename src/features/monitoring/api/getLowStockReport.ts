import { api } from "@/lib/api";
import type { ApiResponse, Item } from "@/types/api";

/**
 * Mengambil daftar barang berstatus stok rendah langsung dari server backend
 * Endpoint: GET /api/v1/inventory/reports/low-stock (Sanctum Authenticated)
 */
export async function getLowStockReportApi(): Promise<Item[]> {
	const response = await api.get<ApiResponse<Item[]>>(
		"/inventory/reports/low-stock",
	);
	return response.data.data;
}
