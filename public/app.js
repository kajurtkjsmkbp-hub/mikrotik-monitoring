// MikroTik Monitor Client Application with Activity Inspector & Watcher
const socket = io();

// State
let appState = {
    connected: false,
    currentTab: 'tab-hotspot',
    searchQuery: '',
    hotspotRadiusFilter: 'all',
    logFilter: 'all',
    eventFilter: 'all',
    autoScrollLogs: true,
    audioAlerts: true,
    desktopNotifications: false,
    kickTarget: null,
    inspectTarget: null,
    interfaces: [],
    events: [],
    trafficHistory: {
        labels: [],
        rx: [],
        tx: []
    }
};

// Elements
const el = {
    routerIdentity: document.getElementById('router-identity'),
    connBadge: document.getElementById('conn-badge'),
    connText: document.getElementById('conn-text'),
    routerIpHost: document.getElementById('router-ip-host'),
    routerBoard: document.getElementById('router-board'),
    routerRos: document.getElementById('router-ros'),
    clockDisplay: document.getElementById('clock-display'),
    uptimeDisplay: document.getElementById('uptime-display'),
    ifaceSelect: document.getElementById('iface-select'),
    btnForceRefresh: document.getElementById('btn-force-refresh'),
    btnAudioToggle: document.getElementById('btn-audio-toggle'),
    audioIcon: document.getElementById('audio-icon'),
    btnDesktopNotify: document.getElementById('btn-desktop-notify'),
    desktopNotifyIcon: document.getElementById('desktop-notify-icon'),
    desktopNotifyText: document.getElementById('desktop-notify-text'),

    // Stats
    statHotspotCount: document.getElementById('stat-hotspot-count'),
    statHotspotRadius: document.getElementById('stat-hotspot-radius'),
    statOmsetToday: document.getElementById('stat-omset-today'),
    statOmsetVouchersToday: document.getElementById('stat-omset-vouchers-today'),
    statOmsetMonthBadge: document.getElementById('stat-omset-month-badge'),
    statOmsetMonth: document.getElementById('stat-omset-month'),
    statOmsetVouchersMonth: document.getElementById('stat-omset-vouchers-month'),
    statDhcpCount: document.getElementById('stat-dhcp-count'),
    statDhcpBound: document.getElementById('stat-dhcp-bound'),
    statTotalOnline: document.getElementById('stat-total-online'),
    statPppoeCount: document.getElementById('stat-pppoe-count'),
    statRxSpeed: document.getElementById('stat-rx-speed'),
    statTxSpeed: document.getElementById('stat-tx-speed'),

    // Hardware
    cpuPercent: document.getElementById('cpu-percent'),
    cpuProgressBar: document.getElementById('cpu-progress-bar'),
    cpuDot: document.getElementById('cpu-dot'),
    cpuFreqBadge: document.getElementById('cpu-freq-badge'),
    ramText: document.getElementById('ram-text'),
    ramProgressBar: document.getElementById('ram-progress-bar'),
    specArch: document.getElementById('spec-arch'),
    graphIfaceTag: document.getElementById('graph-iface-tag'),

    // Badges & Tables
    tabBadgeHotspot: document.getElementById('tab-badge-hotspot'),
    tabBadgeEvents: document.getElementById('tab-badge-events'),
    tabBadgeDhcp: document.getElementById('tab-badge-dhcp'),
    tabBadgePpp: document.getElementById('tab-badge-ppp'),
    tabBadgeLogs: document.getElementById('tab-badge-logs'),

    tableSearch: document.getElementById('table-search'),
    btnExportCsv: document.getElementById('btn-export-csv'),
    hotspotTableBody: document.getElementById('hotspot-table-body'),
    hotspotEmptyState: document.getElementById('hotspot-empty-state'),
    dhcpTableBody: document.getElementById('dhcp-table-body'),
    dhcpEmptyState: document.getElementById('dhcp-empty-state'),
    pppTableBody: document.getElementById('ppp-table-body'),
    pppEmptyState: document.getElementById('ppp-empty-state'),
    interfacesTableBody: document.getElementById('interfaces-table-body'),

    // Events Tab
    eventsContainer: document.getElementById('events-container'),
    eventCounterText: document.getElementById('event-counter-text'),

    // Logs Tab
    logsContainer: document.getElementById('logs-container'),
    btnToggleAutoscroll: document.getElementById('btn-toggle-autoscroll'),
    btnClearLogView: document.getElementById('btn-clear-log-view'),

    // Activity Inspector Modal
    modalInspect: document.getElementById('modal-inspect'),
    inspectModalUser: document.getElementById('inspect-modal-user'),
    inspectModalIp: document.getElementById('inspect-modal-ip'),
    inspectModalConns: document.getElementById('inspect-modal-conns'),
    inspectCategoriesList: document.getElementById('inspect-categories-list'),
    inspectConnsTable: document.getElementById('inspect-conns-table'),
    inspectTimestamp: document.getElementById('inspect-timestamp'),
    btnCloseInspect: document.getElementById('btn-close-inspect'),
    btnDoneInspect: document.getElementById('btn-done-inspect'),
    btnRefreshInspect: document.getElementById('btn-refresh-inspect'),
    btnKickFromInspect: document.getElementById('btn-kick-from-inspect'),

    // Ping Modal
    modalPing: document.getElementById('modal-ping'),
    btnOpenPing: document.getElementById('btn-open-ping'),
    btnClosePing: document.getElementById('btn-close-ping'),
    pingTargetInput: document.getElementById('ping-target-input'),
    btnExecutePing: document.getElementById('btn-execute-ping'),
    pingResultsBox: document.getElementById('ping-results-box'),

    // Kick Modal
    modalKick: document.getElementById('modal-kick'),
    kickModalUser: document.getElementById('kick-modal-user'),
    kickModalIp: document.getElementById('kick-modal-ip'),
    kickModalMac: document.getElementById('kick-modal-mac'),
    btnCancelKick: document.getElementById('btn-cancel-kick'),
    btnConfirmKick: document.getElementById('btn-confirm-kick'),

    floatingAlerts: document.getElementById('floating-alerts'),
    toastContainer: document.getElementById('toast-container')
};

// Web Audio API Chimes (Singleton AudioContext to prevent memory/thread leak)
let sharedAudioCtx = null;
function getSharedAudioContext() {
    try {
        if (!sharedAudioCtx) {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (AudioContextClass) sharedAudioCtx = new AudioContextClass();
        }
        if (sharedAudioCtx && sharedAudioCtx.state === 'suspended') {
            sharedAudioCtx.resume();
        }
        return sharedAudioCtx;
    } catch (e) {
        return null;
    }
}

function playLoginSound() {
    if (!appState.audioAlerts || document.hidden) return;
    try {
        const audioCtx = getSharedAudioContext();
        if (!audioCtx) return;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(523.25, audioCtx.currentTime); // C5
        osc.frequency.exponentialRampToValueAtTime(783.99, audioCtx.currentTime + 0.14); // G5
        gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.35);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.36);
    } catch (e) {}
}

function playLogoutSound() {
    if (!appState.audioAlerts || document.hidden) return;
    try {
        const audioCtx = getSharedAudioContext();
        if (!audioCtx) return;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(659.25, audioCtx.currentTime); // E5
        osc.frequency.exponentialRampToValueAtTime(392.00, audioCtx.currentTime + 0.18); // G4
        gain.gain.setValueAtTime(0.10, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.42);
    } catch (e) {}
}

// Browser Desktop Push Notification
function triggerDesktopNotification(title, body, iconUrl = '') {
    if (!appState.desktopNotifications || !("Notification" in window)) return;
    if (Notification.permission === "granted") {
        try {
            new Notification(title, {
                body: body,
                icon: iconUrl || 'https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/wifi.svg'
            });
        } catch (e) {}
    }
}

if ("Notification" in window && Notification.permission === "granted") {
    appState.desktopNotifications = true;
    updateDesktopNotifyButton(true);
}

