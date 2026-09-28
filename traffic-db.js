const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'traffic.sqlite');

process.env.TZ = process.env.TZ || 'Asia/Jakarta';
const APP_TIMEZONE = process.env.APP_TIMEZONE || 'Asia/Jakarta';

const INDO_DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const INDO_MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

function getJakartaParts(dateObj = new Date()) {
    const d = (dateObj instanceof Date && !isNaN(dateObj.getTime())) ? dateObj : new Date();
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: APP_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
    const parts = formatter.formatToParts(d);
    const m = {};
    parts.forEach(p => m[p.type] = p.value);

    const dayFormatter = new Intl.DateTimeFormat('id-ID', {
        timeZone: APP_TIMEZONE,
        weekday: 'long'
    });
    const dayName = dayFormatter.format(d);

    const monthFormatter = new Intl.DateTimeFormat('id-ID', {
        timeZone: APP_TIMEZONE,
        month: 'long'
    });
    const monthName = monthFormatter.format(d);

    return {
        year: m.year,
        month: m.month,
        day: m.day,
        hour: parseInt(m.hour, 10),
        minute: parseInt(m.minute, 10),
        second: parseInt(m.second, 10),
        dateKey: `${m.year}-${m.month}-${m.day}`,
        monthKey: `${m.year}-${m.month}`,
        timeStr: `${m.hour}:${m.minute}:${m.second}`,
        dayName: dayName,
        monthName: monthName,
        indoMonthString: `${monthName} ${m.year}`,
        indoDateString: `${dayName}, ${parseInt(m.day, 10)} ${monthName} ${m.year}`
    };
}

function formatBytes(bytes) {
    if (!bytes || isNaN(bytes) || bytes <= 0) return '0 B';
    const b = Number(bytes);
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const i = Math.floor(Math.log(b) / Math.log(k));
    return (b / Math.pow(k, i)).toFixed(2) + ' ' + sizes[i];
}

class TrafficDatabase {
    constructor() {
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
        }
        this.db = new sqlite3.Database(DB_PATH, (err) => {
            if (err) {
                console.error('[Traffic DB] Error opening SQLite database:', err.message);
            } else {
                console.log(`[Traffic DB] Connected to traffic accounting SQLite database at ${DB_PATH}`);
            }
        });

