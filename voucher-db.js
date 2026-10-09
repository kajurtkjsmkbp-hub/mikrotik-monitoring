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
        hour: m.hour,
        minute: m.minute,
        second: m.second,
        dateKey: `${m.year}-${m.month}-${m.day}`,
        monthKey: `${m.year}-${m.month}`,
        timeStr: `${m.hour}:${m.minute}:${m.second}`,
        dayName: dayName,
        monthName: monthName,
        indoMonthString: `${monthName} ${m.year}`,
        indoDateString: `${dayName}, ${parseInt(m.day, 10)} ${monthName} ${m.year}`
    };
}

function getIndoDateString(dateObj = new Date()) {
    return getJakartaParts(dateObj).indoDateString;
}

function getLocalDateKey(dateObj = new Date()) {
    return getJakartaParts(dateObj).dateKey;
}

function getLocalTimeString(dateObj = new Date()) {
    return getJakartaParts(dateObj).timeStr;
}

function getLocalDayName(dateObj = new Date()) {
    return getJakartaParts(dateObj).dayName;
}

const MIKROTIK_MONTHS = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
};

// Parse MikroTik date string (e.g. 'oct/08/2026 23:25:58', 'oct/08/2026', 'jan/13/2023 00:13:10')
function parseMikrotikDateTime(str) {
    if (!str || typeof str !== 'string') return null;
    const s = str.trim();
    const match = s.match(/([a-zA-Z]{3})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{1,2}):(\d{1,2}))?/i);
    if (!match) return null;
    const mon = MIKROTIK_MONTHS[match[1].toLowerCase()];
    if (mon === undefined) return null;
    const day = parseInt(match[2], 10);
    const year = parseInt(match[3], 10);
    const h = match[4] ? parseInt(match[4], 10) : 0;
    const m = match[5] ? parseInt(match[5], 10) : 0;
    const sec = match[6] ? parseInt(match[6], 10) : 0;

    // Constructed in WIB (+07:00) as configured in MikroTik clock
    const isoString = `${year}-${String(mon + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}+07:00`;
    const dObj = new Date(isoString);
    return isNaN(dObj.getTime()) ? null : dObj;
}

// Parse MikroTik duration string (e.g. 1w2d3h4m5s, 19h16m22s, 3h20m, 45s, or colon 03:45:12, 1d03:45:12) into milliseconds
function parseMikrotikDuration(str = '') {
    if (!str || typeof str !== 'string' || str === '0s') return 0;
    const s = str.trim();
    let totalMs = 0;
    const weeks = s.match(/(\d+)\s*w/i);
    const days = s.match(/(\d+)\s*d(?![\d:])/i);
    const hours = s.match(/(\d+)\s*h/i);
    const mins = s.match(/(\d+)\s*m(?!s)/i);
    const secs = s.match(/(\d+)\s*s/i);

    if (weeks || days || hours || mins || secs) {
        if (weeks) totalMs += parseInt(weeks[1], 10) * 7 * 86400 * 1000;
        if (days) totalMs += parseInt(days[1], 10) * 86400 * 1000;
        if (hours) totalMs += parseInt(hours[1], 10) * 3600 * 1000;
        if (mins) totalMs += parseInt(mins[1], 10) * 60 * 1000;
        if (secs) totalMs += parseInt(secs[1], 10) * 1000;
        return totalMs;
    }

    // Colon format: [d] hh:mm:ss or [d]d hh:mm:ss
    const parts = s.split(':');
    if (parts.length === 3) {
        let d = 0;
        let h = parseInt(parts[0], 10) || 0;
        if (parts[0].includes('d')) {
            const dSplit = parts[0].split('d');
            d = parseInt(dSplit[0], 10) || 0;
            h = parseInt(dSplit[1], 10) || 0;
        }
        const m = parseInt(parts[1], 10) || 0;
        const sec = parseInt(parts[2], 10) || 0;
        return ((d * 86400) + (h * 3600) + (m * 60) + sec) * 1000;
    }

    return 0;
}

