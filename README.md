# MikroTik Live Realtime Monitoring Dashboard & Hotspot Voucher Accounting

Dashboard web modern, elegan, responsif, dan realtime untuk memantau MikroTik RouterOS serta sistem manajemen voucher hotspot mandiri dengan database lokal SQLite.

---

## 🚀 Fitur Utama

1. **Executive Stats & Realtime Gauges**:
   - **Hotspot Active Users**: Jumlah pengguna aktif saat ini, lengkap dengan filter RADIUS / Voucher.
   - **DHCP Leases**: Status perangkat yang terhubung (Bound / Waiting / Dynamic / Static).
   - **PPPoE Active Sessions**: Sesi aktif pengguna PPPoE.
   - **Live Bandwidth Traffic**: Download (Rx) dan Upload (Tx) dalam satuan bps / Kbps / Mbps secara realtime.
   - **Router Health**: CPU Load %, Pemakaian RAM (MB & %), Arsitektur, Suhu/Frekuensi CPU, dan Uptime.

2. **Grafik Real-Time Bandwidth**:
   - Grafik interaktif (Chart.js) menampilkan grafik kecepatan Download (Cyan) dan Upload (Violet) setiap 1.5 - 2 detik.
   - Pilihan interface WAN/LAN (cth: `ether1-internet`, `ether2`, `bridge1`, dll.) dapat diganti langsung dari menu header.

3. **Inspeksi Aktivitas Pengguna (Website / Domain Resolver)**:
   - Tombol **Periksa** pada setiap user menampilkan situs/layanan apa yang sedang diakses (YouTube, TikTok, Facebook, Game, Google, dll.) menggunakan reverse IP & ASN lookup.

4. **Manajemen User (Hotspot, DHCP & PPPoE)**:
   - Pencarian instan (User, IP Address, MAC Address, Hostname).
   - Detail data: Uptime (lama online), Idle time, Download / Upload (KB/MB/GB), Login method.
   - **Tombol Kick / Disconnect**: Putuskan user tertentu langsung dari dashboard dengan 1 klik.
   - **Ekspor CSV**: Download daftar user aktif ke file Excel/CSV.

5. **Live Router Logs**:
   - Menampilkan log aktivitas router MikroTik langsung secara live (newest first).
   - Filter cepat berdasarkan topik: *Semua*, *Hotspot*, *DHCP*, *Login / Account*, *System*, *Warning & Error*.

6. **Tool Diagnostik Jaringan**:
   - **MikroTik Ping Tool**: Melakukan ping dari router ke IP target / domain (cth: 8.8.8.8) dan melihat latency RTT serta packet loss secara live.
   - **Notifikasi Audio Kasir**: Suara lonceng kasir 🔔 jika ada voucher baru yang diaktifkan pelanggan.

7. **🎫 Manajemen Voucher Hotspot & Rekap Omset Penjualan (Halaman Baru)**:
   - Halaman khusus terpisah di `/voucher.html` agar dashboard utama tetap bersih dan rapi.
   - **3 Kategori Paket Voucher**:
     - **Paket Rp 1.000** (Durasi: **3 Jam**)
     - **Paket Rp 2.000** (Durasi: **10 Jam**)
     - **Paket Rp 3.000** (Durasi: **1 Hari / 24 Jam**)
   - **Ekstraksi Otomatis Template Mikhmon**: Mendeteksi 16 kode username alfanumerik asli (6 karakter) dari file cetak `.html` Mikhmon dan mengabaikan kode tag HTML/CSS lainnya.
   - **Database SQLite Lokal** (`data/vouchers.sqlite`): Cepat, aman, andal, dan offline-first.
   - **First-Login Lock (Anti-Dobel Hitung)**:
     - Hanya menghitung saat login pertama kali.
     - Logout dan login kembali (re-login) **TIDAK** menambah omset atau memotong stok lagi.
   - **Auto-Catch Up Router Sync**:
     - Jika komputer server mati sementara router tetap hidup, saat server dinyalakan kembali, sistem otomatis menyinkronkan voucher yang aktif di router dan menghitung jam aktivasi sesuai uptime router.
   - **Rekap Buku Kas Harian**:
     - Periode hitung 00:00 - 23:59 per tanggal.
     - Tabel riwayat pendapatan per hari + Ekspor ke format CSV / Excel.

---

## 💻 Panduan Instalasi di LXC Proxmox (Debian / Ubuntu)

