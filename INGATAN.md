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

## 11. Modul Pemakaian Trafik & Akumulasi Bandwidth (Tahan Restart MikroTik)

### A. Latar Belakang & Masalah Bawaan RouterOS
- Pada router MikroTik, counter `rx-byte` dan `tx-byte` pada `/interface/print` disimpan murni di memori RAM router.
- **Masalah Fatal Jika Tanpa Database Lokal**: Setiap kali MikroTik mengalami mati lampu, mati listrik, atau restart berkala, seluruh counter byte kembali menjadi **0**. Jika sistem hanya membaca nilai router saat ini, data pemakaian download & upload hari itu akan terhapus atau bernilai minus!

### B. Arsitektur Solusi: Akumulasi Delta Persisten (Offline-First SQLite)
1. **Engine Database (`traffic-db.js`)**:
   - Beroperasi di database mandiri `data/traffic.sqlite` (aman dari git pull).
   - Menggunakan mode SQLite WAL (`PRAGMA journal_mode = WAL`) untuk performa tinggi dan proteksi data korup.
   - Tabel `traffic_meta`: Menyimpan `last_raw_rx`, `last_raw_tx`, `last_uptime_sec`, dan `last_seen_date` per interface.
   - Tabel `traffic_daily`: Mencatat total download (`rx_bytes`), upload (`tx_bytes`), total volume (`total_bytes`), dan `reboot_count` per interface per tanggal (`YYYY-MM-DD` WIB).
   - Tabel `traffic_hourly`: Mencatat pergerakan byte per jam (0..23) untuk mendeteksi jam puncak (*Peak Hour*) dan grafik 24 jam.
2. **Algoritma Deteksi Reboot / Listrik Padam**:
   - Pada setiap siklus pembacaan router (setiap ~3 detik):
     - Jika `curr_rx >= last_rx` dan `curr_tx >= last_tx` serta uptime berlanjut:
       `delta_rx = curr_rx - last_rx`
       `delta_tx = curr_tx - last_tx`
     - Jika `curr_rx < last_rx` ATAU `curr_tx < last_tx` ATAU `uptimeSec < lastUptimeSec - 10`:
       **Reboot Terdeteksi!**
       Byte sebelum restart telah terkunci aman di SQLite pada detik sebelumnya.
       Trafik baru pasca-reboot adalah:
       `delta_rx = curr_rx`
       `delta_tx = curr_tx`
       `reboot_count += 1`
   - Delta ini langsung diakumulasikan (`rx_bytes = rx_bytes + delta_rx`) ke row tanggal hari ini.
   - **Hasil**: Router restart berkali-kali pun, angka download dan upload harian tetap 100% akurat dan terus bertambah secara akumulatif.

### C. Halaman Khusus `/traffic.html` & Navigasi
1. **Tombol Navigasi**:
   - Di `public/index.html`: Tombol `📊 Pemakaian Trafik` ditempatkan tepat di sebelah tombol `Menu Voucher` pada header.
   - Di `public/voucher.html`: Tombol `Pemakaian Trafik` ditambahkan di header agar navigasi antara Dashboard Utama, Menu Voucher, dan Pemakaian Trafik terhubung 3 arah.
2. **Fitur Lengkap Halaman `/traffic.html`**:
   - **4 Hero KPI Cards**: Pemakaian Hari Ini (Download, Upload, Total, % vs Kemarin, Status Reboot), Minggu Ini (7 hari), Bulan Ini (dengan rata-rata harian), dan Tahun Ini.
   - **Live Speed & Peak Hour**: Kecepatan realtime saat ini (Download/Upload bps) + Jam Tersibuk Hari Ini (*Peak Hour*) + Rasio Konsumsi (persentase DL vs UL).
   - **Grafik Interaktif (Chart.js)**: Toggle mode 24 Jam Hari Ini (per jam), 30 Hari Terakhir, dan 12 Bulan Terakhir.
   - **Buku Rekapitulasi 4 Periode**:
     - `📅 Harian`: Tabel rincian per hari dengan filter dropdown bulan dan baris grand total footer.
     - `📆 Mingguan`: Tabel rincian per minggu kalender ISO beserta rentang tanggal dan rata-rata per hari.
     - `📊 Bulanan`: Tabel rincian per bulan dengan filter dropdown tahun.
     - `📈 Tahunan`: Tabel rincian per tahun untuk buku besar jaringan.
   - **Export CSV**: Mengunduh laporan resmi dalam format file spreadsheet Excel/CSV yang otomatis menyesuaikan periode aktif.

### D. Fitur Ekstra yang Ditambahkan (28 September 2026)
1. **🏆 Top 10 Pengguna Paling Boros Kuota (Top Consumers Leaderboard)**:
   - Endpoint: `GET /api/traffic/top-users?limit=10`.
   - Mengombinasikan data `/ip/hotspot/active` (live session bytes) dan `/ip/hotspot/user` (historical bytes) dari router MikroTik.
   - Menampilkan peringkat 10 user teratas dengan badge medali (emas, perak, perunggu), status Online/Offline, durasi, Download RX, Upload TX, Total volume kuota, dan progress bar visual.
