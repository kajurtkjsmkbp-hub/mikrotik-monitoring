# DOKUMEN INGATAN & ARSITEKTUR SISTEM (INGATAN.md)
*Dokumen ini dibuat otomatis sebagai memori permanen proyek MikroTik Dashboard & Manajemen Voucher Hotspot.*
*Setiap kali AI atau pengembang memulai sesi baru, baca file ini untuk langsung memahami seluruh konteks tanpa kehilangan detail apa pun.*

---

## 1. Ringkasan & Tujuan Proyek
Proyek ini adalah sistem **Dashboard Monitoring MikroTik & Manajemen Voucher Hotspot Mandiri** (Offline-First) berbasis Web untuk jaringan Hotspot RT/RW Net / Kafe / Rumah.
- **Tujuan Utama**:
  1. Memonitor router MikroTik secara real-time (Traffic WAN, User Hotspot Aktif, Total Omset Hari Ini [menggantikan KPI DHCP Leases], PPPoE/User Login, Log Sistem, serta Inspeksi Situs/Website yang dibuka pengguna).
  2. Menyediakan **Halaman Khusus Manajemen Voucher** (`/voucher.html`) yang terpisah dan estetis agar tidak merusak tampilan dashboard utama.
  3. Mengimpor file template cetak voucher `.html` dari Mikhmon, menyimpan ke database **SQLite lokal**, mendeteksi aktivasi login pengguna di MikroTik secara real-time, dan mengalkulasi buku kas / omset pendapatan harian secara otomatis.
  4. Card ke-2 pada Dashboard Utama (`public/index.html`) menampilkan **Total Omset Hari Ini** yang tersinkronisasi langsung secara real-time dengan menu voucher. Jika diklik, langsung membuka `/voucher.html`. (Tabel detail DHCP Leases tetap tersedia di tab bawah).

---