// Resolve true historical activation time for a voucher code
function resolveVoucherActivationTime(code, {
    activeUsersMap = new Map(),
    umSessionsMap = new Map(),
    umUsersMap = new Map(),
    localUsersMap = new Map(),
    now = new Date()
} = {}) {
    const cleanCode = (code || '').toLowerCase().trim();

    // 1. User Manager Sessions (Earliest recorded session in router flash storage)
    if (umSessionsMap && umSessionsMap.has(cleanCode)) {
        const sessEntry = umSessionsMap.get(cleanCode);
        if (sessEntry && sessEntry.dateObj) {
            return {
                dateObj: sessEntry.dateObj,
                source: 'um_session',
                ip: sessEntry.session ? sessEntry.session['user-ip'] : null,
                mac: sessEntry.session ? sessEntry.session['calling-station-id'] : null
            };
        }
    }

    // 2. User Manager User Record (last-seen minus uptime-used)
    if (umUsersMap && umUsersMap.has(cleanCode)) {
        const umUser = umUsersMap.get(cleanCode);
        const lastSeenDate = parseMikrotikDateTime(umUser['last-seen']);
        const uptimeUsedMs = parseMikrotikDuration(umUser['uptime-used']);
        if (lastSeenDate) {
            const firstAct = uptimeUsedMs > 0 ? new Date(lastSeenDate.getTime() - uptimeUsedMs) : lastSeenDate;
            return {
                dateObj: firstAct,
                source: 'um_user',
                ip: null,
                mac: null
            };
        }
    }

    // 3. Hotspot Active session uptime (now minus active uptime)
    if (activeUsersMap && activeUsersMap.has(cleanCode)) {
        const actUser = activeUsersMap.get(cleanCode);
        const uptimeMs = parseMikrotikDuration(actUser.uptime);
        if (uptimeMs > 0) {
            const firstAct = new Date(now.getTime() - uptimeMs);
            return {
                dateObj: firstAct,
                source: 'active_uptime',
                ip: actUser.address || actUser.user_address || null,
                mac: actUser.macAddress || actUser.mac || null
            };
        }
    }

    // 4. Local Hotspot User
    if (localUsersMap && localUsersMap.has(cleanCode)) {
        const locUser = localUsersMap.get(cleanCode);
        const uptimeMs = parseMikrotikDuration(locUser.uptime);
        if (uptimeMs > 0) {
            const firstAct = new Date(now.getTime() - uptimeMs);
            return {
                dateObj: firstAct,
                source: 'local_user',
                ip: null,
                mac: null
            };
        }
    }

    // 5. Fallback: current time
    return {
        dateObj: now,
        source: 'now',
        ip: null,
        mac: null
    };
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

            // Auto-align existing records to Jakarta timezone if activated_at is present
            this.db.all(`SELECT id, activated_at, activated_date, activated_time FROM vouchers WHERE status = 'used' AND activated_at IS NOT NULL`, [], (err, rows) => {
                if (!err && Array.isArray(rows) && rows.length > 0) {
                    rows.forEach(r => {
                        try {
                            const d = new Date(r.activated_at);
                            if (!isNaN(d.getTime())) {
                                const parts = getJakartaParts(d);
                                if (parts.timeStr !== r.activated_time || parts.dateKey !== r.activated_date) {
                                    this.db.run(`
                                        UPDATE vouchers SET
                                            activated_date = ?,
                                            activated_time = ?,
                                            activated_day = ?
                                        WHERE id = ?
                                    `, [parts.dateKey, parts.timeStr, parts.dayName, r.id]);
                                }
                            }
                        } catch (e) {}
                    });
                }
            });

            console.log(`[SQLite VoucherDB] Connected and table verified at: ${DB_PATH} (Timezone: ${APP_TIMEZONE})`);
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

        await this.run('BEGIN TRANSACTION');
        try {
            for (const code of codes) {
                const cleanCode = code.trim().toLowerCase();
                const id = 'vc_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);

                const res = await this.run(`
                    INSERT OR IGNORE INTO vouchers (
                        id, code, package_key, package_name, price, duration, status, source, imported_at, active_now
                    ) VALUES (?, ?, ?, ?, ?, ?, 'available', ?, ?, 0)
                `, [
                    id, cleanCode, pkg.key, pkg.name, pkg.price, pkg.duration, fileName, importIso
                ]);

                if (res.changes > 0) {
                    addedCodes.push(cleanCode);
                } else {
                    duplicates.push(cleanCode);
                }
            }
            await this.run('COMMIT');
        } catch (err) {
            await this.run('ROLLBACK');
            throw err;
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

    // Check MikroTik active users against SQLite and activate matching vouchers with historical accuracy
    async checkAndActivateUsers(activeHotspotUsers = [], options = {}) {
        if (!Array.isArray(activeHotspotUsers) || activeHotspotUsers.length === 0) {
            await this.run(`UPDATE vouchers SET active_now = 0 WHERE active_now = 1`);
            return [];
        }

        const now = new Date();
        const localDate = getLocalDateKey(now);
        const localTime = getLocalTimeString(now);
        const dayName = getLocalDayName(now);

        const activeUsersMap = new Map();
        for (const u of activeHotspotUsers) {
            if (u.user) {
                activeUsersMap.set(u.user.toLowerCase().trim(), u);
            }
        }

        // Build index of User Manager sessions if available
        const umSessionsMap = new Map();
        if (Array.isArray(options.umSessions)) {
            for (const s of options.umSessions) {
                const u = (s.user || '').toLowerCase().trim();
                const dt = parseMikrotikDateTime(s['from-time']);
                if (u && dt) {
                    if (!umSessionsMap.has(u) || dt.getTime() < umSessionsMap.get(u).dateObj.getTime()) {
                        umSessionsMap.set(u, { dateObj: dt, session: s });
                    }
                }
            }
        }

        // Build index of User Manager users if available
        const umUsersMap = new Map();
        if (Array.isArray(options.umUsers)) {
            for (const u of options.umUsers) {
                if (u && u.username) {
                    umUsersMap.set(u.username.toLowerCase().trim(), u);
                }
            }
        }

        // Build index of Local Hotspot users if available
        const localUsersMap = new Map();
        if (Array.isArray(options.localUsers)) {
            for (const u of options.localUsers) {
                if (u && u.name) {
                    localUsersMap.set(u.name.toLowerCase().trim(), u);
                }
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

                // Resolve true historical first activation time
                const actInfo = resolveVoucherActivationTime(code, {
                    activeUsersMap,
                    umSessionsMap,
                    umUsersMap,
                    localUsersMap,
                    now
                });
                const activationDateObj = actInfo.dateObj;
                const actIso = activationDateObj.toISOString();
                const actDate = getLocalDateKey(activationDateObj);
                const actTime = getLocalTimeString(activationDateObj);
                const actDay = getLocalDayName(activationDateObj);
                const userAddress = userObj.address || actInfo.ip || '-';
                const userMac = userObj.macAddress || actInfo.mac || '-';

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
                        actIso, actDate, actTime, actDay,
                        userAddress, userMac,
                        row.id
                    ]);

                    // Only emit live pop-up alert if activation date is TODAY
                    if (actDate === localDate) {
                        activatedNow.push({
                            id: row.id,
                            code: row.code,
                            package: row.package_key,
                            packageName: row.package_name,
                            price: row.price,
                            duration: row.duration,
                            status: 'used',
                            activatedAt: actIso,
                            activatedDate: actDate,
                            activatedTime: actTime,
                            activatedDayName: actDay,
                            userAddress,
                            userMac,
                            formattedRevenue: `Rp ${row.price.toLocaleString('id-ID')}`
                        });
                    } else {
                        console.log(`[Voucher Sync Historical] Voucher "${row.code}" diaktifkan pada tanggal histori ${actDate} ${actTime} (${actInfo.source}).`);
                    }
                } else {
                    // AUTO-RECTIFY: If already used but mistakenly recorded on today's date when router has earlier session
                    if (actInfo.source !== 'now' && actInfo.dateObj && row.activated_date !== actDate) {
                        console.log(`[Auto-Rectify Active] Menyelaraskan tanggal voucher "${row.code}": dari ${row.activated_date} menjadi ${actDate} (${actTime}).`);
                        await this.run(`
                            UPDATE vouchers SET
                                activated_at = ?,
                                activated_date = ?,
                                activated_time = ?,
                                activated_day = ?
                            WHERE id = ?
                        `, [actIso, actDate, actTime, actDay, row.id]);
                    }

                    // Update active_now flag and IP/MAC
                    await this.run(`
                        UPDATE vouchers SET 
                            active_now = 1,
                            user_address = ?,
                            user_mac = ?
                        WHERE id = ?
                    `, [userAddress, userMac, row.id]);
                }
            }
        }

        return activatedNow;
    }

    // Comprehensive sync with router history (User Manager Sessions, Users, and Hotspot Users)
    async syncWithRouterComprehensive({ activeUsers = [], umSessions = [], umUsers = [], routerUsers = [] } = {}) {
        let newlyActivated = 0;
        let rectifiedCount = 0;
        const now = new Date();

        // 1. Build Index Maps
        const activeUsersMap = new Map();
        if (Array.isArray(activeUsers)) {
            for (const u of activeUsers) {
                if (u.user) activeUsersMap.set(u.user.toLowerCase().trim(), u);
            }
        }

        const umSessionsMap = new Map();
        if (Array.isArray(umSessions)) {
            for (const s of umSessions) {
                const u = (s.user || '').toLowerCase().trim();
                const dt = parseMikrotikDateTime(s['from-time']);
                if (u && dt) {
                    if (!umSessionsMap.has(u) || dt.getTime() < umSessionsMap.get(u).dateObj.getTime()) {
                        umSessionsMap.set(u, { dateObj: dt, session: s });
                    }
                }
            }
        }

        const umUsersMap = new Map();
        if (Array.isArray(umUsers)) {
            for (const u of umUsers) {
                if (u && u.username) {
                    umUsersMap.set(u.username.toLowerCase().trim(), u);
                }
            }
        }

        const localUsersMap = new Map();
        if (Array.isArray(routerUsers)) {
            for (const u of routerUsers) {
                if (u && u.name) {
                    localUsersMap.set(u.name.toLowerCase().trim(), u);
                }
            }
        }

        // 2. Check all available vouchers in database
        const availableRows = await this.all(`SELECT * FROM vouchers WHERE status = 'available'`);
        for (const row of availableRows) {
            const code = row.code.toLowerCase().trim();
            const isOnline = activeUsersMap.has(code);
            const inSessions = umSessionsMap.has(code);
            const umUser = umUsersMap.get(code);
            const inUmUsed = umUser && (parseMikrotikDuration(umUser['uptime-used']) > 0 || parseInt(umUser['download-used'] || '0', 10) > 0);
            const locUser = localUsersMap.get(code);
            const inLocUsed = locUser && (locUser.uptime !== '0s' || parseInt(locUser['bytes-out'] || '0', 10) > 0);

            if (isOnline || inSessions || inUmUsed || inLocUsed) {
                const actInfo = resolveVoucherActivationTime(code, {
                    activeUsersMap,
                    umSessionsMap,
                    umUsersMap,
                    localUsersMap,
                    now
                });

                const actIso = actInfo.dateObj.toISOString();
                const actDate = getLocalDateKey(actInfo.dateObj);
                const actTime = getLocalTimeString(actInfo.dateObj);
                const actDay = getLocalDayName(actInfo.dateObj);

                const activeUserObj = activeUsersMap.get(code);
                const userAddress = (activeUserObj ? activeUserObj.address : null) || actInfo.ip || '-';
                const userMac = (activeUserObj ? activeUserObj.macAddress : null) || actInfo.mac || '-';

                await this.run(`
                    UPDATE vouchers SET
                        status = 'used',
                        activated_at = ?,
                        activated_date = ?,
                        activated_time = ?,
                        activated_day = ?,
                        user_address = ?,
                        user_mac = ?,
                        active_now = ?
                    WHERE id = ?
                `, [actIso, actDate, actTime, actDay, userAddress, userMac, isOnline ? 1 : 0, row.id]);

                newlyActivated++;
                console.log(`[Sync Router] Voucher "${row.code}" diaktifkan mundur ke tanggal histori: ${actDate} ${actTime} (${actInfo.source}).`);
            }
        }

        // 3. Auto-Rectify: Check recent used vouchers (recorded today or last 60 days) against earliest router session
        const recentUsed = await this.all(`SELECT * FROM vouchers WHERE status = 'used' AND activated_date IS NOT NULL ORDER BY activated_date DESC LIMIT 300`);
        for (const row of recentUsed) {
            const code = row.code.toLowerCase().trim();
            if (umSessionsMap.has(code)) {
                const sessData = umSessionsMap.get(code);
                if (sessData && sessData.dateObj) {
                    const trueDateKey = getLocalDateKey(sessData.dateObj);
                    const trueTimeStr = getLocalTimeString(sessData.dateObj);
                    const trueDayName = getLocalDayName(sessData.dateObj);
                    const trueIso = sessData.dateObj.toISOString();

                    if (row.activated_date !== trueDateKey) {
                        console.log(`[Auto-Rectify Comprehensive] Menyelaraskan voucher "${row.code}": ${row.activated_date} -> ${trueDateKey} (${trueTimeStr}).`);
                        await this.run(`
                            UPDATE vouchers SET
                                activated_at = ?,
                                activated_date = ?,
                                activated_time = ?,
                                activated_day = ?
                            WHERE id = ?
                        `, [trueIso, trueDateKey, trueTimeStr, trueDayName, row.id]);
                        rectifiedCount++;
                    }
                }
            }
        }

        return {
            newlyActivated,
            rectifiedCount
        };
    }

    // Sync with router hotspot users list (Backward Compatibility Wrapper)
    async syncWithRouterHotspotUsers(routerHotspotUsers = [], options = {}) {
        const res = await this.syncWithRouterComprehensive({
            routerUsers: routerHotspotUsers,
            umSessions: options.umSessions || [],
            umUsers: options.umUsers || [],
            activeUsers: options.activeUsers || []
        });
        return res.newlyActivated + res.rectifiedCount;
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

        // 3. This Month's Used
        const parts = getJakartaParts(new Date());
        const currentMonthKey = parts.monthKey;
        summary.thisMonth = {
            monthKey: currentMonthKey,
            monthName: parts.monthName,
            monthLabel: parts.indoMonthString,
            count1k: 0,
            revenue1k: 0,
            count2k: 0,
            revenue2k: 0,
            count3k: 0,
            revenue3k: 0,
            totalCount: 0,
            totalRevenue: 0
        };

        const monthRows = await this.all(`
            SELECT package_key, COUNT(*) as cnt, SUM(price) as rev 
            FROM vouchers 
            WHERE status = 'used' AND substr(activated_date, 1, 7) = ?
            GROUP BY package_key
        `, [currentMonthKey]);

        monthRows.forEach(r => {
            const count = r.cnt || 0;
            const rev = r.rev || 0;
            if (r.package_key === '1k') {
                summary.thisMonth.count1k = count;
                summary.thisMonth.revenue1k = rev;
            } else if (r.package_key === '2k') {
                summary.thisMonth.count2k = count;
                summary.thisMonth.revenue2k = rev;
            } else if (r.package_key === '3k') {
                summary.thisMonth.count3k = count;
                summary.thisMonth.revenue3k = rev;
            }
            summary.thisMonth.totalCount += count;
            summary.thisMonth.totalRevenue += rev;
        });

        // 4. All-time Used
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

        // Alias compatibility for total revenue
        summary.today.revenue = summary.today.totalRevenue;
        summary.thisMonth.revenue = summary.thisMonth.totalRevenue;
        summary.allTime.revenue = summary.allTime.totalRevenue;

        return summary;
    }

    // Get Daily Sales History (Rekap Omset Harian)
    async getDailyHistory(options = 60) {
        let limit = 60;
        let month = null;
        if (typeof options === 'object' && options !== null) {
            limit = parseInt(options.limit, 10) || 60;
            month = options.month || null;
        } else {
            limit = parseInt(options, 10) || 60;
        }

        let sql = `
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
        `;
        const params = [];
        if (month) {
            sql += ` AND substr(activated_date, 1, 7) = ? `;
            params.push(month);
        }
        sql += `
            GROUP BY activated_date
            ORDER BY activated_date DESC
            LIMIT ?
        `;
        params.push(limit);

        const rows = await this.all(sql, params);

        let totalPeriodRevenue = 0;
        let totalPeriodCount = 0;
        let totalPeriod1kCount = 0;
        let totalPeriod1kRevenue = 0;
        let totalPeriod2kCount = 0;
        let totalPeriod2kRevenue = 0;
        let totalPeriod3kCount = 0;
        let totalPeriod3kRevenue = 0;

        const items = rows.map(r => {
            let formattedDate = r.dateKey;
            try {
                const [y, m, d] = r.dateKey.split('-').map(Number);
                formattedDate = getIndoDateString(new Date(y, m - 1, d));
            } catch (e) {}

            totalPeriodRevenue += (r.totalRevenue || 0);
            totalPeriodCount += (r.totalCount || 0);
            totalPeriod1kCount += (r.count1k || 0);
            totalPeriod1kRevenue += (r.revenue1k || 0);
            totalPeriod2kCount += (r.count2k || 0);
            totalPeriod2kRevenue += (r.revenue2k || 0);
            totalPeriod3kCount += (r.count3k || 0);
            totalPeriod3kRevenue += (r.revenue3k || 0);

            return {
                ...r,
                formattedDate
            };
        });

        return {
            items,
            summary: {
                totalCount: totalPeriodCount,
                totalRevenue: totalPeriodRevenue,
                count1k: totalPeriod1kCount,
                revenue1k: totalPeriod1kRevenue,
                count2k: totalPeriod2kCount,
                revenue2k: totalPeriod2kRevenue,
                count3k: totalPeriod3kCount,
                revenue3k: totalPeriod3kRevenue,
                selectedMonth: month || 'all'
            }
        };
    }

    // Get Monthly Sales History (Rekap Omset Bulanan)
    async getMonthlyHistory(options = 24) {
        let limit = 24;
        let year = null;
        if (typeof options === 'object' && options !== null) {
            limit = parseInt(options.limit, 10) || 24;
            year = options.year || null;
        } else {
            limit = parseInt(options, 10) || 24;
        }

        let sql = `
            SELECT 
                substr(activated_date, 1, 7) as monthKey,
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
        `;
        const params = [];
        if (year) {
            sql += ` AND substr(activated_date, 1, 4) = ? `;
            params.push(String(year));
        }
        sql += `
            GROUP BY substr(activated_date, 1, 7)
            ORDER BY monthKey DESC
            LIMIT ?
        `;
        params.push(limit);

        const rows = await this.all(sql, params);

        let totalYearRevenue = 0;
        let totalYearCount = 0;
        let totalYear1kCount = 0;
        let totalYear1kRevenue = 0;
        let totalYear2kCount = 0;
        let totalYear2kRevenue = 0;
        let totalYear3kCount = 0;
        let totalYear3kRevenue = 0;

        const items = rows.map(r => {
            let monthLabel = r.monthKey;
            let monthName = '';
            let yStr = '';
            try {
                const [y, m] = r.monthKey.split('-').map(Number);
                const mIdx = m - 1;
                monthName = INDO_MONTHS[mIdx] || `Bulan ${m}`;
                yStr = String(y);
                monthLabel = `${monthName} ${yStr}`;
            } catch (e) {}

            totalYearRevenue += (r.totalRevenue || 0);
            totalYearCount += (r.totalCount || 0);
            totalYear1kCount += (r.count1k || 0);
            totalYear1kRevenue += (r.revenue1k || 0);
            totalYear2kCount += (r.count2k || 0);
            totalYear2kRevenue += (r.revenue2k || 0);
            totalYear3kCount += (r.count3k || 0);
            totalYear3kRevenue += (r.revenue3k || 0);

            return {
                ...r,
                monthName,
                year: yStr,
                monthLabel
            };
        });

        return {
            items,
            summary: {
                totalCount: totalYearCount,
                totalRevenue: totalYearRevenue,
                count1k: totalYear1kCount,
                revenue1k: totalYear1kRevenue,
                count2k: totalYear2kCount,
                revenue2k: totalYear2kRevenue,
                count3k: totalYear3kCount,
                revenue3k: totalYear3kRevenue,
                selectedYear: year || 'all'
            }
        };
    }

    // Get Distinct Available Years and Months for Filters
    async getAvailablePeriods() {
        const yearRows = await this.all(`
            SELECT DISTINCT substr(activated_date, 1, 4) as year
            FROM vouchers
            WHERE status = 'used' AND activated_date IS NOT NULL
            ORDER BY year DESC
        `);

        const monthRows = await this.all(`
            SELECT DISTINCT substr(activated_date, 1, 7) as monthKey
            FROM vouchers
            WHERE status = 'used' AND activated_date IS NOT NULL
            ORDER BY monthKey DESC
        `);

        const months = monthRows.map(r => {
            let label = r.monthKey;
            try {
                const [y, m] = r.monthKey.split('-').map(Number);
                const mIdx = m - 1;
                const mName = INDO_MONTHS[mIdx] || `Bulan ${m}`;
                label = `${mName} ${y}`;
            } catch (e) {}
            return {
                monthKey: r.monthKey,
                monthLabel: label,
                year: r.monthKey.split('-')[0]
            };
        });

        const years = yearRows.map(r => r.year).filter(Boolean);

        const parts = getJakartaParts(new Date());
        if (!years.includes(parts.year)) {
            years.unshift(parts.year);
        }
        if (!months.some(m => m.monthKey === parts.monthKey)) {
            months.unshift({
                monthKey: parts.monthKey,
                monthLabel: `${parts.monthName} ${parts.year}`,
                year: parts.year
            });
        }

        return { years, months };
    }

    // Get filtered and paginated vouchers
    async getVouchers({ packageFilter, statusFilter, dateFilter, monthFilter, search, page = 1, limit = 50 }) {
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

        if (monthFilter) {
            whereClauses.push(`substr(activated_date, 1, 7) = ?`);
            params.push(monthFilter);
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