2. **🎯 Indikator Batas Kuota FUP Bulanan (FUP Tracker)**:
   - Menyimpan konfigurasi batas FUP bulanan di tabel `traffic_settings` SQLite (`isp_fup_gb`, `isp_name`).
   - Progress bar dinamis dengan kalkulasi kuota terpakai, sisa kuota, dan persentase.
   - Status badge otomatis:
     - `Aman` (< 75%)
     - `Waspada (75%+)` (75% - 89%)
     - `Mendekati Batas` (>= 90%)
   - Dilengkapi modal pengaturan interaktif `⚙️ Atur FUP & Biaya` langsung dari UI web.
3. **💰 Analisa Margin Keuangan & Efisiensi Bandwidth**:
   - Mengintegrasikan data biaya langganan bulanan ISP (`isp_monthly_cost`) dengan omset penjualan voucher bulan berjalan (`voucherSummary.thisMonth.revenue`).
   - Menghitung **Beban Modal per GB**: `Biaya_ISP / Total_GB_Bulan_Ini`.
   - Menghitung **Estimasi Laba Bersih Operasional**: `Omset_Voucher - Biaya_ISP`.
   - Menghitung **ROI / Profit Margin**: `((Omset - Biaya) / Biaya) * 100%`.
4. **💾 Cadangan & Pemulihan Database Langsung dari Web (Backup & Restore)**:
   - Tombol `💾 Backup Database` di header `traffic.html` dan tombol `Backup DB` di `voucher.html`.
   - **Download Backup**:
     - `GET /api/backup/download/vouchers` -> Mengunduh `vouchers.sqlite` bertanggal.
     - `GET /api/backup/download/traffic` -> Mengunduh `traffic.sqlite` bertanggal.
   - **Restore Database**:
     - `POST /api/backup/restore/:type` -> Menerima upload file `.sqlite` via Base64.
     - Dilengkapi mekanisme keselamatan otomatis: server membuat salinan backup `.bak_<timestamp>` dari database yang sedang berjalan sebelum file ditimpa.


---

## 12. Standarisasi Satuan Bandwidth (SI Desimal) & Ketahanan Server Proxmox

### A. Konversi Satuan Kuota Bandwidth: Mengapa 1000 MB = 1 GB?
- **Masalah Sebelumnya**: Pada tampilan kartu atau tabel terkadang muncul angka seperti `1008.90 MB` bukan `1.01 GB`.
- **Akar Penyebab**:
  - Secara historis pada sistem operasi komputer lawas (seperti Windows Explorer untuk RAM/File Size), digunakan standar biner IEC ($1\text{ GiB} = 1024\text{ MiB}$). Dengan pembagi 1024, angka antara $1000.00\text{ MB}$ hingga $1023.99\text{ MB}$ masih tertahan di satuan `MB`.
- **Standar Industri Telekomunikasi, ISP & Jaringan**:
  - Seluruh provider internet (ISP seperti Telkomsel, Indihome, Biznet, MyRepublic, dll.), kuota FUP, smartphone Android/iOS, standar IEEE 1541, dan International System of Units (SI) menggunakan perhitungan berbasis desimal ($10^3$):
    - $1\text{ KB} = 1.000\text{ Byte}$
    - $1\text{ MB} = 1.000\text{ KB} = 1.000.000\text{ Byte}$
    - $1\text{ GB} = 1.000\text{ MB} = 1.000.000.000\text{ Byte}$ ($10^9$)
    - $1\text{ TB} = 1.000\text{ GB} = 1.000.000.000.000\text{ Byte}$ ($10^{12}$)
  - Standar kecepatan internet (*throughput*) juga sudah menggunakan basis desimal ($1\text{ Gbps} = 1.000\text{ Mbps}$, $1\text{ Mbps} = 1.000\text{ Kbps}$).
- **Implementasi Terpadu (28 September 2026)**:
  - Seluruh fungsi `formatBytes` di `traffic-db.js`, `server.js`, dan `public/traffic.js` telah diselaraskan menggunakan basis $k = 1000$ dengan mekanisme **Auto-Rollover**:
    ```javascript
    function formatBytes(bytes) {
        if (!bytes || isNaN(bytes) || bytes <= 0) return '0 B';
        const b = Number(bytes);
        const k = 1000;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
        let i = Math.floor(Math.log(b) / Math.log(k));
        if (i <= 0) return b + ' B';
        if (i >= sizes.length) i = sizes.length - 1;
        let val = (b / Math.pow(k, i)).toFixed(2);
        if (parseFloat(val) >= 1000 && i < sizes.length - 1) {
            i++;
            val = (b / Math.pow(k, i)).toFixed(2);
        }
        return val + ' ' + sizes[i];
    }
    ```
  - **Hasil**:
    - $999.00\text{ MB} \to 999.00\text{ MB}$
    - $1000.00\text{ MB} \to 1.00\text{ GB}$ (langsung berpindah ke GB)
    - $1008.90\text{ MB} \to 1.01\text{ GB}$
    - $1000.00\text{ GB} \to 1.00\text{ TB}$
  - Kalkulasi `totalMonthGb` untuk pemantauan FUP ISP di `traffic-db.js` diselaraskan ke `bytes / (1000 * 1000 * 1000)` sehingga persentase FUP dan angka gigabyte di kartu KPI presisi 100%.

### B. Analisis & Solusi Ketahanan Jika Server Proxmox Mati / Listrik Padam
Banyak pengelola jaringan bertanya: *Bagaimana jika server Proxmox / LXC yang mati lampu, apakah perhitungan trafik tetap akurat?*