function updateDesktopNotifyButton(active) {
    if (active) {
        el.desktopNotifyIcon.className = 'w-4 h-4 text-emerald-400';
        el.desktopNotifyText.textContent = 'Notif: Aktif';
    } else {
        el.desktopNotifyIcon.className = 'w-4 h-4 text-amber-400';
        el.desktopNotifyText.textContent = 'Notifikasi';
    }
}

el.btnDesktopNotify.addEventListener('click', async () => {
    if (!("Notification" in window)) {
        showToast('Browser ini tidak mendukung notifikasi desktop', 'error');
        return;
    }
    if (Notification.permission === "granted") {
        appState.desktopNotifications = !appState.desktopNotifications;
        updateDesktopNotifyButton(appState.desktopNotifications);
        showToast(appState.desktopNotifications ? 'Notifikasi desktop aktif' : 'Notifikasi desktop dinonaktifkan', 'info');
    } else if (Notification.permission !== "denied") {
        const perm = await Notification.requestPermission();
        if (perm === "granted") {
            appState.desktopNotifications = true;
            updateDesktopNotifyButton(true);
            showToast('Izin notifikasi desktop diberikan!', 'success');
            triggerDesktopNotification('MikroTik Monitor', 'Notifikasi desktop aktif!');
        } else {
            showToast('Izin notifikasi ditolak', 'info');
        }
    } else {
        showToast('Izin notifikasi diblokir di browser. Izinkan lewat pengaturan browser.', 'info');
    }
});

// Toast notification helper
function showToast(message, type = 'info') {
    if (document.hidden) return;
    const toast = document.createElement('div');
    const colorClasses = {
        info: 'bg-gray-800 border-blue-500/50 text-blue-300',
        success: 'bg-gray-800 border-emerald-500/50 text-emerald-300',
        error: 'bg-gray-800 border-rose-500/50 text-rose-300'
    }[type] || 'bg-gray-800 border-gray-700 text-gray-200';

    toast.className = `flex items-center gap-2.5 px-4 py-3 rounded-xl border text-xs shadow-xl transition-all duration-300 transform translate-y-2 opacity-0 pointer-events-auto ${colorClasses}`;
    toast.innerHTML = `<span>${message}</span>`;
    el.toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.classList.remove('translate-y-2', 'opacity-0');
    }, 10);

    setTimeout(() => {
        toast.classList.add('opacity-0', 'translate-y-2');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// Floating Event Alert (Live popup on top right, max 3 visible, skips if tab hidden)
function showFloatingEventAlert(event) {
    if (document.hidden) return; // Prevent alert accumulation when tab is inactive

    // Capping: keep at most 3 alerts to prevent layout lag & memory exhaustion
    while (el.floatingAlerts && el.floatingAlerts.children.length >= 3) {
        el.floatingAlerts.firstElementChild.remove();
    }

    const isLogin = event.type === 'login';
    const alert = document.createElement('div');

    const borderBg = isLogin 
        ? 'bg-gradient-to-r from-emerald-950/90 to-gray-900 border-emerald-500/50 shadow-emerald-500/10'
        : 'bg-gradient-to-r from-rose-950/90 to-gray-900 border-rose-500/50 shadow-rose-500/10';

    const iconHtml = isLogin
        ? '<div class="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0"><i data-lucide="log-in" class="w-4 h-4"></i></div>'
        : '<div class="w-8 h-8 rounded-lg bg-rose-500/20 text-rose-400 flex items-center justify-center shrink-0"><i data-lucide="log-out" class="w-4 h-4"></i></div>';

    const subDetails = isLogin
        ? `IP: <span class="text-cyan-400 font-mono">${event.address}</span> • Metode: <span class="text-gray-300">${event.loginBy || '-'}</span>`
        : `Durasi: <span class="text-amber-300 font-mono">${event.duration || '-'}</span> • Kuota: <span class="text-cyan-400 font-mono">${event.bytesOutFormatted || '0 B'}</span>`;

    alert.className = `p-3.5 rounded-2xl border backdrop-blur-md shadow-2xl transition-all duration-300 transform translate-x-10 opacity-0 pointer-events-auto ${borderBg} flex items-start gap-3`;
    alert.innerHTML = `
        ${iconHtml}
        <div class="flex-1 text-xs">
            <div class="flex items-center justify-between gap-2">
                <span class="font-bold text-white uppercase text-[11px] tracking-wide ${isLogin ? 'text-emerald-400' : 'text-rose-400'}">
                    ${isLogin ? '🟢 User Login' : '🔴 User Logout'}
                </span>
                <span class="text-gray-400 text-[10px] font-mono">${event.time}</span>
            </div>
            <div class="text-white font-semibold text-sm mt-0.5">${escapeHtml(event.user)}</div>
            <div class="text-[11px] text-gray-400 mt-1">${subDetails}</div>
        </div>
    `;

    el.floatingAlerts.appendChild(alert);
    // Crucial: Only create icons inside this new alert, NOT the whole document!
    lucide.createIcons({ root: alert });

    requestAnimationFrame(() => {
        alert.classList.remove('translate-x-10', 'opacity-0');
    });

    setTimeout(() => {
        if (alert.parentNode) {
            alert.classList.add('opacity-0', 'translate-x-10');
            setTimeout(() => {
                if (alert.parentNode) alert.remove();
            }, 300);
        }
    }, 4500);
}

// Chart.js Setup
// Chart.js Setup
let trafficChart = null;
function initChart() {
    const ctx = document.getElementById('trafficChart').getContext('2d');
    const maxPoints = 25;

    for (let i = 0; i < maxPoints; i++) {
        appState.trafficHistory.labels.push('');
        appState.trafficHistory.rx.push(0);
        appState.trafficHistory.tx.push(0);
    }

    trafficChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: appState.trafficHistory.labels,
            datasets: [
                {
                    label: 'Download (Rx)',
                    borderColor: '#06b6d4',
                    backgroundColor: 'rgba(6, 182, 212, 0.12)',
                    borderWidth: 2,
                    pointRadius: 0,
                    tension: 0.4,
                    fill: true,
                    data: appState.trafficHistory.rx
                },
                {
                    label: 'Upload (Tx)',
                    borderColor: '#a855f7',
                    backgroundColor: 'rgba(168, 85, 247, 0.12)',
                    borderWidth: 2,
                    pointRadius: 0,
                    tension: 0.4,
                    fill: true,
                    data: appState.trafficHistory.tx
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
                duration: 800,
                easing: 'easeInOutQuad'
            },
            scales: {
                x: { display: false },
                y: {
                    min: 0,
                    beginAtZero: true,
                    suggestedMax: 1,
                    grid: { color: 'rgba(75, 85, 99, 0.15)' },
                    ticks: {
                        color: '#9ca3af',
                        font: { size: 10 },
                        callback: function(val) {
                            if (val >= 1000) return (val / 1000).toFixed(1) + ' G';
                            if (val >= 1) return val.toFixed(1) + ' M';
                            return (val * 1000).toFixed(0) + ' K';
                        }
                    }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#1f2937',
                    titleColor: '#f9fafb',
                    bodyColor: '#d1d5db',
                    padding: 8,
                    callbacks: {
                        label: function(context) {
                            const val = context.raw || 0;
                            return `${context.dataset.label}: ${val.toFixed(2)} Mbps`;
                        }
                    }
                }
            }
        }
    });
}

function updateChart(rxBps, txBps) {
    if (!trafficChart) return;
    const rxMbps = rxBps / 1000000;
    const txMbps = txBps / 1000000;

    appState.trafficHistory.rx.push(rxMbps);
    appState.trafficHistory.tx.push(txMbps);
    appState.trafficHistory.labels.push(new Date().toLocaleTimeString());

    if (appState.trafficHistory.rx.length > 25) {
        appState.trafficHistory.rx.shift();
        appState.trafficHistory.tx.shift();
        appState.trafficHistory.labels.shift();
    }

    // Skip drawing canvas frames when tab is hidden in background
    if (!document.hidden) {
        trafficChart.update('none');
    }
}

// Live Clock
setInterval(() => {
    const now = new Date();
    el.clockDisplay.textContent = now.toLocaleTimeString('id-ID');
}, 1000);

