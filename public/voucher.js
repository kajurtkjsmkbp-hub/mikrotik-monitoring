// Voucher Management & Daily Revenue Accounting Client Application
const socket = io();

// State
let vState = {
    packageFilter: 'all',
    statusFilter: 'all',
    dateFilter: null,
    monthFilter: null,
    historyMonthFilter: null,
    historyYearFilter: null,
    activeHistoryTab: 'daily',
    searchQuery: '',
    currentPage: 1,
    limit: 25,
    audioAlerts: true,
    pendingImport: {
        packageKey: null,
        fileName: null,
        content: null,
        codes: []
    }
};

// Safe Event Listener Helper
function on(el, event, handler) {
    if (el && typeof el.addEventListener === 'function') {
        el.addEventListener(event, handler);
    }
}

// Dynamic Elements Accessor (Prevents caching null if DOM is not immediately ready)
const vel = new Proxy({}, {
    get(target, prop) {
        const idMap = {
            clock: 'voucher-clock',
            headerTodayDate: 'header-today-date',
            btnSyncRouter: 'btn-sync-router',
            syncIcon: 'sync-icon',
            statTotalRevenueToday: 'stat-total-revenue-today',
            statTotalUsedToday: 'stat-total-used-today',
            statCurrentMonthName: 'stat-current-month-name',
            statTotalRevenueMonth: 'stat-total-revenue-month',
            statRevenue1kToday: 'stat-revenue-1k-today',
            statCount1kToday: 'stat-count-1k-today',
            statStock1k: 'stat-stock-1k',
            cardStock1k: 'card-stock-1k',
            statRevenue2kToday: 'stat-revenue-2k-today',
            statCount2kToday: 'stat-count-2k-today',
            statStock2k: 'stat-stock-2k',
            cardStock2k: 'card-stock-2k',
            statRevenue3kToday: 'stat-revenue-3k-today',
            statCount3kToday: 'stat-count-3k-today',
            statStock3k: 'stat-stock-3k',
            cardStock3k: 'card-stock-3k',
            filterDailyWrapper: 'filter-daily-wrapper',
            filterDailyMonth: 'filter-daily-month',
            filterMonthlyWrapper: 'filter-monthly-wrapper',
            filterMonthlyYear: 'filter-monthly-year',
            tabRekapHarian: 'tab-rekap-harian',
            tabRekapBulanan: 'tab-rekap-bulanan',
            containerDailyHistory: 'container-daily-history',
            containerMonthlyHistory: 'container-monthly-history',
            dailyHistoryTbody: 'daily-history-tbody',
            dailyHistoryTfoot: 'daily-history-tfoot',
            monthlyHistoryTbody: 'monthly-history-tbody',
            monthlyHistoryTfoot: 'monthly-history-tfoot',
            historyFilterBadge: 'history-filter-badge',
            historyFilterMonthText: 'history-filter-month-text',
            btnExportHistoryCsv: 'btn-export-history-csv',
            exportHistoryLabel: 'export-history-label',
            filterStatus: 'filter-status',
            filterPackage: 'filter-package',
            voucherSearch: 'voucher-search',
            vouchersTbody: 'vouchers-tbody',
            paginationInfo: 'pagination-info',
            pageIndicator: 'page-indicator',
            btnPrevPage: 'btn-prev-page',
            btnNextPage: 'btn-next-page',
            modalImportPreview: 'modal-import-preview',
            previewModalSubtitle: 'preview-modal-subtitle',
            previewFilename: 'preview-filename',
            previewTotalCount: 'preview-total-count',
            previewCodesBox: 'preview-codes-box',
            btnClosePreview: 'btn-close-preview',
            btnCancelPreview: 'btn-cancel-preview',
            btnConfirmImport: 'btn-confirm-import',
            modalPaste: 'modal-paste',
            pasteModalSubtitle: 'paste-modal-subtitle',
            pasteTextarea: 'paste-textarea',
            btnClosePaste: 'btn-close-paste',
            btnCancelPaste: 'btn-cancel-paste',
            btnConfirmPaste: 'btn-confirm-paste',
            floatingAlerts: 'voucher-floating-alerts',
            toastContainer: 'voucher-toast-container'
        };
        const id = idMap[prop] || prop;
        return document.getElementById(id);
    }
});

// Web Audio Cash Register Chime on Voucher Activation (Singleton AudioContext)
let sharedVoucherAudioCtx = null;
function getSharedVoucherAudioContext() {
    try {
        if (!sharedVoucherAudioCtx) {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (AudioContextClass) sharedVoucherAudioCtx = new AudioContextClass();
        }
        if (sharedVoucherAudioCtx && sharedVoucherAudioCtx.state === 'suspended') {
            sharedVoucherAudioCtx.resume();
        }
        return sharedVoucherAudioCtx;
    } catch (e) {
        return null;
    }
}

function playVoucherSound() {
    if (document.hidden) return;
    try {
        const audioCtx = getSharedVoucherAudioContext();
        if (!audioCtx) return;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
        osc.frequency.exponentialRampToValueAtTime(880.00, audioCtx.currentTime + 0.12); // A5
        gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.42);
    } catch (e) {}
}

