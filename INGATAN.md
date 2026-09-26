# DOKUMEN INGATAN & ARSITEKTUR SISTEM (INGATAN.md)
*Dokumen ini dibuat otomatis sebagai memori permanen proyek MikroTik Dashboard & Manajemen Voucher Hotspot.*
*Setiap kali AI atau pengembang memulai sesi baru, baca file ini untuk langsung memahami seluruh konteks tanpa kehilangan detail apa pun.*

---

## 1. Ringkasan & Tujuan Proyek
Proyek ini adalah sistem **Dashboard Monitoring MikroTik & Manajemen Voucher Hotspot Mandiri** (Offline-First) berbasis Web untuk jaringan Hotspot RT/RW Net / Kafe / Rumah.
- **Tujuan Utama**:
  1. Memonitor router MikroTik secara real-time (Traffic WAN, User Hotspot Aktif, DHCP Leases, PPP, Log Sistem, serta Inspeksi Situs/Website yang dibuka pengguna).
  2. Menyediakan **Halaman Khusus Manajemen Voucher** (`/voucher.html`) yang terpisah dan estetis agar tidak merusak tampilan dashboard utama.
  3. Mengimpor file template cetak voucher `.html` dari Mikhmon, menyimpan ke database **SQLite lokal**, mendeteksi aktivasi login pengguna di MikroTik secara real-time, dan mengalkulasi buku kas / omset pendapatan harian secara otomatis.

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
- **Periode Harian**: Pukul **00:00:00 s/d 23:59:59** waktu lokal.
- **Tabel Rekap Buku Kas** di `/voucher.html`:
  - Menampilkan riwayat per hari (contoh: *Sabtu, 26 September 2026*).
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

---
*Catatan Terakhir Diperbarui: 27 September 2026 - Dokumentasi lengkap dan diverifikasi pada repositori GitHub & environment Proxmox LXC.*