// Tab switching
document.querySelectorAll('#main-tabs .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('#main-tabs .tab-btn').forEach(b => {
            b.classList.remove('active');
            b.classList.remove('bg-blue-500/10', 'text-blue-400', 'border-blue-500/20');
            b.classList.add('text-gray-400');
        });
        btn.classList.add('active', 'bg-blue-500/10', 'text-blue-400', 'border-blue-500/20');
        btn.classList.remove('text-gray-400');

        const targetTab = btn.getAttribute('data-tab');
        appState.currentTab = targetTab;

        document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
        document.getElementById(targetTab).classList.remove('hidden');
        renderCurrentTable();
    });
});

// Search input
el.tableSearch.addEventListener('input', (e) => {
    appState.searchQuery = e.target.value.toLowerCase().trim();
    renderCurrentTable();
});

// Sub Filter Hotspot (Semua vs Hanya RADIUS vs User Lokal)
document.querySelectorAll('.hs-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const filter = btn.getAttribute('data-filter') || 'all';
        appState.hotspotRadiusFilter = filter;
        document.querySelectorAll('.hs-filter-btn').forEach(b => {
            b.className = 'hs-filter-btn px-2.5 py-0.5 rounded-md font-medium text-gray-400 hover:text-gray-200 transition';
        });
        btn.className = 'hs-filter-btn px-2.5 py-0.5 rounded-md font-semibold text-white bg-blue-600 shadow transition';
        renderHotspotTable();
    });
});

if (el.statHotspotRadius && el.statHotspotRadius.parentElement) {
    const parent = el.statHotspotRadius.parentElement;
    parent.classList.add('cursor-pointer', 'hover:text-blue-300', 'transition');
    parent.title = 'Klik untuk filter hanya menampilkan user RADIUS / Voucher';
    parent.addEventListener('click', () => {
        const hsTabBtn = document.querySelector('button[data-tab="tab-hotspot"]');
        if (hsTabBtn) hsTabBtn.click();
        const radBtn = document.querySelector('.hs-filter-btn[data-filter="radius"]');
        if (radBtn) radBtn.click();
    });
}

// Audio toggle
el.btnAudioToggle.addEventListener('click', () => {
    appState.audioAlerts = !appState.audioAlerts;
    if (appState.audioAlerts) {
        el.audioIcon.classList.remove('text-gray-500');
        el.audioIcon.classList.add('text-emerald-400');
        showToast('Notifikasi suara aktif', 'success');
        playLoginSound();
    } else {
        el.audioIcon.classList.remove('text-emerald-400');
        el.audioIcon.classList.add('text-gray-500');
        showToast('Notifikasi suara dinonaktifkan', 'info');
    }
});

// Refresh button
el.btnForceRefresh.addEventListener('click', () => {
    el.btnForceRefresh.classList.add('animate-spin');
    socket.emit('force_refresh');
    setTimeout(() => el.btnForceRefresh.classList.remove('animate-spin'), 600);
});

// Interface selector change
el.ifaceSelect.addEventListener('change', (e) => {
    const selected = e.target.value;
    socket.emit('change_interface', selected);
    el.graphIfaceTag.textContent = selected;
    showToast(`Monitoring interface diubah ke: ${selected}`, 'info');
});

// Kick modal controls
el.btnCancelKick.addEventListener('click', () => {
    el.modalKick.classList.add('hidden');
    el.modalKick.classList.remove('flex');
    appState.kickTarget = null;
});

el.btnConfirmKick.addEventListener('click', async () => {
    if (!appState.kickTarget) return;
    try {
        const res = await fetch('/api/users/kick', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(appState.kickTarget)
        });
        const data = await res.json();
        if (data.success) {
            showToast(`User ${appState.kickTarget.user} berhasil diputuskan!`, 'success');
        } else {
            showToast(`Gagal: ${data.error}`, 'error');
        }
    } catch (e) {
        showToast(`Error: ${e.message}`, 'error');
    } finally {
        el.modalKick.classList.add('hidden');
        el.modalKick.classList.remove('flex');
        appState.kickTarget = null;
    }
});

function openKickModal(id, user, ip, mac, type = 'hotspot') {
    appState.kickTarget = { id, user, ip, mac, type };
    el.kickModalUser.textContent = user;
    el.kickModalIp.textContent = ip;
    el.kickModalMac.textContent = mac;
    el.modalKick.classList.remove('hidden');
    el.modalKick.classList.add('flex');
}

// ACTIVITY INSPECTOR LOGIC WITH IP-TO-WEBSITE DISPLAY
async function openInspectModal(user, ip, mac, id) {
    appState.inspectTarget = { user, ip, mac, id };
    el.inspectModalUser.textContent = user;
    el.inspectModalIp.textContent = ip;
    el.inspectModalConns.textContent = '...';
    el.inspectTimestamp.textContent = new Date().toLocaleTimeString('id-ID');

    el.inspectCategoriesList.innerHTML = `
        <div class="text-xs text-cyan-400 animate-pulse flex items-center gap-1.5 py-2">
            <i data-lucide="loader" class="w-4 h-4 animate-spin"></i>
            <span>Menganalisis paket & koneksi yang sedang dibuka ${user}...</span>
        </div>
    `;
    el.inspectConnsTable.innerHTML = `<div class="text-gray-500 py-3 text-center">Memuat daftar koneksi...</div>`;

    el.modalInspect.classList.remove('hidden');
    el.modalInspect.classList.add('flex');
    lucide.createIcons();

    await loadInspectData(user, ip);
}

async function loadInspectData(user, ip) {
    try {
        const res = await fetch(`/api/users/inspect?ip=${encodeURIComponent(ip)}&user=${encodeURIComponent(user)}`);
        const data = await res.json();

        if (data.success) {
            el.inspectModalConns.textContent = data.totalConnections || '0';
            el.inspectTimestamp.textContent = new Date().toLocaleTimeString('id-ID');

            // Render Categories Summary
            if (!data.categories || data.categories.length === 0) {
                el.inspectCategoriesList.innerHTML = `
                    <span class="text-gray-400 text-xs py-1">Tidak ada koneksi aktif saat ini (user sedang idle/standby).</span>
                `;
            } else {
                el.inspectCategoriesList.innerHTML = data.categories.map(c => `
                    <div class="px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-2 ${c.color}">
                        <i data-lucide="${c.icon || 'activity'}" class="w-4 h-4"></i>
                        <span>${escapeHtml(c.name)}</span>
                        <span class="text-[10px] bg-black/30 px-1.5 py-0.5 rounded-full">${c.count} sesi</span>
                        <span class="text-[10px] text-gray-300 font-mono">${c.bytesFormatted}</span>
                    </div>
                `).join('');
            }

            // Render Detailed Connections with Website & Server Owner
            if (!data.connections || data.connections.length === 0) {
                el.inspectConnsTable.innerHTML = `<div class="text-gray-500 py-4 text-center">Tidak ada koneksi tujuan yang terdeteksi.</div>`;
            } else {
                el.inspectConnsTable.innerHTML = data.connections.map(c => `
                    <div class="p-2.5 rounded-xl bg-gray-900 border border-gray-800/80 flex items-center justify-between gap-3 text-xs hover:bg-gray-850 transition">
                        <div class="flex items-center gap-3 truncate">
                            <span class="px-2 py-0.5 rounded uppercase font-bold text-[10px] bg-gray-800 text-cyan-400 border border-gray-700 font-mono shrink-0">${c.protocol}</span>
                            <div class="truncate">
                                <div class="flex items-center gap-2">
                                    <span class="text-white font-bold text-xs truncate">${escapeHtml(c.website || c.dstIp)}</span>
                                </div>
                                <div class="text-[11px] text-gray-400 font-mono mt-0.5 flex items-center gap-1.5">
                                    <span class="text-cyan-400">${escapeHtml(c.dstIp)}:${c.port}</span>
                                    ${c.domain && c.domain !== '-' ? `<span>• Domain: <span class="text-gray-300">${escapeHtml(c.domain)}</span></span>` : ''}
                                    ${c.organization && c.organization !== '-' ? `<span>• Provider: <span class="text-gray-300">${escapeHtml(c.organization)}</span></span>` : ''}
                                </div>
                            </div>
                        </div>
                        <div class="flex items-center gap-2.5 shrink-0 text-right">
                            <span class="text-[10px] px-2 py-0.5 rounded-full border ${c.color}">${escapeHtml(c.category)}</span>
                            <span class="text-cyan-300 font-mono text-xs font-semibold">${c.totalBytes}</span>
                        </div>
                    </div>
                `).join('');
            }

            lucide.createIcons();
        } else {
            el.inspectCategoriesList.innerHTML = `<div class="text-rose-400 text-xs">Error: ${data.error}</div>`;
        }
    } catch (e) {
        el.inspectCategoriesList.innerHTML = `<div class="text-rose-400 text-xs">Gagal mengambil data: ${e.message}</div>`;
    }
}