// Toast helper
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
    vel.toastContainer.appendChild(toast);

    setTimeout(() => toast.classList.remove('translate-y-2', 'opacity-0'), 10);
    setTimeout(() => {
        toast.classList.add('opacity-0', 'translate-y-2');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// Floating Live Alert on Activation (max 3, skips if tab hidden)
function showFloatingVoucherAlert(v) {
    if (document.hidden) return;

    while (vel.floatingAlerts && vel.floatingAlerts.children.length >= 3) {
        vel.floatingAlerts.firstElementChild.remove();
    }

    const alert = document.createElement('div');
    alert.className = `p-3.5 rounded-2xl border border-amber-500/50 bg-gradient-to-r from-amber-950/90 to-gray-900 shadow-xl shadow-amber-500/10 backdrop-blur-md transition-all duration-300 transform translate-x-10 opacity-0 pointer-events-auto flex items-start gap-3`;
    alert.innerHTML = `
        <div class="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
            <i data-lucide="sparkles" class="w-4 h-4"></i>
        </div>
        <div class="flex-1 text-xs">
            <div class="flex items-center justify-between gap-2">
                <span class="font-bold text-amber-400 uppercase text-[11px] tracking-wide">
                    💰 Voucher Diaktifkan!
                </span>
                <span class="text-gray-400 text-[10px] font-mono">${v.activatedTime || new Date().toLocaleTimeString()}</span>
            </div>
            <div class="text-white font-bold text-sm mt-0.5">${escapeHtml(v.code)} • ${v.formattedRevenue || 'Rp ' + (v.price||0).toLocaleString('id-ID')}</div>
            <div class="text-[11px] text-gray-400 mt-1">
                Paket: <span class="text-amber-300 font-semibold">${v.duration || '3 Jam'}</span> • IP: <span class="text-cyan-400 font-mono">${v.userAddress || '-'}</span>
            </div>
        </div>
    `;

    vel.floatingAlerts.appendChild(alert);
    lucide.createIcons({ root: alert });

    requestAnimationFrame(() => alert.classList.remove('translate-x-10', 'opacity-0'));
    setTimeout(() => {
        if (alert.parentNode) {
            alert.classList.add('opacity-0', 'translate-x-10');
            setTimeout(() => {
                if (alert.parentNode) alert.remove();
            }, 300);
        }
    }, 4500);
}

// Live Clock
setInterval(() => {
    const now = new Date();
    vel.clock.textContent = now.toLocaleTimeString('id-ID');
}, 1000);

// Number animation helper (lerp with race-condition & negative clamp)
function animateCurrency(el, startVal, endVal, duration = 500) {
    if (!el) return;
    startVal = Number(startVal) || 0;
    endVal = Number(endVal) || 0;

    if (el._animId) {
        cancelAnimationFrame(el._animId);
        el._animId = null;
    }

    if (startVal === endVal || document.hidden || duration <= 0) {
        el.textContent = `Rp ${Math.max(0, Math.round(endVal)).toLocaleString('id-ID')}`;
        return;
    }

    const startTime = performance.now();
    function step(currentTime) {
        const elapsed = currentTime - startTime;
        if (elapsed < 0) {
            el.textContent = `Rp ${Math.max(0, Math.round(endVal)).toLocaleString('id-ID')}`;
            el._animId = null;
            return;
        }

        const progress = Math.max(0, Math.min(elapsed / duration, 1));
        const ease = 1 - Math.pow(1 - progress, 3);
        let current = Math.round(startVal + (endVal - startVal) * ease);
        if (endVal >= 0 && current < 0) current = 0;

        el.textContent = `Rp ${current.toLocaleString('id-ID')}`;
        if (progress < 1) {
            el._animId = requestAnimationFrame(step);
        } else {
            el._animId = null;
            el.textContent = `Rp ${Math.max(0, Math.round(endVal)).toLocaleString('id-ID')}`;
        }
    }
    el._animId = requestAnimationFrame(step);
}

let lastRevenue = {
    total: 0,
    month: 0,
    r1k: 0,
    r2k: 0,
    r3k: 0
};

// Render Summary Numbers
function renderSummary(summary) {
    if (!summary) return;

    if (summary.todayLabel) {
        vel.headerTodayDate.textContent = summary.todayLabel;
    }

    const t = summary.today || {};
    const stock = summary.stock || {};
    const m = summary.thisMonth || {};

    // Total Today
    animateCurrency(vel.statTotalRevenueToday, lastRevenue.total, t.totalRevenue || 0);
    lastRevenue.total = t.totalRevenue || 0;
    vel.statTotalUsedToday.textContent = t.totalCount || 0;

    // This Month
    if (vel.statCurrentMonthName && m.monthName) {
        vel.statCurrentMonthName.textContent = m.monthName;
    }
    if (vel.statTotalRevenueMonth) {
        animateCurrency(vel.statTotalRevenueMonth, lastRevenue.month, m.totalRevenue || 0);
        lastRevenue.month = m.totalRevenue || 0;
    }

    // 1K
    animateCurrency(vel.statRevenue1kToday, lastRevenue.r1k, t.revenue1k || 0);
    lastRevenue.r1k = t.revenue1k || 0;
    vel.statCount1kToday.textContent = t.count1k || 0;
    vel.statStock1k.textContent = stock['1k'] || 0;
    vel.cardStock1k.textContent = stock['1k'] || 0;

    // 2K
    animateCurrency(vel.statRevenue2kToday, lastRevenue.r2k, t.revenue2k || 0);
    lastRevenue.r2k = t.revenue2k || 0;
    vel.statCount2kToday.textContent = t.count2k || 0;
    vel.statStock2k.textContent = stock['2k'] || 0;
    vel.cardStock2k.textContent = stock['2k'] || 0;

    // 3K
    animateCurrency(vel.statRevenue3kToday, lastRevenue.r3k, t.revenue3k || 0);
    lastRevenue.r3k = t.revenue3k || 0;
    vel.statCount3kToday.textContent = t.count3k || 0;
    vel.statStock3k.textContent = stock['3k'] || 0;
    vel.cardStock3k.textContent = stock['3k'] || 0;
}

// Load distinct available years and months from backend into dropdown filters
async function loadAvailablePeriods() {
    try {
        const res = await fetch('/api/vouchers/periods');
        if (!res.ok) return;
        const data = await res.json();
        const years = data.years || [];
        const months = data.months || [];

        // 1. Populate Month Filter (for Rekap Harian)
        if (vel.filterDailyMonth) {
            const currentVal = vState.historyMonthFilter || '';
            let html = '<option value="">Semua Bulan (Terbaru)</option>';
            months.forEach(m => {
                const selected = m.monthKey === currentVal ? 'selected' : '';
                html += `<option value="${escapeHtml(m.monthKey)}" ${selected}>${escapeHtml(m.monthLabel)}</option>`;
            });
            vel.filterDailyMonth.innerHTML = html;
        }

        // 2. Populate Year Filter (for Rekap Bulanan)
        if (vel.filterMonthlyYear) {
            const currentYearVal = vState.historyYearFilter || '';
            let html = '<option value="">Semua Tahun</option>';
            years.forEach(y => {
                const selected = y === currentYearVal ? 'selected' : '';
                html += `<option value="${escapeHtml(y)}" ${selected}>Tahun ${escapeHtml(y)}</option>`;
            });
            vel.filterMonthlyYear.innerHTML = html;
        }
    } catch (e) {
        console.error('Error loading available periods:', e);
    }
}

// History Tab Switcher
window.switchHistoryTab = function(tab) {
    vState.activeHistoryTab = tab;
    if (tab === 'daily') {
        if (vel.tabRekapHarian) vel.tabRekapHarian.className = 'px-3 py-1.5 rounded-lg font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/40 transition flex items-center gap-1.5 shadow-sm';
        if (vel.tabRekapBulanan) vel.tabRekapBulanan.className = 'px-3 py-1.5 rounded-lg font-semibold text-gray-400 hover:text-white transition flex items-center gap-1.5';
        if (vel.filterDailyWrapper) {
            vel.filterDailyWrapper.classList.remove('hidden');
            vel.filterDailyWrapper.classList.add('flex');
        }
        if (vel.filterMonthlyWrapper) {
            vel.filterMonthlyWrapper.classList.add('hidden');
            vel.filterMonthlyWrapper.classList.remove('flex');
        }
        if (vel.containerDailyHistory) vel.containerDailyHistory.classList.remove('hidden');
        if (vel.containerMonthlyHistory) vel.containerMonthlyHistory.classList.add('hidden');
        if (vel.exportHistoryLabel) vel.exportHistoryLabel.textContent = 'Export CSV Harian';
        loadDailyHistory();
    } else {
        if (vel.tabRekapBulanan) vel.tabRekapBulanan.className = 'px-3 py-1.5 rounded-lg font-semibold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 transition flex items-center gap-1.5 shadow-sm';
        if (vel.tabRekapHarian) vel.tabRekapHarian.className = 'px-3 py-1.5 rounded-lg font-semibold text-gray-400 hover:text-white transition flex items-center gap-1.5';
        if (vel.filterDailyWrapper) {
            vel.filterDailyWrapper.classList.add('hidden');
            vel.filterDailyWrapper.classList.remove('flex');
        }
        if (vel.filterMonthlyWrapper) {
            vel.filterMonthlyWrapper.classList.remove('hidden');
            vel.filterMonthlyWrapper.classList.add('flex');
        }
        if (vel.containerDailyHistory) vel.containerDailyHistory.classList.add('hidden');
        if (vel.containerMonthlyHistory) vel.containerMonthlyHistory.classList.remove('hidden');
        if (vel.exportHistoryLabel) vel.exportHistoryLabel.textContent = 'Export CSV Bulanan';
        loadMonthlyHistory();
    }
    lucide.createIcons();
};

window.filterDailyByMonth = function(monthKey, monthLabel) {
    vState.historyMonthFilter = monthKey;
    if (vel.filterDailyMonth) {
        vel.filterDailyMonth.value = monthKey;
    }
    if (vel.historyFilterBadge) {
        vel.historyFilterBadge.classList.remove('hidden');
        vel.historyFilterBadge.classList.add('inline-flex');
    }
    if (vel.historyFilterMonthText) {
        vel.historyFilterMonthText.textContent = monthLabel || monthKey;
    }
    switchHistoryTab('daily');
};

window.clearMonthHistoryFilter = function() {
    vState.historyMonthFilter = null;
    if (vel.filterDailyMonth) {
        vel.filterDailyMonth.value = '';
    }
    if (vel.historyFilterBadge) {
        vel.historyFilterBadge.classList.add('hidden');
        vel.historyFilterBadge.classList.remove('inline-flex');
    }
    loadDailyHistory();
};

// Fetch & Render Daily History Table
async function loadDailyHistory() {
    try {
        let url = '/api/vouchers/daily-history?limit=60';
        if (vState.historyMonthFilter) {
            url += `&month=${encodeURIComponent(vState.historyMonthFilter)}`;
        }
        const res = await fetch(url);
        const data = await res.json();
        const list = Array.isArray(data) ? data : (data.items || []);
        const summary = Array.isArray(data) ? null : data.summary;

        if (!list || list.length === 0) {
            vel.dailyHistoryTbody.innerHTML = `
                <tr>
                    <td colspan="7" class="text-center py-8 text-gray-500 font-sans">
                        Belum ada riwayat aktivasi voucher tercatat untuk periode ini.
                    </td>
                </tr>
            `;
            if (vel.dailyHistoryTfoot) {
                vel.dailyHistoryTfoot.classList.add('hidden');
                vel.dailyHistoryTfoot.innerHTML = '';
            }
            return;
        }

        vel.dailyHistoryTbody.innerHTML = list.map(item => `
            <tr class="hover:bg-gray-800/40 transition">
                <td class="px-5 py-3.5 font-semibold text-white">
                    <div class="flex items-center gap-2">
                        <span class="w-2 h-2 rounded-full bg-amber-400"></span>
                        <span class="font-bold">${escapeHtml(item.formattedDate || item.dateKey)}</span>
                    </div>
                </td>
                <td class="px-4 py-3.5 text-center">
                    <span class="text-amber-300 font-bold font-mono">${item.count1k || 0}</span>
                    <span class="text-gray-500 text-[11px] block font-mono">Rp ${(item.revenue1k || 0).toLocaleString('id-ID')}</span>
                </td>
                <td class="px-4 py-3.5 text-center">
                    <span class="text-cyan-300 font-bold font-mono">${item.count2k || 0}</span>
                    <span class="text-gray-500 text-[11px] block font-mono">Rp ${(item.revenue2k || 0).toLocaleString('id-ID')}</span>
                </td>
                <td class="px-4 py-3.5 text-center">
                    <span class="text-emerald-300 font-bold font-mono">${item.count3k || 0}</span>
                    <span class="text-gray-500 text-[11px] block font-mono">Rp ${(item.revenue3k || 0).toLocaleString('id-ID')}</span>
                </td>
                <td class="px-4 py-3.5 text-center font-bold text-gray-200 font-mono">
                    ${item.totalCount || 0} voucher
                </td>
                <td class="px-5 py-3.5 text-right font-mono text-amber-400 font-extrabold text-sm">
                    Rp ${(item.totalRevenue || 0).toLocaleString('id-ID')}
                </td>
                <td class="px-4 py-3.5 text-center">
                    <button onclick="filterByDate('${item.dateKey}')" class="px-2.5 py-1 rounded-lg bg-gray-800 hover:bg-gray-700 text-cyan-400 border border-gray-700 text-xs font-semibold transition" title="Lihat voucher yang aktif pada tanggal ini">
                        Rincian
                    </button>
                </td>
            </tr>
        `).join('');

        // Render Total Summary Row in Table Footer
        if (summary && vel.dailyHistoryTfoot) {
            const titleLabel = summary.selectedMonth !== 'all' ? `TOTAL BULAN INI` : `TOTAL PERIODE (${list.length} HARI)`;
            vel.dailyHistoryTfoot.innerHTML = `
                <tr>
                    <td class="px-5 py-3.5 text-amber-400 uppercase text-xs font-extrabold flex items-center gap-1.5">
                        <i data-lucide="calculator" class="w-3.5 h-3.5"></i>
                        <span>${escapeHtml(titleLabel)}</span>
                    </td>
                    <td class="px-4 py-3.5 text-center">
                        <span class="text-amber-300 font-bold font-mono">${summary.count1k || 0} lbr</span>
                        <span class="text-gray-400 text-[11px] block font-mono">Rp ${(summary.revenue1k || 0).toLocaleString('id-ID')}</span>
                    </td>
                    <td class="px-4 py-3.5 text-center">
                        <span class="text-cyan-300 font-bold font-mono">${summary.count2k || 0} lbr</span>
                        <span class="text-gray-400 text-[11px] block font-mono">Rp ${(summary.revenue2k || 0).toLocaleString('id-ID')}</span>
                    </td>
                    <td class="px-4 py-3.5 text-center">
                        <span class="text-emerald-300 font-bold font-mono">${summary.count3k || 0} lbr</span>
                        <span class="text-gray-400 text-[11px] block font-mono">Rp ${(summary.revenue3k || 0).toLocaleString('id-ID')}</span>
                    </td>
                    <td class="px-4 py-3.5 text-center font-extrabold text-white font-mono text-xs">
                        ${summary.totalCount || 0} voucher
                    </td>
                    <td class="px-5 py-3.5 text-right font-mono text-amber-400 font-extrabold text-sm sm:text-base">
                        Rp ${(summary.totalRevenue || 0).toLocaleString('id-ID')}
                    </td>
                    <td class="px-4 py-3.5 text-center text-[10px] text-gray-500 font-sans">
                        Rekap
                    </td>
                </tr>
            `;
            vel.dailyHistoryTfoot.classList.remove('hidden');
        } else if (vel.dailyHistoryTfoot) {
            vel.dailyHistoryTfoot.classList.add('hidden');
        }

        lucide.createIcons({ root: vel.containerDailyHistory });
    } catch (e) {
        console.error('Error loading daily history:', e);
    }
}

// Fetch & Render Monthly History Table
async function loadMonthlyHistory() {
    try {
        let url = '/api/vouchers/monthly-history?limit=36';
        if (vState.historyYearFilter) {
            url += `&year=${encodeURIComponent(vState.historyYearFilter)}`;
        }
        const res = await fetch(url);
        const data = await res.json();
        const list = Array.isArray(data) ? data : (data.items || []);
        const summary = Array.isArray(data) ? null : data.summary;

        if (!list || list.length === 0) {
            vel.monthlyHistoryTbody.innerHTML = `
                <tr>
                    <td colspan="7" class="text-center py-8 text-gray-500 font-sans">
                        Belum ada riwayat bulanan tercatat untuk periode ini. Data omset akan terkumpul otomatis setiap bulan.
                    </td>
                </tr>
            `;
            if (vel.monthlyHistoryTfoot) {
                vel.monthlyHistoryTfoot.classList.add('hidden');
                vel.monthlyHistoryTfoot.innerHTML = '';
            }
            return;
        }

        vel.monthlyHistoryTbody.innerHTML = list.map(item => `
            <tr class="hover:bg-gray-800/40 transition">
                <td class="px-5 py-3.5 font-semibold text-white">
                    <div class="flex items-center gap-2">
                        <span class="w-2 h-2 rounded-full bg-cyan-400"></span>
                        <span class="font-bold font-sans text-sm">${escapeHtml(item.monthLabel || item.monthKey)}</span>
                    </div>
                </td>
                <td class="px-4 py-3.5 text-center">
                    <span class="text-amber-300 font-bold font-mono">${item.count1k || 0} lbr</span>
                    <span class="text-gray-500 text-[11px] block font-mono">Rp ${(item.revenue1k || 0).toLocaleString('id-ID')}</span>
                </td>
                <td class="px-4 py-3.5 text-center">
                    <span class="text-cyan-300 font-bold font-mono">${item.count2k || 0} lbr</span>
                    <span class="text-gray-500 text-[11px] block font-mono">Rp ${(item.revenue2k || 0).toLocaleString('id-ID')}</span>
                </td>
                <td class="px-4 py-3.5 text-center">
                    <span class="text-emerald-300 font-bold font-mono">${item.count3k || 0} lbr</span>
                    <span class="text-gray-500 text-[11px] block font-mono">Rp ${(item.revenue3k || 0).toLocaleString('id-ID')}</span>
                </td>
                <td class="px-4 py-3.5 text-center font-bold text-gray-200 font-mono">
                    ${item.totalCount || 0} voucher
                </td>
                <td class="px-5 py-3.5 text-right font-mono text-cyan-400 font-extrabold text-base">
                    Rp ${(item.totalRevenue || 0).toLocaleString('id-ID')}
                </td>
                <td class="px-4 py-3.5 text-center">
                    <button onclick="filterDailyByMonth('${item.monthKey}', '${escapeHtml(item.monthLabel)}')" class="px-2.5 py-1 rounded-lg bg-gray-800 hover:bg-gray-700 text-cyan-400 border border-gray-700 text-xs font-semibold transition flex items-center gap-1 mx-auto" title="Lihat rincian penjualan hari demi hari di bulan ini">
                        <i data-lucide="list-filter" class="w-3.5 h-3.5"></i>
                        <span>Lihat Hari</span>
                    </button>
                </td>
            </tr>
        `).join('');

        // Render Grand Total Summary Row in Table Footer
        if (summary && vel.monthlyHistoryTfoot) {
            const titleLabel = summary.selectedYear !== 'all' ? `TOTAL OMSET TAHUN ${summary.selectedYear}` : `TOTAL OMSET KESELURUHAN`;
            vel.monthlyHistoryTfoot.innerHTML = `
                <tr>
                    <td class="px-5 py-3.5 text-cyan-400 uppercase text-xs font-extrabold flex items-center gap-1.5">
                        <i data-lucide="calculator" class="w-3.5 h-3.5"></i>
                        <span>${escapeHtml(titleLabel)}</span>
                    </td>
                    <td class="px-4 py-3.5 text-center">
                        <span class="text-amber-300 font-bold font-mono">${summary.count1k || 0} lbr</span>
                        <span class="text-gray-400 text-[11px] block font-mono">Rp ${(summary.revenue1k || 0).toLocaleString('id-ID')}</span>
                    </td>
                    <td class="px-4 py-3.5 text-center">
                        <span class="text-cyan-300 font-bold font-mono">${summary.count2k || 0} lbr</span>
                        <span class="text-gray-400 text-[11px] block font-mono">Rp ${(summary.revenue2k || 0).toLocaleString('id-ID')}</span>
                    </td>
                    <td class="px-4 py-3.5 text-center">
                        <span class="text-emerald-300 font-bold font-mono">${summary.count3k || 0} lbr</span>
                        <span class="text-gray-400 text-[11px] block font-mono">Rp ${(summary.revenue3k || 0).toLocaleString('id-ID')}</span>
                    </td>
                    <td class="px-4 py-3.5 text-center font-extrabold text-white font-mono text-xs">
                        ${summary.totalCount || 0} voucher
                    </td>
                    <td class="px-5 py-3.5 text-right font-mono text-cyan-400 font-extrabold text-base">
                        Rp ${(summary.totalRevenue || 0).toLocaleString('id-ID')}
                    </td>
                    <td class="px-4 py-3.5 text-center text-[10px] text-gray-500 font-sans">
                        Tahunan
                    </td>
                </tr>
            `;
            vel.monthlyHistoryTfoot.classList.remove('hidden');
        } else if (vel.monthlyHistoryTfoot) {
            vel.monthlyHistoryTfoot.classList.add('hidden');
        }

        lucide.createIcons({ root: vel.containerMonthlyHistory });
    } catch (e) {
        console.error('Error loading monthly history:', e);
    }
}

// Fetch & Render Vouchers List
async function loadVouchers() {
    try {
        const params = new URLSearchParams({
            packageFilter: vState.packageFilter,
            statusFilter: vState.statusFilter,
            search: vState.searchQuery,
            page: vState.currentPage,
            limit: vState.limit
        });

        if (vState.dateFilter) {
            params.append('dateFilter', vState.dateFilter);
        }

        const res = await fetch(`/api/vouchers?${params.toString()}`);
        const data = await res.json();
        const items = data.items || [];
        const pag = data.pagination || { page: 1, totalPages: 1, totalItems: 0 };

        vel.pageIndicator.textContent = `${pag.page} / ${pag.totalPages}`;
        vel.paginationInfo.textContent = `Menampilkan ${items.length} dari ${pag.totalItems} total voucher`;
        vel.btnPrevPage.disabled = pag.page <= 1;
        vel.btnNextPage.disabled = pag.page >= pag.totalPages;

        if (items.length === 0) {
            vel.vouchersTbody.innerHTML = `
                <tr>
                    <td colspan="8" class="text-center py-10 text-gray-500 font-sans">
                        Tidak ada voucher yang cocok dengan filter ini.
                    </td>
                </tr>
            `;
            return;
        }

        vel.vouchersTbody.innerHTML = items.map(v => {
            const isUsed = v.status === 'used';
            const isOnline = v.activeNow;

            let statusBadge = '';
            if (isOnline) {
                statusBadge = `
                    <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-sans font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                        <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                        <span>Online Sekarang</span>
                    </span>
                `;
            } else if (isUsed) {
                statusBadge = `
                    <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-sans font-semibold bg-emerald-950/60 text-emerald-400 border border-emerald-800/50">
                        <span>✓ Terpakai</span>
                    </span>
                `;
            } else {
                statusBadge = `
                    <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-sans font-medium bg-gray-800 text-gray-400 border border-gray-700">
                        <span>Stok Belum Terpakai</span>
                    </span>
                `;
            }

            const pkgBadge = {
                '1k': '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">1K (3 Jam)</span>',
                '2k': '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">2K (10 Jam)</span>',
                '3k': '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">3K (1 Hari)</span>'
            }[v.package] || v.package;

            const timeFormatted = v.activatedAt 
                ? `${v.activatedDayName ? v.activatedDayName + ', ' : ''}${v.activatedDate || ''} <span class="text-amber-300">${v.activatedTime || ''}</span>`
                : '<span class="text-gray-500">-</span>';

            const deviceInfo = (v.userAddress || v.userMac)
                ? `<span class="text-cyan-400">${escapeHtml(v.userAddress || '-')}</span><br><span class="text-gray-500 text-[10px]">${escapeHtml(v.userMac || '-')}</span>`
                : '<span class="text-gray-500">-</span>';

            return `
                <tr class="hover:bg-gray-800/40 transition">
                    <td class="px-5 py-3 font-semibold text-white flex items-center gap-2">
                        <span class="w-1.5 h-1.5 rounded-full ${isUsed ? 'bg-emerald-400' : 'bg-gray-500'}"></span>
                        <span class="font-mono text-sm tracking-wide font-bold">${escapeHtml(v.code)}</span>
                    </td>
                    <td class="px-4 py-3 font-sans">${pkgBadge}</td>
                    <td class="px-4 py-3 font-mono font-bold text-gray-200">Rp ${(v.price || 0).toLocaleString('id-ID')}</td>
                    <td class="px-4 py-3">${statusBadge}</td>
                    <td class="px-4 py-3 text-xs font-mono">${timeFormatted}</td>
                    <td class="px-4 py-3 text-xs font-mono">${deviceInfo}</td>
                    <td class="px-4 py-3 text-gray-400 text-xs font-sans truncate max-w-xs" title="${escapeHtml(v.source || '-')}">${escapeHtml(v.source || '-')}</td>
                    <td class="px-4 py-3 text-center">
                        <button onclick="deleteSingleVoucher('${v.id}')" title="Hapus voucher ini dari database" class="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 transition">
                            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

        lucide.createIcons({ root: vel.vouchersTbody });
    } catch (e) {
        console.error('Error loading vouchers:', e);
    }
}

// Initial Data Load
async function loadInitialData() {
    try {
        const res = await fetch('/api/vouchers/summary');
        if (res.ok) {
            const summary = await res.json();
            renderSummary(summary);
        }
    } catch (e) {
        console.error('Error loading summary:', e);
    }

    try {
        await loadAvailablePeriods();
    } catch (e) {
        console.error('Error loading periods:', e);
    }

    try {
        await loadDailyHistory();
    } catch (e) {
        console.error('Error loading daily history:', e);
    }

    try {
        await loadVouchers();
    } catch (e) {
        console.error('Error loading vouchers:', e);
    }
}

// Filter by Date from Daily History Row
window.filterByDate = function(dateKey) {
    vState.dateFilter = dateKey;
    vState.statusFilter = 'used';
    if (vel.filterStatus) vel.filterStatus.value = 'used';
    vState.currentPage = 1;
    loadVouchers();
    showToast(`Memfilter voucher yang aktif pada tanggal ${dateKey}`, 'info');
    const tableSection = document.querySelector('section:last-of-type');
    if (tableSection) tableSection.scrollIntoView({ behavior: 'smooth' });
};

// History Filter Dropdown Listeners
on(vel.filterDailyMonth, 'change', (e) => {
    vState.historyMonthFilter = e.target.value || null;
    if (vState.historyMonthFilter) {
        if (vel.historyFilterBadge) {
            vel.historyFilterBadge.classList.remove('hidden');
            vel.historyFilterBadge.classList.add('inline-flex');
        }
        const optText = e.target.options[e.target.selectedIndex]?.text || vState.historyMonthFilter;
        if (vel.historyFilterMonthText) vel.historyFilterMonthText.textContent = optText;
    } else {
        if (vel.historyFilterBadge) {
            vel.historyFilterBadge.classList.add('hidden');
            vel.historyFilterBadge.classList.remove('inline-flex');
        }
    }
    loadDailyHistory();
});

on(vel.filterMonthlyYear, 'change', (e) => {
    vState.historyYearFilter = e.target.value || null;
    loadMonthlyHistory();
});

// Filter Changes
on(vel.filterStatus, 'change', (e) => {
    vState.statusFilter = e.target.value;
    vState.currentPage = 1;
    loadVouchers();
});

on(vel.filterPackage, 'change', (e) => {
    vState.packageFilter = e.target.value;
    vState.currentPage = 1;
    loadVouchers();
});

on(vel.voucherSearch, 'input', (e) => {
    vState.searchQuery = e.target.value.trim();
    vState.currentPage = 1;
    loadVouchers();
});

// Pagination
on(vel.btnPrevPage, 'click', () => {
    if (vState.currentPage > 1) {
        vState.currentPage--;
        loadVouchers();
    }
});

on(vel.btnNextPage, 'click', () => {
    vState.currentPage++;
    loadVouchers();
});

// Sync with Router Action
on(vel.btnSyncRouter, 'click', async () => {
    if (vel.syncIcon) vel.syncIcon.classList.add('animate-spin');
    try {
        const res = await fetch('/api/vouchers/sync-router', { method: 'POST' });
        const data = await res.json();
        if (data.success) {
            renderSummary(data.summary);
            await loadDailyHistory();
            await loadVouchers();
            showToast(`Sinkronisasi selesai! ${data.synced} voucher diperbarui dari router.`, 'success');
        } else {
            showToast(`Gagal sinkron: ${data.error}`, 'error');
        }
    } catch (e) {
        showToast(`Error: ${e.message}`, 'error');
    } finally {
        setTimeout(() => {
            if (vel.syncIcon) vel.syncIcon.classList.remove('animate-spin');
        }, 600);
    }
});

// File Upload & Drag & Drop Handling for 3 Package Slots
document.querySelectorAll('.dropzone').forEach(zone => {
    const pkg = zone.getAttribute('data-package');
    const input = zone.querySelector('.file-input');

    zone.addEventListener('click', () => input.click());

    zone.addEventListener('dragover', (e) => {
        e.preventDefault();
        zone.classList.add('border-amber-400', 'bg-amber-950/20');
    });

    zone.addEventListener('dragleave', () => {
        zone.classList.remove('border-amber-400', 'bg-amber-950/20');
    });

    zone.addEventListener('drop', (e) => {
        e.preventDefault();
        zone.classList.remove('border-amber-400', 'bg-amber-950/20');
        if (e.dataTransfer.files.length > 0) {
            handleFileSelected(e.dataTransfer.files[0], pkg);
        }
    });

    input.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFileSelected(e.target.files[0], pkg);
        }
    });
});

// Read and parse selected file
function handleFileSelected(file, packageKey) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        const content = e.target.result;
        openImportPreviewModal(packageKey, file.name, content);
    };
    reader.readAsText(file);
}

// Open Import Preview Modal
function openImportPreviewModal(packageKey, fileName, content) {
    const pkgNames = {
        '1k': 'Paket Rp 1.000 (3 Jam)',
        '2k': 'Paket Rp 2.000 (10 Jam)',
        '3k': 'Paket Rp 3.000 (1 Hari / 24 Jam)'
    };

    // Client-side extraction for instant preview
    const foundCodes = extractCodesClient(content);

    vState.pendingImport = {
        packageKey,
        fileName,
        content,
        codes: foundCodes
    };

    vel.previewModalSubtitle.textContent = `Kategori: ${pkgNames[packageKey] || packageKey}`;
    vel.previewFilename.textContent = fileName;
    vel.previewTotalCount.textContent = `${foundCodes.length} voucher terdeteksi`;

    if (foundCodes.length === 0) {
        vel.previewCodesBox.innerHTML = `
            <div class="text-rose-400 py-3 text-center">
                Tidak ada kode voucher yang terdeteksi otomatis dari file ini.<br>
                Gunakan tombol "Atau Tempel Teks Kode" untuk memasukkan kode secara manual.
            </div>
        `;
        vel.btnConfirmImport.disabled = true;
    } else {
        const previewList = foundCodes.slice(0, 30);
        vel.previewCodesBox.innerHTML = previewList.map((code, idx) => `
            <div>${idx + 1}. <span class="font-bold text-white">${escapeHtml(code)}</span></div>
        `).join('') + (foundCodes.length > 30 ? `<div class="text-gray-500 pt-1">... dan ${foundCodes.length - 30} kode voucher lainnya</div>` : '');
        vel.btnConfirmImport.disabled = false;
    }

    vel.modalImportPreview.classList.remove('hidden');
    vel.modalImportPreview.classList.add('flex');
    lucide.createIcons({ root: vel.modalImportPreview });
}

// Client-side quick extractor for preview
function extractCodesClient(content) {
    if (!content || typeof content !== 'string') return [];
    const results = [];
    const seen = new Set();

    // 1. Primary Precision Parser: Match Mikhmon table structure
    // Finds table row with "Username", then captures the FIRST <td> in the very next row!
    const mikhmonUserRegex = /<tr[^>]*>\s*<td[^>]*>\s*Username\s*<\/td>[\s\S]*?<\/tr>\s*<tr[^>]*>\s*<td[^>]*>([\s\S]*?)<\/td>/gi;
    let match;
    while ((match = mikhmonUserRegex.exec(content)) !== null) {
        const clean = match[1].replace(/<[^>]+>/g, '').trim().toLowerCase();
        if (/^[a-zA-Z0-9]{3,12}$/.test(clean)) {
            if (!seen.has(clean)) {
                seen.add(clean);
                results.push(clean);
            }
        }
    }

    // 2. Secondary: If template uses class="user" or id="user"
    if (results.length === 0) {
        const classUserRegex = /<(?:td|span|div|b)[^>]*class=["'][^"']*\buser(?:name)?\b[^"']*["'][^>]*>([\s\S]*?)<\/(?:td|span|div|b)>/gi;
        while ((match = classUserRegex.exec(content)) !== null) {
            const clean = match[1].replace(/<[^>]+>/g, '').trim().toLowerCase();
            if (/^[a-zA-Z0-9]{3,12}$/.test(clean) && clean !== 'username' && clean !== 'user') {
                if (!seen.has(clean)) {
                    seen.add(clean);
                    results.push(clean);
                }
            }
        }
    }

    // 3. Fallback: Plain text / pasted codes (one code per line)
    if (results.length === 0) {
        const lines = content.split(/[\r\n]+/);
        for (const line of lines) {
            const clean = line.replace(/<[^>]+>/g, '').trim().toLowerCase();
            if (/^[a-zA-Z0-9]{4,10}$/.test(clean)) {
                if (!['username', 'password', 'voucher', 'hotspot', 'profile', 'rupiah', 'unlimited'].includes(clean)) {
                    if (!seen.has(clean)) {
                        seen.add(clean);
                        results.push(clean);
                    }
                }
            }
        }
    }

    return results;
}

// Confirm Import API Call
on(vel.btnConfirmImport, 'click', async () => {
    if (!vState.pendingImport.packageKey || !vState.pendingImport.content) return;

    if (vel.btnConfirmImport) {
        vel.btnConfirmImport.disabled = true;
        vel.btnConfirmImport.innerHTML = `<i data-lucide="loader" class="w-4 h-4 animate-spin"></i> Menyimpan...`;
        if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons({ root: vel.btnConfirmImport });
    }

    try {
        const res = await fetch('/api/vouchers/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                packageKey: vState.pendingImport.packageKey,
                content: vState.pendingImport.content,
                fileName: vState.pendingImport.fileName
            })
        });

        const data = await res.json();
        if (data.success) {
            showToast(`Berhasil menyimpan ${data.addedCount} voucher baru ke database! (Duplikat dilewati: ${data.duplicateCount})`, 'success');
            if (vel.modalImportPreview) {
                vel.modalImportPreview.classList.add('hidden');
                vel.modalImportPreview.classList.remove('flex');
            }
            vState.pendingImport = { packageKey: null, fileName: null, content: null, codes: [] };

            // Reload UI
            loadInitialData();
        } else {
            showToast(`Gagal: ${data.error}`, 'error');
        }
    } catch (e) {
        showToast(`Error: ${e.message}`, 'error');
    } finally {
        if (vel.btnConfirmImport) {
            vel.btnConfirmImport.disabled = false;
            vel.btnConfirmImport.innerHTML = `<i data-lucide="check" class="w-4 h-4"></i> <span>Simpan ke Database</span>`;
            if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons({ root: vel.btnConfirmImport });
        }
    }
});

on(vel.btnClosePreview, 'click', () => {
    if (vel.modalImportPreview) {
        vel.modalImportPreview.classList.add('hidden');
        vel.modalImportPreview.classList.remove('flex');
    }
});
on(vel.btnCancelPreview, 'click', () => {
    if (vel.modalImportPreview) {
        vel.modalImportPreview.classList.add('hidden');
        vel.modalImportPreview.classList.remove('flex');
    }
});

// Manual Paste Modal
let currentPastePkg = '1k';
window.openPasteModal = function(pkgKey) {
    currentPastePkg = pkgKey;
    const pkgNames = {
        '1k': 'Paket Rp 1.000 (3 Jam)',
        '2k': 'Paket Rp 2.000 (10 Jam)',
        '3k': 'Paket Rp 3.000 (1 Hari / 24 Jam)'
    };
    if (vel.pasteModalSubtitle) vel.pasteModalSubtitle.textContent = `Untuk ${pkgNames[pkgKey] || pkgKey}`;
    if (vel.pasteTextarea) vel.pasteTextarea.value = '';
    if (vel.modalPaste) {
        vel.modalPaste.classList.remove('hidden');
        vel.modalPaste.classList.add('flex');
    }
};

on(vel.btnClosePaste, 'click', () => {
    if (vel.modalPaste) {
        vel.modalPaste.classList.add('hidden');
        vel.modalPaste.classList.remove('flex');
    }
});
on(vel.btnCancelPaste, 'click', () => {
    if (vel.modalPaste) {
        vel.modalPaste.classList.add('hidden');
        vel.modalPaste.classList.remove('flex');
    }
});

on(vel.btnConfirmPaste, 'click', async () => {
    const rawText = vel.pasteTextarea ? vel.pasteTextarea.value.trim() : '';
    if (!rawText) {
        showToast('Silakan masukkan minimal satu kode voucher', 'error');
        return;
    }

    try {
        const res = await fetch('/api/vouchers/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                packageKey: currentPastePkg,
                content: rawText,
                fileName: 'Tempel Manual'
            })
        });

        const data = await res.json();
        if (data.success) {
            showToast(`Berhasil menyimpan ${data.addedCount} voucher baru ke database! (Duplikat: ${data.duplicateCount})`, 'success');
            if (vel.modalPaste) {
                vel.modalPaste.classList.add('hidden');
                vel.modalPaste.classList.remove('flex');
            }
            loadInitialData();
        } else {
            showToast(`Gagal: ${data.error}`, 'error');
        }
    } catch (e) {
        showToast(`Error: ${e.message}`, 'error');
    }
});

// Delete Single Voucher
window.deleteSingleVoucher = async function(id) {
    if (!confirm('Yakin ingin menghapus voucher ini dari database?')) return;
    try {
        const res = await fetch('/api/vouchers/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: [id] })
        });
        const data = await res.json();
        if (data.success) {
            showToast('Voucher berhasil dihapus', 'info');
            loadInitialData();
        }
    } catch (e) {
        showToast(`Gagal menghapus: ${e.message}`, 'error');
    }
};

// Clear Stock
window.clearStock = async function(pkgKey) {
    const pkgNames = { '1k': 'Rp 1.000', '2k': 'Rp 2.000', '3k': 'Rp 3.000' };
    if (!confirm(`Yakin ingin mengosongkan semua stok BELUM TERPAKAI untuk Paket ${pkgNames[pkgKey]}? (Voucher yang sudah terpakai tetap aman).`)) return;

    try {
        const res = await fetch('/api/vouchers/clear-stock', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ packageKey: pkgKey })
        });
        const data = await res.json();
        if (data.success) {
            showToast(`Stok ${data.deleted} voucher paket ${pkgNames[pkgKey]} berhasil dikosongkan`, 'info');
            loadInitialData();
        }
    } catch (e) {
        showToast(`Gagal: ${e.message}`, 'error');
    }
};

// Export History (Daily or Monthly) to CSV
window.exportHistoryCsv = async function() {
    try {
        if (vState.activeHistoryTab === 'monthly') {
            let url = '/api/vouchers/monthly-history?limit=120';
            if (vState.historyYearFilter) {
                url += `&year=${encodeURIComponent(vState.historyYearFilter)}`;
            }
            const res = await fetch(url);
            const data = await res.json();
            const list = Array.isArray(data) ? data : (data.items || []);

            if (!list || list.length === 0) {
                showToast('Belum ada data bulanan untuk diunduh', 'info');
                return;
            }
            let csv = 'Periode Bulan,Kode Bulan,Paket 1K (Lembar),Subtotal 1K,Paket 2K (Lembar),Subtotal 2K,Paket 3K (Lembar),Subtotal 3K,Total Voucher,Total Omset Rupiah\n';
            list.forEach(row => {
                csv += `"${row.monthLabel || row.monthKey}","${row.monthKey}",${row.count1k || 0},${row.revenue1k || 0},${row.count2k || 0},${row.revenue2k || 0},${row.count3k || 0},${row.revenue3k || 0},${row.totalCount || 0},${row.totalRevenue || 0}\n`;
            });
            const encodedUri = encodeURI('data:text/csv;charset=utf-8,' + csv);
            const link = document.createElement('a');
            link.setAttribute('href', encodedUri);
            const filename = vState.historyYearFilter ? `rekap_omset_bulanan_tahun_${vState.historyYearFilter}.csv` : `rekap_omset_bulanan_${new Date().toISOString().slice(0, 10)}.csv`;
            link.setAttribute('download', filename);
            document.body.appendChild(link);
            link.click();
            link.remove();
            showToast('Rekap omset bulanan berhasil diexport ke CSV', 'success');
        } else {
            let url = '/api/vouchers/daily-history?limit=365';
            if (vState.historyMonthFilter) {
                url += `&month=${encodeURIComponent(vState.historyMonthFilter)}`;
            }
            const res = await fetch(url);
            const data = await res.json();
            const list = Array.isArray(data) ? data : (data.items || []);

            if (!list || list.length === 0) {
                showToast('Belum ada data harian untuk diunduh', 'info');
                return;
            }
            let csv = 'Tanggal,Hari,Voucher 1K (3 Jam),Subtotal 1K,Voucher 2K (10 Jam),Subtotal 2K,Voucher 3K (1 Hari),Subtotal 3K,Total Lembar,Total Omset Rupiah\n';
            list.forEach(row => {
                csv += `"${row.formattedDate || row.dateKey}","${row.dayName || ''}",${row.count1k || 0},${row.revenue1k || 0},${row.count2k || 0},${row.revenue2k || 0},${row.count3k || 0},${row.revenue3k || 0},${row.totalCount || 0},${row.totalRevenue || 0}\n`;
            });
            const encodedUri = encodeURI('data:text/csv;charset=utf-8,' + csv);
            const link = document.createElement('a');
            link.setAttribute('href', encodedUri);
            const filename = vState.historyMonthFilter ? `rekap_omset_harian_${vState.historyMonthFilter}.csv` : `rekap_omset_harian_${new Date().toISOString().slice(0, 10)}.csv`;
            link.setAttribute('download', filename);
            document.body.appendChild(link);
            link.click();
            link.remove();
            showToast('Rekap omset harian berhasil diexport ke CSV', 'success');
        }
    } catch (e) {
        showToast(`Gagal export: ${e.message}`, 'error');
    }
};

const exportBtn = document.getElementById('btn-export-history-csv') || document.getElementById('btn-export-daily-csv');
if (exportBtn) {
    on(exportBtn, 'click', window.exportHistoryCsv);
}

// Real-time Socket.io Listeners
socket.on('initial_state', (data) => {
    if (data.voucherSummary) {
        renderSummary(data.voucherSummary);
    }
});

socket.on('voucher_summary_update', (summary) => {
    renderSummary(summary);
    if (vState.activeHistoryTab === 'monthly') {
        loadMonthlyHistory();
    } else {
        loadDailyHistory();
    }
    loadVouchers();
});

socket.on('voucher_activated', (voucher) => {
    playVoucherSound();
    showFloatingVoucherAlert(voucher);
    showToast(`🟢 Voucher ${voucher.code} (${voucher.packageName || 'Rp ' + voucher.price}) diaktifkan!`, 'success');
});

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Start
let isVoucherInitialized = false;
function initVoucherApp() {
    if (isVoucherInitialized) return;
    isVoucherInitialized = true;

    try {
        if (typeof lucide !== 'undefined' && lucide.createIcons) {
            lucide.createIcons();
        }
    } catch (e) {
        console.error('Lucide error:', e);
    }

    loadInitialData();

    // Auto-refresh summary every 3 seconds so stock & revenue stay 100% in sync without manual reload
    setInterval(async () => {
        try {
            const res = await fetch('/api/vouchers/summary');
            if (res.ok) {
                const summary = await res.json();
                renderSummary(summary);
            }
        } catch (e) {}
    }, 3000);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initVoucherApp);
} else {
    initVoucherApp();
}

