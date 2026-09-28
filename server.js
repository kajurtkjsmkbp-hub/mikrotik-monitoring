process.env.TZ = process.env.TZ || 'Asia/Jakarta';
require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const MikrotikClient = require('./mikrotik');
const voucherDb = require('./voucher-db');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*' }
});

const PORT = process.env.PORT || 3000;

let routerConfig = {
    host: process.env.ROUTER_HOST || '192.168.1.64',
    port: parseInt(process.env.ROUTER_PORT || '8728', 10),
    user: process.env.ROUTER_USER || 'admin',
    password: process.env.ROUTER_PASS || 'farkhatin',
    pollInterval: 1500,
    wanInterface: process.env.DEFAULT_WAN_INTERFACE || 'ether1-internet'
};

let cache = {
    connected: false,
    lastUpdate: null,
    identity: 'MikroTik Router',
    resource: {
        cpuLoad: 0,
        freeMemory: 0,
        totalMemory: 0,
        memoryUsagePercent: 0,
        uptime: '-',
        boardName: '-',
        version: '-',
        cpuFrequency: 0
    },
    traffic: {
        interface: routerConfig.wanInterface,
        rxBps: 0,
        txBps: 0,
        rxFormatted: '0 Bps',
        txFormatted: '0 Bps'
    },
    counts: {
        hotspot: 0,
        dhcp: 0,
        ppp: 0,
        totalOnline: 0
    },
    hotspotUsers: [],
    dhcpLeases: [],
    pppUsers: [],
    logs: [],
    interfaces: [],
    userEvents: [],
    dnsMap: {},
    ipOrgCache: {} // Cache for IP -> Organization / Website name
};

let previousHotspotUsersMap = null;

let mikrotikClient = null;
let isQuerying = false;
const queryQueue = [];

function formatBytes(bytes) {
    if (!bytes || isNaN(bytes)) return '0 B';
    const b = parseInt(bytes, 10);
    if (b === 0) return '0 B';
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(b) / Math.log(1024));
    return (b / Math.pow(1024, i)).toFixed(1) + ' ' + sizes[i];
}

function formatBitsPerSecond(bps) {
    if (!bps || isNaN(bps)) return '0 bps';
    const b = parseInt(bps, 10);
    if (b === 0) return '0 bps';
    if (b >= 1000000000) return (b / 1000000000).toFixed(2) + ' Gbps';
    if (b >= 1000000) return (b / 1000000).toFixed(2) + ' Mbps';
    if (b >= 1000) return (b / 1000).toFixed(1) + ' Kbps';
    return b + ' bps';
}

function executeQueue() {
    if (isQuerying || queryQueue.length === 0) return;
    const { fn, resolve, reject } = queryQueue.shift();
    isQuerying = true;
    fn()
        .then(result => resolve(result))
        .catch(err => reject(err))
        .finally(() => {
            isQuerying = false;
            executeQueue();
        });
}

function safeQuery(fn) {
    return new Promise((resolve, reject) => {
        queryQueue.push({ fn, resolve, reject });
        executeQueue();
    });
}

async function ensureClient() {
    if (mikrotikClient && mikrotikClient.connected && mikrotikClient.loggedIn) {
        return mikrotikClient;
    }

    if (mikrotikClient) {
        mikrotikClient.disconnect();
    }

    mikrotikClient = new MikrotikClient(
        routerConfig.host,
        routerConfig.port,
        routerConfig.user,
        routerConfig.password
    );

    await mikrotikClient.login();
    cache.connected = true;
    return mikrotikClient;
}

// BATCH IP RESOLVER HELPER (Resolves IP to Owner / Organization / ISP)
async function resolveIpBatch(ips) {
    const uniqueIps = Array.from(new Set(ips)).filter(ip => {
        if (!ip || ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('127.')) return false;
        return !cache.ipOrgCache[ip];
    });

    if (uniqueIps.length === 0) return;

    // Take max 30 IPs at once to avoid rate-limit
    const batch = uniqueIps.slice(0, 30);
    const postData = JSON.stringify(batch);

    return new Promise((resolve) => {
        const req = http.request({
            hostname: 'ip-api.com',
            path: '/batch?fields=query,org,as,isp',
            method: 'POST',
            timeout: 2500,
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    if (Array.isArray(parsed)) {
                        parsed.forEach(item => {
                            if (item.query) {
                                cache.ipOrgCache[item.query] = {
                                    org: item.org || item.isp || item.as || 'Unknown Provider',
                                    as: item.as || '',
                                    isp: item.isp || ''
                                };
                            }
                        });
                    }
                } catch (e) {}
                resolve();
            });
        });

        req.on('error', () => resolve());
        req.on('timeout', () => {
            req.destroy();
            resolve();
        });

        req.write(postData);
        req.end();
    });
}