## 2. Repositori GitHub & Lingkungan Deployment
- **GitHub Repository**: [https://github.com/kajurtkjsmkbp-hub/mikrotik-monitoring](https://github.com/kajurtkjsmkbp-hub/mikrotik-monitoring)
- **Branch Utama**: `main`
- **Server Deployment**: Container LXC di **Proxmox VE** (Debian 12 / Ubuntu 22.04 LTS).
- **Lokasi Folder di Proxmox**: `/opt/mikrotik-monitoring`
- **Process Manager 24/7**: **PM2** (`pm2 start server.js --name mikrotik-dashboard`).

---

## 3. Parameter Jaringan & Router MikroTik
- **IP Router**: `192.168.1.64`
- **Port RouterOS API**: `8728`
- **Username**: `admin`
- **Password**: `farkhatin`
- **WAN Interface**: `ether1-internet`
- **Port Server Web**: `3000`
  - Akses Lokal: `http://localhost:3000`
  - Akses Jaringan: `http://192.168.1.81:3000`
  - Akses Menu Voucher: `http://localhost:3000/voucher.html`

---

## 4. Struktur File & Modul Kode

```
mikrotik-monitoring/
├── server.js               # Backend utama Express, Socket.IO, Polling MikroTik API & REST API
├── mikrotik.js             # Client TCP Socket RouterOS API port 8728 (query, login, parse)
├── voucher-db.js           # Engine database SQLite, parser Mikhmon HTML, aktivasi user, rekap omset
├── update.sh               # Script otomatis update dari git tanpa merusak database
├── .gitignore              # Memproteksi .env, node_modules, dan data/*.sqlite agar tidak tertimpa
├── .env.example            # Template konfigurasi environment untuk server baru
├── .env                    # Variabel environment router & server (TIDAK DIPUSH KE GIT)
├── package.json            # Dependensi: express, socket.io, sqlite3, dotenv, lucide, dll.
├── README.md               # Dokumentasi instalasi Proxmox LXC & panduan penggunaan
├── INGATAN.md              # Memori permanen arsitektur dan troubleshooting
├── data/
│   ├── .gitkeep            # Menjaga folder data tetap ada di repository git
│   └── vouchers.sqlite     # Database SQLite lokal (TIDAK DIPUSH KE GIT / AMAN SAAT UPDATE)
└── public/
    ├── index.html          # Tampilan Dashboard Utama (Traffic, Hotspot, PPP, DHCP, Log)
    ├── app.js              # Script frontend dashboard utama (interpolasi chart, polling, inspect)
    ├── voucher.html        # Halaman Khusus Manajemen Voucher & Buku Kas Harian
    └── voucher.js          # Script frontend voucher (drag & drop, audio alert, modal preview, socket)
```

---

## 5. Kategori Paket Voucher & Harga

Sistem mendukung 3 kategori paket voucher sesuai pesanan:
1. **Paket Rp 1.000** (`1k`)
   - Durasi: **3 Jam**
   - Nilai: **Rp 1.000**
2. **Paket Rp 2.000** (`2k`)
   - Durasi: **10 Jam**
   - Nilai: **Rp 2.000**
3. **Paket Rp 3.000** (`3k`)
   - Durasi: **1 Hari (24 Jam)**
   - Nilai: **Rp 3.000**

---

## 6. Mesin Ekstraksi Kode Voucher Mikhmon (Sangat Penting!)
- **Format Username Voucher**: Berupa **6 karakter alfanumerik** kombinasi huruf dan angka (misal: `6b5txh`, `q5wvxc`, `c9v9iy`).
- **Tantangan Mikhmon**: File cetak HTML Mikhmon (seperti `template baru (8).html`) mengandung ratusan kata HTML & CSS bawaan (seperti `border`, `button`, `italic`, `table`) yang berpanjang 6 karakter.
- **Solusi Regex Presisi Tinggi**:
  Parser di backend (`voucher-db.js`) dan frontend preview (`public/voucher.js`) menggunakan regex khusus penangkap baris tabel tepat di bawah header `Username`:
  ```javascript
  /<tr[^>]*>\s*<td[^>]*>\s*Username\s*<\/td>[\s\S]*?<\/tr>\s*<tr[^>]*>\s*<td[^>]*>([\s\S]*?)<\/td>/gi
  ```
  - **Hasil**: File contoh `template baru (8).html` yang berisi 16 kartu voucher akan terdeteksi **tepat 16 kode username**, dan 100% mengabaikan seluruh tag HTML/CSS lainnya.

---

## 7. Aturan Bisnis & Siklus Hidup Voucher

### A. Kunci Aktivasi Pertama (First-Login Lock / Anti-Dobel Hitung)
1. **Kondisi Awal (Baru Diimport)**:
   - Status: `available`
   - Masuk ke hitungan **Stok Belum Terpakai**.
2. **Saat Pelanggan Login Pertama Kali**:
   - Terdeteksi di `/ip/hotspot/active` MikroTik.
   - Status di SQLite berubah dari `available` menjadi `used`.
   - Waktu, tanggal, jam, IP, dan MAC address dikunci pada login pertama ini.
   - **Stok Belum Terpakai berkurang 1**.
   - **Terpakai hari ini bertambah 1**.
   - **Nominal Rupiah (Rp ...) bertambah** sesuai harga paket (misal +Rp 2.000).
   - **Total Omset Hari Ini bertambah**.
   - Halaman browser memutar suara lonceng kasir 🔔 dan memunculkan pop-up alert mengambang.
3. **Saat Pelanggan Logout / Disconnect**:
   - Status tetap `used`. Stok tidak kembali jadi `available`. Omset tetap sama.
4. **Saat Pelanggan Login Kembali (Re-login ke-2, ke-3, dst)**:
   - Sistem mengenali bahwa voucher sudah berstatus `used`.
   - **TIDAK DIHITUNG ULANG!**
   - Omset **TIDAK bertambah dobel**.
   - Stok **TIDAK terpotong lagi**.
   - Hanya memperbarui tanda status menjadi `Online Sekarang` (titik hijau berkedip).

---

## 8. Solusi Jika Server Mati Saat Pelanggan Login (Auto-Catch Up)
Jika komputer/LXC server web dimatikan (misal malam hari atau listrik padam), sementara router MikroTik tetap hidup 24 jam dan ada pelanggan yang login:

1. **Pencatatan 24/7 di MikroTik**:
   MikroTik secara mandiri mencatat setiap pengguna yang pernah aktif di menu `/ip/hotspot/user` lengkap dengan parameter:
   - `uptime` (lama aktif, misal `3h 45m`)
   - `bytes-out` / `bytes-in` (kuota terpakai)
2. **Auto-Sync Saat Server Dinyalakan**:
   Begitu komputer dan program `server.js` dijalankan kembali, pada siklus polling pertama sistem otomatis:
   - Membaca seluruh data pengguna dari router.
   - Menemukan voucher yang sudah berstatus aktif di MikroTik (`uptime > 0s` atau `bytes-out > 0`).
   - Mencocokkan dengan database SQLite: jika masih `available`, otomatis diubah menjadi `used`.
3. **Perhitungan Jam Aktivasi Cerdas**:
   Sistem menghitung mundur:
   ```javascript
   Waktu_Aktivasi = Waktu_Sekarang - Uptime_Router
   ```
   Sehingga meskipun server baru dinyalakan keesokan harinya, transaksi tetap tercatat di buku kas tanggal dan jam saat pelanggan pertama kali login di MikroTik.
4. **Tombol Sinkron Manual**:
   Tersedia tombol **`🔄 Sinkron Router`** di pojok kanan atas halaman `/voucher.html` untuk memicu pengecekan instan kapan saja.

---

## 9. Pembukuan & Rekap Omset Harian
- **Zona Waktu Standar**: Terkunci permanen ke **Waktu Indonesia Barat (`Asia/Jakarta`, WIB / GMT+7)** secara otomatis melalui `Intl.DateTimeFormat` dan `process.env.APP_TIMEZONE`, sehingga tidak akan terpengaruh jika server Linux/Proxmox diset ke UTC.
- **Periode Harian**: Pukul **00:00:00 s/d 23:59:59 WIB**.
- **Tabel Rekap Buku Kas** di `/voucher.html`:
  - Menampilkan riwayat per hari (contoh: *Senin, 28 September 2026*).
  - Kolom: Hari/Tanggal, Voucher 1K (Jumlah & Rp), Voucher 2K (Jumlah & Rp), Voucher 3K (Jumlah & Rp), Total Lembar, Total Omset (Rp).
  - Tombol **Rincian**: Klik untuk memfilter daftar voucher yang aktif pada tanggal tersebut.
  - Tombol **Export ke CSV**: Untuk mengunduh laporan pembukuan ke format file Excel/Spreadsheet.

---

## 10. Catatan Khusus Linux / Proxmox & Solusi Masalah (Troubleshooting)

### A. Error GLIBC pada SQLite (`version GLIBC_2.38 not found`)
- **Penyebab**: Paket `sqlite3` pada npm mengunduh binary pre-built yang dikompilasi pada GLIBC versi baru, sedangkan Debian 12 / Ubuntu 22.04 LTS menggunakan GLIBC 2.35 / 2.36.
- **Solusi**:
  Kompilasi ulang modul `sqlite3` langsung dari source code lokal LXC:
  ```bash
  apt install -y build-essential python3
  cd /opt/mikrotik-monitoring
  npm rebuild sqlite3 --build-from-source
  pm2 restart mikrotik-dashboard
  ```

### B. Prosedur Update Aman (Tanpa Menimpa Database Proxmox)
- File `data/*.sqlite*` dan `.env` sudah masuk ke `.gitignore`.
- Menjalankan `git pull` di Proxmox **TIDAK AKAN PERNAH** menimpa database penjualan lokal yang sudah ada.
- Gunakan perintah satu baris berikut di Proxmox:
  ```bash
  cd /opt/mikrotik-monitoring && chmod +x update.sh && ./update.sh
  ```
  atau:
  ```bash
  cd /opt/mikrotik-monitoring && git pull && npm install --omit=dev && pm2 restart mikrotik-dashboard
  ```

### C. Optimasi Tab Background & Anti-Freeze / Anti-Negative Lerp Bug
- **Masalah Lama**: Jika tab browser ditinggal/berpindah tab selama beberapa menit, kembali ke tab MikroTik sering menyebabkan browser freeze/hang dan angka KPI menjadi negatif (misal `-204`, `-184`).
- **Penyebab**:
  1. `requestAnimationFrame` dibekukan oleh browser saat tab di background, mengakibatkan time drift negatif dan race condition kurva kubik pada `animateNumber()`.
  2. `setTimeout` throttled di background sehingga floating alerts user login/logout menumpuk puluhan di DOM dan Lucide memindai satu halaman penuh setiap ada event baru.
  3. Instansiasi `new AudioContext()` berulang tanpa pernah ditutup menyebabkan thread audio browser macet.
- **Solusi Permanen yang Diterapkan**:
  1. Integrasi Page Visibility API (`document.hidden` & event `visibilitychange`): saat tab di background, pembaruan angka dilakukan langsung (tanpa RAF), rendering canvas chart dihentikan sementara, dan saat tab aktif kembali, state langsung dipulihkan secara instan.
  2. Pembatasan Floating Alert: maksimal 3 notifikasi mengambang di layar (kartu lama otomatis dibersihkan), pemanggilan ikon dibatasi hanya pada elemen alert terkait (`lucide.createIcons({ root: alert })`), dan tidak memunculkan notifikasi DOM saat tab tersembunyi.
  3. Proteksi Angka Negatif: pembatalan animasi aktif sebelumnya via `cancelAnimationFrame` serta clamping `Math.max(0, ...)` sehingga angka tidak akan pernah minus.
  4. Singleton AudioContext: audio lonceng menggunakan satu instans audio context bersama yang di-resume secara aman.

### D. Solusi Bug Desinkronisasi Protokol RouterOS API (!trap & !done Offset Bug)
- **Gejala Masalah**:
  1. Tampilan CPU 0%, RAM 0 MB / 0 MB (0%), Uptime 0 Detik, ROS v-, dan Board -.
  2. Tabel User Hotspot tiba-tiba muncul 1 user dengan nama "Unknown", IP "-", MAC "-", dan Durasi "-".
  3. Interface berubah menjadi "undefined (undefined)" dan grafik bandwidth flat 0 bps dengan sumbu Y minus (-200 K s/d -1000 K).
- **Akar Penyebab Utama**:
  Pada protokol API MikroTik port 8728, setiap respons command (baik sukses maupun error `!trap`) **selalu diakhiri dengan baris `!done`**.
  Sebelumnya, saat router mengembalikan pesan error `!trap` (misalnya saat memonitor interface yang belum ada atau parameter salah), `mikrotik.js` langsung melempar `throw new Error(...)` tanpa menghabiskan paket `!done` yang menyusul di TCP buffer.
  Akibatnya, seluruh antrean query berikutnya tergeser 1-2 respons (desinkronisasi pipeline):
  - Query resource terbaca `!done` -> kembali kosong (CPU 0%, RAM 0 MB).
  - Query hotspot terbaca respons resource -> user kosong sehingga dinamai "Unknown".
  - Query interface terbaca respons hotspot -> nama interface undefined.
- **Solusi Permanen yang Diterapkan**:
  1. Di `mikrotik.js`: saat menerima `!trap`, parser tetap membaca hingga baris penutup `!done` tiba, baru kemudian melemparkan error sehingga buffer TCP tetap sinkron 100%.
  2. Proteksi auto-disconnect di `client.query()`: jika terjadi timeout atau error query, koneksi socket langsung di-reset otomatis agar tidak ada sisa byte yang mencemari query berikutnya.
  3. Filter data sanitasi di `server.js`: membuang entri rusak/desinkronisasi pada `hotspotUsers` dan `interfaces`.
  4. Skala Chart.js di `public/app.js`: menambahkan `min: 0, beginAtZero: true` sehingga grafik traffic tidak akan pernah menampilkan angka minus.

### E. Fitur Rekap Omset Bulanan & Tab Switcher Buku Kas (28 September 2026)
- **Kebutuhan**: Pemilik usaha membutuhkan rekapan penghasilan per bulan (contoh: *Bulan September 2026*, *Oktober 2026*, dst.) untuk pembukuan tanpa merusak keindahan UI dark mode.
- **Implementasi Backend (`voucher-db.js` & `server.js`)**:
  1. Helper `getJakartaParts()` diperluas untuk menghasilkan `monthKey` (`YYYY-MM`) dan `indoMonthString` (`NamaBulan YYYY`).
  2. `getSummary()` diperluas dengan field `thisMonth` (menghitung total nominal omset dan lembar voucher di bulan berjalan).
  3. Method baru `getMonthlyHistory(limit = 24)` mengelompokkan voucher terpakai (`status = 'used'`) berdasarkan `substr(activated_date, 1, 7)` untuk menampilkan rincian paket 1K, 2K, 3K, total voucher, dan total omset per bulan.
  4. Method `getDailyHistory()` diperluas dengan dukungan parameter `{ month: 'YYYY-MM' }` untuk memfilter rincian hari pada bulan tertentu.
  5. Route `/api/vouchers/monthly-history` dan update route `/api/vouchers/daily-history?month=...`.
- **Implementasi Frontend (`public/voucher.html` & `public/voucher.js`)**:
  1. **Sub-stat Elegan di Kartu Utama**: Baris pemisah halus di dalam kartu "Total Omset Hari Ini" yang menampilkan `Bulan Ini (September 2026): Rp X` secara real-time.
  2. **Pill Tab Switcher**: Di header Riwayat Buku Kas terdapat tombol toggle `[ 📅 Rekap Harian ]` dan `[ 📆 Rekap Bulanan ]`.
  3. **Tabel Rekap Bulanan**: Kolom Bulan & Tahun, Paket 1K, Paket 2K, Paket 3K, Total Lembar, Total Omset Bersih, dan Tombol "Lihat Hari".
  4. **Filter Antar-Bulan**: Menekan tombol "Lihat Hari" pada salah satu bulan akan langsung memfilter tabel harian hanya untuk bulan tersebut, disertai badge filter dan tombol reset silang (✕).
  5. **Export CSV Bulanan & Harian**: Tombol "Export CSV" otomatis menyesuaikan data yang sedang aktif (rekap harian vs rekap bulanan).

### F. Filter Dropdown Periode Dinamis & Baris Total Rekap Tahunan/Bulanan (28 September 2026)
- **Kebutuhan**: Seiring berjalannya waktu, data riwayat hari dan bulan bertambah banyak. Pemilik usaha membutuhkan menu tarik-turun (*dropdown*) agar tabel harian tidak memanjang tanpa batas saat ganti bulan, dan tabel bulanan dapat difilter per tahun (misal Tahun 2026, 2027) lengkap dengan ringkasan total omset tahunan.
- **Implementasi Backend (`voucher-db.js` & `server.js`)**:
  1. Method `voucherDb.getAvailablePeriods()` mengambil seluruh distinct tahun dan distinct bulan dari voucher yang sudah terpakai (`status = 'used'`) secara dinamis.
  2. Method `voucherDb.getMonthlyHistory({ limit, year })` mendukung penyaringan per tahun (`substr(activated_date, 1, 4) = ?`) dan mengembalikan objek `{ items, summary }` berisi total omset tahunan serta total lembar voucher per paket.
  3. Method `voucherDb.getDailyHistory({ limit, month })` mengembalikan objek `{ items, summary }` berisi total omset untuk bulan/periode yang dipilih.
  4. Route baru `/api/vouchers/periods` menyajikan daftar tahun dan bulan untuk dropdown frontend.
- **Implementasi Frontend (`public/voucher.html` & `public/voucher.js`)**:
  1. **Dropdown Filter Bulan (di Tab Rekap Harian)**: Dropdown `<select id="filter-daily-month">` otomatis terisi daftar bulan (`Semua Bulan`, `September 2026`, dst.). Memilih bulan tertentu langsung menyaring tabel harian.
  2. **Dropdown Filter Tahun (di Tab Rekap Bulanan)**: Dropdown `<select id="filter-monthly-year">` otomatis muncul saat tab Bulanan aktif (`Semua Tahun`, `Tahun 2026`, dst.).
  3. **Baris Grand Total Footer (`tfoot`)**:
     - Di bawah tabel harian: baris **TOTAL PERIODE / TOTAL BULAN INI** menghitung total lembar 1K, 2K, 3K, total voucher, dan total pendapatan rupiah.
     - Di bawah tabel bulanan: baris **TOTAL OMSET TAHUNAN / KESELURUHAN** menampilkan akumulasi omset satu tahun penuh.
  4. **Export CSV Kontekstual**: File CSV yang diunduh otomatis menyaring baris dan memberi nama file sesuai bulan/tahun yang dipilih (contoh: `rekap_omset_harian_2026-09.csv` atau `rekap_omset_bulanan_tahun_2026.csv`).

### G. Transformasi Kartu ke-3 Dashboard Utama: Total Omset Bulan Berjalan (28 September 2026)
- **Kebutuhan**: Pada Dashboard Utama (`public/index.html`), pemilik usaha menginginkan kartu ke-3 (yang sebelumnya menampilkan "Total User Login" & PPPoE) diganti menjadi **Total Omset Bulan Berjalan** (misalnya *Bulan September 2026*, lalu otomatis berganti saat masuk bulan baru seperti *Oktober 2026*, dst.) dengan format besar dan jelas seperti kartu omset harian.
- **Implementasi Frontend (`public/index.html` & `public/app.js`)**:
  1. **Kartu ke-3 Baru (Luxury Violet Theme)**:
     - Judul: `Omset Bulan Ini` disertai badge bulan dinamis (`stat-omset-month-badge`, misal: `September 2026`).
     - Nilai Utama: `stat-omset-month` dengan angka rupiah tebal (`Rp XX.XXX`).
     - Subtitle: `stat-omset-vouchers-month` (`X voucher diaktifkan bulan ini`).
     - Ikon: `wallet` (dompet keuangan).
     - Link Klik: Seluruh kartu dapat diklik untuk langsung membuka `/voucher.html`.
  2. **Pembaruan Real-Time (`app.js`)**:
     - Fungsi `updateOmsetUI(summary)` mengupdate kartu hari ini (`summary.today`) sekaligus kartu bulan berjalan (`summary.thisMonth`) secara otomatis via event Socket.IO (`initial_state`, `voucher_summary_update`, dan polling interval).
     - Angka nominal rupiah dianimasikan secara halus menggunakan `animateCurrency()`.
  3. **Penyesuaian Cache Buster**: Script dimuat dengan `/app.js?v=20260928_2` dan `/voucher.js?v=20260928_5` agar browser client langsung memperbarui file script tanpa tertahan cache lawas.

---
*Catatan Terakhir Diperbarui: 28 September 2026 - Penambahan Filter Dropdown Periode (Bulan/Tahun), Baris Total Rekap Tahunan, dan Transformasi Kartu ke-3 Dashboard Utama menjadi Omset Bulan Berjalan.*

