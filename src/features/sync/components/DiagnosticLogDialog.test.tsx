import {
	act,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import * as diagnosticsLib from "../lib/diagnostics";
import { DiagnosticLogDialog } from "./DiagnosticLogDialog";

describe("DiagnosticLogDialog Component Suite (Task P5.13)", () => {
	const onOpenChangeMock = vi.fn();

	beforeEach(async () => {
		await db.diagnostic_logs.clear();
		vi.clearAllMocks();
	});

	afterEach(async () => {
		await db.diagnostic_logs.clear();
		vi.restoreAllMocks();
	});

	it("renders dialog elements properly when open=true", async () => {
		render(<DiagnosticLogDialog open={true} onOpenChange={onOpenChangeMock} />);

		await waitFor(() => {
			expect(screen.getByTestId("diagnostic-log-dialog")).toBeDefined();
			expect(screen.getByText("Log Diagnostik Sistem")).toBeDefined();
			expect(screen.getByTestId("log-counter-badge").textContent).toContain(
				"0 / 100 Entri",
			);
			expect(
				screen.getByText("Belum ada entri log diagnostik tercatat."),
			).toBeDefined();
		});
	});

	it("renders list of diagnostic logs with tags and collapsible details", async () => {
		await db.addDiagnosticLog({
			timestamp: "2026-10-29T10:00:00.000Z",
			level: "error",
			category: "SYNC_ENGINE",
			message: "Koneksi gateway terputus saat upload transaksi",
			details: { status: 504, transactionId: "tx-999" },
		});
		await db.addDiagnosticLog({
			timestamp: "2026-10-29T10:01:00.000Z",
			level: "info",
			category: "AUTH",
			message: "Autentikasi PIN berhasil diverifikasi",
			details: null,
		});

		render(<DiagnosticLogDialog open={true} onOpenChange={onOpenChangeMock} />);

		await waitFor(() => {
			expect(
				screen.getByText("Koneksi gateway terputus saat upload transaksi"),
			).toBeDefined();
			expect(
				screen.getByText("Autentikasi PIN berhasil diverifikasi"),
			).toBeDefined();
		});

		expect(screen.getByTestId("log-counter-badge").textContent).toContain(
			"2 / 100 Entri",
		);

		// Collapsible payload toggle
		const payloadButton = screen.getByRole("button", { name: "Lihat payload" });
		expect(payloadButton).toBeDefined();
		expect(screen.queryByText(/"transactionId": "tx-999"/)).toBeNull();

		fireEvent.click(payloadButton);
		expect(screen.getByText(/"transactionId": "tx-999"/)).toBeDefined();

		fireEvent.click(payloadButton);
		expect(screen.queryByText(/"transactionId": "tx-999"/)).toBeNull();
	});

	it("filters log entries by level chips (all, error, warn, info)", async () => {
		await db.addDiagnosticLog({
			timestamp: "2026-10-29T10:00:00.000Z",
			level: "error",
			category: "SYNC_ENGINE",
			message: "Error transaksi offline",
		});
		await db.addDiagnosticLog({
			timestamp: "2026-10-29T10:01:00.000Z",
			level: "warn",
			category: "SYNC_SCHEDULER",
			message: "Peringatan antrean tertunda",
		});
		await db.addDiagnosticLog({
			timestamp: "2026-10-29T10:02:00.000Z",
			level: "info",
			category: "SYSTEM",
			message: "Aplikasi online kembali",
		});

		render(<DiagnosticLogDialog open={true} onOpenChange={onOpenChangeMock} />);

		await waitFor(() => {
			expect(screen.getByText("Error transaksi offline")).toBeDefined();
		});

		// Filter ke Error
		fireEvent.click(screen.getByTestId("filter-level-error"));
		expect(screen.getByText("Error transaksi offline")).toBeDefined();
		expect(screen.queryByText("Peringatan antrean tertunda")).toBeNull();
		expect(screen.queryByText("Aplikasi online kembali")).toBeNull();

		// Filter ke Warning
		fireEvent.click(screen.getByTestId("filter-level-warn"));
		expect(screen.queryByText("Error transaksi offline")).toBeNull();
		expect(screen.getByText("Peringatan antrean tertunda")).toBeDefined();
		expect(screen.queryByText("Aplikasi online kembali")).toBeNull();

		// Kembali ke Semua
		fireEvent.click(screen.getByTestId("filter-level-all"));
		expect(screen.getByText("Error transaksi offline")).toBeDefined();
		expect(screen.getByText("Peringatan antrean tertunda")).toBeDefined();
		expect(screen.getByText("Aplikasi online kembali")).toBeDefined();
	});

	it("filters entries via search bar and resets on clear click", async () => {
		const user = userEvent.setup();

		await db.addDiagnosticLog({
			timestamp: "2026-10-29T10:00:00.000Z",
			level: "info",
			category: "TIME_SYNC",
			message: "Offset waktu server tersinkronisasi 250ms",
		});
		await db.addDiagnosticLog({
			timestamp: "2026-10-29T10:01:00.000Z",
			level: "info",
			category: "CATALOG_SYNC",
			message: "Katalog barang 120 SKU terbarui",
		});

		render(<DiagnosticLogDialog open={true} onOpenChange={onOpenChangeMock} />);

		await waitFor(() => {
			expect(
				screen.getByText("Offset waktu server tersinkronisasi 250ms"),
			).toBeDefined();
		});

		const searchInput = screen.getByTestId("diagnostic-search-input");
		await user.type(searchInput, "SKU");

		expect(
			screen.queryByText("Offset waktu server tersinkronisasi 250ms"),
		).toBeNull();
		expect(screen.getByText("Katalog barang 120 SKU terbarui")).toBeDefined();

		// Hapus keyword
		await user.clear(searchInput);
		expect(
			screen.getByText("Offset waktu server tersinkronisasi 250ms"),
		).toBeDefined();
	});

	it("copies logs to clipboard when 'Salin' button is clicked", async () => {
		const copySpy = vi
			.spyOn(diagnosticsLib, "copyLogsToClipboard")
			.mockResolvedValue(true);

		await db.addDiagnosticLog({
			timestamp: "2026-10-29T10:00:00.000Z",
			level: "info",
			category: "SYSTEM",
			message: "Sample test log for clipboard",
		});

		render(<DiagnosticLogDialog open={true} onOpenChange={onOpenChangeMock} />);

		await waitFor(() => {
			expect(screen.getByText("Sample test log for clipboard")).toBeDefined();
		});

		const copyButton = screen.getByTestId("copy-logs-button");
		await act(async () => {
			fireEvent.click(copyButton);
		});

		await waitFor(() => {
			expect(copySpy).toHaveBeenCalledTimes(1);
			expect(screen.getByText("Tersalin!")).toBeDefined();
		});

		copySpy.mockRestore();
	});

	it("downloads logs file when 'Unduh' button is clicked", async () => {
		const downloadSpy = vi
			.spyOn(diagnosticsLib, "downloadLogsFile")
			.mockImplementation(() => true);

		await db.addDiagnosticLog({
			timestamp: "2026-10-29T10:00:00.000Z",
			level: "warn",
			category: "SYSTEM",
			message: "Log for download verification",
		});

		render(<DiagnosticLogDialog open={true} onOpenChange={onOpenChangeMock} />);

		await waitFor(() => {
			expect(screen.getByText("Log for download verification")).toBeDefined();
		});

		const downloadButton = screen.getByTestId("download-logs-button");
		await act(async () => {
			fireEvent.click(downloadButton);
		});

		await waitFor(() => {
			expect(downloadSpy).toHaveBeenCalledTimes(1);
			expect(downloadSpy.mock.calls[0][1]).toContain("inventory-diagnostic-");
			expect(downloadSpy.mock.calls[0][1]).toContain(".txt");
		});

		// Switch ke JSON format
		const formatSelect = screen.getByTestId("export-format-select");
		fireEvent.change(formatSelect, { target: { value: "json" } });

		await act(async () => {
			fireEvent.click(downloadButton);
		});
		await waitFor(() => {
			expect(downloadSpy).toHaveBeenCalledTimes(2);
			expect(downloadSpy.mock.calls[1][1]).toContain(".json");
		});

		downloadSpy.mockRestore();
	});

	it("confirms and clears all diagnostic logs", async () => {
		await db.addDiagnosticLog({
			timestamp: "2026-10-29T10:00:00.000Z",
			level: "error",
			category: "AUTH",
			message: "Session token invalid",
		});

		render(<DiagnosticLogDialog open={true} onOpenChange={onOpenChangeMock} />);

		await waitFor(() => {
			expect(screen.getByText("Session token invalid")).toBeDefined();
		});

		const clearButton = screen.getByTestId("clear-logs-button");
		fireEvent.click(clearButton);

		// Menampilkan konfirmasi "Hapus semua?"
		expect(screen.getByText("Hapus semua?")).toBeDefined();
		const confirmButton = screen.getByTestId("confirm-clear-logs-button");
		await act(async () => {
			fireEvent.click(confirmButton);
		});

		await waitFor(() => {
			expect(
				screen.getByText("Belum ada entri log diagnostik tercatat."),
			).toBeDefined();
		});

		const remainingCount = await db.getDiagnosticLogCount();
		expect(remainingCount).toBe(0);
	});

	it("invokes onOpenChange(false) when 'Tutup' button is clicked", async () => {
		render(<DiagnosticLogDialog open={true} onOpenChange={onOpenChangeMock} />);

		await waitFor(() => {
			expect(screen.getByRole("button", { name: "Tutup" })).toBeDefined();
		});

		const closeButton = screen.getByRole("button", { name: "Tutup" });
		fireEvent.click(closeButton);

		expect(onOpenChangeMock).toHaveBeenCalledWith(false);
	});
});
