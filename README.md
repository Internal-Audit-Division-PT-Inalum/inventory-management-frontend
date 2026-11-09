<div align="center">

<img src="https://vitejs.dev/logo.svg" width="75" alt="Vite Logo" />
&nbsp;&nbsp;
<img src="https://upload.wikimedia.org/wikipedia/commons/a/a7/React-icon.svg" width="75" alt="React Logo" />
&nbsp;&nbsp;
<img src="https://raw.githubusercontent.com/shadowwalker/next-pwa/master/assets/pwa.svg" width="75" alt="PWA Logo" />

# inventory-system-frontend

**Aplikasi Mobile PWA Offline-First — Manajemen Inventaris Gudang Divisi Internal Audit PT INALUM**

[![React](https://img.shields.io/badge/React-19.2-61DAFB?logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-7.2-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![PWA](https://img.shields.io/badge/PWA-Lighthouse%20100%25-5A0FC8?logo=pwa&logoColor=white)](https://web.dev/progressive-web-apps/)
[![Dexie.js](https://img.shields.io/badge/Dexie.js-IndexedDB%204.4-13B5EA?logo=indexeddb&logoColor=white)](https://dexie.org/)
[![TanStack Query](https://img.shields.io/badge/TanStack%20Query-5.104-FF4154?logo=reactquery&logoColor=white)](https://tanstack.com/query)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-4.1-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Vitest](https://img.shields.io/badge/Vitest-522%20Passed-brightgreen?logo=vitest&logoColor=white)](https://vitest.dev/)
[![Playwright](https://img.shields.io/badge/Playwright%20E2E-7%20Passed-45ba4b?logo=playwright&logoColor=white)](https://playwright.dev/)
[![Biome](https://img.shields.io/badge/Linter-Biome%202.6-60A5FA?logo=biome&logoColor=white)](https://biomejs.dev/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

*Aplikasi Progressive Web App (PWA) Mobile-First & Offline-First berstandar enterprise dengan jaminan **Zero Data Loss** untuk pengelolaan mutasi logistik barang habis pakai (consumables), peminjaman & pengembalian bertahap aset alat kerja, pemantauan stok kritis, serta audit trail kepatuhan di lingkungan gudang fisik Divisi Internal Audit PT Indonesia Asahan Aluminium.*

</div>

---

## Daftar Isi

- [Gambaran Umum & Filosofi Desain](#gambaran-umum--filosofi-desain)
- [Arsitektur Sistem & FSD](#arsitektur-sistem--fsd)
- [Fitur Utama](#fitur-utama)
  - [1. Mobile-First PWA & Hardening Kiosk](#1-mobile-first-pwa--hardening-kiosk)
  - [2. Autentikasi Pegawai & Isolasi Multi-Akun](#2-autentikasi-pegawai--isolasi-multi-akun)
  - [3. Katalog Offline-First & Pencarian Reaktif](#3-katalog-offline-first--pencarian-reaktif)
  - [4. Mutasi Transaksi & Pengurangan Stok Optimistik](#4-mutasi-transaksi--pengurangan-stok-optimistik)
  - [5. Peminjaman Aset & Pengembalian Bertahap (FIFO Projection)](#5-peminjaman-aset--pengembalian-bertahap-fifo-projection)
  - [6. Mesin Ketahanan Offline (Sync Engine & Web Locks)](#6-mesin-ketahanan-offline-sync-engine--web-locks)
  - [7. Dashboard Monitoring, Aging Tracker, & Rekonsiliasi Paritas Server](#7-dashboard-monitoring-aging-tracker--rekonsiliasi-paritas-server)
  - [8. Pemindaian QR Code Fisik Rak Gudang](#8-pemindaian-qr-code-fisik-rak-gudang)
- [Teknologi & Dependensi](#teknologi--dependensi)
- [Persyaratan Sistem](#persyaratan-sistem)
- [Panduan Instalasi & Menjalankan](#panduan-instalasi--menjalankan)
- [Konfigurasi Lingkungan (.env & Vite Proxy)](#konfigurasi-lingkungan-env--vite-proxy)
- [Struktur Rute Aplikasi](#struktur-rute-aplikasi)
- [Modul Fitur (Feature-Sliced Design)](#modul-fitur-feature-sliced-design)
- [Arsitektur Sync Engine & Mesin Status Deterministik](#arsitektur-sync-engine--mesin-status-deterministik)
- [Sistem Komponen UI & Desain Ergonomis](#sistem-komponen-ui--desain-ergonomis)
- [Piramida Pengujian & Jaminan Mutu (Vitest & Playwright)](#piramida-pengujian--jaminan-mutu-vitest--playwright)
- [Protokol UAT & Pengujian Lapangan Multi-Device (Cloudflare Tunnel)](#protokol-uat--pengujian-lapangan-multi-device-cloudflare-tunnel)
- [Build Produksi & Konfigurasi Web Server (Nginx)](#build-produksi--konfigurasi-web-server-nginx)
- [Struktur Repositori](#struktur-repositori)
- [Keamanan, Kepatuhan SIT, & Privasi Data](#keamanan-kepatuhan-sit--privasi-data)

---

## Gambaran Umum & Filosofi Desain

`inventory-system-frontend` (paket `inventory-pwa`) adalah aplikasi peramban generasi baru yang dirancang khusus untuk auditor internal PT INALUM yang sering kali harus melakukan inspeksi, pengambilan perlengkapan kerja, serta pencatatan stok di lorong-lorong gudang fisik dengan sinyal seluler yang sangat minim (*low-bandwidth*) atau terputus total (*dead zone* / *blind spot*).

Aplikasi ini dibangun berlandaskan 4 pilar arsitektur:
1. **Zero Data Loss Guarantee**: Setiap transaksi mutasi yang dicatat auditor saat perangkat berada dalam mode offline dijamin tersimpan secara persisten pada IndexedDB lokal dan tidak akan hilang meskipun aplikasi ditutup, gawai kehabisan daya, atau peramban disegarkan.
2. **Instant Optimistic UI**: Auditor tidak perlu menunggu koneksi internet kembali pulih untuk melihat perubahan stok. Antarmuka katalog dan ringkasan mutasi seketika terpotong secara optimistik dengan indikator status antrean yang jelas.
3. **Replay-Safe Idempotency**: Setiap aksi mutasi dibekali UUID unik (RFC 4122 v4) di sisi klien. Ketika jaringan pulih dan sinkronisasi dijalankan, peladen Laravel mengenali kunci idempotensi ini untuk mencegah terjadinya pengurangan atau penambahan stok ganda.
4. **Account & Device Safety**: Sistem mendukung penggunaan satu gawai tablet/ponsel pintar secara bergantian antar-auditor (*shared device*) tanpa risiko kebocoran data antrean offline antar-karyawan (*multi-account queue isolation*).

---

## Arsitektur Sistem & FSD

Aplikasi mengombinasikan prinsip **Feature-Sliced Design (FSD)** untuk modularitas antarmuka dan **Clean Architecture** untuk mesin sinkronisasi data lokal:

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        Mobile PWA Client Layer                         │
│                                                                        │
│  ┌───────────────────────────────────────────────────────────────┐    │
│  │                    React 19 & React Router v7                 │    │
│  │   AppShell (Top Brand Bar + Offline Banner + BottomNav)       │    │
│  │                                                               │    │
│  │   /login   /change-pin   / (Home)   /loans   /outbox  /profile│    │
│  └──────────────────────────────┬────────────────────────────────┘    │
│                                 │                                      │
│  ┌──────────────────────────────▼────────────────────────────────┐    │
│  │             Feature-Sliced Design (Domain Modules)            │    │
│  │                                                               │    │
│  │   auth · catalog · transactions · loans · sync · monitoring   │    │
│  │   pwa · diagnostics                                           │    │
│  └───────────────┬───────────────────────────────┬───────────────┘    │
│                  │ (Local Read/Write)            │ (Server Cache)     │
│  ┌───────────────▼──────────────┐  ┌─────────────▼───────────────┐    │
│  │     Dexie.js (IndexedDB 4.4) │  │      TanStack Query v5      │    │
│  │                              │  │      & Zustand Stores       │    │
│  │  • db.items (Catalog Cache)  │  │  • authStore (Token & PIN)  │    │
│  │  • db.locations (Rack Locs)  │  │  • Server Parity Queries    │    │
│  │  • db.outbox (Offline Queue) │  │  • Active Loans Cache       │    │
│  │  • db.diagnostic_logs        │  └─────────────┬───────────────┘    │
│  └───────────────┬──────────────┘                │                    │
│                  │                               │                    │
│  ┌───────────────▼───────────────────────────────▼───────────────┐    │
│  │             Sync Engine & Offline Resilience Layer            │    │
│  │                                                               │    │
│  │   • Web Locks API (Cross-Tab Mutual Exclusion Mutex)          │    │
│  │   • Serial FIFO Processor per Item (Anti-Sequence Inversion)  │    │
│  │   • Clock Skew Correction (HTTP Header Date Synchronization)  │    │
│  │   • Optimistic Stock Deduction & Rollback Guard               │    │
│  │   • Exponential Backoff & Jitter Network Recovery             │    │
│  └──────────────────────────────┬────────────────────────────────┘    │
│                                 │ Axios Interceptor (Bearer Sanctum)   │
└─────────────────────────────────┼──────────────────────────────────────┘
                                  │
                  ┌───────────────▼──────────────────┐
                  │   Backend REST API (Laravel 13)  │
                  │   /api/v1/inventory/...          │
                  └──────────────────────────────────┘
```

---

## Fitur Utama

### 1. Mobile-First PWA & Hardening Kiosk
- **Mode Standalone PWA**: Aplikasi berjalan tanpa bilah URL peramban (*browser chrome-free*), memberikan pengalaman layaknya aplikasi *native* Android/iOS bertema resmi INALUM Deep Blue (`#004785`).
- **Instalasi Add to Home Screen (A2HS)**: Banner interaktif cerdas yang menangkap event `beforeinstallprompt` pada platform Android dan modal panduan visual langkah demi langkah untuk iOS Safari.
- **Penyimpanan Persisten (*Persistent Storage*)**: Meminta izin kuota `navigator.storage.persist()` secara otomatis agar peramban tidak menghapus cache IndexedDB saat ruang memori perangkat menipis.
- **Ergonomi Sentuh WCAG AA**: Seluruh tombol aksi, pemilih kuantitas (*stepper*), dan tab navigasi memiliki target sentuh minimal $\ge 44 \times 44\text{ px}$.

### 2. Autentikasi Pegawai & Isolasi Multi-Akun
- **Login Ramah Mobile**: Menggunakan kode nama resmi (*Namecode* 3 huruf PT INALUM) dan PIN keamanan 6 digit.
- **Proteksi Brute-Force**: Pembatasan percobaan login lokal dan server dengan *timer countdown lockout* otomatis.
- **Penegakan Pergantian PIN**: Rute terproteksi `/change-pin` memaksa pembaruan PIN saat pertama kali login atau saat diinisialisasi oleh administrator.
- **Multi-Account Queue Isolation**: Jika perangkat digunakan bergantian oleh beberapa pegawai, antrean transaksi offline milik auditor A tidak akan terkirim menggunakan akun auditor B.
- **Safe Logout Dialog**: Dialog konfirmasi keluar akun yang memvalidasi antrean outbox lokal dan memberikan opsi sinkronisasi instan sebelum mengakhiri sesi.

### 3. Katalog Offline-First & Pencarian Reaktif
- **Penyimpanan Lokal Sub-Detik**: Data barang dan lokasi rak fisik tersimpan di IndexedDB melalui Dexie.js, menjamin pencarian reaktif < 50ms tanpa membebani lalu lintas jaringan.
- **ETag / HTTP 304 Differential Sync**: Sinkronisasi katalog hemat data; peladen hanya mengirimkan payload lengkap jika terjadi revisi pada data inventaris backend.
- **Filter Fleksibel**: Pemfilteran berdasarkan lokasi rak fisik (`location_id`), tipe barang (Konsumabel / Aset Alat Kerja), dan ketersediaan stok (*Semua*, *Tersedia*, *Menipis/Habis*).

### 4. Mutasi Transaksi & Pengurangan Stok Optimistik
- **Pengambilan Barang Habis Pakai (*Take Item*)**: Formulir mutasi cepat dengan validasi batas stok tersedia, tombol kuantitas cepat (+1, +5, +10, Semua/Max), dan kolom peruntukan kerja.
- **Penambahan Stok Masuk (*Add Stock*)**: Pencatatan logistik baru dengan penomoran surat jalan atau referensi penerimaan.
- **Rollback Guard**: Jika transaksi ditolak permanen oleh server (*e.g.* barang dinonaktifkan di sistem pusat), stok lokal dikembalikan seketika (*rollback safe*).

### 5. Peminjaman Aset & Pengembalian Bertahap (FIFO Projection)
- **Peminjaman Alat Kerja (*Borrow Asset*)**: Peminjaman alat audit dengan penentuan target tanggal pengembalian dan pencatatan catatan keperluan inspeksi.
- **Pengembalian Bertahap (*Partial Return*)**: Mendukung pengembalian unit secara berangsur-angsur dengan kalkulasi sisa tanggungan (*projected remaining stock*) dan riwayat lini masa pengembalian (*return timeline*) berbasis alokasi FIFO.

### 6. Mesin Ketahanan Offline (Sync Engine & Web Locks)
- **Deterministic Outbox State Machine**: Setiap mutasi offline melewati siklus status: `pending` $\rightarrow$ `syncing` $\rightarrow$ `synced` / `rejected` / `failed`.
- **Serial FIFO per Item**: Mencegah pembalikan urutan kronologis (*sequence inversion*) saat seorang auditor melakukan transaksi beruntun pada barang yang sama.
- **Web Locks API Mutex (`tabLock`)**: Penguncian multi-tab modern (`navigator.locks`) dengan cadangan *localStorage heartbeat*, menjamin hanya satu tab yang mengirim transaksi ke backend.
- **Clock Skew Correction**: Kompensasi otomatis selisih waktu perangkat terhadap server melalui inspeksi header HTTP `Date`.
- **Exponential Backoff & Jitter**: Pengulangan pengiriman otomatis dengan penambahan jeda waktu acak guna mencegah beban lonjakan serentak (*thundering herd problem*).
- **Ring-Buffer Diagnostics Log**: Pencatatan 100 jejak peristiwa terakhir di IndexedDB yang dapat diekspor langsung dalam format teks/JSON untuk audit teknis SIT.

### 7. Dashboard Monitoring, Aging Tracker, & Rekonsiliasi Paritas Server
- **4 Kartu Metrik KPI**: Total Barang, Stok Sehat, Stok Menipis, dan Stok Kosong dengan filter interaktif satu ketukan.
- **Peringatan Stok Kritis**: Daftar barang dengan stok $\le 50\% \text{ min\_stock}$ lengkap dengan lokasi rak dan tag penanda mutasi lokal yang sedang pending.
- **Aging Tracker Pinjaman**: Deteksi otomatis pinjaman alat yang mendekati jatuh tempo atau telah melampaui batas $\ge 7$ hari (*overdue badge*).
- **Lencana Rekonsiliasi Paritas**: Validasi integritas data lokal terhadap endpoint laporan `/api/v1/inventory/reports/low-stock` (*100% Cocok*, *Divergensi Mutasi Pending*, atau *Divergensi Cache Usang* disertai tombol *Segarkan Katalog*).

### 8. Pemindaian QR Code Fisik Rak Gudang
- **Landing Parameter Dinamis**: Mendukung pemindaian kode QR stiker fisik di rak gudang (`/?src=qr&item=SKU` atau `/?src=qr&location_id=UUID`) yang langsung membuka kartu detail barang atau menyaring daftar rak terkait.

---

## Teknologi & Dependensi

| Kategori | Paket / Pustaka | Versi | Peran & Kegunaan |
|---|---|---|---|
| **UI Framework** | React | `^19.2.0` | Library utama render antarmuka berbasis komponen modern |
| **Bahasa** | TypeScript | `~5.9.3` | Pengetikan statis ketat (*Strict Mode*) |
| **Bundler & Dev Server**| Vite | `^7.2.4` | Server lokal super cepat dengan rollup build optimizer |
| **PWA Engine** | `vite-plugin-pwa` + Workbox | `^2.0.0` | App Shell precaching, manifest generator, & background service worker |
| **Basis Data Lokal** | Dexie.js | `^4.4.6` | Abstraksi relasional IndexedDB dengan indeks majemuk |
| **Server State** | TanStack Query | `^5.104.5` | Manajemen query cache, polling status, & sinkronisasi data |
| **Client / Auth State** | Zustand | `^5.0.16` | Penyimpanan sesi pegawai terisolasi dengan persistensi aman |
| **Routing** | React Router DOM | `^7.18.4` | Routing SPA mobile, layout shell, dan route guards |
| **Styling & Desain** | Tailwind CSS v4 | `^4.1.18` | Framework styling modern berbasis CSS variables |
| **Komponen UI Primitives**| Radix / CVA / clsx | `^0.7.1` | Komponen aksesibel dengan varian status visual dinamis |
| **Validasi Formulir** | React Hook Form + Zod | `^7.90.0` / `^4.6.7` | Validasi skema mutasi dan formulir PIN di sisi klien |
| **Klien HTTP** | Axios | `^1.20.0` | Komunikasi REST API dengan Bearer token interceptor |
| **Ikonografi** | Lucide React | `^1.61.0` | Set ikon SVG berbobot ringan untuk navigasi mobile |
| **Notifikasi Toast** | Sonner | `^2.0.8` | Sistem umpan balik interaksi toast mengambang |
| **Linter & Formatter** | Biome | `^2.6.2` | Pemformat kode dan pemeriksa sintaks instan |
| **Unit & Integration Test**| Vitest + Testing Library | `^5.0.5` / `^16.3.3` | Eksekutor pengujian unit dan integrasi komponen |
| **E2E Testing Suite** | Playwright Test | `^1.64.1` | Pengujian end-to-end pada profil mobile browser nyata |
| **Mocking Jaringan** | MSW (Mock Service Worker) | `^3.0.3` | Simulasi respons server dan skenario kegagalan jaringan |
| **Mock IndexedDB** | fake-indexeddb | `^6.2.6` | Emulasi IndexedDB di lingkungan jsdom untuk CI/CD |

---

## Persyaratan Sistem

| Komponen | Spesifikasi Minimum Disarankan |
|---|---|
| **Node.js** | `>= 20.x LTS` (Disarankan Node 22) |
| **npm** | `>= 10.x` |
| **Backend Peladen** | `visual-board-inventory-backend` (Laravel 13 API) aktif di port `8000` |
| **Peramban Ponsel** | Google Chrome Mobile `>= 120` (Android) / Safari iOS `>= 16.4` (iOS) |

---

## Panduan Instalasi & Menjalankan

### 1. Kloning Repositori
```bash
git clone https://github.com/Internal-Audit-Division-PT-Inalum/inventory-system-frontend.git
cd inventory-system-frontend
```

### 2. Instalasi Paket Dependensi
```bash
npm install
```

### 3. Konfigurasi Lingkungan
Salin berkas template lingkungan:
```bash
cp .env.example .env
```

### 4. Menjalankan Server Pengembangan
```bash
npm run dev
```
Aplikasi PWA akan aktif di port bawaan `http://localhost:5174`.

> [!TIP]
> **Akses Ponsel Pintar via WiFi Gudang:**
> Vite secara otomatis mengaktifkan *network listening*. Anda dapat membuka alamat IP LAN (*e.g.* `http://192.168.1.50:5174`) langsung dari browser ponsel pintar yang terhubung ke jaringan WiFi yang sama untuk menguji pengalaman sentuh secara langsung.

---

## Konfigurasi Lingkungan (.env & Vite Proxy)

Contoh berkas konfigurasi `.env`:
```env
VITE_API_BASE_URL=/api/v1
VITE_APP_NAME="Inventory System — Internal Audit PT INALUM"
VITE_APP_SHORT_NAME="Inventory IIA"
```

### Mekanisme Vite Reverse Proxy
Diatur di dalam [`vite.config.ts`](file:///c:/Users/LENOVO/Projek/Internal%20Audit%20PT%20Inalum/Visual%20Board%20and%20Inventory%20System/Inventory%20System%20Frontend/vite.config.ts):
```typescript
server: {
  port: 5174,
  proxy: {
    '/api': {
      target: 'http://localhost:8000',
      changeOrigin: true,
    },
  },
}
```
*Permintaan API `/api/v1/...` otomatis dialihkan ke backend Laravel tanpa terhambat kebijakan CORS.*

---

## Struktur Rute Aplikasi

| Rute URL | Komponen Halaman | Modul FSD | Aksesibilitas | Deskripsi Fungsional |
|---|---|---|---|---|
| `/login` | `LoginPage` | `features/auth` | Publik | Autentikasi auditor via Namecode dan PIN 6 digit |
| `/change-pin` | `ChangePinPage` | `features/auth` | Terproteksi (`mustChangePin`) | Alur wajib pembaruan PIN keamanan perdana |
| `/` | `HomePage` | `features/monitoring` & `catalog` | Terproteksi (Sesi Aktif) | Dasbor ringkasan KPI, stok kritis, rekonsiliasi, & katalog |
| `/loans` | `LoansPage` | `features/loans` | Terproteksi (Sesi Aktif) | Monitoring aset pinjaman aktif, riwayat, & dialog pengembalian |
| `/outbox` | `OutboxPage` | `features/sync` | Terproteksi (Sesi Aktif) | Antrean transaksi offline, filter status, pemicu sync, & log |
| `/profile` | `ProfilePage` | `features/auth` | Terproteksi (Sesi Aktif) | Profil auditor, ganti PIN, info storage cache, & dialog logout |

---

## Modul Fitur (Feature-Sliced Design)

```text
src/features/
├── auth/          # Login PIN, proteksi rute, ganti PIN, & logout isolasi multi-akun
├── catalog/       # IndexedDB catalog cache, pencarian instan, ETag sync, & QR code landing
├── diagnostics/   # Registrasi log diagnostik & ekspor laporan teknis
├── loans/         # Peminjaman aset, pengembalian bertahap FIFO, & return timeline
├── monitoring/    # KPI stock health, critical stock alert, loan aging, & rekonsiliasi paritas
├── pwa/           # Banner install A2HS, persistent storage prompt, & service worker lifecycle
├── sync/          # Outbox queue, syncEngine, tabLock (Web Locks), clockSkew, & diagnostics
└── transactions/  # Form mutasi barang, optimistic updates, & riwayat ledger per item
```

---

## Arsitektur Sync Engine & Mesin Status Deterministik

### Siklus Hidup Transaksi Outbox (State Machine)

```text
[Aksi Mutasi Auditor: Ambil / Tambah / Pinjam / Kembalikan]
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
         │  (Tersimpan di db.outbox) │       (Timeout, 5xx, Network Disconnect)
         └─────────────┬─────────────┘
                       │
      [Jaringan Pulih / Interval Polling / Tombol Sync]
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

---

## Sistem Komponen UI & Desain Ergonomis

Komponen UI bersama di bawah `src/components/ui/`:
- `Badge`, `Button`, `Card`, `Dialog`, `Drawer`, `Input`, `Label`, `Progress`, `ScrollArea`, `Select`, `Separator`, `Sheet`, `Skeleton`, `Tabs`, `Textarea`.

Pola interaksi khusus perangkat genggam:
- **Bottom Sheet / Drawer**: Formulir mutasi dan detail barang muncul dari bawah layar ponsel agar mudah dijangkau satu tangan (*thumb zone friendly*).
- **Sticky Bottom Navigation**: Navigasi 4 tab utama (*Beranda*, *Pinjaman*, *Outbox*, *Profil*) tetap terlihat di bagian bawah layar.
- **Offline Banner Alert**: Pita status di bagian atas layar mengabarkan status koneksi secara elegan tanpa menutupi konten utama.

---

## Piramida Pengujian & Jaminan Mutu (Vitest & Playwright)

Sistem ini memiliki piramida pengujian lengkap yang diverifikasi secara otomatis pada CI/CD:

```text
               ▲
              / \
             /   \      E2E Tests (Playwright Mobile Chrome)
            /  7  \     7 Skenario Nyata: Auth, Flight Mode, PWA, Reconnect
           /───────\
          /         \   Integration Tests (MSW + Fake-IndexedDB)
         /    120    \  Skenario Sync Engine, Outbox Lifecycle, ETag Sync
        /─────────────\
       /               \Unit Tests (Vitest)
      /       395       \Stock Calc, Clock Skew, TabLock, KPI, Form Validation
     /───────────────────\
```

### Perintah Pengujian:
```bash
# 1. Menjalankan seluruh test unit & integrasi Vitest (522 tests)
npm test

# 2. Menjalankan pengujian Vitest dalam mode watch interaktif
npm run test:watch

# 3. Menjalankan pengujian End-to-End Playwright pada emulasi Mobile Chrome (7 tests)
npm run test:e2e

# 4. Memeriksa kepatuhan linter & format kode (Biome)
npm run lint
npm run format

# 5. Pipeline CI terpadu (Biome check + tsc type check + Vitest + Vite build)
npm run ci
```

**Hasil Verifikasi Terkini**:
- **Vitest**: **522 pengujian lulus 100%** di seluruh **66 berkas uji**.
- **Playwright**: **7 pengujian E2E mobile lulus 100%** (Mode Pesawat, Pemulihan Jaringan, Kepatuhan Lighthouse PWA).
- **Linter & Tipe**: **0 errors / 0 warnings** pada Biome linter dan kompilator TypeScript (`tsc -b`).

---

## Protokol UAT & Pengujian Lapangan Multi-Device (Cloudflare Tunnel)

### Dokumen Protokol UAT
Pelaksanaan pengujian operasional bersama auditor internal dipandu oleh dokumen formal:
📄 [`PROTOKOL_DAN_LEMBAR_KERJA_UAT_INVENTORY_PWA.md`](file:///c:/Users/LENOVO/Projek/Internal%20Audit%20PT%20Inalum/Visual%20Board%20and%20Inventory%20System/PROTOKOL_DAN_LEMBAR_KERJA_UAT_INVENTORY_PWA.md)
*Nomor Registrasi: `BA-UAT/IIA-INALUM/INV-PWA/2026/X` (Mencakup 8 Skenario Operasional UAT-01 s/d UAT-08).*

### Uji Coba Multi-Device via Cloudflare Tunnel HTTPS
Fitur-fitur modern PWA (*Service Worker*, *Camera Scanner*, *A2HS Install Banner*) mewajibkan konteks aman (**Secure Context / HTTPS**) saat diuji pada perangkat smartphone fisik (di luar `localhost`).

Gunakan `cloudflared` untuk membuka tunnel HTTPS publik sementara:
```bash
# Terminal 1: Nyalakan Backend API Laravel (port 8000)
cd ../Backend
php artisan serve --port=8000

# Terminal 2: Nyalakan Frontend PWA (port 5174)
npm run dev

# Terminal 3: Buka Tunnel HTTPS Aman
cloudflared tunnel --url http://localhost:5174
```
*Salin URL HTTPS yang dihasilkan (misal `https://random-subdomain.trycloudflare.com`) ke browser ponsel pintar Android / iPhone untuk pengujian langsung.*

---

## Build Produksi & Konfigurasi Web Server (Nginx)

### 1. Kompilasi Aset Produksi
```bash
npm run build
```
Hasil build teroptimasi akan ditempatkan di direktori `/dist` lengkap dengan *service worker* (`sw.js`) dan *manifest* PWA.

### 2. Pratinjau Lokal Bundel Produksi
```bash
npm run preview
```

### 3. Konfigurasi Nginx Server Produksi (SIT INALUM)
```nginx
server {
    listen 80;
    server_name inventory.inalum.id;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name inventory.inalum.id;

    ssl_certificate /etc/ssl/certs/inalum_wildcard.crt;
    ssl_certificate_key /etc/ssl/private/inalum_wildcard.key;
    ssl_protocols TLSv1.2 TLSv1.3;

    root /var/www/inventory-system-frontend/dist;
    index index.html;

    # Gzip Compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml image/svg+xml;

    # Service Worker & Manifest: No Cache agar pembaruan PWA seketika terpasang
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

    # Proxy API Request ke Peladen Backend Laravel
    location /api/ {
        proxy_pass http://127.0.0.1:8000/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## Struktur Repositori

```text
inventory-system-frontend/
├── e2e/                         # Skenario pengujian end-to-end Playwright
│   ├── fixtures/                # Inisialisasi basis data dan state pengujian
│   ├── helpers/                 # Utilitas helper selektor DOM mobile
│   ├── auth.spec.ts             # Skenario E2E login, proteksi PIN, & logout
│   ├── offlineMutation.spec.ts  # Skenario E2E transaksi offline (mode pesawat)
│   ├── pwa.spec.ts              # Skenario E2E audit metadata PWA & manifest
│   └── reconciliation.spec.ts   # Skenario E2E pemulihan jaringan & outbox sync
├── public/                      # Aset statis favicon, manifest, & ikon PWA
│   ├── icons/                   # Ikon maskable & standar (192x192, 512x512 PNG)
│   ├── inalum-logo.png          # Logo resmi PT INALUM
│   └── favicon.ico
├── src/
│   ├── app/                     # AppProviders, Router v7, & guards
│   ├── components/              # Komponen antarmuka bersama (AppShell, UI)
│   ├── features/                # 8 Modul domain FSD (auth, catalog, dll.)
│   ├── hooks/                   # Custom hooks global (useOnlineStatus, dll.)
│   ├── lib/                     # Client Axios, basis data Dexie (db.ts), time helpers
│   ├── pages/                   # Komponen halaman utama per rute
│   ├── test/                    # Utilitas uji, mock IndexedDB, & MSW handlers
│   ├── types/                   # Deklarasi tipe TypeScript untuk model dan API
│   ├── App.tsx                  # Root Application Component
│   ├── index.css                # Konfigurasi Tailwind CSS v4
│   └── main.tsx                 # Entrypoint React DOM
├── biome.json                   # Konfigurasi aturan linter & pemformat Biome
├── package.json                 # Skrip build & daftar paket dependensi
├── playwright.config.ts         # Konfigurasi peramban dan emulasi mobile Playwright
├── tsconfig.json                # Pengaturan kompilator TypeScript
├── vite.config.ts               # Bundler Vite, konfigurasi PWA, & reverse proxy
└── vitest.config.ts             # Konfigurasi lingkungan pengujian Vitest
```

---

## Keamanan, Kepatuhan SIT, & Privasi Data

1. **Penyimpanan Kredensial Terisolasi**: Token autentikasi disimpan menggunakan Zustand `persist` terisolasi dengan auto-clear saat sesi berakhir atau saat terjadi force-logout.
2. **Kepatuhan Arsitektur SIT**: Sistem telah diajukan dan memenuhi prinsip tata kelola korporat Departemen Smelter IT (SIT) PT INALUM sebagaimana tertera pada dokumen pengajuan:
   - 📄 [`DOKUMEN_PENGAJUAN_GO_LIVE_SIT.md`](file:///c:/Users/LENOVO/Projek/Internal%20Audit%20PT%20Inalum/Visual%20Board%20and%20Inventory%20System/DOKUMEN_PENGAJUAN_GO_LIVE_SIT.md)
   - 📄 [`DEFENSE_STRATEGY_JUSTIFIKASI_SIT.md`](file:///c:/Users/LENOVO/Projek/Internal%20Audit%20PT%20Inalum/Visual%20Board%20and%20Inventory%20System/DEFENSE_STRATEGY_JUSTIFIKASI_SIT.md)
3. **Proteksi Akses Pangkalan Data Lokal**: IndexedDB berjalan di bawah *Same-Origin Policy (SOP)*, mencegah kebocoran data barang inventaris ke skrip domain luar.
4. **Audit Trail Mutasi**: Seluruh mutasi offline menyimpan `occurred_at` presisi (terkoreksi clock skew) dan `client_uuid` sehingga setiap perpindahan fisik barang dapat ditelusuri riwayatnya secara akuntabel.

---

<div align="center">
  <sub>Dikembangkan dan disempurnakan untuk Divisi Internal Audit PT Indonesia Asahan Aluminium.</sub><br />
  <sub>Standar Industri • Zero Data Loss • Mobile & Offline First • Enterprise Grade. 🏭🇲🇨</sub>
</div>