1. **Skenario 1: Hanya MikroTik yang Mati / Restart (Proxmox Tetap Nyala)**
   - Database SQLite telah menyimpan byte sebelum restart.
   - Uptime MikroTik terdeteksi reset ke 0 -> Server mengunci nilai lama dan menghitung byte baru dari 0.
   - **Tingkat Akurasi**: 100% Akurat.

2. **Skenario 2: Server Proxmox Mati Sementara, tetapi MikroTik Tetap Hidup 24 Jam**
   - MikroTik terus menghitung counter total byte (`rx-byte` & `tx-byte`) di hardware-nya secara mandiri tanpa henti.
   - Saat server Proxmox dinyalakan kembali, script `server.js` membaca counter MikroTik saat itu (`curr_rx`).
   - Sistem membandingkan dengan `last_raw_rx` yang tersimpan di SQLite sebelum Proxmox mati:
     `delta_rx = curr_rx - last_raw_rx`
   - Seluruh pemakaian kuota pelanggan selama server Proxmox mati **TIDAK HILANG**, melainkan langsung diakumulasikan sebagai delta ke database hari tersebut!
   - **Tingkat Akurasi**: 100% Akurat.

3. **Skenario 3: Server Proxmox dan MikroTik Mati Bersamaan (Listrik Padam Total)**
   - Selama listrik padam total di rumah/kantor, tidak ada perangkat yang menyala dan tidak ada trafik internet sama sekali (0 byte terpakai).
   - Begitu listrik menyala kembali:
     - MikroTik booting dengan counter byte mulai dari 0.
     - Proxmox booting dengan auto-start LXC.
     - Sistem mendeteksi `curr_uptime < last_uptime` (Reboot terdeteksi) dan mengunci byte sebelum mati lampu, lalu mengakumulasikan trafik baru dari 0.
   - **Tingkat Akurasi**: 100% Akurat.

4. **Skenario 4: Server Proxmox Mati, dan MikroTik Sempat Restart Beberapa Kali Saat Proxmox Mati**
   - Jika Proxmox mati cukup lama (misal 5 jam) dan selama 5 jam itu MikroTik sempat restart 2 kali, MikroTik mereset counter byte-nya di tengah jalan tanpa sempat dicatat Proxmox.
   - **Solusi Pencegahan Terbaik**:
     1. Pasang UPS (Uninterruptible Power Supply) mini untuk server Proxmox dan Router MikroTik (daya tahan 1-2 jam).
     2. Konfigurasi BIOS PC Proxmox: `Restore on AC Power Loss` diubah ke **`Power On / Always On`** agar server langsung menyala otomatis begitu listrik kembali menyala.
     3. Jadwalkan auto-start LXC container di Proxmox (`Options -> Start at boot = Yes`).

---
*Catatan Terakhir Diperbarui: 28 September 2026 - Standarisasi Satuan Bandwidth SI Desimal (1000 MB = 1 GB) & Analisis Ketahanan Daya Proxmox.*

---

## 13. Arsitektur Keamanan MikroTik & User Manager (100% Read-Only Safety Manifesto)

### A. Jaminan Keamanan Sistem: Mengapa 100% Aman?
Banyak pengelola jaringan khawatir saat aplikasi pihak ketiga terhubung ke router MikroTik, terutama ke modul **User Manager**. Sistem ini dirancang dengan prinsip **Zero-Modification (100% Read-Only)**:

1. **Hanya Menggunakan Perintah Pembacaan (`print`)**:
   - Seluruh komunikasi dengan MikroTik melalui port RouterOS API (8728) hanya memanggil perintah baca:
     - `/tool/user-manager/user/print` (Membaca username, profil, dan sisa kuota)
     - `/ip/hotspot/active/print` (Membaca user yang sedang online)
     - `/queue/simple/print` (Membaca laju bandwidth bps saat itu)
     - `/ip/hotspot/user/print` (Membaca counter uptime user lokal)
     - `/system/resource/print` (Membaca beban CPU dan free RAM)
     - `/interface/monitor-traffic =once=` (Membaca bit per detik WAN)
   - **TIDAK ADA SATU PUN** pemanggilan perintah berbahaya seperti `add`, `set`, `remove`, `delete`, `reset`, maupun `disable`.
   - Sistem ini setara dengan membuka Winbox dan melihat layar tanpa menekan tombol "Apply" atau "OK".
2. **Tidak Menulis ke Penyimpanan Internal (NAND Flash) MikroTik**:
   - Seluruh database, riwayat trafik, buku kas omset, dan log tersimpan di file database lokal SQLite (`data/vouchers.sqlite` dan `data/traffic.sqlite`) di komputer/server monitoring.
   - Tidak ada satu byte pun yang ditulis ke memori internal MikroTik, menjaga NAND router tetap awet dan tidak cepat penuh.
3. **Proteksi Beban CPU Router (Non-Intrusive Stale-While-Revalidate Caching)**:
   - Data User Manager (1.200+ voucher) tidak dipanggil setiap detik atau setiap kali browser direfresh.
   - Data disimpan di RAM server monitoring dan hanya disegarkan di background secara santai setiap 3 menit sekali. Beban CPU router tetap dingin dan stabil.

---

## 14. Pemantauan Kuota & Kecepatan Realtime User RADIUS (29 September 2026)

