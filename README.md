# Inventory System Mobile PWA — Divisi Internal Audit PT INALUM

Aplikasi Progressive Web App (PWA) *Mobile-First & Offline-First* untuk pengelolaan mutasi inventaris, pengambilan barang habis pakai (*consumable*), serta peminjaman dan pengembalian aset alat kerja (*asset equipment*) di lingkungan Divisi Internal Audit (IIA) PT Indonesia Asahan Aluminium.

---

## 🛠️ Tech Stack & Arsitektur

* **Framework**: React 19 + TypeScript (Strict Mode)
* **Build Tool**: Vite 7
* **PWA & Offline Storage**: `vite-plugin-pwa` + Workbox (App Shell Precaching) + Dexie.js (IndexedDB)
* **Styling**: Tailwind CSS v4 + Class Variance Authority (CVA)
* **State Management**: TanStack React Query v5 (Server State) + Zustand (Client & Auth State)
* **Form & Validasi**: React Hook Form + Zod
* **HTTP Client**: Axios (dengan Interceptor Sanctum Bearer & Server Date Skew Sync)
* **Linter & Formatter**: Biome

---

## 🚀 Fitur Utama

1. **Otentikasi Pegawai**: Login ramah mobile menggunakan Namecode PT INALUM dan 6-digit PIN dengan proteksi *brute-force lockout*.
2. **Katalog & Pencarian Offline**: Sinkronisasi katalog penuh ke IndexedDB dengan validasi ETag/304 dan pencarian instan < 100ms.
3. **Transaksi Cepat (Consumable & Asset)**:
   - Pengambilan barang habis pakai (*Take Item*).
   - Penambahan stok (*Add Item*).
   - Peminjaman aset (*Borrow Asset*).
   - Pengembalian aset parsial dengan alokasi FIFO (*Return Asset*).
4. **Offline Resilience & Idempotent Sync**:
   - Outbox queue lokal di IndexedDB.
   - Replay-safe menggunakan `client_uuid` unik per transaksi.
   - Deteksi pergeseran jam perangkat (*clock skew correction*).
5. **Mobile First PWA**:
   - Touch target standar WCAG AA (≥ 44px).
   - Standalone display mode tanpa browser URL bar.
   - Prompt instalasi (*Add to Home Screen*) untuk Android & iOS.

---

## 💻 Pengembangan Lokal

```bash
# Instalasi dependensi
npm install

# Menjalankan server pengembangan (Port 5174)
npm run dev

# Memeriksa kualitas kode
npm run lint

# Kompilasi & Build produksi
npm run build
```