// ENHANCED APP & ACTIVITY CATEGORIZATION ENGINE
function categorizeConnection(proto, dstIp, port, domain, orgInfo = null) {
    const p = parseInt(port, 10) || 0;
    const d = (domain || '').toLowerCase();
    const isUdp = proto.toLowerCase() === 'udp';
    const org = ((orgInfo ? orgInfo.org + ' ' + orgInfo.as + ' ' + orgInfo.isp : '')).toLowerCase();

    // 1. TikTok & ByteDance Live Webcast
    if (d.includes('tiktok') || d.includes('bytedance') || d.includes('byteglb') || d.includes('byteoversea') || d.includes('ibytedtos') || org.includes('bytedance')) {
        return {
            category: 'TikTok / Video Streaming',
            website: 'TikTok (ByteDance)',
            icon: 'video',
            type: 'video',
            color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30'
        };
    }
    // TikTok Live P2P WebRTC / Video Chunk UDP range (ports 8500-8999)
    if (isUdp && p >= 8500 && p <= 8999) {
        return {
            category: 'TikTok Live / P2P Streaming Video',
            website: 'TikTok Live (P2P CDN Node)',
            icon: 'radio',
            type: 'video',
            color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30'
        };
    }

    // 2. YouTube & Google Video
    if (d.includes('googlevideo') || d.includes('gvt1.com') || d.includes('youtube') || d.includes('ytimg')) {
        return {
            category: 'YouTube / Video Streaming',
            website: 'YouTube / Google Video',
            icon: 'youtube',
            type: 'video',
            color: 'text-red-400 bg-red-500/10 border-red-500/30'
        };
    }
    if (d.includes('netflix') || d.includes('nflxvideo')) {
        return {
            category: 'Netflix Streaming',
            website: 'Netflix',
            icon: 'film',
            type: 'video',
            color: 'text-rose-500 bg-rose-500/10 border-rose-500/30'
        };
    }
    if (d.includes('snackvideo') || d.includes('kwai')) {
        return {
            category: 'SnackVideo',
            website: 'SnackVideo / Kwai',
            icon: 'video',
            type: 'video',
            color: 'text-amber-400 bg-amber-500/10 border-amber-500/30'
        };
    }

    // 3. Sosmed & Chat (Meta: Facebook, Instagram, WhatsApp)
    if (d.includes('whatsapp') || p === 5222 || p === 5242) {
        return {
            category: 'WhatsApp Chat / Call',
            website: 'WhatsApp Messenger',
            icon: 'message-circle',
            type: 'chat',
            color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
        };
    }
    if (d.includes('fbcdn') || d.includes('facebook') || d.includes('instagram') || dstIp.startsWith('157.240.') || dstIp.startsWith('31.13.') || dstIp.startsWith('57.144.') || dstIp.startsWith('129.134.') || org.includes('facebook') || org.includes('meta')) {
        return {
            category: 'Facebook / Instagram',
            website: 'Meta (Facebook / Instagram)',
            icon: 'camera',
            type: 'social',
            color: 'text-pink-400 bg-pink-500/10 border-pink-500/30'
        };
    }
    if (d.includes('telegram') || d.includes('t.me') || org.includes('telegram')) {
        return {
            category: 'Telegram Messenger',
            website: 'Telegram',
            icon: 'send',
            type: 'chat',
            color: 'text-sky-400 bg-sky-500/10 border-sky-500/30'
        };
    }
    if (d.includes('twitter') || d.includes('x.com') || d.includes('twimg')) {
        return {
            category: 'Twitter / X',
            website: 'Twitter / X',
            icon: 'twitter',
            type: 'social',
            color: 'text-gray-300 bg-gray-700 border-gray-600'
        };
    }

    // 4. Game Online
    if ((p >= 5000 && p <= 5200) || (p >= 5500 && p <= 5700) || (p >= 30000 && p <= 30300) || d.includes('mobilelegends') || d.includes('youngjoy') || org.includes('moonton')) {
        return {
            category: 'Mobile Legends Game',
            website: 'Mobile Legends (Moonton Server)',
            icon: 'gamepad-2',
            type: 'game',
            color: 'text-amber-400 bg-amber-500/10 border-amber-500/30'
        };
    }
    if (p === 7006 || p === 7008 || (p >= 10000 && p <= 10020) || d.includes('freefire') || d.includes('garena') || org.includes('garena')) {
        return {
            category: 'Free Fire Game',
            website: 'Free Fire (Garena Server)',
            icon: 'flame',
            type: 'game',
            color: 'text-orange-400 bg-orange-500/10 border-orange-500/30'
        };
    }
    if ((p >= 17500 && p <= 17550) || (p >= 20000 && p <= 20050)) {
        return {
            category: 'PUBG Mobile Game',
            website: 'PUBG Mobile',
            icon: 'crosshair',
            type: 'game',
            color: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30'
        };
    }
    if (p === 25565 || p === 19132) {
        return {
            category: 'Minecraft Online',
            website: 'Minecraft Server',
            icon: 'box',
            type: 'game',
            color: 'text-green-400 bg-green-500/10 border-green-500/30'
        };
    }
    if ((p >= 27015 && p <= 27030) || d.includes('steampowered') || d.includes('steamcommunity') || org.includes('valve')) {
        return {
            category: 'Steam Gaming',
            website: 'Steam / Valve Gaming',
            icon: 'play-square',
            type: 'game',
            color: 'text-blue-400 bg-blue-500/10 border-blue-500/30'
        };
    }
    if (d.includes('roblox') || org.includes('roblox')) {
        return {
            category: 'Roblox Game',
            website: 'Roblox Server',
            icon: 'gamepad',
            type: 'game',
            color: 'text-rose-400 bg-rose-500/10 border-rose-500/30'
        };
    }

    // 5. E-Commerce
    if (d.includes('shopee') || org.includes('shopee') || org.includes('sea group')) {
        return {
            category: 'Shopee Online Shop',
            website: 'Shopee Indonesia',
            icon: 'shopping-bag',
            type: 'shop',
            color: 'text-orange-500 bg-orange-500/10 border-orange-500/30'
        };
    }
    if (d.includes('tokopedia')) {
        return {
            category: 'Tokopedia Online Shop',
            website: 'Tokopedia',
            icon: 'shopping-cart',
            type: 'shop',
            color: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/30'
        };
    }

    // 6. Google, Cloud & Android System Services
    if (p === 5228 || p === 5229 || p === 5230 || dstIp.startsWith('74.125.') || dstIp.startsWith('142.250.') || dstIp.startsWith('172.217.') || org.includes('google')) {
        return {
            category: 'Layanan Google / Android Push',
            website: 'Google Services / Play Store',
            icon: 'cloud',
            type: 'system',
            color: 'text-blue-400 bg-blue-500/10 border-blue-500/30'
        };
    }
    if (p === 5223 || d.includes('apple.com') || d.includes('icloud.com') || org.includes('apple')) {
        return {
            category: 'Layanan Apple / iCloud',
            website: 'Apple Services / iCloud',
            icon: 'cloud',
            type: 'system',
            color: 'text-gray-300 bg-gray-800 border-gray-700'
        };
    }

    // 7. Web Browsing
    if (p === 443) {
        const ownerName = orgInfo ? orgInfo.org : (d ? d : 'Situs Terenkripsi');
        return {
            category: 'Browsing Web (HTTPS)',
            website: ownerName,
            icon: 'globe',
            type: 'web',
            color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/30'
        };
    }
    if (p === 80) {
        const ownerName = orgInfo ? orgInfo.org : (d ? d : 'Situs Web (HTTP)');
        return {
            category: 'Browsing Web (HTTP)',
            website: ownerName,
            icon: 'globe',
            type: 'web',
            color: 'text-gray-400 bg-gray-500/10 border-gray-500/30'
        };
    }

    const genericOwner = orgInfo ? orgInfo.org : `Koneksi Port ${p}`;
    return {
        category: 'Koneksi Aplikasi Lainnya',
        website: genericOwner,
        icon: 'activity',
        type: 'other',
        color: 'text-gray-400 bg-gray-800 border-gray-700'
    };
}