el.btnCloseInspect.addEventListener('click', () => {
    el.modalInspect.classList.add('hidden');
    el.modalInspect.classList.remove('flex');
    appState.inspectTarget = null;
});

el.btnDoneInspect.addEventListener('click', () => {
    el.modalInspect.classList.add('hidden');
    el.modalInspect.classList.remove('flex');
    appState.inspectTarget = null;
});

el.btnRefreshInspect.addEventListener('click', () => {
    if (appState.inspectTarget) {
        loadInspectData(appState.inspectTarget.user, appState.inspectTarget.ip);
        showToast('Analisis aktivitas diperbarui', 'info');
    }
});

el.btnKickFromInspect.addEventListener('click', () => {
    if (appState.inspectTarget) {
        el.modalInspect.classList.add('hidden');
        el.modalInspect.classList.remove('flex');
        openKickModal(appState.inspectTarget.id, appState.inspectTarget.user, appState.inspectTarget.ip, appState.inspectTarget.mac, 'hotspot');
    }
});

// Ping tool controls
el.btnOpenPing.addEventListener('click', () => {
    el.modalPing.classList.remove('hidden');
    el.modalPing.classList.add('flex');
});

el.btnClosePing.addEventListener('click', () => {
    el.modalPing.classList.add('hidden');
    el.modalPing.classList.remove('flex');
});

el.btnExecutePing.addEventListener('click', async () => {
    const host = el.pingTargetInput.value.trim();
    if (!host) return;

    el.btnExecutePing.disabled = true;
    el.btnExecutePing.classList.add('opacity-50');
    el.pingResultsBox.innerHTML = `<span class="text-indigo-400 animate-pulse">// Melakukan ping ke ${host} via MikroTik 192.168.1.64...</span>`;

    try {
        const res = await fetch('/api/tools/ping', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ host, count: 4 })
        });
        const data = await res.json();
        if (data.success && data.results) {
            let html = `<div class="text-emerald-400 font-semibold mb-2">== PING RESULT: ${host} ==</div>`;
            data.results.forEach((r, idx) => {
                html += `<div class="text-xs text-gray-300">
                    Seq #${r.seq || idx}: Host ${r.host || host} | Size: ${r.size || '56'}B | TTL: ${r.ttl || '-'} | Time: <span class="text-cyan-400 font-bold">${r.time || '-'}</span> | Loss: ${r['packet-loss'] || '0'}%
                </div>`;
            });
            el.pingResultsBox.innerHTML = html;
        } else {
            el.pingResultsBox.innerHTML = `<div class="text-rose-400">Ping Error: ${data.error || 'Unknown error'}</div>`;
        }
    } catch (e) {
        el.pingResultsBox.innerHTML = `<div class="text-rose-400">Error: ${e.message}</div>`;
    } finally {
        el.btnExecutePing.disabled = false;
        el.btnExecutePing.classList.remove('opacity-50');
    }
});

// Logs controls
document.querySelectorAll('#log-topic-filters .log-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('#log-topic-filters .log-filter-btn').forEach(b => {
            b.classList.remove('active', 'bg-blue-600', 'text-white');
            b.classList.add('bg-gray-800', 'text-gray-300');
        });
        btn.classList.add('active', 'bg-blue-600', 'text-white');
        btn.classList.remove('bg-gray-800', 'text-gray-300');
        appState.logFilter = btn.getAttribute('data-filter');
        renderLogs();
    });
});

el.btnToggleAutoscroll.addEventListener('click', () => {
    appState.autoScrollLogs = !appState.autoScrollLogs;
    el.btnToggleAutoscroll.innerHTML = `
        <i data-lucide="arrow-down" class="w-3.5 h-3.5"></i>
        <span>Auto Scroll: ${appState.autoScrollLogs ? 'ON' : 'OFF'}</span>
    `;
    lucide.createIcons();
});

el.btnClearLogView.addEventListener('click', () => {
    el.logsContainer.innerHTML = '<div class="text-gray-500 py-4 text-center">Log view cleared. Data baru akan muncul otomatis.</div>';
});

// Event timeline filters (All, Login, Logout)
document.querySelectorAll('#event-type-filters .event-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('#event-type-filters .event-filter-btn').forEach(b => {
            b.classList.remove('active', 'bg-amber-500', 'text-gray-950', 'font-bold');
            b.classList.add('bg-gray-800');
        });
        btn.classList.add('active', 'bg-amber-500', 'text-gray-950', 'font-bold');
        btn.classList.remove('bg-gray-800');
        appState.eventFilter = btn.getAttribute('data-filter');
        renderEvents();
    });
});

