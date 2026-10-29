import { HttpResponse, http } from "msw";
import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
} from "vitest";
import { useAuthStore } from "@/features/auth/store/authStore";
import { db, type OutboxItem } from "@/lib/db";
import {
	calculateOffsetFromHeader,
	getCorrectedNow,
	resetServerTimeOffset,
	setServerTimeOffset,
	validateOccurredAt,
} from "@/lib/time";
import { mockItemStore, mswControl, resetMswStore } from "@/test/msw/handlers";
import { server } from "@/test/msw/server";
import type { AuthSession, Item } from "@/types/api";
import { runSyncEngine } from "./lib/syncEngine";
import { syncPauseController } from "./lib/syncPauseController";
import {
	FALLBACK_STORAGE_LOCK_KEY_PREFIX,
	SYNC_TAB_LOCK_NAME,
} from "./lib/tabLock";

beforeAll(() => {
	server.listen();
});

afterEach(async () => {
	server.resetHandlers();
	resetMswStore();
	syncPauseController.resume();
	resetServerTimeOffset();
	useAuthStore.getState().logout();
	await db.items.clear();
	await db.outbox.clear();
	await db.diagnostic_logs.clear();
	localStorage.clear();
});

afterAll(() => {
	server.close();
});

describe("Task P5.14: 7 Skenario Wajib Sync Engine (MSW + Fake-IndexedDB)", () => {
	const defaultConsumable: Item = {
		id: "item-consumable-1",
		sku: "SKU-KRT-A4",
		name: "Kertas HVS A4",
		type: "consumable",
		unit: "rim",
		location_id: "loc-01",
		current_stock: 20,
		minimum_stock: 5,
		image_url: null,
		updated_at: "2026-10-29T00:00:00Z",
	};

	const defaultAsset: Item = {
		id: "item-asset-1",
		sku: "SKU-PROJ-01",
		name: "Proyektor Epson",
		type: "asset",
		unit: "unit",
		location_id: "loc-01",
		current_stock: 10,
		minimum_stock: 1,
		borrowed_quantity: 2,
		image_url: null,
		updated_at: "2026-10-29T00:00:00Z",
	};

	const aliceSession: AuthSession = {
		token: "token-alice-12345",
		employee: {
			id: "emp-alice",
			user_id: "user-alice",
			namecode: "ALC",
			name: "Alice Smith",
			role: "auditor",
			email: "alice@inalum.id",
			is_active: true,
			must_change_pin: false,
		},
		must_change_pin: false,
	};

	const bobSession: AuthSession = {
		token: "token-bob-67890",
		employee: {
			id: "emp-bob",
			user_id: "user-bob",
			namecode: "BOB",
			name: "Bob Jones",
			role: "auditor",
			email: "bob@inalum.id",
			is_active: true,
			must_change_pin: false,
		},
		must_change_pin: false,
	};

	beforeEach(async () => {
		await db.items.bulkAdd([defaultConsumable, defaultAsset]);
		useAuthStore.getState().setSession(aliceSession);
	});

	// =========================================================================
	// SKENARIO 1: Putus Jaringan Sebelum Respons -> Retry (Tak Menggandakan Stok)
	// =========================================================================
	it("Skenario 1: Putus jaringan sebelum respons -> retry tidak menggandakan pemotongan stok", async () => {
		const clientUuid = "uuid-skenario-1-retry";
		const outboxItem: OutboxItem = {
			clientUuid,
			employeeId: "emp-alice",
			operation: "take",
			itemId: "item-consumable-1",
			quantity: 2,
			occurredAt: "2026-10-29T08:00:00Z",
			status: "pending",
			attempts: 0,
			notes: "Pengambilan audit lapangan",
			createdAt: "2026-10-29T08:00:00Z",
		};
		await db.outbox.add(outboxItem);

		// 1. Simulasikan koneksi jaringan putus saat request dikirimkan
		mswControl.simulateNetworkError = true;

		const failedRun = await runSyncEngine({
			bypassTabLock: true,
			employeeId: "emp-alice",
		});

		expect(failedRun.totalProcessed).toBe(1);
		expect(failedRun.failedCount).toBe(1);
		expect(failedRun.syncedCount).toBe(0);

		// Record di outbox harus beralih kembali ke antrean retry dengan attempts bertambah & backoff nextAttemptAt
		const failedRecord = await db.getOutboxItemByUuid(clientUuid);
		expect(failedRecord?.status).toBe("pending");
		expect(failedRecord?.attempts).toBe(1);
		expect(failedRecord?.nextAttemptAt).toBeDefined();

		// Di server stok belum terpotong (masih 20)
		expect(mockItemStore["item-consumable-1"].current_stock).toBe(20);

		// 2. Koneksi internet pulih kembali
		mswControl.simulateNetworkError = false;

		// Reset jadwal backoff nextAttemptAt agar antrean langsung eligible untuk di-retry
		await db.outbox.update(clientUuid, { nextAttemptAt: null });

		// 3. Retry sinkronisasi dengan menyertakan item yang gagal
		const retryRun = await runSyncEngine({
			bypassTabLock: true,
			employeeId: "emp-alice",
			includeFailed: true,
		});

		expect(retryRun.totalProcessed).toBe(1);
		expect(retryRun.syncedCount).toBe(1);
		expect(retryRun.failedCount).toBe(0);

		const syncedRecord = await db.getOutboxItemByUuid(clientUuid);
		expect(syncedRecord?.status).toBe("synced");

		// Stok di server terpotong 1 kali menjadi 18
		expect(mockItemStore["item-consumable-1"].current_stock).toBe(18);

		// Stok di IndexedDB lokal terbarui menjadi 18
		const localItem = await db.items.get("item-consumable-1");
		expect(localItem?.current_stock).toBe(18);

		// 4. Simulasi Replay Idempotency: Jika retry terkirim lagi dengan clientUuid sama
		// Server MSW mengembalikan { meta: { replayed: true } } dan tidak memotong stok lagi
		const duplicateRun = await runSyncEngine({
			bypassTabLock: true,
			employeeId: "emp-alice",
		});
		expect(duplicateRun.totalProcessed).toBe(0); // Sudah synced, tidak diproses ulang

		// Stok tetap 18 (tidak menggandakan pemotongan ke 16)
		expect(mockItemStore["item-consumable-1"].current_stock).toBe(18);
		expect((await db.items.get("item-consumable-1"))?.current_stock).toBe(18);
	});

	// =========================================================================
	// SKENARIO 2: Dua Tab Bersamaan (Hanya Satu Menyinkronkan)
	// =========================================================================
	it("Skenario 2: Dua tab bersamaan -> hanya satu tab yang menyinkronkan (mutual exclusion)", async () => {
		const clientUuid = "uuid-skenario-2-tablock";
		await db.outbox.add({
			clientUuid,
			employeeId: "emp-alice",
			operation: "take",
			itemId: "item-consumable-1",
			quantity: 1,
			occurredAt: "2026-10-29T08:05:00Z",
			status: "pending",
			attempts: 0,
			createdAt: "2026-10-29T08:05:00Z",
		});

		// Simulasikan Tab Lain (Tab 2) sedang memegang active lock di localStorage
		const foreignTabId = "tab-other-browser-999";
		const lockKey = `${FALLBACK_STORAGE_LOCK_KEY_PREFIX}${SYNC_TAB_LOCK_NAME}`;
		localStorage.setItem(
			lockKey,
			JSON.stringify({
				lockId: "lock_foreign_active_123",
				tabId: foreignTabId,
				acquiredAt: Date.now(),
				expiresAt: Date.now() + 30000,
			}),
		);

		// Tab saat ini (Tab 1) mencoba menjalankan sinkronisasi
		const result = await runSyncEngine({
			employeeId: "emp-alice",
			bypassTabLock: false, // Wajib mengevaluasi lock antar-tab
		});

		// Verifikasi: Tab 1 langsung melewatinya tanpa memproses atau mengeksekusi request
		expect(result.skippedDueToTabLock).toBe(true);
		expect(result.totalProcessed).toBe(0);
		expect(result.syncedCount).toBe(0);

		// Transaksi di antrean tetap pending dan tidak disentuh ganda
		const outboxRecord = await db.getOutboxItemByUuid(clientUuid);
		expect(outboxRecord?.status).toBe("pending");
		expect(outboxRecord?.attempts).toBe(0);

		// Bersihkan lock tab asing
		localStorage.removeItem(lockKey);

		// Sekarang Tab 1 mencoba lagi setelah lock dilepas
		const successRun = await runSyncEngine({
			employeeId: "emp-alice",
			bypassTabLock: false,
		});

		expect(successRun.skippedDueToTabLock).toBeUndefined();
		expect(successRun.syncedCount).toBe(1);
		expect((await db.getOutboxItemByUuid(clientUuid))?.status).toBe("synced");
	});

	// =========================================================================
	// SKENARIO 3: Stok Habis Saat Sinkron (Rejected + Pesan Jelas; Antrian Lain Jalan)
	// =========================================================================
	it("Skenario 3: Stok habis saat sinkron -> status rejected dengan pesan jelas; antrean item lain tetap jalan", async () => {
		// Habiskan stok consumable di server (misal habis diambil auditor lain di Kiosk)
		mockItemStore["item-consumable-1"].current_stock = 0;
		// Sedangkan aset Proyektor masih tersedia stok 10
		mockItemStore["item-asset-1"].current_stock = 10;

		const uuidA1 = "uuid-skenario-3-itemA-1";
		const uuidA2 = "uuid-skenario-3-itemA-2";
		const uuidB = "uuid-skenario-3-itemB-1";

		// 2 transaksi antrean untuk Item A
		await db.outbox.add({
			clientUuid: uuidA1,
			employeeId: "emp-alice",
			operation: "take",
			itemId: "item-consumable-1",
			quantity: 2,
			occurredAt: "2026-10-29T08:10:00Z",
			status: "pending",
			attempts: 0,
			createdAt: "2026-10-29T08:10:00Z",
		});
		await db.outbox.add({
			clientUuid: uuidA2,
			employeeId: "emp-alice",
			operation: "take",
			itemId: "item-consumable-1",
			quantity: 1,
			occurredAt: "2026-10-29T08:11:00Z",
			status: "pending",
			attempts: 0,
			createdAt: "2026-10-29T08:11:00Z",
		});

		// 1 transaksi antrean untuk Item B
		await db.outbox.add({
			clientUuid: uuidB,
			employeeId: "emp-alice",
			operation: "borrow",
			itemId: "item-asset-1",
			quantity: 1,
			occurredAt: "2026-10-29T08:12:00Z",
			status: "pending",
			attempts: 0,
			createdAt: "2026-10-29T08:12:00Z",
		});

		const syncResult = await runSyncEngine({
			bypassTabLock: true,
			employeeId: "emp-alice",
		});

		// Verifikasi agregasi hasil
		expect(syncResult.rejectedCount).toBe(1); // Item A transaksi 1 ditolak
		expect(syncResult.syncedCount).toBe(1); // Item B transaksi 1 sukses tersinkron

		// 1. Periksa entri Item A transaksi 1: berstatus 'rejected' dengan error code INSUFFICIENT_STOCK
		const recordA1 = await db.getOutboxItemByUuid(uuidA1);
		expect(recordA1?.status).toBe("rejected");
		expect(recordA1?.lastError?.code).toBe("INSUFFICIENT_STOCK");
		expect(recordA1?.lastError?.message).toContain(
			"Stok barang tidak mencukupi",
		);

		// 2. Periksa entri Item A transaksi 2: terhenti/terjaga secara FIFO serial per item
		// (karena A1 gagal ditolak, A2 tidak boleh dieksekusi secara membabi buta)
		const recordA2 = await db.getOutboxItemByUuid(uuidA2);
		expect(recordA2?.status).toBe("pending");

		// 3. Periksa entri Item B: Berhasil tersinkronisasi tanpa terpengaruh kegagalan Item A!
		const recordB = await db.getOutboxItemByUuid(uuidB);
		expect(recordB?.status).toBe("synced");
		expect(mockItemStore["item-asset-1"].borrowed_quantity).toBe(3); // 2 + 1
	});

	// =========================================================================
	// SKENARIO 4: Token Kedaluwarsa di Tengah (Pause; Lanjut Setelah Login Ulang)
	// =========================================================================
	it("Skenario 4: Token kedaluwarsa di tengah -> pause antrean; lanjut otomatis setelah login ulang", async () => {
		const uuid1 = "uuid-skenario-4-auth-1";
		const uuid2 = "uuid-skenario-4-auth-2";

		await db.outbox.add({
			clientUuid: uuid1,
			employeeId: "emp-alice",
			operation: "take",
			itemId: "item-consumable-1",
			quantity: 1,
			occurredAt: "2026-10-29T08:15:00Z",
			status: "pending",
			attempts: 0,
			createdAt: "2026-10-29T08:15:00Z",
		});
		await db.outbox.add({
			clientUuid: uuid2,
			employeeId: "emp-alice",
			operation: "take",
			itemId: "item-consumable-1",
			quantity: 2,
			occurredAt: "2026-10-29T08:16:00Z",
			status: "pending",
			attempts: 0,
			createdAt: "2026-10-29T08:16:00Z",
		});

		// 1. Simulasikan token kedaluwarsa (401 Unauthorized dari server)
		mswControl.simulateAuthExpired = true;

		const authFailedResult = await runSyncEngine({
			bypassTabLock: true,
			employeeId: "emp-alice",
		});

		expect(authFailedResult.haltedByAuth).toBe(true);

		// Verifikasi: SyncPauseController aktif dalam mode paused
		expect(syncPauseController.isPaused()).toBe(true);
		expect(syncPauseController.getReason()).toBeDefined();

		// Item tidak dibuang/rejected, melainkan tetap terselamatkan dalam status pending
		const record1 = await db.getOutboxItemByUuid(uuid1);
		expect(record1?.status).toBe("pending");
		expect(record1?.lastError?.code).toBe("UNAUTHENTICATED");

		const record2 = await db.getOutboxItemByUuid(uuid2);
		expect(record2?.status).toBe("pending");

		// Panggilan sync berikutnya langsung di-skip oleh guard antrean yang ter-pause
		const skippedRun = await runSyncEngine({
			bypassTabLock: true,
			employeeId: "emp-alice",
		});
		expect(skippedRun.haltedByAuth).toBe(true);
		expect(skippedRun.totalProcessed).toBe(0);

		// 2. Auditor melakukan login ulang (menghasilkan sesi aktif baru & resume controller)
		mswControl.simulateAuthExpired = false;
		useAuthStore.getState().setSession(aliceSession);

		expect(syncPauseController.isPaused()).toBe(false);

		// 3. Sync engine dipicu kembali setelah login ulang berhasil
		const resumedRun = await runSyncEngine({
			bypassTabLock: true,
			employeeId: "emp-alice",
		});

		expect(resumedRun.syncedCount).toBe(2);
		expect((await db.getOutboxItemByUuid(uuid1))?.status).toBe("synced");
		expect((await db.getOutboxItemByUuid(uuid2))?.status).toBe("synced");
	});

	// =========================================================================
	// SKENARIO 5: 20 Transaksi Offline Lalu Online (Terkirim Urut Per Item)
	// =========================================================================
	it("Skenario 5: 20 transaksi offline lalu online -> terkirim urut strictly FIFO per item", async () => {
		const receivedOrderConsumable: string[] = [];
		const receivedOrderAsset: string[] = [];

		// Pasang spy handler di MSW untuk melacak urutan payload yang tiba di server
		server.use(
			http.post(
				"*/inventory/items/:itemId/:operation",
				async ({ params, request }) => {
					const itemId = params.itemId as string;
					const body = (await request.json()) as { client_uuid: string };

					if (itemId === "item-consumable-1") {
						receivedOrderConsumable.push(body.client_uuid);
					} else if (itemId === "item-asset-1") {
						receivedOrderAsset.push(body.client_uuid);
					}

					return HttpResponse.json(
						{
							success: true,
							message: "Success",
							data: {
								id: `led-${Date.now()}`,
								item_id: itemId,
								stock_after: 10,
								client_uuid: body.client_uuid,
								occurred_at: new Date().toISOString(),
								item: { id: itemId, current_stock: 10 },
							},
						},
						{ status: 201 },
					);
				},
			),
		);

		// Buat 10 transaksi untuk Item Consumable dan 10 transaksi untuk Item Asset
		const expectedConsumableUuids: string[] = [];
		const expectedAssetUuids: string[] = [];

		const itemsToEnqueue: OutboxItem[] = [];

		for (let i = 1; i <= 10; i++) {
			const uuidC = `uuid-c-${i.toString().padStart(2, "0")}`;
			expectedConsumableUuids.push(uuidC);
			itemsToEnqueue.push({
				clientUuid: uuidC,
				employeeId: "emp-alice",
				operation: i % 2 === 0 ? "add" : "take",
				itemId: "item-consumable-1",
				quantity: 1,
				occurredAt: `2026-10-29T08:${i.toString().padStart(2, "0")}:00Z`,
				status: "pending",
				attempts: 0,
				createdAt: `2026-10-29T08:${i.toString().padStart(2, "0")}:00Z`,
			});

			const uuidA = `uuid-a-${i.toString().padStart(2, "0")}`;
			expectedAssetUuids.push(uuidA);
			itemsToEnqueue.push({
				clientUuid: uuidA,
				employeeId: "emp-alice",
				operation: i % 2 === 0 ? "return" : "borrow",
				itemId: "item-asset-1",
				quantity: 1,
				occurredAt: `2026-10-29T08:${(i + 20).toString().padStart(2, "0")}:00Z`,
				status: "pending",
				attempts: 0,
				createdAt: `2026-10-29T08:${(i + 20).toString().padStart(2, "0")}:00Z`,
			});
		}

		// Acak urutan insert ke DB untuk memastikan engine menyortir berdasarkan createdAt asc
		await db.outbox.bulkAdd(itemsToEnqueue.sort(() => Math.random() - 0.5));

		const runResult = await runSyncEngine({
			bypassTabLock: true,
			employeeId: "emp-alice",
		});

		expect(runResult.totalProcessed).toBe(20);
		expect(runResult.syncedCount).toBe(20);

		// Verifikasi: Urutan pengiriman untuk Item Consumable harus strictly FIFO (uuid-c-01 s/d uuid-c-10)
		expect(receivedOrderConsumable).toEqual(expectedConsumableUuids);

		// Verifikasi: Urutan pengiriman untuk Item Asset harus strictly FIFO (uuid-a-01 s/d uuid-a-10)
		expect(receivedOrderAsset).toEqual(expectedAssetUuids);

		// Semua 20 entri outbox beralih ke 'synced'
		const allOutbox = await db.outbox.toArray();
		expect(allOutbox.every((item) => item.status === "synced")).toBe(true);
	});

	// =========================================================================
	// SKENARIO 6: Ganti Akun (Antrian Akun Lama Tak Terkirim Dengan Token Baru)
	// =========================================================================
	it("Skenario 6: Ganti akun -> antrean akun lama tidak pernah terkirim menggunakan token akun baru", async () => {
		const aliceUuid1 = "uuid-alice-tx-1";
		const aliceUuid2 = "uuid-alice-tx-2";

		// Pegawai A (Alice) membuat 2 transaksi antrean offline
		await db.outbox.bulkAdd([
			{
				clientUuid: aliceUuid1,
				employeeId: "emp-alice",
				operation: "take",
				itemId: "item-consumable-1",
				quantity: 1,
				occurredAt: "2026-10-29T08:30:00Z",
				status: "pending",
				attempts: 0,
				createdAt: "2026-10-29T08:30:00Z",
			},
			{
				clientUuid: aliceUuid2,
				employeeId: "emp-alice",
				operation: "take",
				itemId: "item-consumable-1",
				quantity: 2,
				occurredAt: "2026-10-29T08:31:00Z",
				status: "pending",
				attempts: 0,
				createdAt: "2026-10-29T08:31:00Z",
			},
		]);

		// Pegawai A keluar (logout) dari perangkat
		useAuthStore.getState().logout();
		expect(useAuthStore.getState().employee).toBeNull();

		// Pegawai B (Bob) masuk (login) ke perangkat yang sama
		useAuthStore.getState().setSession(bobSession);
		expect(useAuthStore.getState().employee?.id).toBe("emp-bob");

		// Pasang spy pada network untuk memverifikasi apakah ada request yang keluar
		const networkSpy: (string | null)[] = [];
		server.use(
			http.post("*/inventory/items/:itemId/:operation", async ({ request }) => {
				networkSpy.push(request.headers.get("authorization"));
				return HttpResponse.json({ success: true }, { status: 201 });
			}),
		);

		// Sinkronisasi otomatis berjalan saat Pegawai B online
		const bobSyncResult = await runSyncEngine({
			bypassTabLock: true,
			// Tidak menyertakan employeeId eksplisit, membiarkan engine me-resolve dari authStore aktif
		});

		// Verifikasi: Bob tidak memiliki antrean pending miliknya
		expect(bobSyncResult.totalProcessed).toBe(0);
		expect(bobSyncResult.syncedCount).toBe(0);

		// Tidak ada network request yang dikirimkan menggunakan kredensial Bob
		expect(networkSpy).toHaveLength(0);

		// Antrean milik Pegawai A (Alice) tetap terlindungi di IndexedDB tanpa disentuh
		const aliceRecord1 = await db.getOutboxItemByUuid(aliceUuid1);
		const aliceRecord2 = await db.getOutboxItemByUuid(aliceUuid2);
		expect(aliceRecord1?.status).toBe("pending");
		expect(aliceRecord2?.status).toBe("pending");
		expect(aliceRecord1?.employeeId).toBe("emp-alice");
		expect(aliceRecord2?.employeeId).toBe("emp-alice");
	});

	// =========================================================================
	// SKENARIO 7: Jam Perangkat Salah (Occurred_at Terkoreksi / Ditolak Jelas)
	// =========================================================================
	it("Skenario 7a: Jam perangkat salah -> occurred_at dikoreksi menggunakan offset header Date server", () => {
		// Asumsikan jam lokal perangkat berada di 08:30:00 GMT
		const deviceLocalNow = new Date("2026-10-29T08:30:00.000Z").getTime();
		const serverDateHeader = "Thu, 29 Oct 2026 08:45:00 GMT"; // Server 15 menit lebih cepat (+900,000ms)

		const requestStart = deviceLocalNow - 200;
		const responseEnd = deviceLocalNow;

		// Hitung offset skew
		const calculatedOffset = calculateOffsetFromHeader(serverDateHeader, {
			requestStartTime: requestStart,
			responseTime: responseEnd,
		});

		expect(calculatedOffset).not.toBeNull();
		if (calculatedOffset !== null) {
			expect(calculatedOffset).toBeGreaterThan(850000);
			expect(calculatedOffset).toBeLessThan(950000);
		}

		// Simpan offset ke time manager
		setServerTimeOffset(serverDateHeader, {
			requestStartTime: requestStart,
			responseTime: responseEnd,
		});

		// getCorrectedNow() harus mengembalikan waktu yang telah diselaraskan dengan server time
		const correctedTime = getCorrectedNow().getTime();
		const localSystemTime = Date.now();

		// Perbedaan antara correctedTime dan localSystemTime harus mendekati calculatedOffset
		if (calculatedOffset !== null) {
			expect(correctedTime - localSystemTime).toBeCloseTo(calculatedOffset, -2);
		}
	});

	it("Skenario 7b: Validasi jendela waktu transaksi -> transaksi masa depan > 5 mnt atau lampau > 30 hari ditolak jelas", () => {
		const now = new Date("2026-10-29T10:00:00.000Z");

		// 1. Transaksi dengan timestamp normal sekarang
		const validResult = validateOccurredAt("2026-10-29T10:00:00.000Z", now);
		expect(validResult.valid).toBe(true);
		expect(validResult.reason).toBeUndefined();

		// 2. Transaksi masa depan > 5 menit (misal 15 menit ke depan) -> DITOLAK
		const futureExceeded = validateOccurredAt("2026-10-29T10:15:00.000Z", now);
		expect(futureExceeded.valid).toBe(false);
		expect(futureExceeded.reason).toBe("future_timestamp");
		expect(futureExceeded.message).toContain("masa depan");

		// 3. Transaksi masa lalu > 30 hari (misal 45 hari yang lalu) -> DITOLAK
		const pastExceeded = validateOccurredAt("2026-09-10T10:00:00.000Z", now);
		expect(pastExceeded.valid).toBe(false);
		expect(pastExceeded.reason).toBe("too_old");
		expect(pastExceeded.message).toContain("30 hari");

		// 4. Transaksi format tanggal tidak valid -> DITOLAK
		const invalidFormat = validateOccurredAt("invalid-timestamp-string", now);
		expect(invalidFormat.valid).toBe(false);
		expect(invalidFormat.reason).toBe("invalid_format");
	});
});
