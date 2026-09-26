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

## 2. Parameter Jaringan & Router MikroTik
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

## 3. Struktur File & Modul Kode

```
COBA/
├── server.js               # Backend utama Express, Socket.IO, Polling MikroTik API & REST API
├── mikrotik.js             # Client TCP Socket RouterOS API port 8728 (query, login, parse)
├── voucher-db.js           # Engine database SQLite, parser Mikhmon HTML, aktivasi user, rekap omset
├── test-relogin.js         # (File pengujian sementara, dapat dihapus/dibuat ulang bila perlu)
├── package.json            # Dependensi: express, socket.io, sqlite3, dotenv, lucide, dll.
├── .env                    # Variabel environment router & server
├── data/
│   ├── vouchers.sqlite     # Database SQLite utama penyimpan voucher & transaksi omset
│   └── vouchers.json       # (File lama sebelum migrasi SQLite, data aktif ada di .sqlite)
└── public/
    ├── index.html          # Tampilan Dashboard Utama (Traffic, Hotspot, PPP, DHCP, Log)
    ├── app.js              # Script frontend dashboard utama (interpolasi chart, polling, inspect)
    ├── voucher.html        # Halaman Khusus Manajemen Voucher & Buku Kas Harian
    └── voucher.js          # Script frontend voucher (drag & drop, audio alert, modal preview, socket)
```

---

## 4. Kategori Paket Voucher & Harga

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

## 5. Mesin Ekstraksi Kode Voucher Mikhmon (Sangat Penting!)
- **Format Username Voucher**: Berupa **6 karakter alfanumerik** kombinasi huruf dan angka (misal: `6b5txh`, `q5wvxc`, `c9v9iy`).
- **Tantangan Mikhmon**: File cetak HTML Mikhmon (seperti `template baru (8).html`) mengandung ratusan kata HTML & CSS bawaan (seperti `border`, `button`, `italic`, `table`) yang berpanjang 6 karakter.
- **Solusi Regex Presisi Tinggi**:
  Parser di backend (`voucher-db.js`) dan frontend preview (`public/voucher.js`) menggunakan regex khusus penangkap baris tabel tepat di bawah header `Username`:
  ```javascript
  /<tr[^>]*>\s*<td[^>]*>\s*Username\s*<\/td>[\s\S]*?<\/tr>\s*<tr[^>]*>\s*<td[^>]*>([\s\S]*?)<\/td>/gi
  ```
  - **Hasil**: File contoh `template baru (8).html` yang berisi 16 kartu voucher akan terdeteksi **tepat 16 kode username**, dan 100% mengabaikan seluruh tag HTML/CSS lainnya.

---

## 6. Aturan Bisnis & Siklus Hidup Voucher

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

## 7. Solusi Jika Server Mati Saat Pelanggan Login (Auto-Catch Up)
Jika komputer server web dimatikan (misal malam hari atau listrik padam), sementara router MikroTik tetap hidup 24 jam dan ada pelanggan yang login:

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

## 8. Pembukuan & Rekap Omset Harian
- **Periode Harian**: Pukul **00:00:00 s/d 23:59:59** waktu lokal.
- **Tabel Rekap Buku Kas** di `/voucher.html`:
  - Menampilkan riwayat per hari (contoh: *Sabtu, 26 September 2026*).
  - Kolom: Hari/Tanggal, Voucher 1K (Jumlah & Rp), Voucher 2K (Jumlah & Rp), Voucher 3K (Jumlah & Rp), Total Lembar, Total Omset (Rp).
  - Tombol **Rincian**: Klik untuk memfilter daftar voucher yang aktif pada tanggal tersebut.
  - Tombol **Export ke CSV**: Untuk mengunduh laporan pembukuan ke format file Excel/Spreadsheet.

---

## 9. Struktur Tabel SQLite (`data/vouchers.sqlite`)

```sql
CREATE TABLE IF NOT EXISTS vouchers (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,       -- Kode voucher 6 karakter (lowercase)
    package_key TEXT NOT NULL,       -- '1k', '2k', atau '3k'
    package_name TEXT NOT NULL,      -- 'Paket Rp 1.000', dll
    price INTEGER NOT NULL,          -- 1000, 2000, 3000
    duration TEXT NOT NULL,         -- '3 Jam', '10 Jam', '1 Hari'
    status TEXT NOT NULL DEFAULT 'available', -- 'available' atau 'used'
    source TEXT,                     -- Nama file cetak HTML asal impor
    imported_at TEXT NOT NULL,       -- Timestamp ISO impor
    activated_at TEXT,               -- Timestamp ISO login pertama
    activated_date TEXT,             -- Format 'YYYY-MM-DD'
    activated_time TEXT,             -- Format 'HH:MM:SS'
    activated_day TEXT,              -- Nama hari Indonesia ('Senin', 'Sabtu', dll)
    user_address TEXT,               -- IP address pelanggan saat login
    user_mac TEXT,                   -- MAC address perangkat pelanggan
    active_now INTEGER DEFAULT 0     -- 1 jika sedang online detik ini, 0 jika offline
);
```

---

## 10. Perintah Penting (Quick Commands)
- Menjalankan server:
  ```powershell
  node server.js
  ```
- Cek ringkasan database via CLI:
  ```powershell
  Invoke-RestMethod -Uri "http://localhost:3000/api/vouchers/summary" | ConvertTo-Json
  ```
- Membersihkan / reset testing:
  Gunakan fungsi internal `voucherDb` atau API endpoint `/api/vouchers/clear-stock`.

---
*Catatan Terakhir Diperbarui: 26 September 2026 - Semua modul telah diverifikasi, diuji coba nyata, dan berjalan stabil.*
