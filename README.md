# Coretax Faktur Pajak Scraper

Scrape semua data **Faktur Pajak Keluaran** dari [Coretax DJP](https://coretaxdjp.pajak.go.id) secara otomatis. Tersedia dalam 2 versi: **Console Script** dan **Browser Extension**.

## ✨ Fitur

- 🚀 Scrape otomatis semua halaman tanpa klik manual
- 📁 Export ke CSV dan JSON
- 🔄 Scroll pagination — mengatasi keterbatasan API yang hanya mengembalikan 50 baris per request
- 🔐 Otomatis mendeteksi auth token dari session yang aktif

## 📦 Cara Pakai

### Opsi 1: Console Script (Cepat & Mudah)

1. **Login** ke [Coretax DJP](https://coretaxdjp.pajak.go.id)
2. Buka halaman **Faktur Pajak Keluaran**
3. Buka **DevTools** (`F12`) → tab **Console**
4. Copy-paste isi file [`console-script.js`](console-script.js) → tekan **Enter**
5. Script otomatis berjalan → CSV ter-download otomatis

### Opsi 2: Browser Extension (Lebih Praktis)

Lihat panduan lengkap di [`extension/README.md`](extension/README.md).

**Instalasi singkat (Chrome/Edge):**

1. Buka `chrome://extensions` → aktifkan **Developer mode**
2. Klik **"Load unpacked"** → pilih folder `extension/`
3. Buka halaman Faktur Pajak Keluaran
4. Klik icon ekstensi → **"Mulai Scrape"**

## 📁 Struktur Project

```
faktur-pajak-scraper/
├── console-script.js      # Standalone console scraper
├── README.md               # Dokumentasi ini
├── todo.md                 # Rencana pengembangan
└── extension/              # Browser extension
    ├── manifest.json
    ├── popup.html / css / js
    ├── content.js           # Bridge (isolated world)
    ├── injected.js          # Scraper (page context)
    └── icons/
```

## ⚙️ Cara Kerja

1. **Intercept** — menangkap 1 request Angular untuk menyalin auth token, headers, dan format body
2. **Auto-trigger** — klik tombol Next Page secara otomatis untuk memicu request pertama
3. **Scroll pagination** — request berurutan (First=0, 50, 100...) sampai server mengembalikan < 50 baris
4. **Deduplikasi** — memastikan tidak ada data duplikat
5. **Export** — generate dan download file CSV/JSON

> **Catatan teknis:** API Coretax mengembalikan `TotalRecords` yang tidak akurat (selalu `First + Rows + 1`), sehingga jumlah data total tidak bisa diketahui di awal. Script menggunakan strategi scroll-until-empty sebagai solusi.

## ⚠️ Catatan Penting

- Script **hanya membaca** data, tidak mengubah apapun
- Membutuhkan session login yang aktif di Coretax
- Pastikan berada di halaman **Faktur Pajak Keluaran** sebelum menjalankan
- Data yang di-scrape mengikuti filter yang sedang aktif di halaman

## 📄 Lisensi

MIT