// SMART TIERED POLLING ENGINE
let cycleCount = 0;
let isPolling = false;

async function runSmartPoll() {
    if (isPolling) return;
    isPolling = true;

    try {
        await safeQuery(async () => {
            const client = await ensureClient();
            cycleCount++;
            const now = new Date();
            const timeStr = now.toLocaleTimeString('id-ID', { hour12: false, timeZone: process.env.APP_TIMEZONE || 'Asia/Jakarta' });

            // 1. System Resource
            const res = await client.query('/system/resource/print');
            if (res && res[0]) {
                const r = res[0];
                const totalMem = parseInt(r['total-memory'] || '0', 10);
                const freeMem = parseInt(r['free-memory'] || '0', 10);
                const usedMem = totalMem - freeMem;
                const memPercent = totalMem > 0 ? Math.round((usedMem / totalMem) * 100) : 0;

                cache.resource = {
                    cpuLoad: parseInt(r['cpu-load'] || '0', 10),
                    freeMemory: freeMem,
                    totalMemory: totalMem,
                    memoryUsagePercent: memPercent,
                    uptime: r['uptime'] || '-',
                    boardName: r['board-name'] || '-',
                    version: r['version'] || '-',
                    cpuFrequency: parseInt(r['cpu-frequency'] || '0', 10)
                };
            }

            // 2. Identity (fetch once)
            if (cache.identity === 'MikroTik Router') {
                try {
                    const idRes = await client.query('/system/identity/print');
                    if (idRes && idRes[0] && idRes[0].name) {
                        cache.identity = idRes[0].name;
                    }
                } catch (e) {}
            }

            // 3. Traffic Monitor
            if (routerConfig.wanInterface && routerConfig.wanInterface !== 'undefined') {
                try {
                    const traf = await client.query('/interface/monitor-traffic', [
                        `=interface=${routerConfig.wanInterface}`,
                        '=once='
                    ]);
                    if (traf && traf[0]) {
                        const rx = parseInt(traf[0]['rx-bits-per-second'] || '0', 10);
                        const tx = parseInt(traf[0]['tx-bits-per-second'] || '0', 10);
                        cache.traffic = {
                            interface: routerConfig.wanInterface,
                            rxBps: rx,
                            txBps: tx,
                            rxFormatted: formatBitsPerSecond(rx),
                            txFormatted: formatBitsPerSecond(tx)
                        };
                    }
                } catch (e) {}
            }

            // 4. Hotspot Active Users & Login/Logout Detection
            try {
                const hotspot = await client.query('/ip/hotspot/active/print');
                const validHotspot = (Array.isArray(hotspot) ? hotspot : []).filter(u => {
                    return u && (u['user'] || u['address'] || u['mac-address']) && !u['cpu-load'] && !u['total-memory'];
                });
                const currentUsers = validHotspot.map(u => ({
                    id: u['.id'],
                    user: u['user'] || 'Unknown',
                    address: u['address'] || '-',
                    macAddress: u['mac-address'] || '-',
                    uptime: u['uptime'] || '-',
                    idleTime: u['idle-time'] || '-',
                    bytesIn: parseInt(u['bytes-in'] || '0', 10),
                    bytesOut: parseInt(u['bytes-out'] || '0', 10),
                    bytesInFormatted: formatBytes(u['bytes-in']),
                    bytesOutFormatted: formatBytes(u['bytes-out']),
                    loginBy: u['login-by'] || '-',
                    server: u['server'] || '-',
                    radius: u['radius'] === 'true'
                }));

                const currentMap = new Map();
                currentUsers.forEach(u => {
                    const key = `${u.user}_${u.macAddress}`;
                    currentMap.set(key, u);
                });

                if (previousHotspotUsersMap !== null) {
                    const detectedEvents = [];

                    for (const [key, currUser] of currentMap.entries()) {
                        if (!previousHotspotUsersMap.has(key)) {
                            const eventObj = {
                                id: 'ev_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
                                type: 'login',
                                user: currUser.user,
                                address: currUser.address,
                                macAddress: currUser.macAddress,
                                time: timeStr,
                                timestamp: Date.now(),
                                loginBy: currUser.loginBy,
                                server: currUser.server,
                                message: `User "${currUser.user}" login pada pukul ${timeStr}`
                            };
                            detectedEvents.push(eventObj);
                            cache.userEvents.unshift(eventObj);
                        }
                    }

                    for (const [key, oldUser] of previousHotspotUsersMap.entries()) {
                        if (!currentMap.has(key)) {
                            const eventObj = {
                                id: 'ev_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
                                type: 'logout',
                                user: oldUser.user,
                                address: oldUser.address,
                                macAddress: oldUser.macAddress,
                                time: timeStr,
                                timestamp: Date.now(),
                                duration: oldUser.uptime,
                                bytesOutFormatted: oldUser.bytesOutFormatted,
                                bytesInFormatted: oldUser.bytesInFormatted,
                                message: `User "${oldUser.user}" logout pada pukul ${timeStr} (Aktif: ${oldUser.uptime} | Kuota: ${oldUser.bytesOutFormatted})`
                            };
                            detectedEvents.push(eventObj);
                            cache.userEvents.unshift(eventObj);
                        }
                    }

                    if (cache.userEvents.length > 200) {
                        cache.userEvents = cache.userEvents.slice(0, 200);
                    }

                    if (detectedEvents.length > 0) {
                        detectedEvents.forEach(ev => {
                            io.emit('user_event', ev);
                        });
                        io.emit('events_history_update', cache.userEvents);
                    }
                }

                previousHotspotUsersMap = currentMap;
                cache.hotspotUsers = currentUsers;

                // Check and activate vouchers matching active hotspot users
                try {
                    const newlyActivated = await voucherDb.checkAndActivateUsers(currentUsers);
                    if (newlyActivated.length > 0) {
                        newlyActivated.forEach(v => {
                            io.emit('voucher_activated', v);
                        });
                        const summary = await voucherDb.getSummary();
                        io.emit('voucher_summary_update', summary);
                    }
                } catch (e) {
                    console.error('Error activating vouchers:', e.message);
                }
            } catch (e) {
                cache.hotspotUsers = [];
            }

            // 5. PPP Active Users
            try {
                const ppp = await client.query('/ppp/active/print');
                cache.pppUsers = ppp.map(p => ({
                    id: p['.id'],
                    name: p['name'] || '-',
                    service: p['service'] || '-',
                    callerId: p['caller-id'] || '-',
                    address: p['address'] || '-',
                    uptime: p['uptime'] || '-'
                }));
            } catch (e) {
                cache.pppUsers = [];
            }

            // Tier 2 (Every 6 cycles = ~9 seconds): DHCP Leases, DNS cache, Router Users & Logs
            if (cycleCount % 6 === 0 || cache.dhcpLeases.length === 0) {
                try {
                    const hotspotUsers = await client.query('/ip/hotspot/user/print');
                    const synced = await voucherDb.syncWithRouterHotspotUsers(hotspotUsers);
                    if (synced > 0) {
                        console.log(`[Auto-Sync MikroTik] Berhasil mendeteksi & menyinkronkan ${synced} voucher yang aktif dari router.`);
                        const summary = await voucherDb.getSummary();
                        io.emit('voucher_summary_update', summary);
                    }
                } catch (e) {}
                try {
                    const dhcp = await client.query('/ip/dhcp-server/lease/print');
                    cache.dhcpLeases = dhcp.map(d => ({
                        id: d['.id'],
                        address: d['address'] || d['active-address'] || '-',
                        macAddress: d['mac-address'] || d['active-mac-address'] || '-',
                        hostName: d['host-name'] || '-',
                        server: d['server'] || d['active-server'] || '-',
                        status: d['status'] || 'unknown',
                        expiresAfter: d['expires-after'] || '-',
                        lastSeen: d['last-seen'] || '-',
                        dynamic: d['dynamic'] === 'true',
                        blocked: d['blocked'] === 'true',
                        disabled: d['disabled'] === 'true'
                    }));
                } catch (e) {}

                try {
                    const dnsEntries = await client.query('/ip/dns/cache/print');
                    dnsEntries.forEach(d => {
                        if (d.data && d.name) {
                            cache.dnsMap[d.data] = d.name;
                        }
                    });
                } catch (e) {}

                try {
                    const logs = await client.query('/log/print');
                    cache.logs = logs.slice(-100).map(l => ({
                        id: l['.id'],
                        time: l['time'] || '-',
                        topics: l['topics'] || '',
                        message: l['message'] || ''
                    })).reverse();
                } catch (e) {}
            }

            // Tier 3 (Every 40 cycles = ~60 seconds): Interfaces list
            if (cycleCount % 40 === 0 || cache.interfaces.length === 0) {
                try {
                    const ifaces = await client.query('/interface/print');
                    cache.interfaces = (Array.isArray(ifaces) ? ifaces : [])
                        .filter(i => i && i['name'] && i['name'] !== 'undefined' && !i['cpu-load'])
                        .map(i => ({
                            id: i['.id'],
                            name: i['name'],
                            type: i['type'] || 'interface',
                            running: i['running'] === 'true',
                            disabled: i['disabled'] === 'true',
                            rxByte: parseInt(i['rx-byte'] || '0', 10),
                            txByte: parseInt(i['tx-byte'] || '0', 10),
                            rxFormatted: formatBytes(i['rx-byte']),
                            txFormatted: formatBytes(i['tx-byte'])
                        }));
                } catch (e) {}
            }

            cache.counts = {
                hotspot: cache.hotspotUsers.length,
                dhcp: cache.dhcpLeases.filter(d => d.status === 'bound').length,
                ppp: cache.pppUsers.length,
                totalOnline: cache.hotspotUsers.length + cache.pppUsers.length,
                eventsCount: cache.userEvents.length
            };

            cache.lastUpdate = new Date().toISOString();
            cache.connected = true;

            io.emit('stats_update', {
                connected: true,
                identity: cache.identity,
                resource: cache.resource,
                traffic: cache.traffic,
                counts: cache.counts,
                lastUpdate: cache.lastUpdate
            });

            io.emit('users_update', {
                hotspot: cache.hotspotUsers,
                dhcp: cache.dhcpLeases,
                ppp: cache.pppUsers,
                counts: cache.counts
            });

            if (cycleCount % 6 === 0) {
                io.emit('logs_update', cache.logs);
            }
        });
    } catch (err) {
        console.error('Smart poll error:', err.message);
        cache.connected = false;
        io.emit('stats_update', {
            connected: false,
            error: err.message,
            identity: cache.identity,
            resource: cache.resource,
            traffic: cache.traffic,
            counts: cache.counts,
            lastUpdate: new Date().toISOString()
        });
        if (mikrotikClient) {
            mikrotikClient.disconnect();
            mikrotikClient = null;
        }
    } finally {
        isPolling = false;
    }
}