        this.metaMemoryCache = new Map();
        this.initPromise = this.init();
    }

    async init() {
        await this.runQuery(`PRAGMA journal_mode = WAL;`);
        await this.runQuery(`PRAGMA synchronous = NORMAL;`);

        // Metadata interface: Menyimpan pembacaan raw terakhir & uptime untuk kalkulasi delta dan deteksi reboot
        await this.runQuery(`
            CREATE TABLE IF NOT EXISTS traffic_meta (
                interface TEXT PRIMARY KEY,
                last_raw_rx INTEGER DEFAULT 0,
                last_raw_tx INTEGER DEFAULT 0,
                last_uptime_sec INTEGER DEFAULT 0,
                last_seen_date TEXT,
                updated_at TEXT
            )
        `);

        // Rangkuman Akumulasi Harian per Interface
        await this.runQuery(`
            CREATE TABLE IF NOT EXISTS traffic_daily (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                interface TEXT NOT NULL,
                date TEXT NOT NULL,
                rx_bytes INTEGER DEFAULT 0,
                tx_bytes INTEGER DEFAULT 0,
                total_bytes INTEGER DEFAULT 0,
                reboot_count INTEGER DEFAULT 0,
                updated_at TEXT,
                UNIQUE(interface, date)
            )
        `);

        // Rangkuman Akumulasi per Jam untuk Grafik 24 Jam & Peak Hour
        await this.runQuery(`
            CREATE TABLE IF NOT EXISTS traffic_hourly (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                interface TEXT NOT NULL,
                date TEXT NOT NULL,
                hour INTEGER NOT NULL,
                rx_bytes INTEGER DEFAULT 0,
                tx_bytes INTEGER DEFAULT 0,
                total_bytes INTEGER DEFAULT 0,
                updated_at TEXT,
                UNIQUE(interface, date, hour)
            )
        `);

        // Indeks untuk performa tinggi
        await this.runQuery(`CREATE INDEX IF NOT EXISTS idx_traffic_daily_iface_date ON traffic_daily(interface, date);`);
        await this.runQuery(`CREATE INDEX IF NOT EXISTS idx_traffic_hourly_iface_date ON traffic_hourly(interface, date, hour);`);

        // Pengaturan Kuota ISP (FUP) & Biaya Langganan Bulanan
        await this.runQuery(`
            CREATE TABLE IF NOT EXISTS traffic_settings (
                key TEXT PRIMARY KEY,
                value TEXT
            )
        `);
        await this.runQuery(`INSERT OR IGNORE INTO traffic_settings (key, value) VALUES ('isp_fup_gb', '1000')`);
        await this.runQuery(`INSERT OR IGNORE INTO traffic_settings (key, value) VALUES ('isp_monthly_cost', '350000')`);
        await this.runQuery(`INSERT OR IGNORE INTO traffic_settings (key, value) VALUES ('isp_name', 'Paket Internet ISP')`);

        // Muat metadata yang sudah ada ke memory cache
        try {
            const rows = await this.allQuery(`SELECT * FROM traffic_meta`);
            rows.forEach(r => {
                this.metaMemoryCache.set(r.interface, {
                    last_raw_rx: Number(r.last_raw_rx) || 0,
                    last_raw_tx: Number(r.last_raw_tx) || 0,
                    last_uptime_sec: Number(r.last_uptime_sec) || 0,
                    last_seen_date: r.last_seen_date || null
                });
            });
            console.log(`[Traffic DB] Loaded metadata for ${rows.length} interfaces.`);
        } catch (e) {
            console.error('[Traffic DB] Failed to load meta cache:', e.message);
        }
    }

    runQuery(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.run(sql, params, function (err) {
                if (err) reject(err);
                else resolve(this);
            });
        });
    }

    getQuery(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.get(sql, params, (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }

    allQuery(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.all(sql, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });
    }

    /**
     * Engine Rekam Trafik Utama (Dengan Deteksi Reboot MikroTik & Listrik Padam)
     * @param {string} ifaceName Nama interface, misal 'ether1-internet'
     * @param {number|string} rawRxBytes Counter rx-byte saat ini dari MikroTik
     * @param {number|string} rawTxBytes Counter tx-byte saat ini dari MikroTik
     * @param {number} uptimeSec Router uptime dalam detik
     */
    async recordInterfaceTraffic(ifaceName, rawRxBytes, rawTxBytes, uptimeSec = 0) {
        await this.initPromise;
        if (!ifaceName || ifaceName === 'undefined') return;

        const currRx = Number(rawRxBytes) || 0;
        const currTx = Number(rawTxBytes) || 0;
        const currUptime = Number(uptimeSec) || 0;

        const parts = getJakartaParts();
        const dateKey = parts.dateKey;
        const hour = parts.hour;
        const nowIso = new Date().toISOString();

        let meta = this.metaMemoryCache.get(ifaceName);

        // Jika interface baru pertama kali dipantau
        if (!meta) {
            meta = {
                last_raw_rx: currRx,
                last_raw_tx: currTx,
                last_uptime_sec: currUptime,
                last_seen_date: dateKey
            };
            this.metaMemoryCache.set(ifaceName, meta);

            await this.runQuery(`
                INSERT INTO traffic_meta (interface, last_raw_rx, last_raw_tx, last_uptime_sec, last_seen_date, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(interface) DO UPDATE SET
                    last_raw_rx = excluded.last_raw_rx,
                    last_raw_tx = excluded.last_raw_tx,
                    last_uptime_sec = excluded.last_uptime_sec,
                    last_seen_date = excluded.last_seen_date,
                    updated_at = excluded.updated_at
            `, [ifaceName, currRx, currTx, currUptime, dateKey, nowIso]);

            // Buat row hari ini jika belum ada
            await this.runQuery(`
                INSERT INTO traffic_daily (interface, date, rx_bytes, tx_bytes, total_bytes, reboot_count, updated_at)
                VALUES (?, ?, 0, 0, 0, 0, ?)
                ON CONFLICT(interface, date) DO NOTHING
            `, [ifaceName, dateKey, nowIso]);

            return;
        }

        // DETEKSI REBOOT / RESET COUNTER
        // Terjadi jika counter raw mengecil ATAU uptime router terdeteksi kembali ke awal (lebih kecil dari pembacaan sebelumnya)
        let deltaRx = 0;
        let deltaTx = 0;
        let rebootDetected = false;

        const counterDropped = (currRx < meta.last_raw_rx) || (currTx < meta.last_raw_tx);
        const uptimeReset = (currUptime > 0 && meta.last_uptime_sec > 0 && currUptime < (meta.last_uptime_sec - 10));

        if (counterDropped || uptimeReset) {
            rebootDetected = true;
            // Saat router reboot dari 0, seluruh byte yang ada saat ini adalah byte baru setelah router menyala!
            deltaRx = currRx;
            deltaTx = currTx;
            console.log(`[Traffic DB] ⚠️ Router Reboot/Listrik Mati terdeteksi pada interface "${ifaceName}"! Melanjutkan akumulasi: RX +${formatBytes(deltaRx)}, TX +${formatBytes(deltaTx)} (Uptime: ${currUptime}s, Prev: ${meta.last_uptime_sec}s)`);
        } else {
            // Kondisi normal tanpa reboot
            deltaRx = currRx - meta.last_raw_rx;
            deltaTx = currTx - meta.last_raw_tx;
        }

        // Sanitasi: delta tidak boleh minus
        deltaRx = Math.max(0, deltaRx);
        deltaTx = Math.max(0, deltaTx);
        const deltaTotal = deltaRx + deltaTx;
        const rebootIncrement = rebootDetected ? 1 : 0;

        // Perbarui metadata cache & database
        meta.last_raw_rx = currRx;
        meta.last_raw_tx = currTx;
        meta.last_uptime_sec = currUptime;
        meta.last_seen_date = dateKey;

        await this.runQuery(`
            INSERT INTO traffic_meta (interface, last_raw_rx, last_raw_tx, last_uptime_sec, last_seen_date, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(interface) DO UPDATE SET
                last_raw_rx = excluded.last_raw_rx,
                last_raw_tx = excluded.last_raw_tx,
                last_uptime_sec = excluded.last_uptime_sec,
                last_seen_date = excluded.last_seen_date,
                updated_at = excluded.updated_at
        `, [ifaceName, currRx, currTx, currUptime, dateKey, nowIso]);

        // Simpan akumulasi jika ada penambahan delta atau event reboot
        if (deltaTotal > 0 || rebootIncrement > 0) {
            // 1. Akumulasi Harian
            await this.runQuery(`
                INSERT INTO traffic_daily (interface, date, rx_bytes, tx_bytes, total_bytes, reboot_count, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(interface, date) DO UPDATE SET
                    rx_bytes = rx_bytes + excluded.rx_bytes,
                    tx_bytes = tx_bytes + excluded.tx_bytes,
                    total_bytes = total_bytes + excluded.total_bytes,
                    reboot_count = reboot_count + excluded.reboot_count,
                    updated_at = excluded.updated_at
            `, [ifaceName, dateKey, deltaRx, deltaTx, deltaTotal, rebootIncrement, nowIso]);

            // 2. Akumulasi per Jam
            await this.runQuery(`
                INSERT INTO traffic_hourly (interface, date, hour, rx_bytes, tx_bytes, total_bytes, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(interface, date, hour) DO UPDATE SET
                    rx_bytes = rx_bytes + excluded.rx_bytes,
                    tx_bytes = tx_bytes + excluded.tx_bytes,
                    total_bytes = total_bytes + excluded.total_bytes,
                    updated_at = excluded.updated_at
            `, [ifaceName, dateKey, hour, deltaRx, deltaTx, deltaTotal, nowIso]);
        }
    }

    /**
     * Mengambil Ringkasan KPI (Hari Ini, Minggu Ini, Bulan Ini, Tahun Ini)
     */
    async getSummary(ifaceName) {
        await this.initPromise;
        const targetIface = ifaceName || 'ether1-internet';
        const parts = getJakartaParts();
        const todayStr = parts.dateKey;
        const monthStr = parts.monthKey;
        const yearStr = parts.year;

        // Tanggal kemarin (Kemarin = Today - 1 hari)
        const yesterdayObj = new Date();
        yesterdayObj.setDate(yesterdayObj.getDate() - 1);
        const yesterdayStr = getJakartaParts(yesterdayObj).dateKey;

        // 1. Data Hari Ini
        const todayRow = await this.getQuery(`
            SELECT rx_bytes, tx_bytes, total_bytes, reboot_count, updated_at 
            FROM traffic_daily 
            WHERE interface = ? AND date = ?
        `, [targetIface, todayStr]) || { rx_bytes: 0, tx_bytes: 0, total_bytes: 0, reboot_count: 0 };

        // 2. Data Kemarin
        const yesterdayRow = await this.getQuery(`
            SELECT rx_bytes, tx_bytes, total_bytes, reboot_count 
            FROM traffic_daily 
            WHERE interface = ? AND date = ?
        `, [targetIface, yesterdayStr]) || { rx_bytes: 0, tx_bytes: 0, total_bytes: 0, reboot_count: 0 };

        // 3. Data Minggu Ini (7 Hari Terakhir)
        const weekRow = await this.getQuery(`
            SELECT SUM(rx_bytes) as rx, SUM(tx_bytes) as tx, SUM(total_bytes) as total, COUNT(DISTINCT date) as days
            FROM traffic_daily 
            WHERE interface = ? AND date >= date(?, '-6 days') AND date <= ?
        `, [targetIface, todayStr, todayStr]) || { rx: 0, tx: 0, total: 0, days: 0 };

        // 4. Data Bulan Ini (YYYY-MM)
        const monthRow = await this.getQuery(`
            SELECT SUM(rx_bytes) as rx, SUM(tx_bytes) as tx, SUM(total_bytes) as total, COUNT(DISTINCT date) as days
            FROM traffic_daily 
            WHERE interface = ? AND substr(date, 1, 7) = ?
        `, [targetIface, monthStr]) || { rx: 0, tx: 0, total: 0, days: 0 };

        // 5. Data Tahun Ini (YYYY)
        const yearRow = await this.getQuery(`
            SELECT SUM(rx_bytes) as rx, SUM(tx_bytes) as tx, SUM(total_bytes) as total, COUNT(DISTINCT date) as days
            FROM traffic_daily 
            WHERE interface = ? AND substr(date, 1, 4) = ?
        `, [targetIface, yearStr]) || { rx: 0, tx: 0, total: 0, days: 0 };

        // 6. Jam Tersibuk (Peak Hour) Hari Ini
        const peakRow = await this.getQuery(`
            SELECT hour, rx_bytes, tx_bytes, total_bytes
            FROM traffic_hourly
            WHERE interface = ? AND date = ? AND total_bytes > 0
            ORDER BY total_bytes DESC
            LIMIT 1
        `, [targetIface, todayStr]);

        let peakHourInfo = null;
        if (peakRow) {
            const h = peakRow.hour;
            const hStart = String(h).padStart(2, '0') + ':00';
            const hEnd = String((h + 1) % 24).padStart(2, '0') + ':00';
            peakHourInfo = {
                hour: h,
                label: `${hStart} - ${hEnd}`,
                rxFormatted: formatBytes(peakRow.rx_bytes),
                txFormatted: formatBytes(peakRow.tx_bytes),
                totalFormatted: formatBytes(peakRow.total_bytes),
                totalBytes: peakRow.total_bytes
            };
        }

        // 7. Data 24 Jam Hari Ini untuk Chart
        const hourlyRows = await this.allQuery(`
            SELECT hour, rx_bytes, tx_bytes, total_bytes
            FROM traffic_hourly
            WHERE interface = ? AND date = ?
            ORDER BY hour ASC
        `, [targetIface, todayStr]);

        const hourlyMap = new Map();
        hourlyRows.forEach(r => hourlyMap.set(r.hour, r));
        const hourly24 = [];
        for (let h = 0; h < 24; h++) {
            const item = hourlyMap.get(h) || { rx_bytes: 0, tx_bytes: 0, total_bytes: 0 };
            hourly24.push({
                hour: h,
                label: String(h).padStart(2, '0') + ':00',
                rxBytes: item.rx_bytes,
                txBytes: item.tx_bytes,
                totalBytes: item.total_bytes,
                rxFormatted: formatBytes(item.rx_bytes),
                txFormatted: formatBytes(item.tx_bytes),
                totalFormatted: formatBytes(item.total_bytes)
            });
        }

        // Hitung Rata-rata Harian Bulan Ini
        const monthDays = Math.max(1, monthRow.days || 1);
        const dailyAvgMonthBytes = Math.round((monthRow.total || 0) / monthDays);

        // Pengaturan & Kalkulasi FUP ISP serta Modal Bandwidth
        const ispSettings = await this.getIspSettings();
        const totalMonthBytes = monthRow.total || 0;
        const totalMonthGb = totalMonthBytes / (1024 * 1024 * 1024);

        let fupPercent = 0;
        let fupRemainingGb = 0;
        let fupStatus = 'safe'; // 'safe' | 'warning' | 'critical'

        if (ispSettings.fupGb > 0) {
            fupPercent = Math.min(100, Math.round((totalMonthGb / ispSettings.fupGb) * 100));
            fupRemainingGb = Math.max(0, ispSettings.fupGb - totalMonthGb);
            if (fupPercent >= 90) fupStatus = 'critical';
            else if (fupPercent >= 75) fupStatus = 'warning';
        }

        const costPerGb = totalMonthGb > 0 ? Math.round(ispSettings.monthlyCost / totalMonthGb) : 0;

        return {
            interface: targetIface,
            date: todayStr,
            indoDate: parts.indoDateString,
            indoMonth: parts.indoMonthString,
            year: parts.year,
            today: {
                rxBytes: todayRow.rx_bytes || 0,
                txBytes: todayRow.tx_bytes || 0,
                totalBytes: todayRow.total_bytes || 0,
                rxFormatted: formatBytes(todayRow.rx_bytes || 0),
                txFormatted: formatBytes(todayRow.tx_bytes || 0),
                totalFormatted: formatBytes(todayRow.total_bytes || 0),
                rebootCount: todayRow.reboot_count || 0
            },
            yesterday: {
                rxBytes: yesterdayRow.rx_bytes || 0,
                txBytes: yesterdayRow.tx_bytes || 0,
                totalBytes: yesterdayRow.total_bytes || 0,
                rxFormatted: formatBytes(yesterdayRow.rx_bytes || 0),
                txFormatted: formatBytes(yesterdayRow.tx_bytes || 0),
                totalFormatted: formatBytes(yesterdayRow.total_bytes || 0),
                rebootCount: yesterdayRow.reboot_count || 0
            },
            thisWeek: {
                rxBytes: weekRow.rx || 0,
                txBytes: weekRow.tx || 0,
                totalBytes: weekRow.total || 0,
                daysActive: weekRow.days || 0,
                rxFormatted: formatBytes(weekRow.rx || 0),
                txFormatted: formatBytes(weekRow.tx || 0),
                totalFormatted: formatBytes(weekRow.total || 0)
            },
            thisMonth: {
                key: monthStr,
                name: parts.indoMonthString,
                rxBytes: monthRow.rx || 0,
                txBytes: monthRow.tx || 0,
                totalBytes: monthRow.total || 0,
                daysActive: monthRow.days || 0,
                rxFormatted: formatBytes(monthRow.rx || 0),
                txFormatted: formatBytes(monthRow.tx || 0),
                totalFormatted: formatBytes(monthRow.total || 0),
                dailyAvgFormatted: formatBytes(dailyAvgMonthBytes)
            },
            thisYear: {
                year: yearStr,
                rxBytes: yearRow.rx || 0,
                txBytes: yearRow.tx || 0,
                totalBytes: yearRow.total || 0,
                daysActive: yearRow.days || 0,
                rxFormatted: formatBytes(yearRow.rx || 0),
                txFormatted: formatBytes(yearRow.tx || 0),
                totalFormatted: formatBytes(yearRow.total || 0)
            },
            peakHour: peakHourInfo,
            hourly24: hourly24,
            isp: {
                name: ispSettings.ispName,
                fupGb: ispSettings.fupGb,
                fupUsedGb: parseFloat(totalMonthGb.toFixed(2)),
                fupRemainingGb: parseFloat(fupRemainingGb.toFixed(2)),
                fupPercent: fupPercent,
                fupStatus: fupStatus,
                monthlyCost: ispSettings.monthlyCost,
                monthlyCostFormatted: 'Rp ' + Number(ispSettings.monthlyCost).toLocaleString('id-ID'),
                costPerGbFormatted: costPerGb > 0 ? ('Rp ' + Number(costPerGb).toLocaleString('id-ID') + ' / GB') : 'Rp 0 / GB'
            }
        };
    }

    async getIspSettings() {
        await this.initPromise;
        const rows = await this.allQuery(`SELECT key, value FROM traffic_settings`);
        const map = {};
        rows.forEach(r => map[r.key] = r.value);
        return {
            fupGb: parseInt(map.isp_fup_gb || '1000', 10),
            monthlyCost: parseInt(map.isp_monthly_cost || '350000', 10),
            ispName: map.isp_name || 'Paket Internet ISP'
        };
    }

    async saveIspSettings({ fupGb, monthlyCost, ispName }) {
        await this.initPromise;
        const fup = Math.max(0, parseInt(fupGb, 10) || 0);
        const cost = Math.max(0, parseInt(monthlyCost, 10) || 0);
        const name = (ispName || 'Paket Internet ISP').trim();

        await this.runQuery(`INSERT INTO traffic_settings (key, value) VALUES ('isp_fup_gb', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [String(fup)]);
        await this.runQuery(`INSERT INTO traffic_settings (key, value) VALUES ('isp_monthly_cost', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [String(cost)]);
        await this.runQuery(`INSERT INTO traffic_settings (key, value) VALUES ('isp_name', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [name]);

        return { fupGb: fup, monthlyCost: cost, ispName: name };
    }

    /**
     * Riwayat Harian (Daily History)
     */
    async getDailyHistory({ ifaceName, month = null, limit = 60 }) {
        await this.initPromise;
        const targetIface = ifaceName || 'ether1-internet';

        let sql = `
            SELECT date, rx_bytes, tx_bytes, total_bytes, reboot_count, updated_at
            FROM traffic_daily
            WHERE interface = ?
        `;
        const params = [targetIface];

        if (month) {
            sql += ` AND substr(date, 1, 7) = ?`;
            params.push(month);
        }

        sql += ` ORDER BY date DESC LIMIT ?`;
        params.push(limit);

        const rows = await this.allQuery(sql, params);

        let totalRx = 0;
        let totalTx = 0;
        let grandTotal = 0;
        let totalReboots = 0;

        const items = rows.map(r => {
            totalRx += r.rx_bytes || 0;
            totalTx += r.tx_bytes || 0;
            grandTotal += r.total_bytes || 0;
            totalReboots += r.reboot_count || 0;

            const dateParts = r.date.split('-');
            const dObj = new Date(parseInt(dateParts[0], 10), parseInt(dateParts[1], 10) - 1, parseInt(dateParts[2], 10));
            const dayName = INDO_DAYS[dObj.getDay()] || 'Hari';
            const mName = INDO_MONTHS[parseInt(dateParts[1], 10) - 1] || '';
            const indoDate = `${dayName}, ${parseInt(dateParts[2], 10)} ${mName} ${dateParts[0]}`;

            return {
                date: r.date,
                dayName: dayName,
                indoDate: indoDate,
                rxBytes: r.rx_bytes,
                txBytes: r.tx_bytes,
                totalBytes: r.total_bytes,
                rxFormatted: formatBytes(r.rx_bytes),
                txFormatted: formatBytes(r.tx_bytes),
                totalFormatted: formatBytes(r.total_bytes),
                rebootCount: r.reboot_count,
                updatedAt: r.updated_at
            };
        });

        const activeDays = items.length;
        const avgDaily = activeDays > 0 ? Math.round(grandTotal / activeDays) : 0;

        return {
            interface: targetIface,
            monthFilter: month,
            items,
            summary: {
                totalDays: activeDays,
                totalRx,
                totalTx,
                grandTotal,
                totalReboots,
                totalRxFormatted: formatBytes(totalRx),
                totalTxFormatted: formatBytes(totalTx),
                grandTotalFormatted: formatBytes(grandTotal),
                avgDailyFormatted: formatBytes(avgDaily)
            }
        };
    }

    /**
     * Riwayat Mingguan (Weekly History)
     */
    async getWeeklyHistory({ ifaceName, limit = 20 }) {
        await this.initPromise;
        const targetIface = ifaceName || 'ether1-internet';

        // Mengelompokkan per minggu menggunakan strftime %Y-W%W
        const rows = await this.allQuery(`
            SELECT 
                strftime('%Y-W%W', date) as week_key,
                MIN(date) as min_date,
                MAX(date) as max_date,
                COUNT(DISTINCT date) as days_count,
                SUM(rx_bytes) as total_rx,
                SUM(tx_bytes) as total_tx,
                SUM(total_bytes) as total_vol,
                SUM(reboot_count) as reboots
            FROM traffic_daily
            WHERE interface = ?
            GROUP BY week_key
            ORDER BY week_key DESC
            LIMIT ?
        `, [targetIface, limit]);

        let allRx = 0;
        let allTx = 0;
        let allTotal = 0;

        const items = rows.map(r => {
            allRx += r.total_rx || 0;
            allTx += r.total_tx || 0;
            allTotal += r.total_vol || 0;

            const days = Math.max(1, r.days_count || 1);
            const avgDaily = Math.round((r.total_vol || 0) / days);

            // Buat label rentang tanggal yang mudah dipahami
            const minP = r.min_date.split('-');
            const maxP = r.max_date.split('-');
            const minMName = INDO_MONTHS[parseInt(minP[1], 10) - 1];
            const maxMName = INDO_MONTHS[parseInt(maxP[1], 10) - 1];

            let dateRangeStr = '';
            if (minP[1] === maxP[1] && minP[0] === maxP[0]) {
                dateRangeStr = `${parseInt(minP[2], 10)} - ${parseInt(maxP[2], 10)} ${maxMName} ${maxP[0]}`;
            } else {
                dateRangeStr = `${parseInt(minP[2], 10)} ${minMName} - ${parseInt(maxP[2], 10)} ${maxMName} ${maxP[0]}`;
            }

            const weekNum = r.week_key.split('-W')[1] || '';

            return {
                weekKey: r.week_key,
                weekNumber: parseInt(weekNum, 10),
                label: `Minggu ke-${parseInt(weekNum, 10)} (${dateRangeStr})`,
                minDate: r.min_date,
                maxDate: r.max_date,
                daysActive: r.days_count,
                rxBytes: r.total_rx,
                txBytes: r.total_tx,
                totalBytes: r.total_vol,
                rxFormatted: formatBytes(r.total_rx),
                txFormatted: formatBytes(r.total_tx),
                totalFormatted: formatBytes(r.total_vol),
                avgDailyFormatted: formatBytes(avgDaily),
                reboots: r.reboots
            };
        });

        return {
            interface: targetIface,
            items,
            summary: {
                totalWeeks: items.length,
                allRxFormatted: formatBytes(allRx),
                allTxFormatted: formatBytes(allTx),
                allTotalFormatted: formatBytes(allTotal)
            }
        };
    }

    /**
     * Riwayat Bulanan (Monthly History)
     */
    async getMonthlyHistory({ ifaceName, year = null, limit = 24 }) {
        await this.initPromise;
        const targetIface = ifaceName || 'ether1-internet';

        let sql = `
            SELECT 
                substr(date, 1, 7) as month_key,
                COUNT(DISTINCT date) as days_count,
                SUM(rx_bytes) as total_rx,
                SUM(tx_bytes) as total_tx,
                SUM(total_bytes) as total_vol,
                SUM(reboot_count) as reboots
            FROM traffic_daily
            WHERE interface = ?
        `;
        const params = [targetIface];

        if (year) {
            sql += ` AND substr(date, 1, 4) = ?`;
            params.push(year);
        }

        sql += ` GROUP BY month_key ORDER BY month_key DESC LIMIT ?`;
        params.push(limit);

        const rows = await this.allQuery(sql, params);

        let totalRx = 0;
        let totalTx = 0;
        let grandTotal = 0;
        let totalReboots = 0;

        const items = rows.map(r => {
            totalRx += r.total_rx || 0;
            totalTx += r.total_tx || 0;
            grandTotal += r.total_vol || 0;
            totalReboots += r.reboots || 0;

            const [y, m] = r.month_key.split('-');
            const mName = INDO_MONTHS[parseInt(m, 10) - 1] || 'Bulan';
            const days = Math.max(1, r.days_count || 1);
            const avgDaily = Math.round((r.total_vol || 0) / days);

            return {
                monthKey: r.month_key,
                year: y,
                monthName: `${mName} ${y}`,
                daysActive: r.days_count,
                rxBytes: r.total_rx,
                txBytes: r.total_tx,
                totalBytes: r.total_vol,
                rxFormatted: formatBytes(r.total_rx),
                txFormatted: formatBytes(r.total_tx),
                totalFormatted: formatBytes(r.total_vol),
                avgDailyFormatted: formatBytes(avgDaily),
                reboots: r.reboots
            };
        });

        return {
            interface: targetIface,
            yearFilter: year,
            items,
            summary: {
                totalMonths: items.length,
                totalRx,
                totalTx,
                grandTotal,
                totalReboots,
                totalRxFormatted: formatBytes(totalRx),
                totalTxFormatted: formatBytes(totalTx),
                grandTotalFormatted: formatBytes(grandTotal)
            }
        };
    }

    /**
     * Riwayat Tahunan (Yearly History)
     */
    async getYearlyHistory({ ifaceName }) {
        await this.initPromise;
        const targetIface = ifaceName || 'ether1-internet';

        const rows = await this.allQuery(`
            SELECT 
                substr(date, 1, 4) as year_key,
                COUNT(DISTINCT date) as days_count,
                SUM(rx_bytes) as total_rx,
                SUM(tx_bytes) as total_tx,
                SUM(total_bytes) as total_vol,
                SUM(reboot_count) as reboots
            FROM traffic_daily
            WHERE interface = ?
            GROUP BY year_key
            ORDER BY year_key DESC
        `, [targetIface]);

        let grandRx = 0;
        let grandTx = 0;
        let grandAll = 0;

        const items = rows.map(r => {
            grandRx += r.total_rx || 0;
            grandTx += r.total_tx || 0;
            grandAll += r.total_vol || 0;

            const days = Math.max(1, r.days_count || 1);
            const avgDaily = Math.round((r.total_vol || 0) / days);

            return {
                yearKey: r.year_key,
                label: `Tahun ${r.year_key}`,
                daysActive: r.days_count,
                rxBytes: r.total_rx,
                txBytes: r.total_tx,
                totalBytes: r.total_vol,
                rxFormatted: formatBytes(r.total_rx),
                txFormatted: formatBytes(r.total_tx),
                totalFormatted: formatBytes(r.total_vol),
                avgDailyFormatted: formatBytes(avgDaily),
                reboots: r.reboots
            };
        });

        return {
            interface: targetIface,
            items,
            summary: {
                totalYears: items.length,
                grandRxFormatted: formatBytes(grandRx),
                grandTxFormatted: formatBytes(grandTx),
                grandAllFormatted: formatBytes(grandAll)
            }
        };
    }

    /**
     * Mengambil daftar Tahun dan Bulan yang tersedia di database untuk Dropdown Filter
     */
    async getAvailablePeriods(ifaceName) {
        await this.initPromise;
        const targetIface = ifaceName || 'ether1-internet';

        const rows = await this.allQuery(`
            SELECT DISTINCT substr(date, 1, 7) as month_key, substr(date, 1, 4) as year_key
            FROM traffic_daily
            WHERE interface = ?
            ORDER BY month_key DESC
        `, [targetIface]);

        const yearsSet = new Set();
        const months = [];

        rows.forEach(r => {
            if (r.year_key) yearsSet.add(r.year_key);
            if (r.month_key) {
                const [y, m] = r.month_key.split('-');
                const mName = INDO_MONTHS[parseInt(m, 10) - 1] || 'Bulan';
                months.push({
                    key: r.month_key,
                    year: y,
                    label: `${mName} ${y}`
                });
            }
        });

        return {
            years: Array.from(yearsSet).sort().reverse(),
            months
        };
    }

    /**
     * Mengambil daftar Interface yang pernah tercatat di database
     */
    async getInterfacesList() {
        await this.initPromise;
        const rows = await this.allQuery(`
            SELECT DISTINCT interface FROM traffic_daily
            UNION
            SELECT DISTINCT interface FROM traffic_meta
        `);
        return rows.map(r => r.interface).filter(Boolean);
    }

    /**
     * Export data ke CSV
     */
    async exportCsv({ ifaceName, period = 'daily', month = null, year = null }) {
        await this.initPromise;
        const targetIface = ifaceName || 'ether1-internet';

        let csv = '\uFEFF'; // UTF-8 BOM untuk Excel

        if (period === 'daily') {
            const data = await this.getDailyHistory({ ifaceName: targetIface, month, limit: 1000 });
            csv += `LAPORAN PEMAKAIAN TRAFIK HARIAN - ${targetIface}\n`;
            csv += `Periode: ${month || 'Semua Waktu'}\n`;
            csv += `Total Download: ${data.summary.totalRxFormatted}; Total Upload: ${data.summary.totalTxFormatted}; Grand Total: ${data.summary.grandTotalFormatted}\n\n`;
            csv += `Tanggal,Hari,Download (Bytes),Download (Format),Upload (Bytes),Upload (Format),Total Volume (Bytes),Total (Format),Restart Router\n`;
            data.items.forEach(item => {
                csv += `"${item.date}","${item.dayName}",${item.rxBytes},"${item.rxFormatted}",${item.txBytes},"${item.txFormatted}",${item.totalBytes},"${item.totalFormatted}",${item.rebootCount}\n`;
            });
        } else if (period === 'weekly') {
            const data = await this.getWeeklyHistory({ ifaceName: targetIface, limit: 100 });
            csv += `LAPORAN PEMAKAIAN TRAFIK MINGGUAN - ${targetIface}\n\n`;
            csv += `Minggu,Rentang Tanggal,Hari Aktif,Download (Bytes),Download (Format),Upload (Bytes),Upload (Format),Total Volume (Bytes),Total (Format),Rata-rata/Hari\n`;
            data.items.forEach(item => {
                csv += `"${item.weekKey}","${item.label}",${item.daysActive},${item.rxBytes},"${item.rxFormatted}",${item.txBytes},"${item.txFormatted}",${item.totalBytes},"${item.totalFormatted}","${item.avgDailyFormatted}"\n`;
            });
        } else if (period === 'monthly') {
            const data = await this.getMonthlyHistory({ ifaceName: targetIface, year, limit: 100 });
            csv += `LAPORAN PEMAKAIAN TRAFIK BULANAN - ${targetIface}\n`;
            csv += `Tahun: ${year || 'Semua Tahun'}\n\n`;
            csv += `Bulan,Hari Aktif,Download (Bytes),Download (Format),Upload (Bytes),Upload (Format),Total Volume (Bytes),Total (Format),Rata-rata/Hari\n`;
            data.items.forEach(item => {
                csv += `"${item.monthName}",${item.daysActive},${item.rxBytes},"${item.rxFormatted}",${item.txBytes},"${item.txFormatted}",${item.totalBytes},"${item.totalFormatted}","${item.avgDailyFormatted}"\n`;
            });
        } else if (period === 'yearly') {
            const data = await this.getYearlyHistory({ ifaceName: targetIface });
            csv += `LAPORAN PEMAKAIAN TRAFIK TAHUNAN - ${targetIface}\n\n`;
            csv += `Tahun,Hari Aktif,Download (Bytes),Download (Format),Upload (Bytes),Upload (Format),Total Volume (Bytes),Total (Format),Rata-rata/Hari\n`;
            data.items.forEach(item => {
                csv += `"${item.label}",${item.daysActive},${item.rxBytes},"${item.rxFormatted}",${item.txBytes},"${item.txFormatted}",${item.totalBytes},"${item.totalFormatted}","${item.avgDailyFormatted}"\n`;
            });
        }

        return csv;
    }
}

const trafficDbInstance = new TrafficDatabase();
module.exports = trafficDbInstance;