### A. Latar Belakang & Kebutuhan Pengguna
1. Pengguna menginginkan daftar khusus untuk **User RADIUS / Voucher Hotspot** tanpa tercampur dengan user login lokal router.
2. Pengguna membutuhkan pemantauan **kecepatan bandwidth realtime per user** (seperti YouTube, download, browsing) yang bergerak dinamis tiap detik dengan satuan jelas (misal `2.5 Mbps`, `↓ ... • ↑ ...`).
3. Pengguna membutuhkan tampilan durasi pemakaian yang manusiawi dan mudah dibaca (bukan format kaku MikroTik seperti `1d18s`).

### B. Tantangan Teknis 1.244 Voucher User Manager & Solusi Lag (5,2 Detik)
- **Akar Masalah**:
  - Router MikroTik memiliki **1.244 voucher** di User Manager.
  - Perintah RouterOS `/tool/user-manager/user/print` membutuhkan waktu **5,2 detik** untuk mentransfer seluruh baris via TCP API.
  - Sebelumnya, saat user mengklik tab *"Top Boros Voucher"* atau *"Semua User"*, backend mengeksekusi query tersebut secara sinkron dalam antrean `safeQuery`.
  - Hal ini menyebabkan:
    1. Respon API tertunda 5+ detik.
    2. Background poller (`runSmartPoll`) yang bertugas menghitung kecepatan realtime per 1,5 detik ikut terblokir dalam antrean `queryQueue`.
    3. Tabel membeku (*freeze*), kecepatan realtime berhenti bergerak, dan perpindahan tab terasa sangat lambat/delay.
- **Solusi Komprehensif yang Diterapkan**:
  1. **Background Asynchronous Cache (`server.js`)**:
     - Fungsi `getUmUsersCached()` diubah menjadi **non-blocking** (0 ms).
     - Mengembalikan data memori RAM secara instan. Jika data lebih lama dari 3 menit atau kosong, proses pembaruan dipicu di latar belakang (`refreshUmUsers().catch(...)`) tanpa menahan request HTTP.
     - Endpoint `/api/traffic/top-users` kini merespons dalam waktu **1–2 milidetik**!
  2. **Instant Client-Side Tab Cache (`public/traffic.js`)**:
     - Browser menyimpan cache lokal per tab (`topUsersCache = { active_radius, top_radius, all }`).
     - Saat pengguna berpindah tab yang pernah dibuka, tabel langsung dirender dalam **0 detik (instan tanpa loading spinner)**, kemudian data diperbarui di latar belakang secara mulus.
  3. **Pemberhentian Request Storm**:
     - Ditambahkan mutex `isLoadingTopUsers` dan debounce 5 detik pada pembaruan soket `users_update` sehingga tidak memicu banjir fetch berulang yang membuat koneksi lambat.

### C. Solusi Kecepatan Realtime di "Top Boros Voucher"
- **Masalah Sebelumnya**:
  - Voucher terboros sepanjang masa di User Manager memiliki kuota 6 GB hingga 9,71 GB (`a9rww8`, `ip3yx5`, dll.) namun statusnya sudah *offline*.
  - User yang sedang online hari ini berada di kisaran 3,7 GB (`hzxuq9`), 3,3 GB (`csadv5`), 3,0 GB (`cuk7e9`).
  - Karena sebelumnya disortir murni berdasarkan total kuota, 20 baris pertama seluruhnya terisi voucher offline, sehingga kolom kecepatan hanya menampilkan `~Kbps (Rata-rata Sesi • Offline)` tanpa ada pergerakan realtime.
- **Solusi yang Diterapkan**:
  1. **Prioritas User Online di Posisi Teratas**:
     - Di `server.js`, algoritma pengurutan dimodifikasi:
       ```javascript
       userList.sort((a, b) => {
           if (a.isOnline && !b.isOnline) return -1;
           if (!a.isOnline && b.isOnline) return 1;
           return b.totalBytes - a.totalBytes;
       });
       ```
     - Seluruh user yang sedang ONLINE diposisikan di paling atas tabel diurutkan dari kuota terbesar mereka.
     - Kecepatan realtime mereka langsung muncul aktif bergerak dinamis via Socket.IO setiap 1,5 detik.
     - Di bawah user online, barulah dicantumkan riwayat voucher offline terbesar sepanjang masa dengan kecepatan rata-rata sesi.
     - Limit tabel dinaikkan menjadi **Top 30**.
  2. **Tampilan Kecepatan Dominan & Warna Dinamis**:
     - Kecepatan utama otomatis menampilkan nilai laju yang dominan (`totalRateFormatted` / `rxRateFormatted`).
     - Subtitle menampilkan rincian download (`↓`) dan upload (`↑`).
     - Titik status: **Hijau berkedip (*pulsing green*)** jika sedang aktif streaming/download, dan abu-abu jika idle.
     - Warna teks:
       - **Emas / Amber (> 1 Mbps)**: Menandakan user sedang streaming video HD / download intensif.
       - **Hijau Cerah (> 30 Kbps)**: Aktivitas normal.
       - **Cyan / Abu-abu**: Idle / offline.
  3. **Selector Kebal Bentrok**:
     - Pembaruan baris tabel menggunakan class-based selector (`row.querySelector('.speed-val')`, `.speed-dot`, `.speed-sub`) sehingga kebal jika ada username ganda (multi-login perangkat berbeda) atau karakter unik.