Panduan langkah demi langkah untuk menginstall aplikasi di dalam Container LXC Proxmox VE agar berjalan 24/7 di server.

### 1. Persiapan Container LXC di Proxmox
- Di Proxmox VE, buat CT baru dengan OS **Debian 12 (Bookworm)** atau **Ubuntu 22.04/24.04 LTS**.
- Rekomendasi Resource:
  - **Cores**: 1 atau 2 vCPU
  - **Memory (RAM)**: 512 MB - 1024 MB
  - **Storage**: 4 GB - 8 GB
  - **Network**: Bridge ke jaringan lokal (misal: `vmbr0`, DHCP / Static IP satu subnet dengan MikroTik).

### 2. Masuk ke Console / SSH LXC & Install Prasyarat
Masuk ke terminal root LXC:

```bash
# Update repository Linux
apt update && apt upgrade -y

# Install git, curl, build-essential (wajib untuk compile driver SQLite)
apt install -y git curl build-essential python3
```

### 3. Install Node.js (Versi 20 LTS atau 22 LTS)
```bash
# Tambahkan repo NodeSource Node.js LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -

# Install Node.js
apt install -y nodejs

# Verifikasi versi node dan npm
node -v
npm -v
```

### 4. Clone Repository & Setup Project
```bash
# Masuk ke direktori /opt
cd /opt

# Clone repository dari GitHub
git clone https://github.com/kajurtkjsmkbp-hub/mikrotik-monitoring.git

# Masuk ke folder project
cd mikrotik-monitoring

# Install dependensi Node.js
npm install --omit=dev

# Buat folder data untuk database SQLite
mkdir -p data
```

### 5. Konfigurasi Koneksi MikroTik (.env)
Salin template konfigurasi `.env.example` menjadi `.env`:

```bash
cp .env.example .env
nano .env
```

Sesuaikan parameter dengan router Anda:
```env
ROUTER_HOST=192.168.1.64
ROUTER_PORT=8728
ROUTER_USER=admin
ROUTER_PASS=farkhatin
PORT=3000
POLL_INTERVAL_MS=1500
DEFAULT_WAN_INTERFACE=ether1-internet
```
*(Tekan `CTRL + O`, lalu `Enter` untuk menyimpan, lalu `CTRL + X` untuk keluar)*.

### 6. Jalankan Otomatis 24/7 dengan PM2 (Rekomendasi)
Agar server tetap menyala terus-menerus dan otomatis hidup kembali saat LXC/Proxmox reboot:

```bash
# Install PM2 Process Manager secara global
npm install -g pm2

# Jalankan dashboard dengan PM2
pm2 start server.js --name mikrotik-dashboard

# Simpan konfigurasi PM2 agar autostart saat boot
pm2 save
pm2 startup
# (Jalankan baris perintah tambahan yang dimunculkan oleh pm2 startup jika ada)
```

Untuk melihat status atau log:
```bash
pm2 status
pm2 logs mikrotik-dashboard
```

Akses web browser di:
- **Dashboard Utama**: `http://<IP_LXC_PROXMOX>:3000`
- **Menu Voucher**: `http://<IP_LXC_PROXMOX>:3000/voucher.html`

---

## 🔄 Cara Update Kode Tanpa Merusak / Menimpa Database di Proxmox

Jika Anda melakukan perubahan/update kode di komputer lokal dan mem-push ke GitHub:
Database SQLite di Proxmox **TIDAK AKAN PERNAH TERTIMPA** karena:
1. File `data/*.sqlite*` sudah terdaftar di `.gitignore`.
2. Git tidak akan melacak atau menimpa database lokal yang sudah ada di Proxmox.

### Cara 1: Menggunakan Script Otomatis `update.sh`
Cukup jalankan satu perintah ini di dalam folder `/opt/mikrotik-monitoring` pada LXC Proxmox:

```bash
cd /opt/mikrotik-monitoring
chmod +x update.sh
./update.sh
```

### Cara 2: Perintah Manual Satu Baris
```bash
cd /opt/mikrotik-monitoring && git pull && npm install --omit=dev && pm2 restart mikrotik-dashboard
```

**Hasilnya**:
- Kode frontend dan backend otomatis diperbarui ke versi terbaru.
- Database voucher (`data/vouchers.sqlite`) dan konfigurasi password (`.env`) **tetap 100% aman dan utuh**.

---

## 📜 Lisensi & Catatan
Dikembangkan untuk monitoring jaringan MikroTik RouterOS & pembukuan voucher hotspot RT/RW Net.
