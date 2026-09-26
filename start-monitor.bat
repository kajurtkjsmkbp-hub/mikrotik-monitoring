@echo off
title MikroTik Live Dashboard Monitor
cd /d "%~dp0"
echo =========================================================
echo       MIKROTIK LIVE REALTIME MONITORING DASHBOARD
echo =========================================================
echo IP MikroTik : 192.168.1.64 (Port 8728 API / 8291 Winbox)
echo.
echo Menjalankan Web Server di port 3000...
echo Buka browser di: http://localhost:3000
echo Atau via HP/jaringan: http://192.168.1.81:3000
echo.
node server.js
pause
