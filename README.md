# Better Coretax

Better Coretax adalah ekstensi Chrome khusus yang dirancang untuk melengkapi dan memaksimalkan fitur portal DJP Coretax, khususnya dalam hal mempermudah Wajib Pajak untuk mengurai, menarik, dan mengekspor memori data pajak yang bervolume raksasa ke dalam satu *file*.

## Fitur Utama

- **Super Ekspor e-Faktur (Pajak Keluaran):** Tarik otomatis ratusan hingga ribuan baris faktur pajak keluaran Anda dalam hitungan detik (500 baris per kedipan) tanpa *timeout* jaringan, dan konversikan langsung menjadi set *file* `.xlsx` yang bersih.
- **Ekspor Lampiran A2 & B2 (SPT Masa PPN):** Mem- _bypass_ portal retur SPT untuk menarik data Pajak Keluaran (A2) dan Pajak Masukan (B2) dengan ukuran porsi ekstra masif (1.000 tarikan/permintaan).
- **Auto-Formatting Excel:** Memformat tanggal sistem (*ISO String*) secara otomatis dan menyesuaikannya menjadi tata letak kalender Indonesia standar (`DD/MM/YYYY`) yang ramah bacaan.
- **Smart Paginator Bypass:** Mengatasi rintangan sistem *Paginasi Sisi-Server (Lazy Loading)* milik Coretax yang mengunci layar Anda sehingga tak lagi perlu menekan "Next Page" lima puluh kali.
- **Filter Pencarian:** Kemampuan memfilter data tabel langsung di layar *header* yang terintegrasi penuh.

## Pemasangan (Build & Install)

Ekstensi ini ditulis menggunakan antarmuka *Typescript* untuk reliabilitas.

1. Install dependensi (jika baru pertama kali):
   ```bash
   npm install
   ```
2. Lakukan _build_ untuk menghasilkan versi siap pakai:
   ```bash
   npm run build
   ```
3. Buka peramban Google Chrome dan masuk ke tautan: `chrome://extensions/`
4. Pastikan opsi **Developer mode** (Mode Pengembang) di pojok kanan atas menyala.
5. Klik **Load unpacked** dan pilih direktori (folder) dari *repository* *Better Coretax* ini.
6. Otomatis ketika Anda masuk ke Coretax DJP portal e-faktur/SPT, tombol **Better Export** warna oranye akan hadir di layar Anda!
