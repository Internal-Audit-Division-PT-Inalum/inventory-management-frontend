import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/features/auth/store/authStore";
import { db } from "@/lib/db";
import { AppHeader } from "./AppHeader";
import { AppShell } from "./AppShell";
import { BottomNav } from "./BottomNav";
import { OUTBOX_CHANGE_EVENT } from "./usePendingOutboxCount";

describe("Layout Components Suite (Task P2.6)", () => {
	beforeEach(async () => {
		localStorage.clear();
		await db.outbox.clear();
		useAuthStore.setState({
			token: "mock-valid-token",
			employee: {
				id: "emp-layout-001",
				user_id: "usr-layout-001",
				namecode: "MHS",
				name: "Mahesa Gya",
				email: "mahesa@inalum.id",
				role: "auditor",
				is_active: true,
				must_change_pin: false,
			},
			mustChangePin: false,
			status: "authenticated",
		});
	});

	afterEach(async () => {
		vi.restoreAllMocks();
		await db.outbox.clear();
	});

	describe("AppHeader Component", () => {
		it("renders default corporate Inalum branding and network status", () => {
			render(
				<MemoryRouter>
					<AppHeader />
				</MemoryRouter>,
			);

			expect(screen.getByText("INVENTORY SYSTEM")).toBeDefined();
			expect(screen.getByText("Internal Audit PT INALUM")).toBeDefined();
			expect(screen.getByText("IIA")).toBeDefined();
			expect(screen.getByText("Online")).toBeDefined();
			expect(screen.getByText("MHS")).toBeDefined();
		});

		it("renders custom title and subtitle when provided", () => {
			render(
				<MemoryRouter>
					<AppHeader
						title="DETAIL LOKASI"
						subtitle="Gudang Sentral Inalum"
						showNetworkStatus={false}
						showEmployeeBadge={false}
					/>
				</MemoryRouter>,
			);

			expect(screen.getByText("DETAIL LOKASI")).toBeDefined();
			expect(screen.getByText("Gudang Sentral Inalum")).toBeDefined();
			expect(screen.queryByText("Online")).toBeNull();
			expect(screen.queryByText("MHS")).toBeNull();
		});

		it("updates network indicator on offline and online window events", () => {
			render(
				<MemoryRouter>
					<AppHeader />
				</MemoryRouter>,
			);

			expect(screen.getByText("Online")).toBeDefined();

			// Simulasikan event offline
			fireEvent(window, new Event("offline"));
			expect(screen.getByText("Offline")).toBeDefined();
			expect(screen.queryByText("Online")).toBeNull();

			// Simulasikan event online kembali
			fireEvent(window, new Event("online"));
			expect(screen.getByText("Online")).toBeDefined();
		});
	});

	describe("BottomNav Component", () => {
		it("renders all 4 navigation tabs with accessible labels", () => {
			render(
				<MemoryRouter initialEntries={["/"]}>
					<BottomNav />
				</MemoryRouter>,
			);

			expect(screen.getByTestId("bottom-nav-catalog")).toBeDefined();
			expect(screen.getByTestId("bottom-nav-loans")).toBeDefined();
			expect(screen.getByTestId("bottom-nav-outbox")).toBeDefined();
			expect(screen.getByTestId("bottom-nav-profile")).toBeDefined();

			expect(screen.getByText("Katalog")).toBeDefined();
			expect(screen.getByText("Pinjaman")).toBeDefined();
			expect(screen.getByText("Antrean")).toBeDefined();
			expect(screen.getByText("Profil")).toBeDefined();
		});

		it("highlights the active tab based on the current location route", () => {
			render(
				<MemoryRouter initialEntries={["/loans"]}>
					<BottomNav />
				</MemoryRouter>,
			);

			const loansTab = screen.getByTestId("bottom-nav-loans");
			expect(loansTab.getAttribute("aria-selected")).toBe("true");

			const catalogTab = screen.getByTestId("bottom-nav-catalog");
			expect(catalogTab.getAttribute("aria-selected")).toBe("false");
		});

		it("displays dynamic outbox badge when pending transactions exist in IndexedDB", async () => {
			// Simulasikan ada 3 transaksi pending di outbox
			await db.outbox.bulkPut([
				{
					clientUuid: "tx-1",
					employeeId: "emp-1",
					operation: "take",
					itemId: "item-1",
					quantity: 1,
					occurredAt: new Date().toISOString(),
					status: "pending",
					attempts: 0,
					createdAt: new Date().toISOString(),
				},
				{
					clientUuid: "tx-2",
					employeeId: "emp-1",
					operation: "borrow",
					itemId: "item-2",
					quantity: 2,
					occurredAt: new Date().toISOString(),
					status: "pending",
					attempts: 0,
					createdAt: new Date().toISOString(),
				},
				{
					clientUuid: "tx-3",
					employeeId: "emp-1",
					operation: "return",
					itemId: "item-2",
					quantity: 1,
					occurredAt: new Date().toISOString(),
					status: "syncing",
					attempts: 1,
					createdAt: new Date().toISOString(),
				},
			]);

			render(
				<MemoryRouter initialEntries={["/"]}>
					<BottomNav />
				</MemoryRouter>,
			);

			// Pemicu event outbox_change
			window.dispatchEvent(new Event(OUTBOX_CHANGE_EVENT));

			await waitFor(() => {
				const badge = screen.getByTestId("outbox-badge-count");
				expect(badge.textContent).toBe("3");
			});
		});

		it("hides outbox badge when no pending transactions exist", async () => {
			render(
				<MemoryRouter initialEntries={["/"]}>
					<BottomNav />
				</MemoryRouter>,
			);

			await waitFor(() => {
				expect(screen.queryByTestId("outbox-badge-count")).toBeNull();
			});
		});
	});

	describe("AppShell Component", () => {
		it("renders children content with AppHeader and BottomNav", () => {
			render(
				<MemoryRouter initialEntries={["/"]}>
					<AppShell>
						<div data-testid="test-content">Konten Halaman Utama</div>
					</AppShell>
				</MemoryRouter>,
			);

			expect(screen.getByText("INVENTORY SYSTEM")).toBeDefined();
			expect(screen.getByTestId("test-content")).toBeDefined();
			expect(screen.getByTestId("bottom-nav-catalog")).toBeDefined();
		});

		it("supports hiding header or bottom nav via props", () => {
			render(
				<MemoryRouter initialEntries={["/"]}>
					<AppShell showHeader={false} showBottomNav={false}>
						<div data-testid="fullscreen-content">Tampilan Penuh Scanner</div>
					</AppShell>
				</MemoryRouter>,
			);

			expect(screen.queryByText("INVENTORY SYSTEM")).toBeNull();
			expect(screen.getByTestId("fullscreen-content")).toBeDefined();
			expect(screen.queryByTestId("bottom-nav-catalog")).toBeNull();
		});

		it("allows seamless navigation across bottom nav tabs", async () => {
			const user = userEvent.setup();

			render(
				<MemoryRouter initialEntries={["/"]}>
					<Routes>
						<Route element={<AppShell />}>
							<Route
								path="/"
								element={<div data-testid="page-katalog">Halaman Katalog</div>}
							/>
							<Route
								path="/loans"
								element={
									<div data-testid="page-pinjaman">Halaman Pinjaman</div>
								}
							/>
							<Route
								path="/outbox"
								element={<div data-testid="page-antrean">Halaman Antrean</div>}
							/>
							<Route
								path="/profile"
								element={<div data-testid="page-profil">Halaman Profil</div>}
							/>
						</Route>
					</Routes>
				</MemoryRouter>,
			);

			expect(screen.getByTestId("page-katalog")).toBeDefined();

			// Klik tab Pinjaman
			await user.click(screen.getByTestId("bottom-nav-loans"));
			expect(screen.getByTestId("page-pinjaman")).toBeDefined();

			// Klik tab Antrean
			await user.click(screen.getByTestId("bottom-nav-outbox"));
			expect(screen.getByTestId("page-antrean")).toBeDefined();

			// Klik tab Profil
			await user.click(screen.getByTestId("bottom-nav-profile"));
			expect(screen.getByTestId("page-profil")).toBeDefined();
		});
	});
});
