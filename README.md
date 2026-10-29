<div align="center">

<img src="https://vitejs.dev/logo.svg" width="75" alt="Vite Logo" />
&nbsp;&nbsp;
<img src="https://upload.wikimedia.org/wikipedia/commons/a/a7/React-icon.svg" width="75" alt="React Logo" />
&nbsp;&nbsp;
<img src="https://raw.githubusercontent.com/shadowwalker/next-pwa/master/assets/pwa.svg" width="75" alt="PWA Logo" />

# inventory-system-frontend

**Aplikasi Mobile PWA Offline-First — Manajemen Inventaris Gudang PT INALUM**

[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-7-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![PWA](https://img.shields.io/badge/PWA-Ready-5A0FC8?logo=pwa&logoColor=white)](https://web.dev/progressive-web-apps/)
[![Dexie.js](https://img.shields.io/badge/Dexie.js-IndexedDB-13B5EA?logo=indexeddb&logoColor=white)](https://dexie.org/)
[![TanStack Query](https://img.shields.io/badge/TanStack%20Query-5-FF4154?logo=reactquery&logoColor=white)](https://tanstack.com/query)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-4-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Tests](https://img.shields.io/badge/Tests-500%20Passed-brightgreen?logo=vitest)](https://vitest.dev/)
[![Biome](https://img.shields.io/badge/Linter-Biome-60A5FA?logo=biome&logoColor=white)](https://biomejs.dev/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

*Aplikasi Progressive Web App (PWA) Mobile-First & Offline-First dengan jaminan Zero Data Loss untuk pengelolaan mutasi logistik barang habis pakai (consumables), peminjaman & pengembalian aset alat kerja, serta pemantauan stok kritis di Divisi Internal Audit PT Indonesia Asahan Aluminium.*

</div>

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
- [Environment Configuration](#environment-configuration)
- [Application Routes](#application-routes)
- [Feature Modules](#feature-modules)
- [Offline & Sync Engine Architecture](#offline--sync-engine-architecture)
- [UI Component System](#ui-component-system)
- [Testing & QA](#testing--qa)
- [Build & PWA Deployment](#build--pwa-deployment)
- [Project Structure](#project-structure)
- [Contributing](#contributing)
- [Security](#security)

---

## Overview

`inventory-system-frontend` adalah aplikasi *client-side* berbasis **Progressive Web App (PWA)** dengan kapabilitas **Mobile-First & Offline-First** penuh yang dirancang khusus untuk memenuhi kebutuhan operasional auditor internal PT INALUM. Saat bertugas di gudang logistik fisik pabrik, auditor kerap berada di area dengan koneksi internet terbatas (*low-bandwidth*) atau terputus total (*dead zone* / *blind spot*).

Aplikasi ini dibangun di atas filosofi **Zero Data Loss**:
- Seluruh data katalog barang dan lokasi rak fisik disinkronkan secara lokal ke dalam **IndexedDB (Dexie.js)**.
- Seluruh mutasi stok—baik pengambilan barang habis pakai (*consumable*), penambahan stok, peminjaman alat (*asset*), maupun pengembalian bertahap—dapat dilakukan seketika tanpa koneksi internet.
- Sistem menerapkan pembaruan stok lokal secara optimistik (*instant optimistic updates*), sementara transaksi offline diantrekan secara atomik ke dalam antrean *outbox queue*.
- Ketika perangkat kembali online, mesin sinkronisasi (*Sync Engine*) asinkron secara otomatis mengirimkan transaksi ke `visual-board-inventory-backend` (Laravel 13 API) dengan jaminan **idempotensi mutlak**, urutan serial FIFO per item, deteksi pergeseran jam (*clock skew correction*), penguncian multi-tab (*cross-tab mutual exclusion*), dan toleransi konflik yang tangguh.

---

## Architecture

Aplikasi ini menggunakan perpaduan **Feature-Sliced Design (FSD)** pada level modular antarmuka dan **Clean Architecture** pada level logika bisnis offline:

```text
┌──────────────────────────────────────────────────────────────────┐
│                   Mobile PWA Client Layer                        │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │                     React 19 & React Router                │  │
│  │   AppShell (Top Brand Bar + Offline Banner + BottomNav)    │  │
│  │                                                            │  │
│  │    /login   /change-pin   / (Home)   /loans   /outbox      │  │
│  └───────────────────────────┬────────────────────────────────┘  │
│                              │                                   │
│  ┌───────────────────────────▼────────────────────────────────┐  │
│  │             Feature-Sliced Design (Domain Modules)         │  │
│  │                                                            │  │
│  │   auth · catalog · transactions · loans · sync · monitoring│  │
│  └───────────────┬────────────────────────────┬───────────────┘  │
│                  │ (Local Read/Write)         │ (Server Query)   │
│  ┌───────────────▼──────────────┐  ┌──────────▼───────────────┐  │
│  │      Dexie.js (IndexedDB)    │  │     TanStack Query v5    │  │
│  │                              │  │     & Zustand Store      │  │
│  │  • db.items (Catalog Cache)  │  │  • Auth Session & PIN    │  │
│  │  • db.locations (Rack Locs)  │  │  • Active Loans Cache    │  │
│  │  • db.outbox (Offline Queue) │  │  • Low-Stock Parity Hook │  │
│  │  • db.diagnostic_logs        │  └──────────┬───────────────┘  │
│  └───────────────┬──────────────┘             │                  │
│                  │                            │                  │
│  ┌───────────────▼────────────────────────────▼───────────────┐  │
│  │            Sync Engine & Offline Resilience Layer          │  │
│  │                                                            │  │
│  │   • Web Locks API (Cross-Tab Mutual Exclusion Lock)        │  │
│  │   • FIFO Serial Processor per Item & Exponential Backoff   │  │
│  │   • Clock Skew Correction (HTTP Server Date Sync)          │  │
│  │   • Optimistic Stock Deduction & Rollback Guard            │  │
│  └───────────────────────────┬────────────────────────────────┘  │
│                              │ Axios Interceptors (Sanctum)      │
└──────────────────────────────┼───────────────────────────────────┘
                               │
               ┌───────────────▼───────────────────┐
               │    Backend REST API (Laravel 13)  │
               │    /api/v1/inventory/...          │
               └───────────────────────────────────┘
```

---

## Features

### 📱 Mobile-First PWA & Standalone Display
- **Standalone PWA Mode** — Tampilan layar penuh tanpa bilah URL peramban (*browser chrome-free*) dengan *manifest* resmi bertema INALUM Deep Blue (`#004785`).
- **Touch Ergonomics (WCAG AA)** — Seluruh tombol aksi, pemilih kuantitas (*stepper*), dan navigasi memiliki target sentuh minimal $\ge 44 \times 44\text{ px}$.
- **Add to Home Screen (A2HS)** — Banner instalasi kustom yang ramah pengguna untuk platform Android (*native beforeinstallprompt*) dan panduan visual langkah demi langkah untuk iOS Safari.
- **QR Code Landing** — Dukungan mendarat langsung ke katalog atau lembar detail barang via pemindaian kode QR stiker fisik di rak gudang (`/?item=SKU` atau `/?location=ID`).

### 🔐 Autentikasi Pegawai & Isolasi Multi-Akun
- **Otentikasi Karyawan Ramah Mobile** — Login menggunakan kode nama resmi (*Namecode* 3 huruf PT INALUM) dan PIN keamanan 6 digit.
- **Proteksi Brute-Force Lockout** — Pembatasan percobaan login lokal dan server dengan *timer countdown* otomatis.
- **Alur Wajib Ganti PIN** — Penegakan keamanan akun perdana via rute khusus terproteksi (`/change-pin`).
- **Multi-Account Queue Isolation** — Menjamin transaksi offline milik satu auditor tidak terkirim menggunakan token akun lain pada gawai bersama (*shared tablet/phone*).
- **Safe Logout Dialog** — Konfirmasi keluar akun dengan deteksi cerdas transaksi outbox lokal yang belum tersinkronisasi.

### 📦 Katalog Offline-First & Pencarian Instan
- **IndexedDB Catalog Cache** — Penyimpanan lokal tabel `items` dan `locations` untuk performa *sub-second* (< 100ms) tanpa bergantung pada jaringan.
- **ETag / HTTP 304 Differential Sync** — Sinkronisasi latar belakang hemat kuota; peladen hanya mengirim data jika terjadi perubahan katalog di server.
- **Indeks Majemuk Cepat** — Pengindeksan gabungan `[location_id+type]` Dexie untuk memfilter barang berdasarkan rak fisik dan tipe barang secara instan.
- **Filter Status Stok** — Pengelompokan cepat antara *Semua Barang*, *Tersedia*, dan *Stok Menipis / Habis*.

### 🔄 Mutasi Transaksi & Peminjaman Aset
- **Pengambilan Barang Habis Pakai (*Take Item*)** — Form mutasi cepat dengan validasi batas stok tersedia dan pengisian peruntukan kerja.
- **Penambahan Stok Masuk (*Add Item*)** — Pencatatan kedatangan logistik baru dengan penomoran surat jalan/referensi.
- **Peminjaman Alat (*Borrow Asset*)** — Peminjaman aset alat kerja dengan penentuan tanggal estimasi pengembalian dan catatan keperluan audit.
- **Pengembalian Parsial Bertahap (*Return Asset*)** — Alur pengembalian fleksibel; mendukung pengembalian bertahap dengan kalkulasi sisa pinjaman (*projected remaining stock*) dan riwayat lini masa (*return timeline*) berbasis alokasi FIFO.
- **Optimistic Stock Deduction & Rollback** — Stok lokal seketika berkurang di antarmuka; jika transaksi ditolak permanen oleh server (*e.g.* status barang dinonaktifkan), stok lokal dikembalikan secara otomatis (*rollback safe*).

### ⚡ Offline Resilience & Sync Engine (Zero Data Loss)
- **Persistent Outbox Queue** — Antrean transaksi disimpan persisten di IndexedDB dengan mesin status deterministik: `pending` $\rightarrow$ `syncing` $\rightarrow$ `synced` / `rejected` / `failed`.
- **Replay-Safe Idempotency** — Setiap mutasi dibekali `client_uuid` (RFC 4122 v4) unik; mencegah pemotongan stok ganda meskipun terjadi *network timeout* saat server memproses permintaan.
- **Cross-Tab Mutual Exclusion Lock** — Sinkronisasi multi-tab dilindungi oleh Web Locks API (`navigator.locks`) dengan cadangan *localStorage heartbeat lock*, mencegah tab ganda mengeksekusi antrean yang sama secara paralel.
- **Clock Skew Correction** — Kompensasi otomatis atas ketidaksesuaian jam gawai pengguna terhadap waktu server melalui pembacaan header HTTP `Date`.
- **Exponential Backoff & Jitter** — Penjadwalan ulang otomatis saat jaringan tidak stabil dengan interval eksponensial untuk mencegah *thundering herd problem*.
- **Ring-Buffer Diagnostic Logs** — Pencatatan log diagnostik lokal berputar (hingga 100 entri) yang dapat diekspor langsung sebagai bahan investigasi tim TI.

### 📊 Monitoring & Rekonsiliasi Real-Time
- **Kartu Metrik KPI Inventaris** — 4 kartu ringkasan kesehatan stok (Total Barang, Stok Aman, Stok Menipis, Stok Habis) dengan navigasi filter cepat ke katalog.
- **Widget Peringatan Stok Kritis** — Daftar visual barang dengan stok kritis ($\le 50\% \text{ min\_stock}$) lengkap dengan kode rak dan tag penanda mutasi lokal.
- **Ringkasan Pinjaman & Aging Tracker** — Pemantauan pinjaman alat yang sedang berjalan dengan deteksi dini pinjaman yang telah melebihi batas waktu $\ge 7$ hari.
- **Feed Riwayat Aktivitas Lokal** — Riwayat transaksi outbox berbahasa Indonesia dengan format waktu relatif presisi.
- **Server Parity Reconciliation Badge** — Verifikasi integritas angka stok rendah lokal terhadap endpoint backend `/api/v1/inventory/reports/low-stock`, membedakan secara cerdas antara status *100% Cocok*, *Divergensi Mutasi Pending*, atau *Divergensi Cache Usang* disertai tombol *Segarkan Katalog*.

---

## Tech Stack

| Kategori | Teknologi / Pustaka | Versi | Keterangan |
|---|---|---|---|
| **UI Framework** | React | ^19.x | Arsitektur SPA modern berbasis komponen fungsional & Hooks |
| **Bahasa Pemrograman** | TypeScript | ~5.9 | Tipisasi data statis ketat (*Strict Mode*) |
| **Build Tool & Bundler** | Vite | ^7.x | Pengembang lokal super cepat dengan Rollup bundler |
| **PWA & Service Worker** | `vite-plugin-pwa` + Workbox | ^2.0 | App Shell precaching, Web App Manifest, & Service Worker generator |
| **Offline Storage** | Dexie.js (IndexedDB wrapper) | ^4.4 | Penyimpanan pangkalan data relasional lokal di peramban |
| **Server State** | TanStack Query (React Query) | ^5.x | Pengelolaan *cache*, revalidasi, dan *polling* data server |
| **Client / Auth State** | Zustand | ^5.x | *Store* sesi otentikasi pegawai dengan persistensi aman |
| **Styling & Design System** | Tailwind CSS v4 + CVA | ^4.x | Utilitas CSS modern dan varian komponen UI responsif |
| **Ikonografi** | Lucide React | ^1.x | Set ikon SVG bersih dan berbobot ringan |
| **Form & Validasi** | React Hook Form + Zod | ^7.x / ^4.x | Validasi input skema form di sisi klien |
| **HTTP Client** | Axios | ^1.x | Klien HTTP dengan interseptor Sanctum Bearer & Server Date |
| **Notifikasi / Toast** | Sonner | ^2.x | Notifikasi toast responsif ramah mobile |
| **Linter & Formatter** | Biome | ^2.6 | Linter dan pemformat kode berkecepatan tinggi |
| **Testing Suite** | Vitest + React Testing Library | ^5.0 / ^16.3 | Framework pengujian unit dan integrasi komponen |
| **Mocking & Isolation** | MSW (Mock Service Worker) + fake-indexeddb | ^3.0 / ^6.2 | Simulasi API network dan IndexedDB di lingkungan jsdom |

---

## Prerequisites

Sebelum menjalankan aplikasi, pastikan peranti lunak berikut telah terpasang di komputer pengembangan Anda:

| Tool | Versi Minimum | Keterangan |
|---|---|---|
| **Node.js** | 20.x LTS | Disarankan menggunakan versi LTS terkini |
| **npm** | 10.x | Paket manajer bawaan Node.js |
| **Backend Peladen** | Laravel 13 | Peladen `visual-board-inventory-backend` berjalan di `localhost:8000` |

---

## Getting Started

### 1. Kloning Repositori

```bash
git clone https://github.com/Internal-Audit-Division-PT-Inalum/inventory-management-frontend.git
cd inventory-management-frontend
```

### 2. Instalasi Dependensi

```bash
npm install
```

### 3. Konfigurasi Lingkungan

Salin berkas contoh konfigurasi lingkungan:

```bash
cp .env.example .env
```

Sesuaikan variabel di dalam berkas `.env` jika peladen backend berada pada port atau host yang berbeda.

### 4. Menjalankan Server Pengembangan

```bash
npm run dev
```

Aplikasi PWA akan aktif dan dapat diakses melalui peramban di:
`http://localhost:5174`

> [!TIP]
> **Akses Mobile via Jaringan Lokal (WiFi Gudang):**
> Vite secara otomatis mengaktifkan *host sharing*. Anda dapat membuka alamat IP jaringan lokal (*e.g.* `http://192.168.x.x:5174`) melalui peramban ponsel pintar yang terhubung ke jaringan WiFi yang sama untuk menguji pengalaman sentuh dan responsivitas PWA secara langsung.

---

## Environment Configuration

Variabel konfigurasi yang tersedia pada berkas `.env`:

| Variabel | Tipe | Nilai Bawaan | Deskripsi |
|---|---|---|---|
| `VITE_API_BASE_URL` | `string` | `/api/v1` | URL dasar pemanggilan endpoint API backend (memanfaatkan Vite proxy) |
| `VITE_APP_NAME` | `string` | `"Inventory System — Internal Audit PT INALUM"` | Nama lengkap aplikasi yang muncul pada dokumen dan title bar |
| `VITE_APP_SHORT_NAME` | `string` | `"Inventory IIA"` | Nama pendek aplikasi untuk ikon PWA di layar utama gawai |

---

## Application Routes

| Path | Komponen Halaman | Modul Fitur | Aksesibilitas | Deskripsi |
|---|---|---|---|---|
| `/login` | `LoginPage` | `auth` | Publik | Otentikasi pegawai via Namecode dan PIN 6 digit |
| `/change-pin` | `ChangePinPage` | `auth` | Terproteksi (`mustChangePin`) | Alur wajib pembaruan PIN keamanan perdana |
| `/` | `HomePage` | `monitoring` & `catalog` | Terproteksi (Sesi Aktif) | Dasbor ringkasan KPI, peringatan stok kritis, rekonsiliasi, dan katalog |
| `/loans` | `LoansPage` | `loans` | Terproteksi (Sesi Aktif) | Daftar pinjaman alat aktif, riwayat selesai, dan modal pengembalian |
| `/outbox` | `OutboxPage` | `sync` | Terproteksi (Sesi Aktif) | Pemantauan antrean transaksi offline, status sinkronisasi, dan diagnostik |
| `/profile` | `ProfilePage` | `auth` | Terproteksi (Sesi Aktif) | Informasi profil pegawai, tautan ganti PIN, dan tombol keluar akun aman |

---

## Feature Modules

Aplikasi ini mengadopsi struktur modular domain (*Feature-Sliced Design*):

- **`src/features/auth/`** — Modul otentikasi kredensial pegawai: formulir login mobile, validasi format PIN, mekanisme ganti PIN, proteksi rute (`ProtectedRoute`), dan dialog konfirmasi keluar aman dengan isolasi akun.
- **`src/features/catalog/`** — Modul katalog inventaris offline: integrasi IndexedDB `items` dan `locations`, sinkronisasi ETag/304, pencarian reaktif instan, pemindaian QR landing, dan kartu barang (*ItemCard*).
- **`src/features/transactions/`** — Modul mutasi stok: lembar detail barang (*ItemDetailSheet*), formulir transaksi (*TransactionForm*), pengurangan stok optimistik, pencatatan antrean outbox, dan riwayat ledger barang (*ItemLedgerHistory*).
- **`src/features/loans/`** — Modul peminjaman aset: kartu pinjaman (*LoanCard*), formulir pengembalian parsial bertahap (*ReturnLoanDialog*), lini masa pengembalian (*LoanReturnTimeline*), dan kalkulasi proyeksi pengembalian FIFO.
- **`src/features/sync/`** — Modul ketahanan offline: mesin sinkronisasi (*syncEngine*), penjadwal otomatis (*syncScheduler*), pengunci multi-tab (*tabLock*), koreksi waktu server (*clockSkew*), antrean UI (*OutboxQueueView*), dan dialog log diagnostik (*DiagnosticLogDialog*).
- **`src/features/monitoring/`** — Modul pemantauan kesehatan stok: kartu KPI (*InventoryKPICards*), widget stok kritis (*CriticalStockAlertWidget*), ringkasan pinjaman (*LoanSummaryWidget*), feed aktivitas lokal (*RecentActivityFeed*), dan lencana rekonsiliasi server (*ReconciliationBadge*).

---

## Offline & Sync Engine Architecture

### Siklus Hidup Transaksi Outbox (State Machine)

Setiap aksi mutasi inventaris yang dilakukan auditor saat offline mengikuti siklus hidup deterministik berikut:

```text
[Aksi Auditor: Ambil / Tambah / Pinjam / Kembalikan]
                      │
                      ▼
        ┌───────────────────────────┐
        │  Generate client_uuid v4  │
        │  & Terapkan Optimistic    │
        │  Stock Update ke db.items │
        └─────────────┬─────────────┘
                      │
                      ▼
        ┌───────────────────────────┐
        │      Status: PENDING      │ ◄──── Retriable Error
        │ (Tersimpan di db.outbox)  │       (Timeout, Jaringan Putus, 5xx)
        └─────────────┬─────────────┘
                      │
     [Jaringan Pulih / Interval Trigger]
                      │
                      ▼
        ┌───────────────────────────┐
        │      Status: SYNCING      │
        │ (Memperoleh Lock TabLock) │
        └─────────────┬─────────────┘
                      │
           Kirim HTTP POST ke API
                      │
        ┌─────────────┴─────────────┐
        │                           │
  HTTP 200/201 OK             HTTP 422 / 409
        │                     (Stok Habis di Server,
        ▼                      Data Tidak Valid)
  ┌───────────┐                     │
  │  SYNCED   │                     ▼
  │ (Selesai) │               ┌───────────┐
  └───────────┘               │ REJECTED  │ ──► Rollback Optimistic Stock
                              └───────────┘
```

### Karakteristik Kunci Sync Engine:
1. **Serial FIFO per Item** — Mencegah pembalikan urutan kronologis (*sequence inversion*) saat pengguna melakukan transaksi berturut-turut pada barang yang sama.
2. **Mutual Exclusion Lock (`tabLock`)** — Menggunakan Web Locks API bawaan peramban dengan cadangan *localStorage* untuk memastikan bahwa jika pengguna membuka beberapa tab PWA secara bersamaan, hanya **satu tab** yang memproses antrean sinkronisasi.
3. **Koreksi Waktu Nyata (*Clock Skew*)** — Setiap respons HTTP membaca header `Date` peladen. Jika jam gawai pengguna tertinggal atau lebih cepat dibanding server, selisih waktu dikompensasikan secara otomatis pada nilai `occurred_at`.
4. **Idempotensi Sempurna** — Backend Laravel mengenali `client_uuid` yang sama. Jika permintaan pertama berhasil di server namun koneksi terputus sebelum respons diterima oleh PWA, percobaan sinkronisasi ulang tidak akan memotong stok untuk kedua kalinya.

---

## UI Component System

Antarmuka dibangun menggunakan perpaduan **shadcn/ui primitives** dan **Tailwind CSS v4** dengan tema visual korporat PT INALUM (*Deep Blue* `#004785` dan *Clean White* `#FFFFFF`).

Komponen utama yang disediakan di `src/components/ui/`:
- `Badge`, `Button`, `Card`, `Dialog`, `Drawer`, `Input`, `Label`, `Progress`, `ScrollArea`, `Select`, `Separator`, `Sheet`, `Skeleton`, `Tabs`, `Textarea`.

Karakteristik desain:
- **Mobile Optimized** — Memanfaatkan pola interaksi *Bottom Sheet / Drawer* untuk perangkat genggam dan transisi mulus.
- **Dark/Light Safe Contrast** — Seluruh teks dan indikator status memenuhi rasio kontras warna standar aksesibilitas WCAG AA.
- **Haptic Feedback Ready** — Sentuhan pada aksi penting didesain responsif dengan efek visual instan.

---

## Testing & QA

Keandalan sistem dipelihara melalui pengujian otomatis berlapis yang mencakup pengujian unit murni, pengujian komponen antarmuka, hingga pengujian integrasi skenario ekstrem offline:

```bash
# Menjalankan seluruh test suite Vitest
npm test

# Menjalankan test dalam mode watch interaktif
npm run test:watch

# Memeriksa kepatuhan linter & format kode (Biome)
npm run lint
npm run format

# Pipeline CI terpadu (Lint + Type Check + Test + Production Build)
npm run ci
```

### Cakupan Pengujian:
- **Unit & Logic Engines**: Pengujian komputasi stok (`stockCalculators`), transformasi aktivitas (`activityTransformer`), penuaan pinjaman (`loanSummary`), dan rekonsiliasi stok (`reconciliationEngine`).
- **IndexedDB Integration**: Simulasi pangkalan data Dexie lokal di lingkungan pengujian menggunakan `fake-indexeddb`.
- **API & Offline Simulation**: Pemanfaatan **Mock Service Worker (MSW)** untuk menguji skenario jaringan offline, kesalahan token 401, konflik validasi 422, dan *network drop* di tengah-tengah pengiriman transaksi.
- **Hasil Verifikasi Terkini**: **500 tests lulus 100%** di seluruh **64 berkas pengujian**, dengan **0 errors** dan **0 warnings** pada Biome linter serta `tsc -b`.

---

## Build & PWA Deployment

### 1. Kompilasi Aset Produksi

```bash
npm run build
```

Perintah ini akan menjalankan pemeriksaan tipe TypeScript (`tsc -b`) dan memicu proses kompilasi Vite. Hasil kompilasi akan ditempatkan di direktori `/dist` lengkap dengan *precache manifest*, *service worker* (`sw.js`), dan aset statis yang teroptimasi gzip.

### 2. Pratinjau Lokal

```bash
npm run preview
```

### 3. Konfigurasi Server Produksi (Nginx / SIT)

Saat menyebarkan direktori `/dist` ke server produksi atau lingkungan *System Integration Testing (SIT)* PT INALUM, pastikan konfigurasi Nginx menangani *routing fallback* SPA dan *caching header* untuk PWA:

```nginx
server {
    listen 80;
    server_name inventory.inalum.id;
    root /var/www/inventory-system-frontend/dist;
    index index.html;

    # Gzip Compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml image/svg+xml;

    # Service Worker & Manifest: Jangan di-cache agresif agar pembaruan PWA instan
    location ~* (sw\.js|registerSW\.js|manifest\.webmanifest)$ {
        expires -1;
        add_header Cache-Control "no-store, no-cache, must-revalidate, proxy-revalidate";
    }

    # Static Assets: Cache agresif (immutable) karena menggunakan hash unik Vite
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # SPA Routing Fallback
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

---

## Project Structure

```text
inventory-system-frontend/
├── public/                      # Aset statis (Favicon, Apple Touch Icon, Logo INALUM, PWA Icons)
│   ├── icons/                   # Ikon PWA maskable & standard (192x192, 512x512)
│   ├── inalum-logo.png          # Logo resmi PT INALUM
│   └── favicon.ico
├── src/
│   ├── app/                     # Titik masuk aplikasi, penyedia konteks (AppProviders), dan Router
│   │   ├── AppProviders.tsx     # TanStack Query Client, Toaster Sonner, & Session Providers
│   │   └── router.tsx           # Konfigurasi rute React Router v7 & guards
│   ├── components/              # Komponen antarmuka bersama (Shared UI)
│   │   ├── layout/              # Cangkang aplikasi (AppShell, BottomNav, TopBar, OfflineBanner)
│   │   └── ui/                  # Komponen primitif bergaya shadcn/ui
│   ├── features/                # Modul fungsional domain (Feature-Sliced Design)
│   │   ├── auth/                # Login PIN, proteksi rute, ganti PIN, & logout isolasi multi-akun
│   │   ├── catalog/             # IndexedDB catalog cache, pencarian instan, & QR code landing
│   │   ├── transactions/        # Form mutasi barang, optimistic updates, & item ledger history
│   │   ├── loans/               # Peminjaman aset, pengembalian bertahap FIFO, & return timeline
│   │   ├── sync/                # Outbox queue, syncEngine, tabLock, & ring-buffer diagnostics
│   │   └── monitoring/          # KPI stock health, critical stock alert, loan aging, & rekonsiliasi
│   ├── hooks/                   # Custom Hooks global (useOnlineStatus, usePWAInstallPrompt, dll.)
│   ├── lib/                     # Utilitas murni, basis data Dexie (db.ts), konfigurasi Axios (api.ts)
│   ├── pages/                   # Komponen halaman utama per rute aplikasi
│   ├── test/                    # Utilitas pengujian, setup mock IndexedDB, dan MSW handlers
│   ├── types/                   # Definisi tipe data TypeScript domain dan API
│   ├── App.tsx                  # Root Application Component
│   ├── index.css                # Konfigurasi tema Tailwind CSS v4 & font inter
│   └── main.tsx                 # Entrypoint React DOM
├── biome.json                   # Konfigurasi aturan ketat linter & pemformat kode Biome
├── package.json                 # Deklarasi pustaka dependensi & skrip otomatisasi
├── tsconfig.json                # Konfigurasi kompilator TypeScript (Strict Mode)
└── vite.config.ts               # Konfigurasi Vite, plugin PWA, Workbox, dan Proxy API
```

---

## Contributing

1. Seluruh perubahan kode wajib mematuhi standar *Clean Architecture* dan *Feature-Sliced Design*.
2. Sebelum melakukan *commit*, jalankan verifikasi kualitas lokal:
   ```bash
   npm run ci
   ```
3. Gunakan konvensi penamaan pesan *commit* berbasis **Conventional Commits** (`feat:`, `fix:`, `test:`, `refactor:`, `style:`, `docs:`).

---

## Security

- **Penyimpanan Kredensial**: Token autentikasi disimpan pada *storage* terisolasi dan divalidasi berkala terhadap peladen backend.
- **PIN Keamanan**: PIN 6 digit pegawai dienkripsi pada jaringan transmisi menggunakan HTTPS TLS 1.3 dan tidak pernah disimpan dalam bentuk teks polos (*plain text*).
- **Proteksi Data Lokal**: Pangkalan data IndexedDB beroperasi di bawah kebijakan *Same-Origin Policy (SOP)* peramban, memastikan data inventaris terlindungi dari akses skrip domain luar.
- **Zero Offline Leakage**: Riwayat outbox antar-pegawai diisolasi ketat berdasarkan `employeeId`, mencegah kebocoran data saat satu perangkat digunakan bergantian oleh beberapa auditor.

---

<div align="center">

*Aplikasi ini dikembangkan dan dipelihara secara khusus untuk mendukung integritas tata kelola logistik fisik Divisi Internal Audit PT Indonesia Asahan Aluminium.* 🏭🇲🇨

</div>