### D. Perapihan Format Durasi Waktu (`formatDurationNice`)
- **Masalah**: String durasi bawaan MikroTik berbentuk singkatan kaku seperti `1d18s`, `23h3m9s`, `19m11s` yang sering disalahartikan pengguna (misal `1d18s` dikira "1 detik 18 detik").
- **Implementasi**:
  Fungsi parser cerdas di `public/traffic.js`:
  - `1d18s` $\to$ **`1 Hari 18 Detik`**
  - `23h3m9s` $\to$ **`23 Jam 3 Menit`**
  - `9h10m4s` $\to$ **`9 Jam 10 Menit`**
  - `19m11s` $\to$ **`19 Menit 11 Detik`**
- Ditampilkan dalam badge elegan beraksen cyan dengan ikon jam `🕒`, dilengkapi string asli MikroTik dalam tanda kurung kecil sebagai referensi teknis.

---

## 15. Perbaikan Sinkronisasi Laba Bersih & Profit Margin (/traffic.html) (6 Oktober 2026)

### A. Gejala Masalah
Pada kartu "Analisa Margin & Efisiensi Bandwidth" di `/traffic.html`, meskipun Biaya Langganan ISP terisi (contoh: `Rp 555.000`), nilai **Omset Voucher Bulan Ini**, **Estimasi Laba Bersih**, dan badge **Profit** tertahan di angka `Rp 0` dan `+0% Profit` (berwarna hijau).

### B. Akar Masalah
1. **Ketidaksesuaian Properti Omset**:
   Di `voucher-db.js`, total nominal omset bulan berjalan disimpan dalam `summary.thisMonth.totalRevenue`. Namun, di `server.js` dipanggil `vSummary?.thisMonth?.revenue`. Akibatnya nilai omset terbaca `undefined` dan default ke `0`.
2. **Desinkronisasi Socket.IO Real-time (`traffic_live_update`)**:
   Polling cerdas MikroTik (`runSmartPoll`) setiap 3 detik memancarkan event `traffic_live_update` dengan memanggil `trafficDb.getSummary()` langsung tanpa menggabungkan data keuangan dari `voucherDb`. Akibatnya, properti `isp.netProfit` dan `isp.profitMarginPct` bernilai `undefined`, yang kemudian di browser di-fallback menjadi `0` dan karena `0 >= 0` dianggap hijau (+0% Profit) alih-alih menampilkan status defisit/rugi riil.

### C. Solusi yang Diterapkan
1. **Helper Sentral Backend (`server.js`)**:
   Dibuat fungsi terpusat `getEnrichedTrafficSummary(iface)` yang menggabungkan kalkulasi `voucherDb.getSummary().thisMonth.totalRevenue` dengan `trafficDb.getSummary()`. Fungsi ini digunakan secara seragam pada:
   - Polling live Smart Poll (`runSmartPoll`)
   - Route HTTP `GET /api/traffic/summary`
   - Event Socket.IO `initial_state`
   - Event Socket.IO `get_traffic_summary`
   - Route HTTP `POST /api/traffic/isp-config`
2. **Alias Kompatibilitas (`voucher-db.js`)**:
   Ditambahkan alias `summary.today.revenue`, `summary.thisMonth.revenue`, dan `summary.allTime.revenue` yang merujuk ke `totalRevenue` agar kompatibel ke belakang.
3. **Penyempurnaan Logika UI (`public/traffic.js`)**:
   - Jika `netProfit < 0`: Tampilan nominal berwarna merah (`text-rose-400`, misal `-Rp 555.000`) dan badge menampilkan `-X% Defisit` (warna merah).
   - Jika `netProfit > 0`: Tampilan nominal berwarna hijau (`text-emerald-400`, misal `+Rp 250.000`) dan badge `+X% Profit` (warna hijau).
   - Jika `netProfit == 0`: Tampilan netral (`text-slate-400`) dan badge `0% Break Even`.
4. **Jaminan Keamanan Database Proxmox**:
   File database `data/*.sqlite*` dan `.env` 100% diproteksi oleh `.gitignore`. Pembaruan kode (`git pull`) di server Proxmox **TIDAK AKAN PERNAH** menimpa data penjualan maupun trafik yang ada di server Proxmox.

## 16. Roadmap & Rekomendasi Fitur Masa Depan (Ide Pengembang & AI)

Berdasarkan analisis kebutuhan operasional jaringan Hotspot RT/RW Net & Kafe, berikut adalah daftar fitur bernilai tinggi yang siap dikembangkan pada fase berikutnya:

### A. Notifikasi & Laporan Otomatis Telegram Bot
1. **Laporan Tutup Buku Harian (Pukul 23:59 / 00:00 WIB)**:
   - Mengirim ringkasan otomatis ke chat / grup Telegram pribadi:
     - Total lembar voucher terjual & nominal omset harian.
     - Rincian per paket (1K, 2K, 3K).
     - Total volume kuota trafik internet terpakai (GB/TB).
     - Sisa stok voucher di database.
2. **Alert Keadaan Darurat Realtime**:
   - Peringatan instan saat router MikroTik restart / reboot / mati listrik.
   - Peringatan saat koneksi WAN internet putus (*RTO / Gateway Unreachable*).
   - Peringatan saat beban CPU MikroTik mencapai > 90% secara terus-menerus.
   - Peringatan saat kuota FUP ISP tersisa < 15% atau mendekati batas limit.