// CSV Export
el.btnExportCsv.addEventListener('click', () => {
    let csvContent = 'data:text/csv;charset=utf-8,';
    if (appState.currentTab === 'tab-hotspot') {
        csvContent += 'User,IP,MAC,Uptime,Idle,Bytes In,Bytes Out,Login By\n';
        (latestData.hotspot || []).forEach(u => {
            csvContent += `"${u.user}","${u.address}","${u.macAddress}","${u.uptime}","${u.idleTime}","${u.bytesInFormatted}","${u.bytesOutFormatted}","${u.loginBy}"\n`;
        });
    } else if (appState.currentTab === 'tab-events') {
        csvContent += 'Type,User,Time,IP,MAC,Duration,Quota\n';
        (appState.events || []).forEach(e => {
            csvContent += `"${e.type}","${e.user}","${e.time}","${e.address}","${e.macAddress}","${e.duration || '-'}","${e.bytesOutFormatted || '-'}"\n`;
        });
    } else if (appState.currentTab === 'tab-dhcp') {
        csvContent += 'HostName,IP,MAC,Status,Server,Expires After,Last Seen\n';
        (latestData.dhcp || []).forEach(d => {
            csvContent += `"${d.hostName}","${d.address}","${d.macAddress}","${d.status}","${d.server}","${d.expiresAfter}","${d.lastSeen}"\n`;
        });
    } else {
        csvContent += 'Name,Service,CallerID,Address,Uptime\n';
        (latestData.ppp || []).forEach(p => {
            csvContent += `"${p.name}","${p.service}","${p.callerId}","${p.address}","${p.uptime}"\n`;
        });
    }
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `mikrotik_${appState.currentTab}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    showToast('File CSV berhasil diunduh', 'success');
});

// Store latest full snapshot
let latestData = {
    hotspot: [],
    dhcp: [],
    ppp: [],
    logs: [],
    interfaces: []
};

// Render Functions
function renderCurrentTable() {
    renderHotspotTable();
    renderDhcpTable();
    renderPppTable();
    renderEvents();
}

// DURATION FORMATTERS (Merubah format 2h50m4s menjadi 2 Jam 50 Menit dengan Badge Elegan)
function formatDuration(str) {
    if (!str || str === '-' || str === '0s') return '0 Detik';
    const weeks = str.match(/(\d+)w/);
    const days = str.match(/(\d+)d/);
    const hours = str.match(/(\d+)h/);
    const minutes = str.match(/(\d+)m/);
    const seconds = str.match(/(\d+)s/);

    const parts = [];
    if (weeks) parts.push(weeks[1] + ' Minggu');
    if (days) parts.push(days[1] + ' Hari');
    if (hours) parts.push(hours[1] + ' Jam');
    if (minutes) parts.push(minutes[1] + ' Menit');
    if (!hours && !days && !weeks && seconds) {
        parts.push(seconds[1] + ' Detik');
    }
    if (parts.length === 0 && seconds) return seconds[1] + ' Detik';
    return parts.join(' ') || str;
}

function renderDurationBadge(uptimeStr) {
    if (!uptimeStr || uptimeStr === '-') return '<span class="text-gray-500 font-mono">-</span>';
    const label = formatDuration(uptimeStr);

    let hours = 0;
    const w = uptimeStr.match(/(\d+)w/);
    const d = uptimeStr.match(/(\d+)d/);
    const h = uptimeStr.match(/(\d+)h/);
    if (w) hours += parseInt(w[1], 10) * 168;
    if (d) hours += parseInt(d[1], 10) * 24;
    if (h) hours += parseInt(h[1], 10);

    let colorClass = 'bg-cyan-500/10 text-cyan-300 border-cyan-500/25';
    let iconColor = 'text-cyan-400';
    if (hours >= 12) {
        colorClass = 'bg-purple-500/15 text-purple-300 border-purple-500/30';
        iconColor = 'text-purple-400';
    } else if (hours >= 4) {
        colorClass = 'bg-amber-500/15 text-amber-300 border-amber-500/30';
        iconColor = 'text-amber-400';
    } else if (hours >= 1) {
        colorClass = 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
        iconColor = 'text-emerald-400';
    }

    return `
        <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border font-sans ${colorClass}" title="Waktu Asli MikroTik: ${escapeHtml(uptimeStr)}">
            <i data-lucide="clock" class="w-3.5 h-3.5 ${iconColor} shrink-0"></i>
            <span class="font-semibold whitespace-nowrap">${escapeHtml(label)}</span>
        </span>
    `;
}

function renderIdleBadge(idleStr) {
    if (!idleStr || idleStr === '0s') {
        return `
            <span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 font-sans font-medium">
                <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>Aktif Sekarang</span>
            </span>
        `;
    }
    const label = formatDuration(idleStr);
    return `
        <span class="text-gray-400 font-sans text-xs">
            ${escapeHtml(label)}
        </span>
    `;
}

function renderHotspotTable() {
    const q = appState.searchQuery;
    const filter = appState.hotspotRadiusFilter || 'all';
    const users = (latestData.hotspot || []).filter(u => {
        if (filter === 'radius' && !u.radius) return false;
        if (filter === 'local' && u.radius) return false;
        if (!q) return true;
        return (
            (u.user && u.user.toLowerCase().includes(q)) ||
            (u.address && u.address.toLowerCase().includes(q)) ||
            (u.macAddress && u.macAddress.toLowerCase().includes(q))
        );
    });

    const countEl = document.getElementById('hs-filter-count');
    if (countEl) countEl.textContent = users.length;

    if (users.length === 0) {
        el.hotspotTableBody.innerHTML = '';
        el.hotspotEmptyState.classList.remove('hidden');
        return;
    }
    el.hotspotEmptyState.classList.add('hidden');

    const activeKeys = new Set();
    const tbody = el.hotspotTableBody;

    users.forEach(u => {
        const key = 'hs-' + (u.id || u.user);
        activeKeys.add(key);

        let row = tbody.querySelector(`tr[data-key="${key}"]`);
        if (!row) {
            row = document.createElement('tr');
            row.setAttribute('data-key', key);
            row.className = 'hover:bg-gray-800/40 transition row-enter-animate';
            row.innerHTML = `
                <td class="px-5 py-3 font-semibold text-white flex items-center gap-2">
                    <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
                    <span>${escapeHtml(u.user)}</span>
                    ${u.radius ? '<span class="text-[9px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded border border-blue-500/30">RADIUS</span>' : ''}
                </td>
                <td class="px-4 py-3 text-cyan-400 font-mono">${escapeHtml(u.address)}</td>
                <td class="px-4 py-3 text-gray-400 text-[11px] font-mono">${escapeHtml(u.macAddress)}</td>
                <td class="px-4 py-3 col-uptime" data-val="${escapeHtml(u.uptime)}">${renderDurationBadge(u.uptime)}</td>
                <td class="px-4 py-3 col-idle" data-val="${escapeHtml(u.idleTime)}">${renderIdleBadge(u.idleTime)}</td>
                <td class="px-4 py-3 text-xs font-sans col-bytes" data-val="${escapeHtml(u.bytesOutFormatted + '_' + u.bytesInFormatted)}">
                    <span class="text-cyan-300 font-semibold">${u.bytesOutFormatted}</span> <span class="text-gray-500">/</span> <span class="text-violet-300 font-semibold">${u.bytesInFormatted}</span>
                </td>
                <td class="px-4 py-3">
                    <span class="px-2 py-0.5 rounded-full text-[10px] font-sans bg-gray-800 text-gray-300 border border-gray-700">${escapeHtml(u.loginBy)}</span>
                </td>
                <td class="px-4 py-3 text-center">
                    <div class="flex items-center justify-center gap-1.5">
                        <button onclick="openInspectModal('${escapeJs(u.user)}', '${escapeJs(u.address)}', '${escapeJs(u.macAddress)}', '${u.id}')" title="Lihat Aktivitas & Aplikasi User (YouTube, Game, dll)" class="px-2.5 py-1 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 text-xs font-semibold flex items-center gap-1 transition">
                            <i data-lucide="scan-eye" class="w-3.5 h-3.5"></i>
                            <span>Aktivitas</span>
                        </button>
                        <button onclick="openKickModal('${u.id}', '${escapeJs(u.user)}', '${escapeJs(u.address)}', '${escapeJs(u.macAddress)}', 'hotspot')" title="Putuskan koneksi user ini" class="p-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 transition">
                            <i data-lucide="power" class="w-3.5 h-3.5"></i>
                        </button>
                    </div>
                </td>
            `;
            tbody.appendChild(row);
            lucide.createIcons({ root: row });
        } else {
            // Update in-place only dynamic cells without DOM teardown
            const uptimeCell = row.querySelector('.col-uptime');
            if (uptimeCell && uptimeCell.getAttribute('data-val') !== u.uptime) {
                uptimeCell.setAttribute('data-val', u.uptime);
                uptimeCell.innerHTML = renderDurationBadge(u.uptime);
                lucide.createIcons({ root: uptimeCell });
            }

            const idleCell = row.querySelector('.col-idle');
            if (idleCell && idleCell.getAttribute('data-val') !== u.idleTime) {
                idleCell.setAttribute('data-val', u.idleTime);
                idleCell.innerHTML = renderIdleBadge(u.idleTime);
            }

            const bytesCell = row.querySelector('.col-bytes');
            const bytesKey = `${u.bytesOutFormatted}_${u.bytesInFormatted}`;
            if (bytesCell && bytesCell.getAttribute('data-val') !== bytesKey) {
                bytesCell.setAttribute('data-val', bytesKey);
                bytesCell.innerHTML = `
                    <span class="text-cyan-300 font-semibold">${u.bytesOutFormatted}</span> <span class="text-gray-500">/</span> <span class="text-violet-300 font-semibold">${u.bytesInFormatted}</span>
                `;
            }
        }
    });

    tbody.querySelectorAll('tr[data-key]').forEach(tr => {
        if (!activeKeys.has(tr.getAttribute('data-key'))) {
            tr.remove();
        }
    });
}

// Render Event Timeline
function renderEvents() {
    const q = appState.searchQuery;
    const filter = appState.eventFilter;

    const filtered = (appState.events || []).filter(e => {
        if (filter !== 'all' && e.type !== filter) return false;
        if (!q) return true;
        return (
            e.user.toLowerCase().includes(q) ||
            (e.address && e.address.toLowerCase().includes(q)) ||
            (e.macAddress && e.macAddress.toLowerCase().includes(q))
        );
    });

    el.eventCounterText.textContent = appState.events.length;
    el.tabBadgeEvents.textContent = appState.events.length;

    if (filtered.length === 0) {
        el.eventsContainer.innerHTML = '<div class="text-gray-500 py-10 text-center">Belum ada riwayat aktivitas yang cocok.</div>';
        return;
    }

    el.eventsContainer.innerHTML = filtered.map(ev => {
        const isLogin = ev.type === 'login';
        const cardBg = isLogin
            ? 'border-emerald-500/30 bg-emerald-950/20'
            : 'border-rose-500/30 bg-rose-950/20';

        const badgeHtml = isLogin
            ? '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">LOGIN</span>'
            : '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">LOGOUT</span>';

        const extraInfo = isLogin
            ? `<span class="text-gray-400">Metode:</span> <span class="text-gray-300 font-sans">${escapeHtml(ev.loginBy || '-')}</span>`
            : `<span class="text-gray-400">Durasi Aktif:</span> <span class="text-amber-300 font-sans font-semibold">${escapeHtml(formatDuration(ev.duration))}</span> • <span class="text-gray-400">Kuota:</span> <span class="text-cyan-400 font-sans">${escapeHtml(ev.bytesOutFormatted || '0 B')}</span>`;

        return `
            <div class="p-3 rounded-xl border ${cardBg} flex items-center justify-between gap-4 transition hover:bg-gray-800/40">
                <div class="flex items-center gap-3">
                    ${badgeHtml}
                    <div>
                        <div class="flex items-center gap-2">
                            <span class="font-bold text-white text-sm">${escapeHtml(ev.user)}</span>
                            <span class="text-cyan-400 font-mono text-xs">(${escapeHtml(ev.address)})</span>
                        </div>
                        <div class="text-[11px] text-gray-400 mt-0.5">
                            MAC: <span class="text-gray-400 font-mono">${escapeHtml(ev.macAddress)}</span> • ${extraInfo}
                        </div>
                    </div>
                </div>
                <div class="text-right">
                    <span class="text-gray-400 font-mono text-xs">${escapeHtml(ev.time)}</span>
                </div>
            </div>
        `;
    }).join('');
}

function renderDhcpTable() {
    const q = appState.searchQuery;
    const leases = (latestData.dhcp || []).filter(d => {
        if (!q) return true;
        return (
            (d.hostName && d.hostName.toLowerCase().includes(q)) ||
            (d.address && d.address.toLowerCase().includes(q)) ||
            (d.macAddress && d.macAddress.toLowerCase().includes(q))
        );
    });

    if (leases.length === 0) {
        el.dhcpTableBody.innerHTML = '';
        el.dhcpEmptyState.classList.remove('hidden');
        return;
    }
    el.dhcpEmptyState.classList.add('hidden');

    const activeKeys = new Set();
    const tbody = el.dhcpTableBody;

    leases.forEach(d => {
        const key = 'dhcp-' + (d.id || d.macAddress || d.address);
        activeKeys.add(key);
        const isBound = d.status === 'bound';

        let row = tbody.querySelector(`tr[data-key="${key}"]`);
        if (!row) {
            row = document.createElement('tr');
            row.setAttribute('data-key', key);
            row.className = 'hover:bg-gray-800/40 transition row-enter-animate';
            row.innerHTML = `
                <td class="px-5 py-3 font-semibold text-white flex items-center gap-2">
                    <span class="w-2 h-2 rounded-full ${isBound ? 'bg-emerald-400' : 'bg-amber-400'}"></span>
                    <span>${escapeHtml(d.hostName || 'Unnamed Device')}</span>
                </td>
                <td class="px-4 py-3 text-cyan-400">${escapeHtml(d.address)}</td>
                <td class="px-4 py-3 text-gray-400 text-[11px]">${escapeHtml(d.macAddress)}</td>
                <td class="px-4 py-3 col-status" data-val="${escapeHtml(d.status)}">
                    <span class="px-2 py-0.5 rounded-full text-[10px] font-sans ${isBound ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'bg-gray-800 text-gray-400'}">
                        ${escapeHtml(d.status)}
                    </span>
                </td>
                <td class="px-4 py-3 text-gray-400 text-xs">${escapeHtml(d.server)}</td>
                <td class="px-4 py-3 text-gray-400 text-xs col-expires">${escapeHtml(d.expiresAfter)}</td>
                <td class="px-4 py-3 text-gray-400 text-xs col-lastseen">${escapeHtml(d.lastSeen)}</td>
            `;
            tbody.appendChild(row);
        } else {
            const statusCell = row.querySelector('.col-status');
            if (statusCell && statusCell.getAttribute('data-val') !== d.status) {
                statusCell.setAttribute('data-val', d.status);
                statusCell.innerHTML = `
                    <span class="px-2 py-0.5 rounded-full text-[10px] font-sans ${isBound ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'bg-gray-800 text-gray-400'}">
                        ${escapeHtml(d.status)}
                    </span>
                `;
            }
            const expCell = row.querySelector('.col-expires');
            if (expCell && expCell.textContent !== d.expiresAfter) {
                expCell.textContent = d.expiresAfter;
            }
            const lsCell = row.querySelector('.col-lastseen');
            if (lsCell && lsCell.textContent !== d.lastSeen) {
                lsCell.textContent = d.lastSeen;
            }
        }
    });

    tbody.querySelectorAll('tr[data-key]').forEach(tr => {
        if (!activeKeys.has(tr.getAttribute('data-key'))) {
            tr.remove();
        }
    });
}

function renderPppTable() {
    const q = appState.searchQuery;
    const ppp = (latestData.ppp || []).filter(p => {
        if (!q) return true;
        return (
            (p.name && p.name.toLowerCase().includes(q)) ||
            (p.address && p.address.toLowerCase().includes(q)) ||
            (p.callerId && p.callerId.toLowerCase().includes(q))
        );
    });

    if (ppp.length === 0) {
        el.pppTableBody.innerHTML = '';
        el.pppEmptyState.classList.remove('hidden');
        return;
    }
    el.pppEmptyState.classList.add('hidden');

    const activeKeys = new Set();
    const tbody = el.pppTableBody;

    ppp.forEach(p => {
        const key = 'ppp-' + (p.id || p.name);
        activeKeys.add(key);

        let row = tbody.querySelector(`tr[data-key="${key}"]`);
        if (!row) {
            row = document.createElement('tr');
            row.setAttribute('data-key', key);
            row.className = 'hover:bg-gray-800/40 transition row-enter-animate';
            row.innerHTML = `
                <td class="px-5 py-3 font-semibold text-white flex items-center gap-2">
                    <span class="w-2 h-2 rounded-full bg-purple-400"></span>
                    <span>${escapeHtml(p.name)}</span>
                </td>
                <td class="px-4 py-3 text-gray-300">${escapeHtml(p.service)}</td>
                <td class="px-4 py-3 text-gray-400 text-[11px]">${escapeHtml(p.callerId)}</td>
                <td class="px-4 py-3 text-cyan-400 font-mono">${escapeHtml(p.address)}</td>
                <td class="px-4 py-3 col-uptime" data-val="${escapeHtml(p.uptime)}">${renderDurationBadge(p.uptime)}</td>
                <td class="px-4 py-3 text-center">
                    <button onclick="openKickModal('${p.id}', '${escapeJs(p.name)}', '${escapeJs(p.address)}', '${escapeJs(p.callerId)}', 'ppp')" title="Putuskan user PPPoE" class="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 transition">
                        <i data-lucide="power" class="w-3.5 h-3.5"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(row);
            lucide.createIcons({ root: row });
        } else {
            const uptimeCell = row.querySelector('.col-uptime');
            if (uptimeCell && uptimeCell.getAttribute('data-val') !== p.uptime) {
                uptimeCell.setAttribute('data-val', p.uptime);
                uptimeCell.innerHTML = renderDurationBadge(p.uptime);
                lucide.createIcons({ root: uptimeCell });
            }
        }
    });

    tbody.querySelectorAll('tr[data-key]').forEach(tr => {
        if (!activeKeys.has(tr.getAttribute('data-key'))) {
            tr.remove();
        }
    });
}

