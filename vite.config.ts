import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "prompt",
      includeAssets: [
        "favicon.ico",
        "apple-touch-icon.png",
        "vite.svg",
        "icons/*.png",
      ],
      manifest: {
        id: "/",
        name: "Inventory System — Internal Audit PT INALUM",
        short_name: "Inventory IIA",
        description:
          "Sistem Informasi Manajemen Inventaris Divisi Internal Audit PT Indonesia Asahan Aluminium",
        theme_color: "#004785",
        background_color: "#ffffff",
        display: "standalone",
        orientation: "portrait-primary",
        start_url: "/",
        scope: "/",
        categories: ["business", "productivity", "utilities"],
        shortcuts: [
          {
            name: "Katalog Inventaris",
            short_name: "Katalog",
            description: "Buka katalog barang dan lokasi rak fisik",
            url: "/",
            icons: [{ src: "/icons/icon-192x192.png", sizes: "192x192" }],
          },
          {
            name: "Pinjaman Saya",
            short_name: "Pinjaman",
            description: "Lihat status pinjaman alat dan pengembalian",
            url: "/loans",
            icons: [{ src: "/icons/icon-192x192.png", sizes: "192x192" }],
          },
          {
            name: "Antrean Outbox",
            short_name: "Antrean",
            description: "Cek antrean transaksi offline dan sinkronisasi",
            url: "/outbox",
            icons: [{ src: "/icons/icon-192x192.png", sizes: "192x192" }],
          },
        ],
        icons: [
          {
            src: "/icons/icon-192x192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icons/icon-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icons/icon-maskable-192x192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "maskable",
          },
          {
            src: "/icons/icon-maskable-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // App Shell precaching saja (HTML, CSS, JS, font, static assets)
        globPatterns: ["**/*.{js,css,html,ico,png,svg,webp,woff,woff2}"],
        navigateFallback: "/index.html",
        cleanupOutdatedCaches: true,
        // PENTING: Tanpa runtimeCaching untuk /api/*
        // Pengelolaan cache data bisnis ditangani penuh secara deterministik oleh Dexie IndexedDB
      },
      devOptions: {
        enabled: true,
        type: "module",
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5174,
    host: true,
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
      "/storage": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 5174,
    host: true,
  },
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-react": ["react", "react-dom", "react-router-dom"],
          "vendor-query": ["@tanstack/react-query"],
          "vendor-db": ["dexie"],
        },
      },
    },
  },
});
