const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'vouchers.sqlite');

const PACKAGES = {
    '1k': {
        key: '1k',
        name: 'Paket Rp 1.000',
        price: 1000,
        duration: '3 Jam',
        color: 'from-amber-500 to-amber-600',
        badgeColor: 'bg-amber-500/15 text-amber-300 border-amber-500/30'
    },
    '2k': {
        key: '2k',
        name: 'Paket Rp 2.000',
        price: 2000,
        duration: '10 Jam',
        color: 'from-cyan-500 to-blue-500',
        badgeColor: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30'
    },
    '3k': {
        key: '3k',
        name: 'Paket Rp 3.000',
        price: 3000,
        duration: '1 Hari',
        color: 'from-emerald-500 to-teal-500',
        badgeColor: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
    }
};

const INDO_DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const INDO_MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

function getIndoDateString(dateObj = new Date()) {
    const dayName = INDO_DAYS[dateObj.getDay()];
    const dateNum = dateObj.getDate();
    const monthName = INDO_MONTHS[dateObj.getMonth()];
    const year = dateObj.getFullYear();
    return `${dayName}, ${dateNum} ${monthName} ${year}`;
}

function getLocalDateKey(dateObj = new Date()) {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function getLocalTimeString(dateObj = new Date()) {
    const h = String(dateObj.getHours()).padStart(2, '0');
    const m = String(dateObj.getMinutes()).padStart(2, '0');
    const s = String(dateObj.getSeconds()).padStart(2, '0');
    return `${h}:${m}:${s}`;
}

// Parse MikroTik uptime string (e.g. 1w2d3h4m5s, 3h20m, 45s) into milliseconds
function parseMikrotikDuration(str = '') {
    if (!str || str === '0s') return 0;
    let totalMs = 0;
    const weeks = str.match(/(\d+)w/);
    const days = str.match(/(\d+)d/);
    const hours = str.match(/(\d+)h/);
    const mins = str.match(/(\d+)m/);
    const secs = str.match(/(\d+)s/);

    if (weeks) totalMs += parseInt(weeks[1], 10) * 7 * 24 * 60 * 60 * 1000;
    if (days) totalMs += parseInt(days[1], 10) * 24 * 60 * 60 * 1000;
    if (hours) totalMs += parseInt(hours[1], 10) * 60 * 60 * 1000;
    if (mins) totalMs += parseInt(mins[1], 10) * 60 * 1000;
    if (secs) totalMs += parseInt(secs[1], 10) * 1000;

    return totalMs;
}

class VoucherSQLiteDatabase {
    constructor() {
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
        }
        this.db = new sqlite3.Database(DB_PATH);
        this.init();
    }

    run(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.run(sql, params, function(err) {
                if (err) reject(err);
                else resolve(this);
            });
        });
    }

    get(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.get(sql, params, (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }

    all(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.all(sql, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });
    }

    init() {
        this.db.serialize(() => {
            this.db.run(`
                CREATE TABLE IF NOT EXISTS vouchers (
                    id TEXT PRIMARY KEY,
                    code TEXT UNIQUE NOT NULL,
                    package_key TEXT NOT NULL,
                    package_name TEXT NOT NULL,
                    price INTEGER NOT NULL,
                    duration TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'available',
                    source TEXT,
                    imported_at TEXT NOT NULL,
                    activated_at TEXT,
                    activated_date TEXT,
                    activated_time TEXT,
                    activated_day TEXT,
                    user_address TEXT,
                    user_mac TEXT,
                    active_now INTEGER DEFAULT 0
                )
            `);

            this.db.run(`CREATE INDEX IF NOT EXISTS idx_vouchers_code ON vouchers(code)`);
            this.db.run(`CREATE INDEX IF NOT EXISTS idx_vouchers_status ON vouchers(status)`);
            this.db.run(`CREATE INDEX IF NOT EXISTS idx_vouchers_date ON vouchers(activated_date)`);
            this.db.run(`CREATE INDEX IF NOT EXISTS idx_vouchers_pkg ON vouchers(package_key)`);

            console.log(`[SQLite VoucherDB] Connected and table verified at: ${DB_PATH}`);
        });
    }

    // EXTRACTION ENGINE SPECIFICALLY TARGETING VOUCHER USERNAMES (6-CHARACTERS AS IN IMAGE)
    // Matches Mikhmon templates directly under the "Username" column (e.g. 6b5txh, q5wvxc, c9v9iy, etc.)
    extractVouchers(inputString) {
        if (!inputString || typeof inputString !== 'string') return [];
        const found = [];
        const seen = new Set();

        // 1. Primary Precision Parser: Match Mikhmon table structure
        // Finds table row with "Username", then captures the FIRST <td> in the very next row!
        const mikhmonUserRegex = /<tr[^>]*>\s*<td[^>]*>\s*Username\s*<\/td>[\s\S]*?<\/tr>\s*<tr[^>]*>\s*<td[^>]*>([\s\S]*?)<\/td>/gi;
        let match;
        while ((match = mikhmonUserRegex.exec(inputString)) !== null) {
            const clean = match[1].replace(/<[^>]+>/g, '').trim().toLowerCase();
            // Validate code (typically 4-10 characters, strictly letters and digits like 6b5txh)
            if (/^[a-zA-Z0-9]{3,12}$/.test(clean)) {
                if (!seen.has(clean)) {
                    seen.add(clean);
                    found.push(clean);
                }
            }
        }

        // 2. Secondary: If template uses class="user" or id="user"
        if (found.length === 0) {
            const classUserRegex = /<(?:td|span|div|b)[^>]*class=["'][^"']*\buser(?:name)?\b[^"']*["'][^>]*>([\s\S]*?)<\/(?:td|span|div|b)>/gi;
            while ((match = classUserRegex.exec(inputString)) !== null) {
                const clean = match[1].replace(/<[^>]+>/g, '').trim().toLowerCase();
                if (/^[a-zA-Z0-9]{3,12}$/.test(clean) && clean !== 'username' && clean !== 'user') {
                    if (!seen.has(clean)) {
                        seen.add(clean);
                        found.push(clean);
                    }
                }
            }
        }

        // 3. Fallback: Plain text / pasted codes (one code per line)
        if (found.length === 0) {
            const lines = inputString.split(/[\r\n]+/);
            for (const line of lines) {
                const clean = line.replace(/<[^>]+>/g, '').trim().toLowerCase();
                if (/^[a-zA-Z0-9]{4,10}$/.test(clean)) {
                    if (!['username', 'password', 'voucher', 'hotspot', 'profile', 'rupiah', 'unlimited'].includes(clean)) {
                        if (!seen.has(clean)) {
                            seen.add(clean);
                            found.push(clean);
                        }
                    }
                }
            }
        }

        return found;
    }

    // Import 6-character vouchers into SQLite database
    async importVouchers(packageKey, rawCodes, fileName = 'Upload HTML') {
        const pkg = PACKAGES[packageKey];
        if (!pkg) {
            throw new Error(`Kategori paket tidak valid: ${packageKey}`);
        }

        let codes = [];
        if (typeof rawCodes === 'string') {
            codes = this.extractVouchers(rawCodes);
        } else if (Array.isArray(rawCodes)) {
            codes = rawCodes.map(c => String(c).trim().toLowerCase()).filter(c => /^[a-zA-Z0-9]{6}$/.test(c));
        }

        if (codes.length === 0) {
            return {
                package: pkg,
                totalParsed: 0,
                addedCount: 0,
                duplicateCount: 0,
                addedCodes: [],
                duplicates: []
            };
        }

        const now = new Date();
        const importIso = now.toISOString();
        const addedCodes = [];
        const duplicates = [];

        for (const code of codes) {
            const cleanCode = code.trim().toLowerCase();
            const id = 'vc_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);

            try {
                const res = await this.run(`
                    INSERT INTO vouchers (
                        id, code, package_key, package_name, price, duration, status, source, imported_at, active_now
                    ) VALUES (?, ?, ?, ?, ?, ?, 'available', ?, ?, 0)
                `, [
                    id, cleanCode, pkg.key, pkg.name, pkg.price, pkg.duration, fileName, importIso
                ]);

                if (res.changes > 0) {
                    addedCodes.push(cleanCode);
                }
            } catch (err) {
                if (err.message && err.message.includes('UNIQUE constraint failed')) {
                    duplicates.push(cleanCode);
                } else {
                    console.error('SQLite insert error:', err.message);
                }
            }
        }

        return {
            package: pkg,
            totalParsed: codes.length,
            addedCount: addedCodes.length,
            duplicateCount: duplicates.length,
            addedCodes,
            duplicates: duplicates.slice(0, 50)
        };
    }

    // Check MikroTik active users against SQLite and activate matching vouchers
    async checkAndActivateUsers(activeHotspotUsers = []) {
        if (!Array.isArray(activeHotspotUsers) || activeHotspotUsers.length === 0) {
            await this.run(`UPDATE vouchers SET active_now = 0 WHERE active_now = 1`);
            return [];
        }

        const now = new Date();
        const localDate = getLocalDateKey(now);
        const localTime = getLocalTimeString(now);
        const dayName = INDO_DAYS[now.getDay()];

        const activeUsersMap = new Map();
        for (const u of activeHotspotUsers) {
            if (u.user) {
                activeUsersMap.set(u.user.toLowerCase().trim(), u);
            }
        }

        const activeCodes = Array.from(activeUsersMap.keys());
        const activatedNow = [];

        // 1. Mark active_now for all currently online users
        await this.run(`UPDATE vouchers SET active_now = 0`);

        for (const code of activeCodes) {
            const row = await this.get(`SELECT * FROM vouchers WHERE lower(code) = lower(?)`, [code]);
            if (row) {
                const userObj = activeUsersMap.get(code);

                // If currently available (not yet used), ACTIVATE IT!
                if (row.status === 'available') {
                    await this.run(`
                        UPDATE vouchers SET
                            status = 'used',
                            activated_at = ?,
                            activated_date = ?,
                            activated_time = ?,
                            activated_day = ?,
                            user_address = ?,
                            user_mac = ?,
                            active_now = 1
                        WHERE id = ?
                    `, [
                        now.toISOString(), localDate, localTime, dayName,
                        userObj.address || '-', userObj.macAddress || '-',
                        row.id
                    ]);

                    activatedNow.push({
                        id: row.id,
                        code: row.code,
                        package: row.package_key,
                        packageName: row.package_name,
                        price: row.price,
                        duration: row.duration,
                        status: 'used',
                        activatedAt: now.toISOString(),
                        activatedDate: localDate,
                        activatedTime: localTime,
                        activatedDayName: dayName,
                        userAddress: userObj.address || '-',
                        userMac: userObj.macAddress || '-',
                        formattedRevenue: `Rp ${row.price.toLocaleString('id-ID')}`
                    });
                } else {
                    // Update active_now flag and IP/MAC
                    await this.run(`
                        UPDATE vouchers SET 
                            active_now = 1,
                            user_address = ?,
                            user_mac = ?
                        WHERE id = ?
                    `, [userObj.address || '-', userObj.macAddress || '-', row.id]);
                }
            }
        }

        return activatedNow;
    }

    // Sync with router hotspot users list (/ip/hotspot/user/print)
    async syncWithRouterHotspotUsers(routerHotspotUsers = []) {
        if (!Array.isArray(routerHotspotUsers) || routerHotspotUsers.length === 0) return 0;
        let syncedCount = 0;
        const now = new Date();
        const localDate = getLocalDateKey(now);
        const localTime = getLocalTimeString(now);
        const dayName = INDO_DAYS[now.getDay()];

        for (const rUser of routerHotspotUsers) {
            const name = (rUser.name || '').toLowerCase().trim();
            const uptime = rUser.uptime || '0s';
            const bytesOut = parseInt(rUser['bytes-out'] || '0', 10);
            const hasBeenUsed = uptime !== '0s' || bytesOut > 0;

            if (hasBeenUsed && name.length === 6) {
                const row = await this.get(`SELECT * FROM vouchers WHERE lower(code) = lower(?) AND status = 'available'`, [name]);
                if (row) {
                    // Calculate estimated activation timestamp from MikroTik uptime
                    const uptimeMs = parseMikrotikDuration(uptime);
                    const activationDateObj = uptimeMs > 0 ? new Date(now.getTime() - uptimeMs) : now;
                    const actIso = activationDateObj.toISOString();
                    const actDate = getLocalDateKey(activationDateObj);
                    const actTime = getLocalTimeString(activationDateObj);
                    const actDay = INDO_DAYS[activationDateObj.getDay()];

                    await this.run(`
                        UPDATE vouchers SET
                            status = 'used',
                            activated_at = ?,
                            activated_date = ?,
                            activated_time = ?,
                            activated_day = ?
                        WHERE id = ?
                    `, [actIso, actDate, actTime, actDay, row.id]);
                    syncedCount++;
                }
            }
        }

        return syncedCount;
    }

    // Get Overall & Today's Revenue Summary from SQLite
    async getSummary() {
        const todayDateKey = getLocalDateKey(new Date());

        const summary = {
            todayDate: todayDateKey,
            todayLabel: getIndoDateString(new Date()),
            stock: {
                '1k': 0,
                '2k': 0,
                '3k': 0,
                total: 0
            },
            today: {
                count1k: 0,
                count2k: 0,
                count3k: 0,
                revenue1k: 0,
                revenue2k: 0,
                revenue3k: 0,
                totalCount: 0,
                totalRevenue: 0
            },
            allTime: {
                count1k: 0,
                count2k: 0,
                count3k: 0,
                revenue1k: 0,
                revenue2k: 0,
                revenue3k: 0,
                totalCount: 0,
                totalRevenue: 0
            }
        };

        // 1. Stock (Available)
        const stockRows = await this.all(`
            SELECT package_key, COUNT(*) as cnt 
            FROM vouchers 
            WHERE status = 'available' 
            GROUP BY package_key
        `);
        stockRows.forEach(r => {
            if (summary.stock[r.package_key] !== undefined) {
                summary.stock[r.package_key] = r.cnt;
                summary.stock.total += r.cnt;
            }
        });

        // 2. Today's Used (00:00 - 23:59)
        const todayRows = await this.all(`
            SELECT package_key, COUNT(*) as cnt, SUM(price) as rev 
            FROM vouchers 
            WHERE status = 'used' AND activated_date = ?
            GROUP BY package_key
        `, [todayDateKey]);

        todayRows.forEach(r => {
            const count = r.cnt || 0;
            const rev = r.rev || 0;
            if (r.package_key === '1k') {
                summary.today.count1k = count;
                summary.today.revenue1k = rev;
            } else if (r.package_key === '2k') {
                summary.today.count2k = count;
                summary.today.revenue2k = rev;
            } else if (r.package_key === '3k') {
                summary.today.count3k = count;
                summary.today.revenue3k = rev;
            }
            summary.today.totalCount += count;
            summary.today.totalRevenue += rev;
        });

        // 3. All-time Used
        const allTimeRows = await this.all(`
            SELECT package_key, COUNT(*) as cnt, SUM(price) as rev 
            FROM vouchers 
            WHERE status = 'used' 
            GROUP BY package_key
        `);

        allTimeRows.forEach(r => {
            const count = r.cnt || 0;
            const rev = r.rev || 0;
            if (r.package_key === '1k') {
                summary.allTime.count1k = count;
                summary.allTime.revenue1k = rev;
            } else if (r.package_key === '2k') {
                summary.allTime.count2k = count;
                summary.allTime.revenue2k = rev;
            } else if (r.package_key === '3k') {
                summary.allTime.count3k = count;
                summary.allTime.revenue3k = rev;
            }
            summary.allTime.totalCount += count;
            summary.allTime.totalRevenue += rev;
        });

        return summary;
    }

    // Get Daily Sales History (Rekap Omset Harian)
    async getDailyHistory(limit = 60) {
        const rows = await this.all(`
            SELECT 
                activated_date as dateKey,
                activated_day as dayName,
                SUM(CASE WHEN package_key = '1k' THEN 1 ELSE 0 END) as count1k,
                SUM(CASE WHEN package_key = '1k' THEN price ELSE 0 END) as revenue1k,
                SUM(CASE WHEN package_key = '2k' THEN 1 ELSE 0 END) as count2k,
                SUM(CASE WHEN package_key = '2k' THEN price ELSE 0 END) as revenue2k,
                SUM(CASE WHEN package_key = '3k' THEN 1 ELSE 0 END) as count3k,
                SUM(CASE WHEN package_key = '3k' THEN price ELSE 0 END) as revenue3k,
                COUNT(*) as totalCount,
                SUM(price) as totalRevenue
            FROM vouchers
            WHERE status = 'used' AND activated_date IS NOT NULL
            GROUP BY activated_date
            ORDER BY activated_date DESC
            LIMIT ?
        `, [limit]);

        return rows.map(r => {
            let formattedDate = r.dateKey;
            try {
                const [y, m, d] = r.dateKey.split('-').map(Number);
                formattedDate = getIndoDateString(new Date(y, m - 1, d));
            } catch (e) {}

            return {
                ...r,
                formattedDate
            };
        });
    }

    // Get filtered and paginated vouchers
    async getVouchers({ packageFilter, statusFilter, dateFilter, search, page = 1, limit = 50 }) {
        let whereClauses = [];
        let params = [];

        if (packageFilter && packageFilter !== 'all') {
            whereClauses.push(`package_key = ?`);
            params.push(packageFilter);
        }

        if (statusFilter && statusFilter !== 'all') {
            whereClauses.push(`status = ?`);
            params.push(statusFilter);
        }

        if (dateFilter) {
            whereClauses.push(`activated_date = ?`);
            params.push(dateFilter);
        }

        if (search) {
            whereClauses.push(`(code LIKE ? OR user_address LIKE ? OR user_mac LIKE ?)`);
            const q = `%${search.toLowerCase().trim()}%`;
            params.push(q, q, q);
        }

        const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

        // Count total
        const countRow = await this.get(`SELECT COUNT(*) as total FROM vouchers ${whereSql}`, params);
        const totalItems = countRow ? countRow.total : 0;
        const totalPages = Math.ceil(totalItems / limit) || 1;
        const offset = (page - 1) * limit;

        // Query items
        const items = await this.all(`
            SELECT 
                id, code, package_key as package, package_name as packageName,
                price, duration, status, source, imported_at as importedAt,
                activated_at as activatedAt, activated_date as activatedDate,
                activated_time as activatedTime, activated_day as activatedDayName,
                user_address as userAddress, user_mac as userMac,
                active_now as activeNow
            FROM vouchers 
            ${whereSql}
            ORDER BY active_now DESC, activated_at DESC, imported_at DESC
            LIMIT ? OFFSET ?
        `, [...params, limit, offset]);

        return {
            items,
            pagination: {
                page,
                limit,
                totalItems,
                totalPages
            }
        };
    }

    // Delete single or bulk vouchers
    async deleteVouchers(ids = []) {
        if (!Array.isArray(ids) || ids.length === 0) return 0;
        const placeholders = ids.map(() => '?').join(',');
        const res = await this.run(`DELETE FROM vouchers WHERE id IN (${placeholders})`, ids);
        return res.changes || 0;
    }

    // Clear unused stock for a package
    async clearPackageStock(packageKey) {
        const res = await this.run(`DELETE FROM vouchers WHERE package_key = ? AND status = 'available'`, [packageKey]);
        return res.changes || 0;
    }
}

module.exports = new VoucherSQLiteDatabase();