function renderLogs() {
    const filter = appState.logFilter;
    const logs = (latestData.logs || []).filter(l => {
        if (filter === 'all') return true;
        const topics = (l.topics || '').toLowerCase();
        if (filter.includes(',')) {
            const parts = filter.split(',');
            return parts.some(p => topics.includes(p));
        }
        return topics.includes(filter);
    });

    if (logs.length === 0) {
        el.logsContainer.innerHTML = '<div class="text-gray-500 py-8 text-center">Tidak ada log untuk kategori ini.</div>';
        return;
    }

    el.logsContainer.innerHTML = logs.map(l => {
        const topics = l.topics || '';
        let badgeColor = 'bg-blue-500/15 text-blue-400 border-blue-500/30';
        if (topics.includes('warning') || topics.includes('error')) {
            badgeColor = 'bg-rose-500/15 text-rose-400 border-rose-500/30';
        } else if (topics.includes('account')) {
            badgeColor = 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
        } else if (topics.includes('hotspot')) {
            badgeColor = 'bg-purple-500/15 text-purple-400 border-purple-500/30';
        } else if (topics.includes('dhcp')) {
            badgeColor = 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30';
        }

        return `
            <div class="log-row p-2 rounded-lg border border-gray-800/80 bg-gray-900/60 flex items-start gap-2.5 transition">
                <span class="text-gray-500 text-[11px] whitespace-nowrap pt-0.5">${escapeHtml(l.time)}</span>
                <span class="px-2 py-0.5 rounded text-[10px] font-sans border ${badgeColor} whitespace-nowrap">${escapeHtml(topics)}</span>
                <span class="text-gray-300 flex-1 break-all">${escapeHtml(l.message)}</span>
            </div>
        `;
    }).join('');

    if (appState.autoScrollLogs) {
        el.logsContainer.scrollTop = 0;
    }
}

