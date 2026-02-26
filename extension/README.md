# Coretax Faktur Pajak Scraper — Browser Extension

Ekstensi browser untuk scrape data **Faktur Pajak Keluaran** dari [Coretax DJP](https://coretaxdjp.pajak.go.id) dengan 1 klik.

## ✨ Fitur

- 🚀 **1-klik scrape** — tidak perlu paste script di console
- 📊 **Progress real-time** — lihat jumlah data, halaman, dan waktu
- 📁 **Export CSV & JSON** — download langsung dari popup
- ⏹️ **Stop kapan saja** — hentikan scraping jika sudah cukup
- 🔍 **Background Scraping** — proses tetap jalan meski popup ditutup
- 📊 **In-page Badge** — pantau progress lewat badge melayang di halaman
- 🌐 **Semua browser** — Chrome, Edge, Firefox (Manifest V3)

## 📦 Instalasi

### Chrome / Edge

1. Buka `chrome://extensions` (Chrome) atau `edge://extensions` (Edge)
2. Aktifkan **Developer mode** (toggle di kanan atas)
3. Klik **"Load unpacked"**
4. Pilih folder `extension/` dari project ini
5. Ekstensi muncul di toolbar! 🎉

### Firefox

1. Buka `about:debugging#/runtime/this-firefox`
2. Klik **"Load Temporary Add-on..."**
3. Pilih file `extension/manifest.json`
4. Ekstensi muncul di toolbar! 🎉

> ⚠️ Di Firefox, ekstensi temporary hanya bertahan sampai browser ditutup.

## 🚀 Cara Pakai

1. **Login** ke [Coretax DJP](https://coretaxdjp.pajak.go.id)
2. Navigasi ke halaman **Faktur Pajak Keluaran**
3. Atur **filter** yang diinginkan (bulan, tahun, status)
4. Klik **icon ekstensi** di toolbar browser
5. Klik **"Mulai Scrape"**
6. Tunggu sampai selesai — progress ditampilkan real-time
7. Klik **"Export CSV"** atau **"Export JSON"** untuk download

## 🏗️ Struktur

```
extension/
├── manifest.json    # Konfigurasi ekstensi (Manifest V3)
├── popup.html       # UI popup
├── popup.css        # Styling (dark theme)
├── popup.js         # Logic popup & export
├── content.js       # Bridge (relay message)
├── injected.js      # Scraper logic (runs in page context)
└── icons/           # Icon ekstensi
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## ⚙️ Cara Kerja

1. **Content script** (`content.js`) otomatis di-inject di halaman Coretax
2. Saat user klik "Mulai Scrape", popup mengirim pesan `START_SCRAPE`
3. Content script **intercept** 1 XHR request Angular untuk "belajar" format request
4. Otomatis klik tombol **Next Page** untuk trigger request pertama
5. **Scroll pagination**: request halaman berurutan (First=0, 50, 100...), berhenti saat server mengembalikan < 50 baris
6. **Background Process**: logic ada di page context, popup hanya menampilkan status. Tutup popup tidak menghentikan proses.
7. Hasil dikirim kembali ke popup untuk export

> 💡 **Mengapa scroll pagination?**
> API Coretax mengembalikan `TotalRecords` palsu (selalu `First + Rows + 1`), sehingga tidak bisa diketahui jumlah total data sesungguhnya. Satu-satunya cara adalah terus minta data sampai habis.
