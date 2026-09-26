// Voucher Management & Daily Revenue Accounting Client Application
const socket = io();

// State
let vState = {
    packageFilter: 'all',
    statusFilter: 'all',
    dateFilter: null,
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

// Elements
const vel = {
    clock: document.getElementById('voucher-clock'),
    headerTodayDate: document.getElementById('header-today-date'),
    btnSyncRouter: document.getElementById('btn-sync-router'),
    syncIcon: document.getElementById('sync-icon'),

    // Top Stats
    statTotalRevenueToday: document.getElementById('stat-total-revenue-today'),
    statTotalUsedToday: document.getElementById('stat-total-used-today'),
    statRevenue1kToday: document.getElementById('stat-revenue-1k-today'),
    statCount1kToday: document.getElementById('stat-count-1k-today'),
    statStock1k: document.getElementById('stat-stock-1k'),
    cardStock1k: document.getElementById('card-stock-1k'),

    statRevenue2kToday: document.getElementById('stat-revenue-2k-today'),
    statCount2kToday: document.getElementById('stat-count-2k-today'),
    statStock2k: document.getElementById('stat-stock-2k'),
    cardStock2k: document.getElementById('card-stock-2k'),

    statRevenue3kToday: document.getElementById('stat-revenue-3k-today'),
    statCount3kToday: document.getElementById('stat-count-3k-today'),
    statStock3k: document.getElementById('stat-stock-3k'),
    cardStock3k: document.getElementById('card-stock-3k'),

    // Daily History
    dailyHistoryTbody: document.getElementById('daily-history-tbody'),
    btnExportDailyCsv: document.getElementById('btn-export-daily-csv'),

    // Vouchers Table & Filter
    filterStatus: document.getElementById('filter-status'),
    filterPackage: document.getElementById('filter-package'),
    voucherSearch: document.getElementById('voucher-search'),
    vouchersTbody: document.getElementById('vouchers-tbody'),
    paginationInfo: document.getElementById('pagination-info'),
    pageIndicator: document.getElementById('page-indicator'),
    btnPrevPage: document.getElementById('btn-prev-page'),
    btnNextPage: document.getElementById('btn-next-page'),

    // Preview Modal
    modalImportPreview: document.getElementById('modal-import-preview'),
    previewModalSubtitle: document.getElementById('preview-modal-subtitle'),
    previewFilename: document.getElementById('preview-filename'),
    previewTotalCount: document.getElementById('preview-total-count'),
    previewCodesBox: document.getElementById('preview-codes-box'),
    btnClosePreview: document.getElementById('btn-close-preview'),
    btnCancelPreview: document.getElementById('btn-cancel-preview'),
    btnConfirmImport: document.getElementById('btn-confirm-import'),

    // Paste Modal
    modalPaste: document.getElementById('modal-paste'),
    pasteModalSubtitle: document.getElementById('paste-modal-subtitle'),
    pasteTextarea: document.getElementById('paste-textarea'),
    btnClosePaste: document.getElementById('btn-close-paste'),
    btnCancelPaste: document.getElementById('btn-cancel-paste'),
    btnConfirmPaste: document.getElementById('btn-confirm-paste'),

    // Alerts & Toasts
    floatingAlerts: document.getElementById('voucher-floating-alerts'),
    toastContainer: document.getElementById('voucher-toast-container')
};

// Web Audio Cash Register Chime on Voucher Activation
function playVoucherSound() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
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

// Floating Live Alert on Activation
function showFloatingVoucherAlert(v) {
    const alert = document.createElement('div');
    alert.className = `p-3.5 rounded-2xl border border-amber-500/50 bg-gradient-to-r from-amber-950/90 to-gray-900 shadow-xl shadow-amber-500/10 backdrop-blur-md transition-all duration-400 transform translate-x-10 opacity-0 pointer-events-auto flex items-start gap-3`;
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

    setTimeout(() => alert.classList.remove('translate-x-10', 'opacity-0'), 20);
    setTimeout(() => {
        alert.classList.add('opacity-0', 'translate-x-10');
        setTimeout(() => alert.remove(), 400);
    }, 6000);
}

// Live Clock
setInterval(() => {
    const now = new Date();
    vel.clock.textContent = now.toLocaleTimeString('id-ID');
}, 1000);

// Number animation helper (lerp)
function animateCurrency(el, startVal, endVal, duration = 600) {
    if (!el) return;
    startVal = Number(startVal) || 0;
    endVal = Number(endVal) || 0;
    if (startVal === endVal) {
        el.textContent = `Rp ${endVal.toLocaleString('id-ID')}`;
        return;
    }
    const startTime = performance.now();
    function step(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const ease = 1 - Math.pow(1 - progress, 3);
        const current = Math.round(startVal + (endVal - startVal) * ease);
        el.textContent = `Rp ${current.toLocaleString('id-ID')}`;
        if (progress < 1) {
            requestAnimationFrame(step);
        }
    }
    requestAnimationFrame(step);
}

let lastRevenue = {
    total: 0,
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

    // Total Today
    animateCurrency(vel.statTotalRevenueToday, lastRevenue.total, t.totalRevenue || 0);
    lastRevenue.total = t.totalRevenue || 0;
    vel.statTotalUsedToday.textContent = t.totalCount || 0;

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

// Fetch & Render Daily History Table
async function loadDailyHistory() {
    try {
        const res = await fetch('/api/vouchers/daily-history?limit=40');
        const list = await res.json();

        if (!list || list.length === 0) {
            vel.dailyHistoryTbody.innerHTML = `
                <tr>
                    <td colspan="7" class="text-center py-8 text-gray-500 font-sans">
                        Belum ada riwayat aktivasi voucher tercatat. Saat ada pelanggan hotspot yang login, riwayat harian otomatis muncul di sini.
                    </td>
                </tr>
            `;
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

        lucide.createIcons({ root: vel.dailyHistoryTbody });
    } catch (e) {
        console.error('Error loading daily history:', e);
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
        const summary = await res.json();
        renderSummary(summary);
    } catch (e) {}

    await loadDailyHistory();
    await loadVouchers();
}

// Filter by Date from Daily History Row
window.filterByDate = function(dateKey) {
    vState.dateFilter = dateKey;
    vState.statusFilter = 'used';
    vel.filterStatus.value = 'used';
    vState.currentPage = 1;
    loadVouchers();
    showToast(`Memfilter voucher yang aktif pada tanggal ${dateKey}`, 'info');
    document.querySelector('section:last-of-type').scrollIntoView({ behavior: 'smooth' });
};

// Filter Changes
vel.filterStatus.addEventListener('change', (e) => {
    vState.statusFilter = e.target.value;
    vState.currentPage = 1;
    loadVouchers();
});

vel.filterPackage.addEventListener('change', (e) => {
    vState.packageFilter = e.target.value;
    vState.currentPage = 1;
    loadVouchers();
});

vel.voucherSearch.addEventListener('input', (e) => {
    vState.searchQuery = e.target.value.trim();
    vState.currentPage = 1;
    loadVouchers();
});

// Pagination
vel.btnPrevPage.addEventListener('click', () => {
    if (vState.currentPage > 1) {
        vState.currentPage--;
        loadVouchers();
    }
});

vel.btnNextPage.addEventListener('click', () => {
    vState.currentPage++;
    loadVouchers();
});

// Sync with Router Action
vel.btnSyncRouter.addEventListener('click', async () => {
    vel.syncIcon.classList.add('animate-spin');
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
        setTimeout(() => vel.syncIcon.classList.remove('animate-spin'), 600);
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
vel.btnConfirmImport.addEventListener('click', async () => {
    if (!vState.pendingImport.packageKey || !vState.pendingImport.content) return;

    vel.btnConfirmImport.disabled = true;
    vel.btnConfirmImport.innerHTML = `<i data-lucide="loader" class="w-4 h-4 animate-spin"></i> Menyimpan...`;
    lucide.createIcons({ root: vel.btnConfirmImport });

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
            vel.modalImportPreview.classList.add('hidden');
            vel.modalImportPreview.classList.remove('flex');
            vState.pendingImport = { packageKey: null, fileName: null, content: null, codes: [] };

            // Reload UI
            loadInitialData();
        } else {
            showToast(`Gagal: ${data.error}`, 'error');
        }
    } catch (e) {
        showToast(`Error: ${e.message}`, 'error');
    } finally {
        vel.btnConfirmImport.disabled = false;
        vel.btnConfirmImport.innerHTML = `<i data-lucide="check" class="w-4 h-4"></i> <span>Simpan ke Database</span>`;
        lucide.createIcons({ root: vel.btnConfirmImport });
    }
});

vel.btnClosePreview.addEventListener('click', () => {
    vel.modalImportPreview.classList.add('hidden');
    vel.modalImportPreview.classList.remove('flex');
});
vel.btnCancelPreview.addEventListener('click', () => {
    vel.modalImportPreview.classList.add('hidden');
    vel.modalImportPreview.classList.remove('flex');
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
    vel.pasteModalSubtitle.textContent = `Untuk ${pkgNames[pkgKey] || pkgKey}`;
    vel.pasteTextarea.value = '';
    vel.modalPaste.classList.remove('hidden');
    vel.modalPaste.classList.add('flex');
};

vel.btnClosePaste.addEventListener('click', () => {
    vel.modalPaste.classList.add('hidden');
    vel.modalPaste.classList.remove('flex');
});
vel.btnCancelPaste.addEventListener('click', () => {
    vel.modalPaste.classList.add('hidden');
    vel.modalPaste.classList.remove('flex');
});

vel.btnConfirmPaste.addEventListener('click', async () => {
    const rawText = vel.pasteTextarea.value.trim();
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
            vel.modalPaste.classList.add('hidden');
            vel.modalPaste.classList.remove('flex');
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

// Export Daily History to CSV
vel.btnExportDailyCsv.addEventListener('click', async () => {
    try {
        const res = await fetch('/api/vouchers/daily-history?limit=365');
        const list = await res.json();
        if (!list || list.length === 0) {
            showToast('Belum ada data untuk diunduh', 'info');
            return;
        }

        let csv = 'Tanggal,Hari,Voucher 1K (3 Jam),Subtotal 1K,Voucher 2K (10 Jam),Subtotal 2K,Voucher 3K (1 Hari),Subtotal 3K,Total Lembar,Total Omset Rupiah\n';
        list.forEach(row => {
            csv += `"${row.formattedDate || row.dateKey}","${row.dayName || ''}",${row.count1k || 0},${row.revenue1k || 0},${row.count2k || 0},${row.revenue2k || 0},${row.count3k || 0},${row.revenue3k || 0},${row.totalCount || 0},${row.totalRevenue || 0}\n`;
        });

        const encodedUri = encodeURI('data:text/csv;charset=utf-8,' + csv);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', `rekap_omset_voucher_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        link.remove();
        showToast('Rekap omset berhasil diexport ke CSV', 'success');
    } catch (e) {
        showToast(`Gagal export: ${e.message}`, 'error');
    }
});

// Real-time Socket.io Listeners
socket.on('initial_state', (data) => {
    if (data.voucherSummary) {
        renderSummary(data.voucherSummary);
    }
});

socket.on('voucher_summary_update', (summary) => {
    renderSummary(summary);
    loadDailyHistory();
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
document.addEventListener('DOMContentLoaded', () => {
    lucide.createIcons();
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
});