function renderInterfaces() {
    el.interfacesTableBody.innerHTML = (latestData.interfaces || []).map(i => `
        <tr class="hover:bg-gray-800/40 transition">
            <td class="px-5 py-3 font-semibold text-white flex items-center gap-2">
                <span class="w-2 h-2 rounded-full ${i.running ? 'bg-emerald-400' : 'bg-gray-600'}"></span>
                <span>${escapeHtml(i.name)}</span>
            </td>
            <td class="px-4 py-3 text-gray-400">${escapeHtml(i.type)}</td>
            <td class="px-4 py-3">
                <span class="px-2 py-0.5 rounded-full text-[10px] font-sans ${i.running ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'bg-gray-800 text-gray-400'}">
                    ${i.running ? 'RUNNING' : 'STOPPED'}
                </span>
            </td>
            <td class="px-4 py-3 text-cyan-300 font-sans">${escapeHtml(i.rxFormatted)}</td>
            <td class="px-4 py-3 text-violet-300 font-sans">${escapeHtml(i.txFormatted)}</td>
        </tr>
    `).join('');
}

function populateInterfaceSelect(interfaces, selectedIface) {
    if (!Array.isArray(interfaces) || interfaces.length === 0) return;
    const valid = interfaces.filter(i => i && i.name && i.name !== 'undefined');
    if (valid.length === 0) return;
    el.ifaceSelect.innerHTML = valid.map(i => `
        <option value="${escapeHtml(i.name)}" class="bg-gray-800" ${i.name === selectedIface ? 'selected' : ''}>
            ${escapeHtml(i.name)} (${escapeHtml(i.type || 'interface')})
        </option>
    `).join('');
}

// Socket.io Event Handlers
socket.on('connect', () => {
    console.log('Connected to server websocket');
});

socket.on('initial_state', (data) => {
    latestData.hotspot = data.hotspot || [];
    latestData.dhcp = data.dhcp || [];
    latestData.ppp = data.ppp || [];
    latestData.logs = data.logs || [];
    latestData.interfaces = data.interfaces || [];
    appState.events = data.events || [];

    if (data.identity) el.routerIdentity.textContent = data.identity;
    if (data.resource) updateResourceUI(data.resource);
    if (data.counts) updateCountsUI(data.counts);
    if (data.traffic) updateTrafficUI(data.traffic);
    if (data.interfaces && data.config) {
        populateInterfaceSelect(data.interfaces, data.config.wanInterface);
    }
    if (data.voucherSummary) {
        updateOmsetUI(data.voucherSummary);
    }

    renderCurrentTable();
    renderLogs();
    renderInterfaces();
    lucide.createIcons();
});

socket.on('voucher_summary_update', (summary) => {
    updateOmsetUI(summary);
});

socket.on('voucher_activated', (voucher) => {
    fetchOmsetToday();
});

socket.on('user_event', (event) => {
    if (event.type === 'login') {
        playLoginSound();
        showFloatingEventAlert(event);
        triggerDesktopNotification(
            `🟢 User Login: ${event.user}`,
            `Login pada pukul ${event.time}\nIP: ${event.address} (${event.loginBy || 'voucher'})`
        );
    } else if (event.type === 'logout') {
        playLogoutSound();
        showFloatingEventAlert(event);
        triggerDesktopNotification(
            `🔴 User Logout: ${event.user}`,
            `Logout pada pukul ${event.time}\nAktif: ${event.duration || '-'} | Kuota: ${event.bytesOutFormatted || '-'}`
        );
    }
});

socket.on('events_history_update', (events) => {
    appState.events = events || [];
    renderEvents();
});

socket.on('stats_update', (data) => {
    if (data.connected) {
        el.connBadge.className = 'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/30';
        el.connText.textContent = 'ONLINE';
    } else {
        el.connBadge.className = 'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/30';
        el.connText.textContent = 'RECONNECTING';
    }

    if (data.identity) el.routerIdentity.textContent = data.identity;
    if (data.resource) updateResourceUI(data.resource);
    if (data.counts) updateCountsUI(data.counts);
    if (data.traffic) updateTrafficUI(data.traffic);
});

socket.on('users_update', (data) => {
    latestData.hotspot = data.hotspot || [];
    latestData.dhcp = data.dhcp || [];
    latestData.ppp = data.ppp || [];

    if (data.counts) updateCountsUI(data.counts);
    renderHotspotTable();
    renderDhcpTable();
    renderPppTable();
});

socket.on('logs_update', (logs) => {
    latestData.logs = logs || [];
    el.tabBadgeLogs.textContent = logs.length;
    renderLogs();
});

// Smooth Number Transition Helper (Lerp)
const currentNumbers = {
    cpu: 0,
    ramPercent: 0,
    hotspotCount: 0,
    radiusCount: 0,
    dhcpCount: 0,
    dhcpBound: 0,
    pppoeCount: 0,
    totalOnline: 0
};

function animateNumber(element, startVal, endVal, duration = 500, suffix = '', decimals = 0) {
    if (!element) return;
    startVal = Number(startVal) || 0;
    endVal = Number(endVal) || 0;

    // Cancel in-flight animation on this specific element to prevent race condition
    if (element._animId) {
        cancelAnimationFrame(element._animId);
        element._animId = null;
    }

    // When tab is hidden in background or duration is 0, update DOM directly without RAF
    if (startVal === endVal || document.hidden || duration <= 0) {
        const safeFinal = Math.max(0, endVal);
        element.textContent = (decimals > 0 ? safeFinal.toFixed(decimals) : Math.round(safeFinal)) + suffix;
        return;
    }

    const startTime = performance.now();
    function step(currentTime) {
        const elapsed = currentTime - startTime;
        if (elapsed < 0) {
            const safeFinal = Math.max(0, endVal);
            element.textContent = (decimals > 0 ? safeFinal.toFixed(decimals) : Math.round(safeFinal)) + suffix;
            element._animId = null;
            return;
        }

        const progress = Math.max(0, Math.min(elapsed / duration, 1));
        const ease = 1 - Math.pow(1 - progress, 3); // easeOutCubic
        let current = startVal + (endVal - startVal) * ease;

        // Anti-negative clamp
        if (endVal >= 0 && current < 0) current = 0;

        element.textContent = (decimals > 0 ? current.toFixed(decimals) : Math.round(current)) + suffix;

        if (progress < 1) {
            element._animId = requestAnimationFrame(step);
        } else {
            element._animId = null;
            const safeFinal = Math.max(0, endVal);
            element.textContent = (decimals > 0 ? safeFinal.toFixed(decimals) : Math.round(safeFinal)) + suffix;
        }
    }
    element._animId = requestAnimationFrame(step);
}