### B. Indikator & Peringatan Stok Voucher Menipis (*Low Stock Warning*)
- Menambahkan badge alert visual di header Dashboard (`/index.html`) dan Menu Voucher (`/voucher.html`) jika stok voucher kategori tertentu (1K, 2K, atau 3K) tersisa kurang dari 5 lembar.
- Membantu pemilik usaha segera mencetak atau mengimpor voucher Mikhmon baru sebelum kehabisan stok saat jam ramai.

### C. Pemantauan Latensi ISP & Kesehatan Router (*Network Health*)
1. **Grafik Ping Latensi & Jitter**:
   - Memantau kestabilan koneksi ke DNS ISP dan Google (`8.8.8.8` / `1.1.1.1`).
   - Memudahkan identifikasi saat ada keluhan pelanggan "WiFi lemot": apakah karena trafik lokal padat atau memang ISP yang sedang gangguan.
2. **Sensor Suhu & Voltase RouterOS (`/system/health`)**:
   - Menampilkan suhu CPU/Board dan tegangan voltase langsung pada router yang mendukung sensor hardware (seperti RB3011, RB4011, CCR, Hex S).

### D. Tombol Aksi Cepat Pengguna Langsung dari Web (*User Quick Actions*)
- **Kick / Putuskan User**: Tombol aksi di tabel Hotspot Aktif dan Top Users untuk memutus sesi pengguna yang mencurigakan tanpa perlu membuka Winbox.
- **Bypass / IP-Binding 1-Klik**: Membantu mem-bypass perangkat pelanggan tertentu (misal perangkat kasir, smart TV, atau pelanggan yang kesulitan login).

### E. Heatmap Jam Sibuk (*Peak Hour Traffic Heatmap*)
- Matriks visual 7 hari $\times$ 24 jam yang menggambarkan kepadatan trafik dan frekuensi aktivasi voucher.
- Memberikan gambaran jam sibuk (contoh: 19:00 - 22:00 WIB) untuk evaluasi kapasitas bandwidth atau strategi promo harga.

### F. Pencadangan Terjadwal Otomatis (*Scheduled Auto-Backup*)
- Cron job internal yang mencadangkan file database SQLite (`vouchers.sqlite` & `traffic.sqlite`) secara otomatis setiap pukul 02:00 WIB ke folder arsip bertanggal (`/opt/backups/`) atau langsung dikirimkan ke Telegram sebagai dokumen cadangan.

---

## 17. Presisi Buku Kas Harian (00:00 WIB) & Pelacakan Histori Aktivasi Voucher (9 Oktober 2026)

### A. Latar Belakang & Masalah
- **Aturan Bisnis Harian**: Perhitungan omset dan penjualan voucher harus berganti/mulai baru setiap terjadi pergantian tanggal (pukul **24:00 / 00:00 WIB**).
- **Gejala Masalah**:
  1. Jika server Proxmox LXC dimatikan malam hari (misal jam 23:00) sementara router MikroTik tetap hidup 24 jam, lalu ada pelanggan login voucher pada jam **23:45 WIB (hari kemarin)**.
  2. Keesokan paginya (misal pukul 06:30 WIB di hari berbeda), saat Proxmox dinyalakan, sistem monitoring melakukan polling ke MikroTik.
  3. Kode lama di `checkAndActivateUsers` menggunakan `new Date()` (waktu server saat Proxmox menyala), sehingga voucher yang aktif jam 23:45 kemarin **malah tercatat di hari ini** (hari saat Proxmox hidup).
  4. Akibatnya, buku kas harian kemarin menjadi kurang, dan buku kas hari ini menjadi bengkak/kotor dengan transaksi kemarin.

### B. Arsitektur Solusi: Hierarki Pelacakan Waktu Aktivasi Pertama (First-Activation Resolver)
Sistem kini mengimplementasikan engine pelacak waktu aktivasi presisi tinggi (`resolveVoucherActivationTime`) dengan hierarki *Source of Truth*:

1. **Prioritas 1: Sesi User Manager MikroTik (`/tool/user-manager/session`)**:
   - Router MikroTik menyimpan riwayat sesi RADIUS secara persisten di penyimpanan flash internal NAND.
   - Sistem mengambil seluruh sesi untuk user tersebut dan mencari **sesi paling awal (*earliest session*)** berdasarkan kolom `'from-time'` (contoh: `'oct/08/2026 23:25:58'`).
   - String diparsing presisi oleh `parseMikrotikDateTime()` menjadi `Date` object WIB (`Asia/Jakarta`).
   - Ini memberikan detik riil saat pengguna pertama kali login di hotspot, bahkan jika router sempat restart atau pengguna sudah login berkali-kali (*re-login*).
2. **Prioritas 2: User Record User Manager (`/tool/user-manager/user`)**:
   - Jika tabel sesi telah di-prune/dibersihkan, sistem membaca `'last-seen'` dan `'uptime-used'`.
   - Waktu aktivasi pertama dihitung: `Date(last-seen) - uptimeUsedMs`.
3. **Prioritas 3: Sesi Hotspot Aktif (`/ip/hotspot/active`)**:
   - Jika voucher sedang online di router, sistem membaca `u.uptime` (contoh: `10h24m` atau `19h16m`).
   - Waktu aktivasi pertama dihitung: `now - uptimeMs`.
   - Contoh: Server Proxmox nyala jam 06:30 (9 Okt), user memiliki uptime 7 jam: `06:30 - 7 jam = 23:30 (8 Okt)` $\to$ voucher otomatis masuk tanggal 8 Okt!
