import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	_setTabIdForTest,
	FALLBACK_STORAGE_LOCK_KEY_PREFIX,
	type FallbackLockRecord,
	getTabId,
	isStorageLockHeld,
	isWebLocksSupported,
	readFallbackLockRecord,
	releaseFallbackLock,
	withTabLock,
} from "./tabLock";

describe("tabLock: Cross-Tab Synchronization Lock", () => {
	const TEST_LOCK_NAME = "test-sync-lock";
	const storageKey = `${FALLBACK_STORAGE_LOCK_KEY_PREFIX}${TEST_LOCK_NAME}`;

	beforeEach(() => {
		localStorage.clear();
		vi.restoreAllMocks();
		_setTabIdForTest("test-tab-1");
	});

	afterEach(() => {
		localStorage.clear();
		vi.restoreAllMocks();
	});

	describe("Web Locks API Mode", () => {
		it("berhasil mengakuisisi lock dan mengeksekusi fn ketika lock tersedia", async () => {
			// Mock navigator.locks
			const originalLocks = navigator.locks;
			const mockRequest = vi
				.fn()
				.mockImplementation(
					async (
						name: string,
						_options: unknown,
						callback: (lock: unknown) => Promise<unknown>,
					) => {
						// Simulasikan lock berhasil didapatkan (lock object ada)
						return await callback({ name, mode: "exclusive" });
					},
				);

			Object.defineProperty(navigator, "locks", {
				value: { request: mockRequest },
				configurable: true,
				writable: true,
			});

			try {
				expect(isWebLocksSupported()).toBe(true);

				const mockTask = vi.fn().mockResolvedValue("task_completed");
				const lockResult = await withTabLock(mockTask, {
					lockName: TEST_LOCK_NAME,
				});

				expect(mockRequest).toHaveBeenCalledWith(
					TEST_LOCK_NAME,
					{ ifAvailable: true },
					expect.any(Function),
				);
				expect(mockTask).toHaveBeenCalledTimes(1);
				expect(lockResult).toEqual({
					acquired: true,
					result: "task_completed",
					lockType: "web-locks",
				});
			} finally {
				Object.defineProperty(navigator, "locks", {
					value: originalLocks,
					configurable: true,
					writable: true,
				});
			}
		});

		it("menolak eksekusi dengan aman saat lock sedang dipegang oleh tab lain (lock === null)", async () => {
			const originalLocks = navigator.locks;
			const mockRequest = vi
				.fn()
				.mockImplementation(
					async (
						_name: string,
						_options: unknown,
						callback: (lock: unknown) => Promise<unknown>,
					) => {
						// Simulasikan lock sedang dipegang tab lain (navigator.locks mengembalikan null untuk ifAvailable)
						return await callback(null);
					},
				);

			Object.defineProperty(navigator, "locks", {
				value: { request: mockRequest },
				configurable: true,
				writable: true,
			});

			try {
				const mockTask = vi.fn().mockResolvedValue("should_not_run");
				const lockResult = await withTabLock(mockTask, {
					lockName: TEST_LOCK_NAME,
				});

				expect(mockRequest).toHaveBeenCalledTimes(1);
				expect(mockTask).not.toHaveBeenCalled();
				expect(lockResult).toEqual({
					acquired: false,
					result: null,
					reason: "held_by_other_tab",
					lockType: "web-locks",
				});
			} finally {
				Object.defineProperty(navigator, "locks", {
					value: originalLocks,
					configurable: true,
					writable: true,
				});
			}
		});

		it("meneruskan error yang dilempar oleh fn di dalam Web Locks callback", async () => {
			const originalLocks = navigator.locks;
			const mockRequest = vi
				.fn()
				.mockImplementation(
					async (
						_name: string,
						_options: unknown,
						callback: (lock: unknown) => Promise<unknown>,
					) => {
						return await callback({ name: TEST_LOCK_NAME });
					},
				);

			Object.defineProperty(navigator, "locks", {
				value: { request: mockRequest },
				configurable: true,
				writable: true,
			});

			try {
				const failingTask = vi
					.fn()
					.mockRejectedValue(new Error("Database crash"));

				await expect(
					withTabLock(failingTask, { lockName: TEST_LOCK_NAME }),
				).rejects.toThrow("Database crash");
			} finally {
				Object.defineProperty(navigator, "locks", {
					value: originalLocks,
					configurable: true,
					writable: true,
				});
			}
		});
	});

	describe("Fallback LocalStorage Mode", () => {
		it("berhasil mengakuisisi fallback lock dan menghapusnya setelah fungsi selesai", async () => {
			const mockTask = vi.fn().mockImplementation(async () => {
				// Pastikan selama task berjalan, lock tersimpan di localStorage
				const currentRecord = readFallbackLockRecord(TEST_LOCK_NAME);
				expect(currentRecord).not.toBeNull();
				expect(currentRecord?.tabId).toBe("test-tab-1");
				expect(isStorageLockHeld(TEST_LOCK_NAME)).toBe(true);
				return "fallback_result";
			});

			const lockResult = await withTabLock(mockTask, {
				lockName: TEST_LOCK_NAME,
				forceFallback: true,
			});

			expect(mockTask).toHaveBeenCalledTimes(1);
			expect(lockResult).toEqual({
				acquired: true,
				result: "fallback_result",
				lockType: "fallback-localstorage",
			});

			// Setelah task selesai, lock harus dibersihkan dari localStorage
			expect(readFallbackLockRecord(TEST_LOCK_NAME)).toBeNull();
			expect(isStorageLockHeld(TEST_LOCK_NAME)).toBe(false);
		});

		it("menolak akuisisi ketika lock aktif sedang dipegang oleh tab lain", async () => {
			// Tab 2 memegang lock
			const activeRecord: FallbackLockRecord = {
				lockId: "lock_active_123",
				tabId: "test-tab-2",
				acquiredAt: Date.now(),
				expiresAt: Date.now() + 20_000, // Aktif 20 detik ke depan
			};
			localStorage.setItem(storageKey, JSON.stringify(activeRecord));

			const mockTask = vi.fn().mockResolvedValue("should_not_run");
			const lockResult = await withTabLock(mockTask, {
				lockName: TEST_LOCK_NAME,
				forceFallback: true,
			});

			expect(mockTask).not.toHaveBeenCalled();
			expect(lockResult).toEqual({
				acquired: false,
				result: null,
				reason: "held_by_other_tab",
				lockType: "fallback-localstorage",
			});

			// Pastikan record tab 2 tidak disentuh atau dihapus
			const currentRecord = readFallbackLockRecord(TEST_LOCK_NAME);
			expect(currentRecord?.lockId).toBe("lock_active_123");
			expect(currentRecord?.tabId).toBe("test-tab-2");
		});

		it("melakukan TTL recovery jika lock sebelumnya sudah kadaluarsa (tab crash/close)", async () => {
			// Tab sebelumnya crash dan meninggalkan lock yang sudah expired 5 detik lalu
			const expiredRecord: FallbackLockRecord = {
				lockId: "lock_crashed_999",
				tabId: "crashed-tab-old",
				acquiredAt: Date.now() - 35_000,
				expiresAt: Date.now() - 5_000, // Sudah kadaluarsa
			};
			localStorage.setItem(storageKey, JSON.stringify(expiredRecord));

			const mockTask = vi.fn().mockResolvedValue("recovered_success");
			const lockResult = await withTabLock(mockTask, {
				lockName: TEST_LOCK_NAME,
				forceFallback: true,
			});

			expect(mockTask).toHaveBeenCalledTimes(1);
			expect(lockResult.acquired).toBe(true);
			expect(lockResult.result).toBe("recovered_success");

			// Pasca eksekusi, lock dibersihkan
			expect(readFallbackLockRecord(TEST_LOCK_NAME)).toBeNull();
		});

		it("membersihkan lock di localStorage jika fungsi fn melempar exception", async () => {
			const failingTask = vi
				.fn()
				.mockRejectedValue(new Error("Fatal sync failure"));

			await expect(
				withTabLock(failingTask, {
					lockName: TEST_LOCK_NAME,
					forceFallback: true,
				}),
			).rejects.toThrow("Fatal sync failure");

			// Lock harus tetap bersih di blok finally
			expect(readFallbackLockRecord(TEST_LOCK_NAME)).toBeNull();
			expect(isStorageLockHeld(TEST_LOCK_NAME)).toBe(false);
		});

		it("menangani race condition verifikasi jika tab lain menimpa record di milidetik yang sama", async () => {
			const setItemSpy = vi.spyOn(Storage.prototype, "setItem");
			setItemSpy.mockImplementationOnce((_key, _val) => {
				// Simulasikan race condition: tepat setelah tab 1 menulis, tab 2 menimpa dengan lockId lain
				const competitorRecord: FallbackLockRecord = {
					lockId: "lock_competitor_win",
					tabId: "tab_competitor",
					acquiredAt: Date.now(),
					expiresAt: Date.now() + 30_000,
				};
				// Tulis ke real storage versi kompetitor
				Storage.prototype.setItem.call(
					localStorage,
					storageKey,
					JSON.stringify(competitorRecord),
				);
			});

			const mockTask = vi.fn().mockResolvedValue("wont_run");
			const lockResult = await withTabLock(mockTask, {
				lockName: TEST_LOCK_NAME,
				forceFallback: true,
			});

			expect(mockTask).not.toHaveBeenCalled();
			expect(lockResult).toEqual({
				acquired: false,
				result: null,
				reason: "held_by_other_tab",
				lockType: "fallback-localstorage",
			});
		});

		it("menangani kegagalan localStorage saat kuota penuh (QuotaExceededError)", async () => {
			const setItemSpy = vi.spyOn(Storage.prototype, "setItem");
			setItemSpy.mockImplementation(() => {
				throw new Error("QuotaExceededError");
			});

			const mockTask = vi.fn().mockResolvedValue("ok");
			const lockResult = await withTabLock(mockTask, {
				lockName: TEST_LOCK_NAME,
				forceFallback: true,
			});

			expect(mockTask).not.toHaveBeenCalled();
			expect(lockResult).toEqual({
				acquired: false,
				result: null,
				reason: "storage_unavailable",
				lockType: "fallback-localstorage",
			});
		});

		it("memperbarui expiresAt melalui heartbeat jika pemrosesan berlangsung melebihi interval heartbeat", async () => {
			vi.useFakeTimers();
			try {
				let initialExpiresAt = 0;

				const longRunningTask = async () => {
					const firstRecord = readFallbackLockRecord(TEST_LOCK_NAME);
					initialExpiresAt = firstRecord?.expiresAt ?? 0;

					// Majukan waktu sebesar 12 detik (melewati heartbeat interval 10 detik)
					vi.advanceTimersByTime(12_000);

					const captured = readFallbackLockRecord(TEST_LOCK_NAME);
					return {
						status: "done_long_task",
						capturedExpiresAt: captured?.expiresAt ?? 0,
					};
				};

				const taskPromise = withTabLock(longRunningTask, {
					lockName: TEST_LOCK_NAME,
					forceFallback: true,
					timeoutMs: 30_000,
					heartbeatIntervalMs: 10_000,
				});

				// Biarkan promise berproses
				await vi.advanceTimersByTimeAsync(1);
				const lockResult = await taskPromise;

				expect(lockResult.acquired).toBe(true);
				expect(lockResult.result?.status).toBe("done_long_task");
				// expiresAt harus bertambah karena heartbeat diperbarui
				expect(lockResult.result?.capturedExpiresAt).toBeGreaterThan(
					initialExpiresAt,
				);
			} finally {
				vi.useRealTimers();
			}
		});

		it("tidak menghapus lock milik tab lain jika lock lokal sudah kadaluarsa dan dicuri", async () => {
			let originalLockId = "";
			const slowTask = async () => {
				const current = readFallbackLockRecord(TEST_LOCK_NAME);
				originalLockId = current?.lockId ?? "";

				// Simulasikan bahwa selama slowTask berjalan sangat lama, tab lain mengambil alih lock
				const stolenRecord: FallbackLockRecord = {
					lockId: "new_tab_stolen_lock",
					tabId: "tab_interloper",
					acquiredAt: Date.now(),
					expiresAt: Date.now() + 30_000,
				};
				localStorage.setItem(storageKey, JSON.stringify(stolenRecord));
				return "slow_done";
			};

			const lockResult = await withTabLock(slowTask, {
				lockName: TEST_LOCK_NAME,
				forceFallback: true,
			});

			expect(lockResult.acquired).toBe(true);

			// Di blok finally, tab asli TIDAK boleh menghapus lock tab_interloper karena lockId berbeda
			const finalRecord = readFallbackLockRecord(TEST_LOCK_NAME);
			expect(finalRecord?.lockId).toBe("new_tab_stolen_lock");
			expect(finalRecord?.lockId).not.toBe(originalLockId);
		});
	});

	describe("Utilities & Helpers", () => {
		it("getTabId() mengembalikan string unik dan _setTabIdForTest dapat mengubahnya", () => {
			const id = getTabId();
			expect(typeof id).toBe("string");
			expect(id.length).toBeGreaterThan(0);

			_setTabIdForTest("custom-tab-id");
			expect(getTabId()).toBe("custom-tab-id");
		});

		it("releaseFallbackLock() menghapus record dari storage", () => {
			localStorage.setItem(
				storageKey,
				JSON.stringify({
					lockId: "sample_id",
					tabId: "tab1",
					acquiredAt: Date.now(),
					expiresAt: Date.now() + 10_000,
				}),
			);
			expect(isStorageLockHeld(TEST_LOCK_NAME)).toBe(true);

			const released = releaseFallbackLock(TEST_LOCK_NAME);
			expect(released).toBe(true);
			expect(isStorageLockHeld(TEST_LOCK_NAME)).toBe(false);
			expect(readFallbackLockRecord(TEST_LOCK_NAME)).toBeNull();
		});

		it("readFallbackLockRecord() menangani data JSON korup secara graceful", () => {
			localStorage.setItem(storageKey, "invalid-json-string{[]");
			expect(readFallbackLockRecord(TEST_LOCK_NAME)).toBeNull();
			expect(isStorageLockHeld(TEST_LOCK_NAME)).toBe(false);
		});
	});
});