function updateResourceUI(r) {
    if (r.uptime) el.uptimeDisplay.textContent = `Uptime: ${formatDuration(r.uptime)}`;
    if (r.boardName) el.routerBoard.textContent = r.boardName;
    if (r.version) el.routerRos.textContent = `ROS v${r.version}`;
    if (r.cpuFrequency) el.cpuFreqBadge.textContent = `${r.cpuFrequency} MHz`;

    const cpu = Math.max(0, Math.min(100, r.cpuLoad || 0));
    animateNumber(el.cpuPercent, currentNumbers.cpu, cpu, 500, '%');
    currentNumbers.cpu = cpu;
    el.cpuProgressBar.style.width = `${cpu}%`;

    if (cpu > 80) {
        el.cpuProgressBar.className = 'h-full bg-rose-500 rounded-full transition-all duration-500';
        el.cpuPercent.className = 'font-bold font-mono text-rose-400';
        el.cpuDot.className = 'w-2 h-2 rounded-full bg-rose-400';
    } else if (cpu > 50) {
        el.cpuProgressBar.className = 'h-full bg-amber-500 rounded-full transition-all duration-500';
        el.cpuPercent.className = 'font-bold font-mono text-amber-400';
        el.cpuDot.className = 'w-2 h-2 rounded-full bg-amber-400';
    } else {
        el.cpuProgressBar.className = 'h-full bg-emerald-500 rounded-full transition-all duration-500';
        el.cpuPercent.className = 'font-bold font-mono text-emerald-400';
        el.cpuDot.className = 'w-2 h-2 rounded-full bg-emerald-400';
    }

    const totalMb = Math.round(r.totalMemory / (1024 * 1024));
    const freeMb = Math.round(r.freeMemory / (1024 * 1024));
    const usedMb = Math.max(0, totalMb - freeMb);
    const memPercent = Math.max(0, Math.min(100, r.memoryUsagePercent || 0));
    el.ramText.textContent = `${usedMb} MB / ${totalMb} MB (${memPercent}%)`;
    el.ramProgressBar.style.width = `${memPercent}%`;
}

function updateCountsUI(counts) {
    const hs = Math.max(0, counts.hotspot || 0);
    animateNumber(el.statHotspotCount, currentNumbers.hotspotCount, hs, 500);
    currentNumbers.hotspotCount = hs;
    el.tabBadgeHotspot.textContent = hs;

    const radiusCount = Math.max(0, (latestData.hotspot || []).filter(u => u.radius).length);
    animateNumber(el.statHotspotRadius, currentNumbers.radiusCount, radiusCount, 500);
    currentNumbers.radiusCount = radiusCount;

    const dhcpTotal = Math.max(0, latestData.dhcp.length || 0);
    animateNumber(el.statDhcpCount, currentNumbers.dhcpCount, dhcpTotal, 500);
    currentNumbers.dhcpCount = dhcpTotal;

    const bound = Math.max(0, counts.dhcp || 0);
    animateNumber(el.statDhcpBound, currentNumbers.dhcpBound, bound, 500);
    currentNumbers.dhcpBound = bound;
    el.tabBadgeDhcp.textContent = bound;

    const ppp = Math.max(0, counts.ppp || 0);
    animateNumber(el.statPppoeCount, currentNumbers.pppoeCount, ppp, 500);
    currentNumbers.pppoeCount = ppp;
    el.tabBadgePpp.textContent = ppp;

    const total = Math.max(0, counts.totalOnline || (hs + ppp));
    animateNumber(el.statTotalOnline, currentNumbers.totalOnline, total, 500);
    currentNumbers.totalOnline = total;
}

function updateTrafficUI(t) {
    el.statRxSpeed.textContent = t.rxFormatted || '0 bps';
    el.statTxSpeed.textContent = t.txFormatted || '0 bps';
    updateChart(t.rxBps || 0, t.txBps || 0);
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function escapeJs(str) {
    if (!str) return '';
    return String(str).replace(/'/g, "\\'").replace(/"/g, '\\"');
}

// VOUCHER OMSET STATS CARD HELPER
let currentRevenueToday = 0;
let currentRevenueMonth = 0;
function animateCurrency(element, startVal, endVal, duration = 500) {
    if (!element) return;
    startVal = Number(startVal) || 0;
    endVal = Number(endVal) || 0;

    if (element._animId) {
        cancelAnimationFrame(element._animId);
        element._animId = null;
    }

    if (startVal === endVal || document.hidden || duration <= 0) {
        element.textContent = `Rp ${Math.max(0, Math.round(endVal)).toLocaleString('id-ID')}`;
        return;
    }

    const startTime = performance.now();
    function step(currentTime) {
        const elapsed = currentTime - startTime;
        if (elapsed < 0) {
            element.textContent = `Rp ${Math.max(0, Math.round(endVal)).toLocaleString('id-ID')}`;
            element._animId = null;
            return;
        }

        const progress = Math.max(0, Math.min(elapsed / duration, 1));
        const ease = 1 - Math.pow(1 - progress, 3);
        let current = Math.round(startVal + (endVal - startVal) * ease);
        if (endVal >= 0 && current < 0) current = 0;

        element.textContent = `Rp ${current.toLocaleString('id-ID')}`;

        if (progress < 1) {
            element._animId = requestAnimationFrame(step);
        } else {
            element._animId = null;
            element.textContent = `Rp ${Math.max(0, Math.round(endVal)).toLocaleString('id-ID')}`;
        }
    }
    element._animId = requestAnimationFrame(step);
}

function updateOmsetUI(summary) {
    if (!summary) return;

    // 1. Hari Ini
    if (summary.today) {
        const t = summary.today || {};
        const rev = Math.max(0, t.totalRevenue || 0);
        const cnt = Math.max(0, t.totalCount || 0);
        animateCurrency(el.statOmsetToday, currentRevenueToday, rev);
        currentRevenueToday = rev;
        if (el.statOmsetVouchersToday) {
            el.statOmsetVouchersToday.textContent = cnt;
        }
    }

    // 2. Bulan Berjalan (This Month)
    if (summary.thisMonth) {
        const m = summary.thisMonth || {};
        const revM = Math.max(0, m.totalRevenue || 0);
        const cntM = Math.max(0, m.totalCount || 0);
        animateCurrency(el.statOmsetMonth, currentRevenueMonth, revM);
        currentRevenueMonth = revM;
        if (el.statOmsetVouchersMonth) {
            el.statOmsetVouchersMonth.textContent = cntM;
        }
        if (el.statOmsetMonthBadge && (m.monthLabel || m.monthName)) {
            el.statOmsetMonthBadge.textContent = m.monthLabel || m.monthName;
        }
    }
}

async function fetchOmsetToday() {
    try {
        const res = await fetch('/api/vouchers/summary');
        if (res.ok) {
            const summary = await res.json();
            updateOmsetUI(summary);
        }
    } catch (e) {}
}

// Page Visibility API: Instantly recover and clean up when returning from another tab
document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
        // Tab became visible again:
        // 1. Purge excess floating alerts immediately
        while (el.floatingAlerts && el.floatingAlerts.children.length > 2) {
            el.floatingAlerts.firstElementChild.remove();
        }

        // 2. Instantly update KPI numbers without laggy Lerp animation
        if (latestData && latestData.hotspot) {
            updateCountsUI({
                hotspot: latestData.hotspot.length,
                dhcp: (latestData.dhcp || []).filter(d => d.status === 'bound').length,
                ppp: (latestData.ppp || []).length,
                totalOnline: (latestData.hotspot || []).length + (latestData.ppp || []).length
            });
        }

        // 3. Render chart with accumulated data
        if (trafficChart) {
            trafficChart.update();
        }

        // 4. Update Omset
        fetchOmsetToday();
    }
});

document.addEventListener('DOMContentLoaded', () => {
    lucide.createIcons();
    initChart();
    fetchOmsetToday();
    // Poll omset every 4 seconds to ensure 100% sync with real-time voucher sales
    setInterval(fetchOmsetToday, 4000);
});