let pollTimer = null;
function startPolling() {
    if (pollTimer) clearInterval(pollTimer);
    runSmartPoll();
    pollTimer = setInterval(runSmartPoll, routerConfig.pollInterval);
}

app.use(express.json({ limit: '15mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/status', (req, res) => {
    res.json({
        connected: cache.connected,
        identity: cache.identity,
        resource: cache.resource,
        traffic: cache.traffic,
        counts: cache.counts,
        lastUpdate: cache.lastUpdate,
        wanInterface: routerConfig.wanInterface
    });
});

app.get('/api/events', (req, res) => {
    res.json(cache.userEvents);
});

app.get('/api/users/hotspot', (req, res) => {
    res.json(cache.hotspotUsers);
});

// VOUCHER MANAGEMENT & ACCOUNTING ENDPOINTS
app.get('/api/vouchers/summary', async (req, res) => {
    try {
        const summary = await voucherDb.getSummary();
        res.json(summary);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/vouchers/daily-history', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit, 10) || 60;
        const month = req.query.month || null;
        const history = await voucherDb.getDailyHistory({ limit, month });
        res.json(history);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/vouchers/monthly-history', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit, 10) || 24;
        const history = await voucherDb.getMonthlyHistory(limit);
        res.json(history);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/vouchers', async (req, res) => {
    try {
        const { packageFilter, statusFilter, dateFilter, monthFilter, search, page, limit } = req.query;
        const vouchers = await voucherDb.getVouchers({
            packageFilter,
            statusFilter,
            dateFilter,
            monthFilter,
            search,
            page: parseInt(page, 10) || 1,
            limit: parseInt(limit, 10) || 50
        });
        res.json(vouchers);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/vouchers/import', async (req, res) => {
    try {
        const { packageKey, content, fileName } = req.body;
        if (!packageKey || !content) {
            return res.status(400).json({ error: 'Paket voucher dan isi file/kode wajib diisi' });
        }
        const result = await voucherDb.importVouchers(packageKey, content, fileName || 'Upload File');
        const summary = await voucherDb.getSummary();
        io.emit('voucher_summary_update', summary);
        res.json({ success: true, ...result });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/vouchers/delete', async (req, res) => {
    try {
        const { ids } = req.body;
        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: 'Daftar ID voucher diperlukan' });
        }
        const deleted = await voucherDb.deleteVouchers(ids);
        const summary = await voucherDb.getSummary();
        io.emit('voucher_summary_update', summary);
        res.json({ success: true, deleted });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/vouchers/clear-stock', async (req, res) => {
    try {
        const { packageKey } = req.body;
        if (!packageKey) {
            return res.status(400).json({ error: 'Kategori paket diperlukan' });
        }
        const deleted = await voucherDb.clearPackageStock(packageKey);
        const summary = await voucherDb.getSummary();
        io.emit('voucher_summary_update', summary);
        res.json({ success: true, deleted });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/vouchers/sync-router', async (req, res) => {
    try {
        await safeQuery(async () => {
            const client = await ensureClient();
            const routerUsers = await client.query('/ip/hotspot/user/print');
            const synced = await voucherDb.syncWithRouterHotspotUsers(routerUsers);
            const summary = await voucherDb.getSummary();
            io.emit('voucher_summary_update', summary);
            res.json({ success: true, synced, summary });
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// INSPECT USER ACTIVITY ENDPOINT WITH IP-TO-WEBSITE RESOLUTION
app.get('/api/users/inspect', async (req, res) => {
    const { ip, user } = req.query;
    if (!ip) {
        return res.status(400).json({ error: 'IP address is required' });
    }

    try {
        const inspection = await safeQuery(async () => {
            const client = await ensureClient();
            const conns = await client.query('/ip/firewall/connection/print');
            const userConns = conns.filter(c => c['src-address'] && c['src-address'].startsWith(ip + ':'));

            // Collect all unique destination IPs to resolve their website/organization
            const destIps = userConns.map(c => (c['dst-address'] || '').split(':')[0]).filter(Boolean);
            await resolveIpBatch(destIps);

            const categoryStats = {};
            const detailedConns = [];

            userConns.forEach(c => {
                const dst = c['dst-address'] || '';
                const [dstIp, port] = dst.split(':');
                const domain = cache.dnsMap[dstIp] || '';
                const orgInfo = cache.ipOrgCache[dstIp] || null;
                const cat = categorizeConnection(c.protocol, dstIp, port, domain, orgInfo);

                const origBytes = parseInt(c['orig-bytes'] || '0', 10);
                const replBytes = parseInt(c['repl-bytes'] || '0', 10);
                const totalBytes = origBytes + replBytes;

                if (!categoryStats[cat.category]) {
                    categoryStats[cat.category] = {
                        name: cat.category,
                        type: cat.type,
                        icon: cat.icon,
                        color: cat.color,
                        count: 0,
                        bytes: 0
                    };
                }
                categoryStats[cat.category].count++;
                categoryStats[cat.category].bytes += totalBytes;

                detailedConns.push({
                    protocol: c.protocol,
                    destination: dst,
                    dstIp,
                    port,
                    domain: domain || '-',
                    website: cat.website || (domain ? domain : (orgInfo ? orgInfo.org : dstIp)),
                    organization: orgInfo ? orgInfo.org : '-',
                    category: cat.category,
                    icon: cat.icon,
                    color: cat.color,
                    origBytes: formatBytes(origBytes),
                    replBytes: formatBytes(replBytes),
                    totalBytes: formatBytes(totalBytes),
                    rawBytes: totalBytes,
                    tcpState: c['tcp-state'] || '-'
                });
            });

            const summary = Object.values(categoryStats).map(s => ({
                ...s,
                bytesFormatted: formatBytes(s.bytes)
            })).sort((a, b) => b.bytes - a.bytes);

            detailedConns.sort((a, b) => b.rawBytes - a.rawBytes);

            return {
                user: user || 'Unknown',
                ip,
                totalConnections: userConns.length,
                categories: summary,
                connections: detailedConns.slice(0, 40)
            };
        });

        res.json({ success: true, ...inspection });
    } catch (err) {
        console.error('Inspect error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/users/dhcp', (req, res) => {
    res.json(cache.dhcpLeases);
});

app.get('/api/users/ppp', (req, res) => {
    res.json(cache.pppUsers);
});

app.get('/api/logs', (req, res) => {
    res.json(cache.logs);
});

app.get('/api/interfaces', (req, res) => {
    res.json(cache.interfaces);
});

app.post('/api/users/kick', async (req, res) => {
    const { id, type } = req.body;
    if (!id || !type) {
        return res.status(400).json({ error: 'Missing user id or type (hotspot/ppp)' });
    }

    try {
        await safeQuery(async () => {
            const client = await ensureClient();
            if (type === 'hotspot') {
                await client.query('/ip/hotspot/active/remove', [`=.id=${id}`]);
            } else if (type === 'ppp') {
                await client.query('/ppp/active/remove', [`=.id=${id}`]);
            } else {
                throw new Error('Unsupported user type');
            }
        });
        setTimeout(runSmartPoll, 300);
        res.json({ success: true, message: `User disconnected successfully` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/tools/ping', async (req, res) => {
    const { host, count = 3 } = req.body;
    if (!host) {
        return res.status(400).json({ error: 'Host is required' });
    }

    try {
        const pingResults = await safeQuery(async () => {
            const client = await ensureClient();
            return await client.query('/ping', [
                `=address=${host.trim()}`,
                `=count=${Math.min(parseInt(count, 10) || 3, 5)}`
            ]);
        });
        res.json({ success: true, host, results: pingResults });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/system/reboot', async (req, res) => {
    try {
        await safeQuery(async () => {
            const client = await ensureClient();
            await client.query('/system/reboot');
        });
        res.json({ success: true, message: 'Reboot signal sent to router' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/config', (req, res) => {
    const { wanInterface } = req.body;
    if (wanInterface) {
        routerConfig.wanInterface = wanInterface;
        cache.traffic.interface = wanInterface;
    }
    res.json({ success: true, config: routerConfig });
});

io.on('connection', async (socket) => {
    let voucherSummary = null;
    try {
        voucherSummary = await voucherDb.getSummary();
    } catch (e) {}

    socket.emit('initial_state', {
        connected: cache.connected,
        identity: cache.identity,
        resource: cache.resource,
        traffic: cache.traffic,
        counts: cache.counts,
        hotspot: cache.hotspotUsers,
        dhcp: cache.dhcpLeases,
        ppp: cache.pppUsers,
        logs: cache.logs,
        interfaces: cache.interfaces,
        events: cache.userEvents,
        voucherSummary,
        config: routerConfig
    });

    socket.on('get_voucher_summary', async () => {
        try {
            socket.emit('voucher_summary_update', await voucherDb.getSummary());
        } catch (e) {}
    });

    socket.on('change_interface', (iface) => {
        if (iface && iface !== 'undefined') {
            routerConfig.wanInterface = iface;
            cache.traffic.interface = iface;
        }
    });

    socket.on('force_refresh', () => {
        runSmartPoll();
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`====================================================`);
    console.log(` MikroTik Dashboard is running (IP-to-Website Resolver)!`);
    console.log(` Access Local: http://localhost:${PORT}`);
    console.log(` Access Network: http://192.168.1.81:${PORT}`);
    console.log(` Connected to MikroTik: ${routerConfig.host}:${routerConfig.port}`);
    console.log(`====================================================`);
    startPolling();
});
