#!/bin/bash
# ==============================================================================
# SCRIPT UPDATE OTOMATIS MIKROTIK MONITORING DASHBOARD (PROXMOX LXC)
# Database SQLite (data/vouchers.sqlite) 100% AMAN dan TIDAK AKAN TERTIMPA!
# ==============================================================================

set -e

echo "=========================================================="
echo "  MEMULAI UPDATE MIKROTIK MONITORING DASHBOARD"
echo "=========================================================="

# 1. Tarik pembaruan kode dari GitHub
echo "[1/4] Menarik pembaruan kode terbaru dari GitHub..."
git pull

# 2. Update dependensi node jika ada paket baru
echo "[2/4] Memeriksa dependensi package.json..."
npm install --omit=dev

# 3. Pastikan folder data tetap ada
mkdir -p data

# 4. Restart proses aplikasi
echo "[3/4] Merestart service dashboard..."
if command -v pm2 &> /dev/null; then
    pm2 restart mikrotik-dashboard || pm2 restart server || pm2 start server.js --name mikrotik-dashboard
    echo "PM2 process restarted."
elif systemctl is-active --quiet mikrotik-dashboard.service 2>/dev/null; then
    systemctl restart mikrotik-dashboard.service
    echo "Systemd service restarted."
else
    echo "Catatan: PM2/Systemd tidak terdeteksi, silakan restart proses server secara manual."
fi

echo "=========================================================="
echo "  UPDATE BERHASIL! Database SQLite di Proxmox tetap aman."
echo "=========================================================="
