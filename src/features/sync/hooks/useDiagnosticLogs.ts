import { useCallback, useEffect, useMemo, useState } from "react";
import { type DiagnosticLog, type DiagnosticLogLevel, db } from "@/lib/db";
import {
	copyLogsToClipboard,
	DEFAULT_DIAGNOSTIC_LOG_CAP,
	DIAGNOSTIC_LOG_UPDATED_EVENT,
	downloadLogsFile,
} from "../lib/diagnostics";
import { SYNC_ENGINE_EVENT } from "../lib/syncEngine";

export interface UseDiagnosticLogsOptions {
	limit?: number;
	autoRefresh?: boolean;
}

export function useDiagnosticLogs(options: UseDiagnosticLogsOptions = {}) {
	const { limit = DEFAULT_DIAGNOSTIC_LOG_CAP, autoRefresh = true } = options;

	const [logs, setLogs] = useState<DiagnosticLog[]>([]);
	const [totalCount, setTotalCount] = useState<number>(0);
	const [isLoading, setIsLoading] = useState<boolean>(true);
	const [levelFilter, setLevelFilter] = useState<DiagnosticLogLevel | "all">(
		"all",
	);
	const [categoryFilter, setCategoryFilter] = useState<string | "all">("all");
	const [searchQuery, setSearchQuery] = useState<string>("");
	const [isCopied, setIsCopied] = useState<boolean>(false);

	/**
	 * Memuat seluruh log dari IndexedDB.
	 */
	const loadLogs = useCallback(async () => {
		try {
			setIsLoading(true);
			const [items, count] = await Promise.all([
				db.getDiagnosticLogs(limit),
				db.getDiagnosticLogCount(),
			]);
			setLogs(items);
			setTotalCount(count);
		} finally {
			setIsLoading(false);
		}
	}, [limit]);

	// Inisialisasi awal & listener pembaruan event
	useEffect(() => {
		loadLogs();

		if (!autoRefresh || typeof window === "undefined") {
			return;
		}

		const handleUpdate = () => {
			void loadLogs();
		};

		window.addEventListener(DIAGNOSTIC_LOG_UPDATED_EVENT, handleUpdate);
		window.addEventListener(SYNC_ENGINE_EVENT, handleUpdate);

		return () => {
			window.removeEventListener(DIAGNOSTIC_LOG_UPDATED_EVENT, handleUpdate);
			window.removeEventListener(SYNC_ENGINE_EVENT, handleUpdate);
		};
	}, [loadLogs, autoRefresh]);

	/**
	 * Filter log berdasarkan level, kategori, dan query pencarian.
	 */
	const filteredLogs = useMemo(() => {
		const query = searchQuery.trim().toLowerCase();

		return logs.filter((log) => {
			if (levelFilter !== "all" && log.level !== levelFilter) {
				return false;
			}

			if (categoryFilter !== "all" && log.category !== categoryFilter) {
				return false;
			}

			if (query !== "") {
				const messageMatch = log.message.toLowerCase().includes(query);
				const categoryMatch = log.category.toLowerCase().includes(query);
				const detailsMatch = log.details
					? (typeof log.details === "object"
							? JSON.stringify(log.details)
							: String(log.details)
						)
							.toLowerCase()
							.includes(query)
					: false;

				return messageMatch || categoryMatch || detailsMatch;
			}

			return true;
		});
	}, [logs, levelFilter, categoryFilter, searchQuery]);

	/**
	 * Statistik level log untuk visual badge counter.
	 */
	const stats = useMemo(() => {
		let errorCount = 0;
		let warnCount = 0;
		let infoCount = 0;
		let debugCount = 0;

		for (const log of logs) {
			if (log.level === "error") errorCount++;
			else if (log.level === "warn") warnCount++;
			else if (log.level === "info") infoCount++;
			else if (log.level === "debug") debugCount++;
		}

		return {
			total: logs.length,
			errorCount,
			warnCount,
			infoCount,
			debugCount,
			error: errorCount,
			warn: warnCount,
			info: infoCount,
			debug: debugCount,
		};
	}, [logs]);

	/**
	 * Daftar kategori unik yang ada di riwayat log saat ini.
	 */
	const availableCategories = useMemo(() => {
		const set = new Set<string>();
		for (const log of logs) {
			if (log.category) set.add(log.category);
		}
		return Array.from(set).sort();
	}, [logs]);

	/**
	 * Membersihkan seluruh log diagnostik di IndexedDB.
	 */
	const clearLogs = useCallback(async () => {
		await db.clearDiagnosticLogs();
		setLogs([]);
		setTotalCount(0);
		if (typeof window !== "undefined") {
			window.dispatchEvent(new CustomEvent(DIAGNOSTIC_LOG_UPDATED_EVENT));
		}
	}, []);

	/**
	 * Mengekspor seluruh log sebagai teks terformat.
	 */
	const exportAsText = useCallback(async () => {
		return await db.exportDiagnosticLogsAsText(limit);
	}, [limit]);

	/**
	 * Mengekspor seluruh log sebagai string JSON.
	 */
	const exportAsJson = useCallback(async () => {
		return await db.exportDiagnosticLogsAsJson(limit);
	}, [limit]);

	/**
	 * Menyalin isi log ke clipboard.
	 */
	const copyToClipboard = useCallback(
		async (format: "text" | "json" = "text") => {
			const content =
				format === "json" ? await exportAsJson() : await exportAsText();
			const success = await copyLogsToClipboard(content);
			if (success) {
				setIsCopied(true);
				setTimeout(() => setIsCopied(false), 2000);
			}
			return success;
		},
		[exportAsJson, exportAsText],
	);

	/**
	 * Mengunduh berkas log diagnostik ke perangkat.
	 */
	const downloadLogs = useCallback(
		async (format: "text" | "json" = "text") => {
			const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
			const ext = format === "json" ? "json" : "txt";
			const filename = `inventory-diagnostic-${timestamp}.${ext}`;
			const mimeType =
				format === "json" ? "application/json" : "text/plain;charset=utf-8";
			const content =
				format === "json" ? await exportAsJson() : await exportAsText();

			return downloadLogsFile(content, filename, mimeType);
		},
		[exportAsJson, exportAsText],
	);

	return {
		logs,
		filteredLogs,
		totalCount,
		isLoading,
		stats,
		availableCategories,
		levelFilter,
		setLevelFilter,
		categoryFilter,
		setCategoryFilter,
		searchQuery,
		setSearchQuery,
		isCopied,
		refreshLogs: loadLogs,
		clearLogs,
		exportAsText,
		exportAsJson,
		copyToClipboard,
		downloadLogs,
	};
}