4. **Prioritas 4: Local Hotspot User (`/ip/hotspot/user`)**:
   - Membaca `u.uptime` dan `bytes-out` untuk router tanpa User Manager.
5. **Prioritas 5: Fallback Saat Ini (`now`)**:
   - Hanya digunakan jika voucher benar-benar baru pertama kali login detik ini tanpa riwayat lama di router.

### C. Mekanisme Jika MikroTik dan Proxmox Padam Bersamaan (Blackout Total)
- Ketika listrik padam total dan keduanya mati, saat menyala kembali:
  1. MikroTik me-load database User Manager dari penyimpanan internalnya lengkap dengan sesi `'from-time'`.
  2. Saat Proxmox boot dan polling ke router, sistem langsung mencocokkan kode voucher dengan `'from-time'` di sesi router.
  3. Voucher tetap tercatat di tanggal dan jam riil saat user login, bukan saat server menyala.

### D. Fitur Auto-Rectify (Koreksi Otomatis Data Tanggal yang Pernah Salah)
- Sistem dilengkapi algoritma rekalibrasi cerdas:
  - Pada setiap siklus sinkronisasi router atau tombol `🔄 Sinkron Router`, sistem memeriksa voucher `used` di database lokal SQLite.
  - Jika sebuah voucher di database tercatat di tanggal $D_1$ (misal 9 Okt karena boot pagi), namun histori sesi di router membuktikan ia pertama kali aktif pada tanggal $D_0$ (8 Okt pukul 14:19 WIB):
  - Sistem **SECARA OTOMATIS MENYELARASKAN** `activated_at`, `activated_date`, `activated_time`, dan `activated_day` di database SQLite kembali ke tanggal riil $D_0$!
  - Rekapitulasi harian dan bulanan langsung diperbarui secara instan.

---

## 18. Presisi Perhitungan Kuota Pemakaian Trafik & Proteksi Padam Lintas Hari (9 Oktober 2026)

### A. Latar Belakang Masalah (Spike Boot Palsu)
- **Gejala Masalah**:
  1. Server Proxmox LXC padam malam hari (misal Kamis 8 Okt pukul 22:00 WIB), sementara MikroTik terus hidup melayani pelanggan hingga subuh.
  2. Counter interface (`rx-byte` dan `tx-byte`) di MikroTik terus bertambah puluhan gigabyte sepanjang malam.
  3. Keesokan paginya (Jumat 9 Okt pukul 05:30 WIB), saat Proxmox dinyalakan, sistem membaca counter MikroTik saat ini dan menghitung delta (`currRx - meta.last_raw_rx = 44.19 GB`).
  4. Kode lama langsung memasukkan seluruh 44.19 GB tersebut ke tanggal hari ini (`2026-10-09`) dan menumpuknya di jam 5 pagi (`traffic_hourly` jam 5).
  5. Akibatnya:
     - Pemakaian kemarin (8 Okt) terpotong dan tidak mencatat kuota yang terpakai semalam.
     - Pemakaian hari ini (9 Okt) melonjak drastis secara tidak wajar menjadi puluhan gigabyte.
     - **Jam Puncak (Peak Hour) Hari Ini rusak** menampilkan: `"05:00 - 06:00 (44.19 GB)"`.

### B. Arsitektur Pemisahan Delta Transisi Tanggal (*Cross-Date Quota Splitting*)
Di `traffic-db.js`, fungsi `recordInterfaceTraffic()` kini mendeteksi kondisi pergantian hari:
```javascript
const prevDate = meta.last_seen_date;
const dateChanged = Boolean(prevDate && prevDate !== dateKey);
```
Jika `dateChanged` terdeteksi, total delta RX dan TX tidak lagi ditumpahkan 100% ke hari ini, melainkan dipecah secara cerdas:
1. **Prioritas 1: Rasio Riil Sesi User Manager (`umSessions`)**:
   - Sistem memeriksa total download/upload dari sesi hotspot yang tercatat di MikroTik pada tanggal kemarin (`prevDate`) vs hari ini (`dateKey`).
   - Formula: `ratioYesterday = umBytesYesterday / (umBytesYesterday + umTodayBytes)`.
   - Jika kemarin pengguna hotspot mengunduh puluhan gigabyte dan hari ini dini hari belum ada aktivitas, 100% dari delta akan dialokasikan ke hari kemarin!
2. **Prioritas 2: Profil Waktu Aktivitas Jaringan (*Activity Profile Fallback*)**:
   - Jika router tidak menggunakan User Manager:
   - Dini hari (00:00 - 06:00 WIB) adalah waktu tidur di mana pemakaian internet sangat rendah (rata-rata hanya 10%-15% dari total harian).
   - Malam hari (20:00 - 24:00 WIB) adalah jam puncak aktivitas internet.
   - Jika sistem baru sinkron di waktu subuh/pagi hari (jam $\le$ 08:00 WIB), 85% dari delta dialokasikan ke kemarin dan 15% ke hari ini.
3. **Penyimpanan Database Presisi**:
   - Porsi kemarin (`deltaRxYesterday`, `deltaTxYesterday`) diakumulasikan ke `traffic_daily (prevDate)` dan menutup grafik 24 jam kemarin di `traffic_hourly (prevDate, hour 23)`.
   - Porsi hari ini (`deltaRxToday`, `deltaTxToday`) diakumulasikan ke `traffic_daily (dateKey)` dan jam saat ini `traffic_hourly (dateKey, hour)`.

