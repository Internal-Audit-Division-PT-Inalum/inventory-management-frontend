import type { Item, Location } from "@/types/api";

const RACK_PATTERN = /^([A-Za-z]+)(\d+)(?:-([A-Za-z0-9]+))?$/;

/**
 * Physical shelf suffix priority matching Divisi IIA cabinet posters:
 * `-I` (Induk / left compartment) always precedes `-A` (Anak / right compartment).
 */
function suffixRank(suffix: string): number {
	const normalized = suffix.toUpperCase();
	if (normalized === "") return 0;
	if (normalized === "I") return 1;
	if (normalized === "A") return 2;
	return 3;
}

/**
 * Natural physical comparator for IIA rack codes:
 * A1 < A2-I < A2-A < A3-I < A3-A < A4 < B1-I < B1-A < B2-I < B2-A < B3-I < B3-A < B4.
 */
export function compareRackCodes(a?: string | null, b?: string | null): number {
	const cleanA = a?.trim() ?? "";
	const cleanB = b?.trim() ?? "";

	if (cleanA === cleanB) return 0;
	if (cleanA === "") return 1;
	if (cleanB === "") return -1;

	const matchA = RACK_PATTERN.exec(cleanA);
	const matchB = RACK_PATTERN.exec(cleanB);

	if (matchA && matchB) {
		const prefixCmp = matchA[1]
			.toUpperCase()
			.localeCompare(matchB[1].toUpperCase());
		if (prefixCmp !== 0) return prefixCmp;

		const numA = Number.parseInt(matchA[2], 10);
		const numB = Number.parseInt(matchB[2], 10);
		if (numA !== numB) return numA - numB;

		const sufA = matchA[3] ?? "";
		const sufB = matchB[3] ?? "";
		const rankDiff = suffixRank(sufA) - suffixRank(sufB);
		if (rankDiff !== 0) return rankDiff;

		return sufA.localeCompare(sufB, "id", { numeric: true });
	}

	return cleanA.localeCompare(cleanB, "id", { numeric: true });
}

export function extractOrderedRacks(
	items: readonly Pick<Item, "rack_code">[],
): string[] {
	const rackSet = new Set<string>();
	for (const item of items) {
		const code = item.rack_code?.trim();
		if (code) {
			rackSet.add(code);
		}
	}

	return Array.from(rackSet).sort(compareRackCodes);
}

export function formatItemLocationLabel(
	item: Pick<Item, "location" | "rack_code">,
	fallbackLocation?: Location | null,
): string {
	const rack = item.rack_code?.trim();
	const location = item.location ?? fallbackLocation ?? null;

	if (location) {
		if (rack) {
			return `${location.name} • Rak ${rack}`;
		}
		return `${location.code} • ${location.name}`;
	}

	if (rack) {
		return `Rak ${rack}`;
	}

	return "Lokasi belum ditentukan";
}
