import { api } from "@/lib/api";
import type { ApiResponse, Item } from "@/types/api";

export interface GetCatalogParams {
	etag?: string | null;
}

export type GetCatalogResult =
	| {
			notModified: true;
			etag?: string;
	  }
	| {
			notModified: false;
			items: Item[];
			etag?: string;
			generatedAt?: string;
	  };

/**
 * Mengambil data katalog barang dari backend dengan dukungan ETag (HTTP 304 Not Modified).
 */
export async function getCatalog(
	params: GetCatalogParams = {},
): Promise<GetCatalogResult> {
	const headers: Record<string, string> = {};

	if (params.etag && params.etag.trim() !== "") {
		// Bersihkan double quotes berlebih jika ada
		const cleanEtag = params.etag.replace(/^"+|"+$/g, "").trim();
		headers["If-None-Match"] = `"${cleanEtag}"`;
	}

	const response = await api.get<ApiResponse<Item[]>>("/inventory/catalog", {
		headers,
		validateStatus: (status) =>
			(status >= 200 && status < 300) || status === 304,
	});

	if (response.status === 304) {
		const rawEtag = (response.headers?.etag || params.etag || "") as string;
		const etag = rawEtag.replace(/^"+|"+$/g, "").trim();
		return {
			notModified: true,
			etag: etag || undefined,
		};
	}

	const rawEtag = (response.headers?.etag || "") as string;
	const etag = rawEtag.replace(/^"+|"+$/g, "").trim();

	const items = response.data?.data || [];
	const generatedAt = response.data?.meta?.generated_at;

	return {
		notModified: false,
		items,
		etag: etag || undefined,
		generatedAt,
	};
}