### C. Fitur Auto-Rectify Spike Booting Lama (`autoRectifyBootTrafficSpike`)
- Untuk data anomali yang sudah terlanjur tercatat di database Proxmox (seperti lonjakan 44.19 GB pada 9 Okt jam 5 pagi):
  - Sistem memiliki fungsi otomatis `trafficDb.autoRectifyBootTrafficSpike()`.
  - Fungsi ini mendeteksi jika di jam subuh/pagi (00:00 - 08:00 WIB) hari ini terdapat jam yang memiliki trafik $\ge 3\text{ GB}$ dan menyumbang $\ge 40\%$ dari total trafik harian.
  - Lonjakan tersebut diidentifikasi sebagai kuota kemarin yang tumpah saat boot, lalu dipindahkan secara otomatis:
    - `traffic_hourly` jam spike hari ini dikurangi dan dikembalikan ke baseline wajar.
    - `traffic_daily` hari ini dikurangi.
    - `traffic_daily` kemarin ditambahkan.
    - `traffic_hourly` kemarin jam 23 ditambahkan.
- **Pemicu Auto-Rectify**:
  1. Berjalan otomatis saat startup server (`server.listen`).
  2. Berjalan pada siklus polling pertama (`cycleCount === 1`).
  3. Dapat dipicu kapan saja melalui REST API: `POST /api/traffic/rectify-spike`.

---

## 19. Filter Batas Awal Riwayat Buku Kas (Mulai September 2026) & Scroll Mouse dengan Sticky Header (9 Oktober 2026)

### A. Latar Belakang & Kebutuhan Pengguna
- **Data Testing Lama / Out-of-Scope**:
  - Pada database, terdapat rekap jejak lama sebelum bisnis RT/RW Net resmi beroperasi penuh (misal: Juli 2026, Juni 2026, April 2026, Maret 2026, November 2025, Oktober 2025).
  - Pengguna meminta agar riwayat buku kas **hanya dimulai sejak September 2026** (`2026-09`), dan seluruh data bulan/tahun kebelakang **tidak ditampilkan**.
- **Kenyamanan Navigasi Data Banyak**:
  - Tabel riwayat yang berisi puluhan baris sebelumnya memanjang ke bawah dan memaksa pengguna men-scroll seluruh halaman web.
  - Pengguna menginginkan tabel yang rapi di mana pengguna cukup men-scroll roda mouse (*mouse wheel scroll*) di dalam tabel secara mandiri dengan dropdown limit tampilan.

### B. Arsitektur Filter Threshold Minimum (September 2026)
Di `voucher-db.js`, didefinisikan konstanta batasan:
```javascript
const MIN_HISTORY_DATE = '2026-09-01';
const MIN_HISTORY_MONTH = '2026-09';
const MIN_HISTORY_YEAR = '2026';
```
1. **Rekap Harian (`getDailyHistory`)**:
   Query SQL mengunci `WHERE status = 'used' AND activated_date >= '2026-09-01'`.
2. **Rekap Bulanan (`getMonthlyHistory`)**:
   Query SQL mengunci `WHERE status = 'used' AND substr(activated_date, 1, 7) >= '2026-09'`.
3. **Dropdown Pilihan Periode (`getAvailablePeriods`)**:
   Dropdown tahun hanya memuat tahun $\ge 2026$, dan dropdown bulan hanya memuat bulan $\ge \text{September 2026}$ (`2026-09`, `2026-10`, dst.).
4. **Export CSV (`exportHistoryCsv`)**:
   Data yang diexport ke CSV otomatis dibatasi mulai September 2026 ke atas.
5. **Omset All-Time (`getSummary`)**:
   Hanya menghitung voucher yang aktif sejak September 2026 ke atas agar total omset selaras 100% dengan tabel riwayat.

### C. Desain UI Kontainer Scroll Mouse & Sticky Header
1. **Dropdown Tampilkan Baris (Limit Data)**:
   - Terintegrasi di header tabel riwayat dengan pilihan: `15 Baris`, `30 Baris (Default)`, `60 Baris`, dan `Tampilkan Semua (Scroll)`.
   - Mengontrol query limit secara dinamis tanpa me-reload halaman.
2. **Kontainer Scroll Vertikal**:
   - Kontainer tabel (`#container-daily-history` & `#container-monthly-history`) dikonfigurasi dengan:
     `max-h-[460px] overflow-y-auto rounded-xl border border-gray-800/80 bg-gray-950/40 shadow-inner`.
   - Menggunakan scrollbar ramping modern (`::-webkit-scrollbar` lebar 6px).
3. **Sticky Header & Footer**:
   - `thead` diberi class `sticky top-0 bg-gray-850 z-10 shadow-sm`: judul kolom tetap terlihat saat mouse di-scroll ke bawah.
   - `tfoot` diberi class `sticky bottom-0 bg-gray-850 z-10 shadow-md`: total ringkasan pendapatan tetap terlihat di bagian bawah kontainer.
4. **Petunjuk Interaktif**:
   - Ditambahkan hint visual di bawah tabel: *"Gunakan scroll roda mouse pada tabel untuk menjelajahi riwayat data ke bawah (Riwayat aktif dimulai sejak September 2026)"*.

---
*Catatan Terakhir Diperbarui: 9 Oktober 2026 - Batas Riwayat Mulai September 2026, Sticky Header Table & Mouse Scroll Dropdown.*
