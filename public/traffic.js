// TRAFFIC & BANDWIDTH ACCOUNTING JAVASCRIPT ENGINE (public/traffic.js)

document.addEventListener('DOMContentLoaded', () => {
    // State
    let currentInterface = 'ether1-internet';
    let currentTab = 'daily'; // 'daily' | 'weekly' | 'monthly' | 'yearly'
    let currentChartMode = '24h'; // '24h' | '30d' | '12m'
    let selectedMonth = '';
    let selectedYear = '';
    let trafficChartInstance = null;
    let liveTrafficSummary = null;

    // DOM Elements
    const ifaceSelect = document.getElementById('traffic-iface-select');
    const clockDisplay = document.getElementById('traffic-clock');
    const headerTodayDate = document.getElementById('header-today-date');
    const btnRefresh = document.getElementById('btn-refresh-traffic');
    const refreshIcon = document.getElementById('traffic-refresh-icon');

    // KPI Elements
    const statTodayTotal = document.getElementById('stat-today-total');
    const statTodayRx = document.getElementById('stat-today-rx');
    const statTodayTx = document.getElementById('stat-today-tx');
    const statYesterdayTotal = document.getElementById('stat-yesterday-total');
    const statTodayDiff = document.getElementById('stat-today-diff');
    const rebootCountToday = document.getElementById('reboot-count-today');

    const statWeekTotal = document.getElementById('stat-week-total');
    const statWeekRx = document.getElementById('stat-week-rx');
    const statWeekTx = document.getElementById('stat-week-tx');
    const statWeekDays = document.getElementById('stat-week-days');

    const statMonthTotal = document.getElementById('stat-month-total');
    const statMonthRx = document.getElementById('stat-month-rx');
    const statMonthTx = document.getElementById('stat-month-tx');
    const statMonthAvg = document.getElementById('stat-month-avg');
    const statMonthDays = document.getElementById('stat-month-days');
    const statMonthBadge = document.getElementById('stat-month-badge');

    const statYearTotal = document.getElementById('stat-year-total');
    const statYearRx = document.getElementById('stat-year-rx');
    const statYearTx = document.getElementById('stat-year-tx');
    const statYearBadge = document.getElementById('stat-year-badge');

    // Live Speed & Peak Hour Widgets
    const liveRxSpeed = document.getElementById('live-rx-speed');
    const liveTxSpeed = document.getElementById('live-tx-speed');
    const liveIfaceName = document.getElementById('live-iface-name');
    const liveRouterUptime = document.getElementById('live-router-uptime');

    const peakHourLabel = document.getElementById('peak-hour-label');
    const peakHourTotal = document.getElementById('peak-hour-total');
    const peakHourRx = document.getElementById('peak-hour-rx');
    const peakHourTx = document.getElementById('peak-hour-tx');

    const ratioRxBar = document.getElementById('ratio-rx-bar');
    const ratioTxBar = document.getElementById('ratio-tx-bar');
    const ratioRxPct = document.getElementById('ratio-rx-pct');
    const ratioTxPct = document.getElementById('ratio-tx-pct');
    const ratioDominance = document.getElementById('ratio-dominance');

    // FUP ISP Tracker Elements (Poin 2)
    const fupStatusBadge = document.getElementById('fup-status-badge');
    const fupIspName = document.getElementById('fup-isp-name');
    const fupUsedGb = document.getElementById('fup-used-gb');
    const fupTotalGb = document.getElementById('fup-total-gb');
    const fupRemainingGb = document.getElementById('fup-remaining-gb');
    const fupPercentage = document.getElementById('fup-percentage');
    const fupProgressBar = document.getElementById('fup-progress-bar');
    const btnOpenIspSettings = document.getElementById('btn-open-isp-settings');

    // Margin & Profit Calculator Elements (Poin 3)
    const marginRoiBadge = document.getElementById('margin-roi-badge');
    const marginIspCost = document.getElementById('margin-isp-cost');
    const marginVoucherRevenue = document.getElementById('margin-voucher-revenue');
    const marginCostPerGb = document.getElementById('margin-cost-per-gb');
    const marginNetProfit = document.getElementById('margin-net-profit');

    // Top Users Elements (Poin 1)
    const topUsersTableBody = document.getElementById('top-users-table-body');
    const btnRefreshTopUsers = document.getElementById('btn-refresh-top-users');

    // Modal ISP Settings
    const modalIspSettings = document.getElementById('modal-isp-settings');
    const btnCloseIspModal = document.getElementById('btn-close-isp-modal');
    const btnCancelIspModal = document.getElementById('btn-cancel-isp-modal');
    const formIspSettings = document.getElementById('form-isp-settings');
    const inputIspName = document.getElementById('input-isp-name');
    const inputIspFup = document.getElementById('input-isp-fup');
    const inputIspCost = document.getElementById('input-isp-cost');

    // Modal Backup & Restore (Poin 5)
    const btnOpenBackupModal = document.getElementById('btn-open-backup-modal');
    const modalBackup = document.getElementById('modal-backup');
    const btnCloseBackupModal = document.getElementById('btn-close-backup-modal');
    const restoreTargetType = document.getElementById('restore-target-type');
    const restoreFileInput = document.getElementById('restore-file-input');
    const btnSubmitRestore = document.getElementById('btn-submit-restore');
    const restoreStatusMsg = document.getElementById('restore-status-msg');

    // Chart Elements
    const btnChart24h = document.getElementById('btn-chart-24h');
    const btnChart30d = document.getElementById('btn-chart-30d');
    const btnChart12m = document.getElementById('btn-chart-12m');

    // Tab Elements
    const tabDaily = document.getElementById('tab-daily');
    const tabWeekly = document.getElementById('tab-weekly');
    const tabMonthly = document.getElementById('tab-monthly');
    const tabYearly = document.getElementById('tab-yearly');

    const filterMonthContainer = document.getElementById('filter-month-container');
    const filterYearContainer = document.getElementById('filter-year-container');
    const filterDailyMonth = document.getElementById('filter-daily-month');
    const filterMonthlyYear = document.getElementById('filter-monthly-year');
    const tableRecordCount = document.getElementById('table-record-count');
    const btnExportCsv = document.getElementById('btn-export-traffic-csv');

    const tableBody = document.getElementById('traffic-table-body');
    const tableFooter = document.getElementById('traffic-table-footer');

    // Socket.io Setup
    const socket = io();

    // Format Bytes Helper
    function formatBytes(bytes) {
        if (!bytes || isNaN(bytes) || bytes <= 0) return '0 B';
        const b = Number(bytes);
        const k = 1000;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
        let i = Math.floor(Math.log(b) / Math.log(k));
        if (i <= 0) return b + ' B';
        if (i >= sizes.length) i = sizes.length - 1;
        let val = (b / Math.pow(k, i)).toFixed(2);
        if (parseFloat(val) >= 1000 && i < sizes.length - 1) {
            i++;
            val = (b / Math.pow(k, i)).toFixed(2);
        }
        return val + ' ' + sizes[i];
    }

    // Format Bits Per Second Helper
    function formatBitsPerSecond(bps) {
        if (!bps || isNaN(bps)) return '0 bps';
        const b = parseInt(bps, 10);
        if (b === 0) return '0 bps';
        if (b >= 1000000000) return (b / 1000000000).toFixed(2) + ' Gbps';
        if (b >= 1000000) return (b / 1000000).toFixed(2) + ' Mbps';
        if (b >= 1000) return (b / 1000).toFixed(1) + ' Kbps';
        return b + ' bps';
    }

    // Clock Updater (WIB)
    function updateClock() {
        const now = new Date();
        if (clockDisplay) {
            clockDisplay.textContent = now.toLocaleTimeString('id-ID', {
                hour12: false,
                timeZone: 'Asia/Jakarta'
            });
        }
        if (headerTodayDate) {
            headerTodayDate.textContent = now.toLocaleDateString('id-ID', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                timeZone: 'Asia/Jakarta'
            });
        }
    }
    updateClock();
    setInterval(updateClock, 1000);

    // ==========================================
    // 1. UPDATE SUMMARY KPI, FUP & MARGIN WIDGETS
    // ==========================================
    function updateSummaryUI(summary) {
        if (!summary) return;
        liveTrafficSummary = summary;

        // Hari Ini
        statTodayTotal.textContent = summary.today.totalFormatted;
        statTodayRx.textContent = summary.today.rxFormatted;
        statTodayTx.textContent = summary.today.txFormatted;
        statYesterdayTotal.textContent = summary.yesterday.totalFormatted;

        // Persentase vs Kemarin
        if (summary.yesterday.totalBytes > 0) {
            const diffPct = Math.round(((summary.today.totalBytes - summary.yesterday.totalBytes) / summary.yesterday.totalBytes) * 100);
            if (diffPct > 0) {
                statTodayDiff.textContent = `+${diffPct}% vs Kemarin`;
                statTodayDiff.className = 'text-emerald-400 font-semibold';
            } else if (diffPct < 0) {
                statTodayDiff.textContent = `${diffPct}% vs Kemarin`;
                statTodayDiff.className = 'text-rose-400 font-semibold';
            } else {
                statTodayDiff.textContent = `0% vs Kemarin`;
                statTodayDiff.className = 'text-gray-400 font-semibold';
            }
        } else {
            statTodayDiff.textContent = `Data Kemarin: 0 B`;
            statTodayDiff.className = 'text-gray-400 font-semibold';
        }

        // Reboot Counter Hari Ini
        const reboots = summary.today.rebootCount || 0;
        rebootCountToday.textContent = `${reboots}x restart hari ini`;
        if (reboots > 0) {
            rebootCountToday.parentElement.className = 'px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 flex items-center gap-1.5';
        } else {
            rebootCountToday.parentElement.className = 'px-2.5 py-1 rounded-lg bg-gray-800/80 border border-gray-700 text-gray-300 flex items-center gap-1.5';
        }

        // Minggu Ini
        statWeekTotal.textContent = summary.thisWeek.totalFormatted;
        statWeekRx.textContent = summary.thisWeek.rxFormatted;
        statWeekTx.textContent = summary.thisWeek.txFormatted;
        statWeekDays.textContent = `${summary.thisWeek.daysActive || 0} hari`;

        // Bulan Ini
        statMonthTotal.textContent = summary.thisMonth.totalFormatted;
        statMonthRx.textContent = summary.thisMonth.rxFormatted;
        statMonthTx.textContent = summary.thisMonth.txFormatted;
        statMonthAvg.textContent = summary.thisMonth.dailyAvgFormatted + '/hari';
        statMonthDays.textContent = summary.thisMonth.daysActive || 0;
        statMonthBadge.textContent = summary.thisMonth.name || 'Bulan Ini';

        // Tahun Ini
        statYearTotal.textContent = summary.thisYear.totalFormatted;
        statYearRx.textContent = summary.thisYear.rxFormatted;
        statYearTx.textContent = summary.thisYear.txFormatted;
        statYearBadge.textContent = summary.thisYear.year || 'Tahun Ini';

        // Jam Tersibuk (Peak Hour)
        if (summary.peakHour && summary.peakHour.totalBytes > 0) {
            peakHourLabel.textContent = summary.peakHour.label;
            peakHourTotal.textContent = summary.peakHour.totalFormatted;
            peakHourRx.textContent = summary.peakHour.rxFormatted;
            peakHourTx.textContent = summary.peakHour.txFormatted;
        } else {
            peakHourLabel.textContent = 'Belum Ada Trafik';
            peakHourTotal.textContent = '0 B';
            peakHourRx.textContent = '0 B';
            peakHourTx.textContent = '0 B';
        }

        // Rasio DL vs UL Hari Ini
        const totalToday = summary.today.totalBytes || 0;
        if (totalToday > 0) {
            const rxPct = Math.round((summary.today.rxBytes / totalToday) * 100);
            const txPct = 100 - rxPct;
            ratioRxBar.style.width = `${rxPct}%`;
            ratioTxBar.style.width = `${txPct}%`;
            ratioRxPct.textContent = `${rxPct}%`;
            ratioTxPct.textContent = `${txPct}%`;

            if (rxPct > 65) {
                ratioDominance.textContent = 'Download Sangat Tinggi';
            } else if (txPct > 65) {
                ratioDominance.textContent = 'Upload Sangat Tinggi';
            } else {
                ratioDominance.textContent = 'Seimbang (Normal)';
            }
        } else {
            ratioRxBar.style.width = '50%';
            ratioTxBar.style.width = '50%';
            ratioRxPct.textContent = '0%';
            ratioTxPct.textContent = '0%';
            ratioDominance.textContent = 'Belum Ada Trafik';
        }

        // FUP ISP TRACKER (Poin 2)
        if (summary.isp) {
            const isp = summary.isp;
            fupIspName.textContent = isp.name || 'Paket Internet ISP';
            fupUsedGb.textContent = `${isp.fupUsedGb} GB`;
            fupTotalGb.textContent = isp.fupGb > 0 ? `${Number(isp.fupGb).toLocaleString('id-ID')} GB` : 'Unlimited';
            fupRemainingGb.textContent = isp.fupGb > 0 ? `${isp.fupRemainingGb} GB` : 'Tanpa Batas';
            fupPercentage.textContent = `${isp.fupPercent}%`;

            fupProgressBar.style.width = `${Math.min(100, isp.fupPercent)}%`;

            if (isp.fupStatus === 'critical') {
                fupStatusBadge.textContent = 'Mendekati Batas';
                fupStatusBadge.className = 'text-[10px] bg-rose-500/20 text-rose-300 border border-rose-500/30 px-2 py-0.5 rounded-full font-mono';
                fupProgressBar.className = 'h-full rounded-full bg-gradient-to-r from-amber-500 to-rose-500 transition-all duration-500';
            } else if (isp.fupStatus === 'warning') {
                fupStatusBadge.textContent = 'Waspada (75%+)';
                fupStatusBadge.className = 'text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full font-mono';
                fupProgressBar.className = 'h-full rounded-full bg-gradient-to-r from-teal-500 to-amber-500 transition-all duration-500';
            } else {
                fupStatusBadge.textContent = 'Aman';
                fupStatusBadge.className = 'text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full font-mono';
                fupProgressBar.className = 'h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500';
            }

            // MARGIN & LABA BERSIH (Poin 3)
            marginIspCost.textContent = isp.monthlyCostFormatted || 'Rp 0';
            marginCostPerGb.textContent = isp.costPerGbFormatted || 'Rp 0 / GB';
            marginVoucherRevenue.textContent = isp.voucherRevenueFormatted || 'Rp 0';

            const profit = isp.netProfit || 0;
            marginNetProfit.textContent = isp.netProfitFormatted || 'Rp 0';
            if (profit >= 0) {
                marginNetProfit.className = 'text-emerald-400 font-mono text-base block font-black';
            } else {
                marginNetProfit.className = 'text-rose-400 font-mono text-base block font-black';
            }

            const roi = isp.profitMarginPct || 0;
            if (roi >= 0) {
                marginRoiBadge.textContent = `+${roi}% Profit`;
                marginRoiBadge.className = 'text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full font-mono';
            } else {
                marginRoiBadge.textContent = `${roi}% Defisit`;
                marginRoiBadge.className = 'text-[10px] bg-rose-500/20 text-rose-300 border border-rose-500/30 px-2 py-0.5 rounded-full font-mono';
            }
        }

        liveIfaceName.textContent = summary.interface;

        // Update chart jika mode 24 jam
        if (currentChartMode === '24h' && summary.hourly24) {
            render24hChart(summary.hourly24);
        }

        if (window.lucide) lucide.createIcons();
    }

    // ==========================================
    // 2. TOP CONSUMERS LEADERBOARD (Poin 1)
    // ==========================================
    async function loadTopUsers() {
        topUsersTableBody.innerHTML = `<tr><td colspan="6" class="py-6 text-center text-gray-500"><div class="flex items-center justify-center gap-2"><i data-lucide="loader" class="w-4 h-4 animate-spin text-cyan-400"></i><span>Memuat top konsumen bandwidth...</span></div></td></tr>`;
        if (window.lucide) lucide.createIcons();

        try {
            const res = await fetch('/api/traffic/top-users?limit=10');
            const users = await res.json();

            if (!Array.isArray(users) || users.length === 0) {
                topUsersTableBody.innerHTML = `<tr><td colspan="6" class="py-6 text-center text-gray-400">Belum ada aktivitas user hotspot yang tercatat hari ini.</td></tr>`;
                return;
            }

            const maxVol = Math.max(...users.map(u => u.totalBytes), 1);
            let html = '';

            users.forEach((u, idx) => {
                const rank = idx + 1;
                let rankBadge = `<span class="w-6 h-6 rounded-full bg-gray-800 text-gray-400 font-bold text-xs flex items-center justify-center mx-auto">${rank}</span>`;
                if (rank === 1) rankBadge = `<span class="w-6 h-6 rounded-full bg-amber-500 text-gray-950 font-black text-xs flex items-center justify-center mx-auto shadow-lg shadow-amber-500/30">1</span>`;
                else if (rank === 2) rankBadge = `<span class="w-6 h-6 rounded-full bg-slate-300 text-gray-950 font-black text-xs flex items-center justify-center mx-auto">2</span>`;
                else if (rank === 3) rankBadge = `<span class="w-6 h-6 rounded-full bg-amber-700 text-white font-black text-xs flex items-center justify-center mx-auto">3</span>`;

                const onlineDot = u.isOnline
                    ? `<span class="inline-flex items-center gap-1 text-[11px] text-emerald-400 font-medium"><span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span> Online</span>`
                    : `<span class="text-[11px] text-gray-500">Offline</span>`;

                const pct = Math.min(100, Math.round((u.totalBytes / maxVol) * 100));

                html += `
                    <tr class="hover:bg-gray-800/40 transition">
                        <td class="py-3 px-4 text-center">${rankBadge}</td>
                        <td class="py-3 px-4">
                            <div class="font-bold text-white text-xs sm:text-sm flex items-center gap-2">
                                <span>${u.name}</span>
                                ${onlineDot}
                            </div>
                            <div class="text-[11px] text-gray-500 flex items-center gap-2">
                                <span>IP: ${u.ip}</span>
                                <span>•</span>
                                <span>MAC: ${u.mac}</span>
                            </div>
                        </td>
                        <td class="py-3 px-4">
                            <span class="text-xs text-gray-300 font-medium">${u.profile}</span>
                            <div class="text-[11px] text-gray-500">Aktif: ${u.uptime}</div>
                        </td>
                        <td class="py-3 px-4 text-right">
                            <span class="text-cyan-400 font-bold">${u.bytesOutFormatted}</span>
                        </td>
                        <td class="py-3 px-4 text-right">
                            <span class="text-purple-400 font-bold">${u.bytesInFormatted}</span>
                        </td>
                        <td class="py-3 px-4 text-right">
                            <span class="text-white font-extrabold text-sm">${u.totalBytesFormatted}</span>
                            <div class="w-20 ml-auto bg-gray-800 h-1.5 rounded-full overflow-hidden mt-1">
                                <div class="bg-gradient-to-r from-amber-500 to-orange-400 h-full" style="width: ${pct}%"></div>
                            </div>
                        </td>
                    </tr>
                `;
            });

            topUsersTableBody.innerHTML = html;
            if (window.lucide) lucide.createIcons();
        } catch (e) {
            console.error('Error loading top users:', e);
            topUsersTableBody.innerHTML = `<tr><td colspan="6" class="py-6 text-center text-rose-400">Gagal memuat top konsumen: ${e.message}</td></tr>`;
        }
    }

    btnRefreshTopUsers.addEventListener('click', loadTopUsers);

    // ==========================================
    // 3. CHART.JS VISUAL ENGINE
    // ==========================================
    function initChart() {
        const ctx = document.getElementById('trafficChart').getContext('2d');
        trafficChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: [],
                datasets: [
                    {
                        label: 'Download (RX)',
                        backgroundColor: '#06b6d4',
                        borderColor: '#0891b2',
                        borderWidth: 1,
                        borderRadius: 4,
                        data: []
                    },
                    {
                        label: 'Upload (TX)',
                        backgroundColor: '#8b5cf6',
                        borderColor: '#7c3aed',
                        borderWidth: 1,
                        borderRadius: 4,
                        data: []
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false
                },
                scales: {
                    x: {
                        grid: { color: 'rgba(31, 41, 55, 0.4)' },
                        ticks: { color: '#9ca3af', font: { family: 'ui-monospace, monospace', size: 10 } }
                    },
                    y: {
                        beginAtZero: true,
                        min: 0,
                        grid: { color: 'rgba(31, 41, 55, 0.6)' },
                        ticks: {
                            color: '#9ca3af',
                            font: { family: 'ui-monospace, monospace', size: 10 },
                            callback: function (val) {
                                return formatBytes(val);
                            }
                        }
                    }
                },
                plugins: {
                    legend: {
                        labels: {
                            color: '#e5e7eb',
                            font: { size: 12, weight: 'bold' }
                        }
                    },
                    tooltip: {
                        backgroundColor: '#111827',
                        titleColor: '#38bdf8',
                        bodyColor: '#f3f4f6',
                        borderColor: '#374151',
                        borderWidth: 1,
                        padding: 10,
                        callbacks: {
                            label: function (ctx) {
                                return `${ctx.dataset.label}: ${formatBytes(ctx.raw)}`;
                            },
                            footer: function (items) {
                                let sum = 0;
                                items.forEach(i => sum += i.raw);
                                return `Total: ${formatBytes(sum)}`;
                            }
                        }
                    }
                }
            }
        });
    }

    function render24hChart(hourlyData) {
        if (!trafficChartInstance) return;
        const labels = hourlyData.map(h => h.label);
        const rxData = hourlyData.map(h => h.rxBytes);
        const txData = hourlyData.map(h => h.txBytes);

        trafficChartInstance.data.labels = labels;
        trafficChartInstance.data.datasets[0].data = rxData;
        trafficChartInstance.data.datasets[1].data = txData;
        trafficChartInstance.update();
    }

    async function load30dChart() {
        try {
            const res = await fetch(`/api/traffic/daily?interface=${encodeURIComponent(currentInterface)}&limit=30`);
            const data = await res.json();
            if (!trafficChartInstance) return;

            const items = (data.items || []).slice().reverse();
            const labels = items.map(i => {
                const parts = i.date.split('-');
                return `${parts[2]}/${parts[1]}`;
            });
            const rxData = items.map(i => i.rxBytes);
            const txData = items.map(i => i.txBytes);

            trafficChartInstance.data.labels = labels;
            trafficChartInstance.data.datasets[0].data = rxData;
            trafficChartInstance.data.datasets[1].data = txData;
            trafficChartInstance.update();
        } catch (e) {
            console.error('Error loading 30d chart:', e);
        }
    }

    async function load12mChart() {
        try {
            const res = await fetch(`/api/traffic/monthly?interface=${encodeURIComponent(currentInterface)}&limit=12`);
            const data = await res.json();
            if (!trafficChartInstance) return;

            const items = (data.items || []).slice().reverse();
            const labels = items.map(i => i.monthName);
            const rxData = items.map(i => i.rxBytes);
            const txData = items.map(i => i.txBytes);

            trafficChartInstance.data.labels = labels;
            trafficChartInstance.data.datasets[0].data = rxData;
            trafficChartInstance.data.datasets[1].data = txData;
            trafficChartInstance.update();
        } catch (e) {
            console.error('Error loading 12m chart:', e);
        }
    }

    function setChartMode(mode) {
        currentChartMode = mode;
        const activeClass = 'px-3 py-1.5 rounded-lg font-semibold transition bg-cyan-500 text-gray-950 shadow';
        const inactiveClass = 'px-3 py-1.5 rounded-lg font-semibold text-gray-400 hover:text-white transition';

        btnChart24h.className = mode === '24h' ? activeClass : inactiveClass;
        btnChart30d.className = mode === '30d' ? activeClass : inactiveClass;
        btnChart12m.className = mode === '12m' ? activeClass : inactiveClass;

        if (mode === '24h') {
            if (liveTrafficSummary && liveTrafficSummary.hourly24) {
                render24hChart(liveTrafficSummary.hourly24);
            } else {
                fetchSummary();
            }
        } else if (mode === '30d') {
            load30dChart();
        } else if (mode === '12m') {
            load12mChart();
        }
    }

    btnChart24h.addEventListener('click', () => setChartMode('24h'));
    btnChart30d.addEventListener('click', () => setChartMode('30d'));
    btnChart12m.addEventListener('click', () => setChartMode('12m'));

    // ==========================================
    // 4. TABLE RENDERING FOR 4 PERIODS
    // ==========================================

    // A. Render Tabel Harian (Daily)
    async function loadDailyTable() {
        tableBody.innerHTML = `<tr><td colspan="5" class="py-8 text-center text-gray-500"><div class="flex flex-col items-center justify-center gap-2"><i data-lucide="loader" class="w-6 h-6 animate-spin text-cyan-400"></i><span>Mengambil rekap data harian...</span></div></td></tr>`;
        tableFooter.innerHTML = '';
        if (window.lucide) lucide.createIcons();

        try {
            let url = `/api/traffic/daily?interface=${encodeURIComponent(currentInterface)}`;
            if (selectedMonth) url += `&month=${encodeURIComponent(selectedMonth)}`;

            const res = await fetch(url);
            const data = await res.json();
            const items = data.items || [];
            const summary = data.summary || {};

            tableRecordCount.textContent = `${items.length} hari tercatat`;

            if (items.length === 0) {
                tableBody.innerHTML = `<tr><td colspan="5" class="py-8 text-center text-gray-400">Belum ada data pemakaian trafik untuk periode ini.</td></tr>`;
                return;
            }

            const maxVol = Math.max(...items.map(i => i.totalBytes), 1);
            let html = '';
            items.forEach(item => {
                const pct = Math.min(100, Math.round((item.totalBytes / maxVol) * 100));
                const hasReboot = item.rebootCount > 0;
                const rebootBadge = hasReboot
                    ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/30" title="Router terdeteksi restart ${item.rebootCount}x pada tanggal ini. Perhitungan trafik tetap aman & akurat."><i data-lucide="shield-alert" class="w-3 h-3 text-amber-400"></i> ${item.rebootCount}x restart (aman)</span>`
                    : `<span class="inline-flex items-center gap-1 text-[11px] text-emerald-400"><i data-lucide="check-circle-2" class="w-3 h-3"></i> Normal</span>`;

                html += `
                    <tr class="hover:bg-gray-800/40 transition">
                        <td class="py-3 px-4">
                            <div class="font-bold text-white text-xs sm:text-sm">${item.indoDate}</div>
                            <div class="text-[11px] text-gray-500">${item.date}</div>
                        </td>
                        <td class="py-3 px-4 text-right">
                            <span class="text-cyan-400 font-bold">${item.rxFormatted}</span>
                        </td>
                        <td class="py-3 px-4 text-right">
                            <span class="text-purple-400 font-bold">${item.txFormatted}</span>
                        </td>
                        <td class="py-3 px-4 text-right">
                            <span class="text-white font-extrabold text-sm">${item.totalFormatted}</span>
                            <div class="w-24 ml-auto bg-gray-800 h-1.5 rounded-full overflow-hidden mt-1">
                                <div class="bg-gradient-to-r from-cyan-500 to-emerald-400 h-full" style="width: ${pct}%"></div>
                            </div>
                        </td>
                        <td class="py-3 px-4 text-center">
                            ${rebootBadge}
                        </td>
                    </tr>
                `;
            });
            tableBody.innerHTML = html;

            tableFooter.innerHTML = `
                <tr class="text-xs sm:text-sm">
                    <td class="py-3.5 px-4 text-cyan-300 uppercase tracking-wider">
                        TOTAL (${summary.totalDays} HARI)
                    </td>
                    <td class="py-3.5 px-4 text-right text-cyan-300 font-black">
                        ${summary.totalRxFormatted}
                    </td>
                    <td class="py-3.5 px-4 text-right text-purple-300 font-black">
                        ${summary.totalTxFormatted}
                    </td>
                    <td class="py-3.5 px-4 text-right text-emerald-300 font-black text-base">
                        ${summary.grandTotalFormatted}
                    </td>
                    <td class="py-3.5 px-4 text-center text-xs text-gray-400 font-normal">
                        Rata-rata: <strong class="text-white">${summary.avgDailyFormatted}</strong>/hari
                    </td>
                </tr>
            `;

            if (window.lucide) lucide.createIcons();
        } catch (e) {
            console.error('Error loading daily table:', e);
            tableBody.innerHTML = `<tr><td colspan="5" class="py-6 text-center text-rose-400">Gagal memuat data harian: ${e.message}</td></tr>`;
        }
    }

    // B. Render Tabel Mingguan (Weekly)
    async function loadWeeklyTable() {
        tableBody.innerHTML = `<tr><td colspan="5" class="py-8 text-center text-gray-500"><div class="flex flex-col items-center justify-center gap-2"><i data-lucide="loader" class="w-6 h-6 animate-spin text-cyan-400"></i><span>Mengambil rekap data mingguan...</span></div></td></tr>`;
        tableFooter.innerHTML = '';
        if (window.lucide) lucide.createIcons();

        try {
            const res = await fetch(`/api/traffic/weekly?interface=${encodeURIComponent(currentInterface)}&limit=30`);
            const data = await res.json();
            const items = data.items || [];
            const summary = data.summary || {};

            tableRecordCount.textContent = `${items.length} minggu tercatat`;

            if (items.length === 0) {
                tableBody.innerHTML = `<tr><td colspan="5" class="py-8 text-center text-gray-400">Belum ada data pemakaian mingguan.</td></tr>`;
                return;
            }

            const maxVol = Math.max(...items.map(i => i.totalBytes), 1);
            let html = '';
            items.forEach(item => {
                const pct = Math.min(100, Math.round((item.totalBytes / maxVol) * 100));
                html += `
                    <tr class="hover:bg-gray-800/40 transition">
                        <td class="py-3 px-4">
                            <div class="font-bold text-white text-xs sm:text-sm">${item.label}</div>
                            <div class="text-[11px] text-gray-500">${item.minDate} s/d ${item.maxDate} (${item.daysActive} hari aktif)</div>
                        </td>
                        <td class="py-3 px-4 text-right">
                            <span class="text-cyan-400 font-bold">${item.rxFormatted}</span>
                        </td>
                        <td class="py-3 px-4 text-right">
                            <span class="text-purple-400 font-bold">${item.txFormatted}</span>
                        </td>
                        <td class="py-3 px-4 text-right">
                            <span class="text-white font-extrabold text-sm">${item.totalFormatted}</span>
                            <div class="w-24 ml-auto bg-gray-800 h-1.5 rounded-full overflow-hidden mt-1">
                                <div class="bg-gradient-to-r from-teal-500 to-cyan-400 h-full" style="width: ${pct}%"></div>
                            </div>
                        </td>
                        <td class="py-3 px-4 text-center">
                            <span class="text-xs text-gray-300 font-medium">Rata-rata: <strong class="text-cyan-300">${item.avgDailyFormatted}</strong>/hari</span>
                        </td>
                    </tr>
                `;
            });
            tableBody.innerHTML = html;

            tableFooter.innerHTML = `
                <tr class="text-xs sm:text-sm">
                    <td class="py-3.5 px-4 text-cyan-300 uppercase tracking-wider">
                        TOTAL (${summary.totalWeeks} MINGGU)
                    </td>
                    <td class="py-3.5 px-4 text-right text-cyan-300 font-black">
                        ${summary.allRxFormatted}
                    </td>
                    <td class="py-3.5 px-4 text-right text-purple-300 font-black">
                        ${summary.allTxFormatted}
                    </td>
                    <td class="py-3.5 px-4 text-right text-emerald-300 font-black text-base">
                        ${summary.allTotalFormatted}
                    </td>
                    <td class="py-3.5 px-4 text-center text-xs text-gray-400 font-normal">
                        Akumulasi Periode Mingguan
                    </td>
                </tr>
            `;

            if (window.lucide) lucide.createIcons();
        } catch (e) {
            console.error('Error loading weekly table:', e);
            tableBody.innerHTML = `<tr><td colspan="5" class="py-6 text-center text-rose-400">Gagal memuat data mingguan: ${e.message}</td></tr>`;
        }
    }

    // C. Render Tabel Bulanan (Monthly)
    async function loadMonthlyTable() {
        tableBody.innerHTML = `<tr><td colspan="5" class="py-8 text-center text-gray-500"><div class="flex flex-col items-center justify-center gap-2"><i data-lucide="loader" class="w-6 h-6 animate-spin text-cyan-400"></i><span>Mengambil rekap data bulanan...</span></div></td></tr>`;
        tableFooter.innerHTML = '';
        if (window.lucide) lucide.createIcons();

        try {
            let url = `/api/traffic/monthly?interface=${encodeURIComponent(currentInterface)}`;
            if (selectedYear) url += `&year=${encodeURIComponent(selectedYear)}`;

            const res = await fetch(url);
            const data = await res.json();
            const items = data.items || [];
            const summary = data.summary || {};

            tableRecordCount.textContent = `${items.length} bulan tercatat`;

            if (items.length === 0) {
                tableBody.innerHTML = `<tr><td colspan="5" class="py-8 text-center text-gray-400">Belum ada data pemakaian bulanan.</td></tr>`;
                return;
            }

            const maxVol = Math.max(...items.map(i => i.totalBytes), 1);
            let html = '';
            items.forEach(item => {
                const pct = Math.min(100, Math.round((item.totalBytes / maxVol) * 100));
                html += `
                    <tr class="hover:bg-gray-800/40 transition">
                        <td class="py-3 px-4">
                            <div class="font-bold text-white text-xs sm:text-sm">${item.monthName}</div>
                            <div class="text-[11px] text-gray-500">${item.daysActive} hari aktif tercatat</div>
                        </td>
                        <td class="py-3 px-4 text-right">
                            <span class="text-cyan-400 font-bold">${item.rxFormatted}</span>
                        </td>
                        <td class="py-3 px-4 text-right">
                            <span class="text-purple-400 font-bold">${item.txFormatted}</span>
                        </td>
                        <td class="py-3 px-4 text-right">
                            <span class="text-white font-extrabold text-sm">${item.totalFormatted}</span>
                            <div class="w-24 ml-auto bg-gray-800 h-1.5 rounded-full overflow-hidden mt-1">
                                <div class="bg-gradient-to-r from-blue-500 to-cyan-400 h-full" style="width: ${pct}%"></div>
                            </div>
                        </td>
                        <td class="py-3 px-4 text-center">
                            <span class="text-xs text-gray-300 font-medium">Rata-rata: <strong class="text-cyan-300">${item.avgDailyFormatted}</strong>/hari</span>
                        </td>
                    </tr>
                `;
            });
            tableBody.innerHTML = html;

            tableFooter.innerHTML = `
                <tr class="text-xs sm:text-sm">
                    <td class="py-3.5 px-4 text-cyan-300 uppercase tracking-wider">
                        TOTAL TAHUNAN (${summary.totalMonths} BULAN)
                    </td>
                    <td class="py-3.5 px-4 text-right text-cyan-300 font-black">
                        ${summary.totalRxFormatted}
                    </td>
                    <td class="py-3.5 px-4 text-right text-purple-300 font-black">
                        ${summary.totalTxFormatted}
                    </td>
                    <td class="py-3.5 px-4 text-right text-emerald-300 font-black text-base">
                        ${summary.grandTotalFormatted}
                    </td>
                    <td class="py-3.5 px-4 text-center text-xs text-gray-400 font-normal">
                        Buku Kas Bandwidth
                    </td>
                </tr>
            `;

            if (window.lucide) lucide.createIcons();
        } catch (e) {
            console.error('Error loading monthly table:', e);
            tableBody.innerHTML = `<tr><td colspan="5" class="py-6 text-center text-rose-400">Gagal memuat data bulanan: ${e.message}</td></tr>`;
        }
    }

    // D. Render Tabel Tahunan (Yearly)
    async function loadYearlyTable() {
        tableBody.innerHTML = `<tr><td colspan="5" class="py-8 text-center text-gray-500"><div class="flex flex-col items-center justify-center gap-2"><i data-lucide="loader" class="w-6 h-6 animate-spin text-cyan-400"></i><span>Mengambil rekap data tahunan...</span></div></td></tr>`;
        tableFooter.innerHTML = '';
        if (window.lucide) lucide.createIcons();

        try {
            const res = await fetch(`/api/traffic/yearly?interface=${encodeURIComponent(currentInterface)}`);
            const data = await res.json();
            const items = data.items || [];
            const summary = data.summary || {};

            tableRecordCount.textContent = `${items.length} tahun tercatat`;

            if (items.length === 0) {
                tableBody.innerHTML = `<tr><td colspan="5" class="py-8 text-center text-gray-400">Belum ada data pemakaian tahunan.</td></tr>`;
                return;
            }

            const maxVol = Math.max(...items.map(i => i.totalBytes), 1);
            let html = '';
            items.forEach(item => {
                const pct = Math.min(100, Math.round((item.totalBytes / maxVol) * 100));
                html += `
                    <tr class="hover:bg-gray-800/40 transition">
                        <td class="py-3.5 px-4">
                            <div class="font-bold text-white text-sm sm:text-base">${item.label}</div>
                            <div class="text-[11px] text-gray-500">${item.daysActive} hari aktif beroperasi</div>
                        </td>
                        <td class="py-3.5 px-4 text-right">
                            <span class="text-cyan-400 font-bold">${item.rxFormatted}</span>
                        </td>
                        <td class="py-3.5 px-4 text-right">
                            <span class="text-purple-400 font-bold">${item.txFormatted}</span>
                        </td>
                        <td class="py-3.5 px-4 text-right">
                            <span class="text-white font-extrabold text-base">${item.totalFormatted}</span>
                            <div class="w-24 ml-auto bg-gray-800 h-1.5 rounded-full overflow-hidden mt-1">
                                <div class="bg-gradient-to-r from-indigo-500 to-cyan-400 h-full" style="width: ${pct}%"></div>
                            </div>
                        </td>
                        <td class="py-3.5 px-4 text-center">
                            <span class="text-xs text-gray-300 font-medium">Rata-rata: <strong class="text-cyan-300">${item.avgDailyFormatted}</strong>/hari</span>
                        </td>
                    </tr>
                `;
            });
            tableBody.innerHTML = html;

            tableFooter.innerHTML = `
                <tr class="text-xs sm:text-sm">
                    <td class="py-3.5 px-4 text-cyan-300 uppercase tracking-wider">
                        GRAND TOTAL SEMUA TAHUN
                    </td>
                    <td class="py-3.5 px-4 text-right text-cyan-300 font-black">
                        ${summary.grandRxFormatted}
                    </td>
                    <td class="py-3.5 px-4 text-right text-purple-300 font-black">
                        ${summary.grandTxFormatted}
                    </td>
                    <td class="py-3.5 px-4 text-right text-emerald-300 font-black text-base">
                        ${summary.grandAllFormatted}
                    </td>
                    <td class="py-3.5 px-4 text-center text-xs text-gray-400 font-normal">
                        Buku Besar Jaringan
                    </td>
                </tr>
            `;

            if (window.lucide) lucide.createIcons();
        } catch (e) {
            console.error('Error loading yearly table:', e);
            tableBody.innerHTML = `<tr><td colspan="5" class="py-6 text-center text-rose-400">Gagal memuat data tahunan: ${e.message}</td></tr>`;
        }
    }

    // Switch Tabs Function
    function setTab(tab) {
        currentTab = tab;
        const activeClass = 'px-3.5 py-1.5 rounded-lg font-semibold transition bg-cyan-500 text-gray-950 shadow flex items-center gap-1.5';
        const inactiveClass = 'px-3.5 py-1.5 rounded-lg font-semibold text-gray-400 hover:text-white transition flex items-center gap-1.5';

        tabDaily.className = tab === 'daily' ? activeClass : inactiveClass;
        tabWeekly.className = tab === 'weekly' ? activeClass : inactiveClass;
        tabMonthly.className = tab === 'monthly' ? activeClass : inactiveClass;
        tabYearly.className = tab === 'yearly' ? activeClass : inactiveClass;

        // Toggle visibility dropdown filter
        if (tab === 'daily') {
            filterMonthContainer.classList.remove('hidden');
            filterYearContainer.classList.add('hidden');
            loadDailyTable();
        } else if (tab === 'weekly') {
            filterMonthContainer.classList.add('hidden');
            filterYearContainer.classList.add('hidden');
            loadWeeklyTable();
        } else if (tab === 'monthly') {
            filterMonthContainer.classList.add('hidden');
            filterYearContainer.classList.remove('hidden');
            loadMonthlyTable();
        } else if (tab === 'yearly') {
            filterMonthContainer.classList.add('hidden');
            filterYearContainer.classList.add('hidden');
            loadYearlyTable();
        }

        if (window.lucide) lucide.createIcons();
    }

    tabDaily.addEventListener('click', () => setTab('daily'));
    tabWeekly.addEventListener('click', () => setTab('weekly'));
    tabMonthly.addEventListener('click', () => setTab('monthly'));
    tabYearly.addEventListener('click', () => setTab('yearly'));

    // Filter Change Listeners
    filterDailyMonth.addEventListener('change', (e) => {
        selectedMonth = e.target.value;
        loadDailyTable();
    });

    filterMonthlyYear.addEventListener('change', (e) => {
        selectedYear = e.target.value;
        loadMonthlyTable();
    });

    // ==========================================
    // 5. PERIODS & INTERFACES DROPDOWN POPULATOR
    // ==========================================
    async function loadPeriods() {
        try {
            const res = await fetch(`/api/traffic/periods?interface=${encodeURIComponent(currentInterface)}`);
            const data = await res.json();

            // Populate Months dropdown
            let mHtml = '<option value="" class="bg-gray-800">Semua Bulan</option>';
            (data.months || []).forEach(m => {
                mHtml += `<option value="${m.key}" class="bg-gray-800">${m.label}</option>`;
            });
            filterDailyMonth.innerHTML = mHtml;

            // Populate Years dropdown
            let yHtml = '<option value="" class="bg-gray-800">Semua Tahun</option>';
            (data.years || []).forEach(y => {
                yHtml += `<option value="${y}" class="bg-gray-800">Tahun ${y}</option>`;
            });
            filterMonthlyYear.innerHTML = yHtml;
        } catch (e) {
            console.error('Error loading periods:', e);
        }
    }

    async function loadInterfaces() {
        try {
            const res = await fetch('/api/traffic/interfaces');
            const list = await res.json();
            if (Array.isArray(list) && list.length > 0) {
                let html = '';
                list.forEach(name => {
                    const isSelected = name === currentInterface ? 'selected' : '';
                    const isWan = name.includes('wan') || name.includes('internet') ? ' (WAN)' : '';
                    html += `<option value="${name}" ${isSelected} class="bg-gray-800">${name}${isWan}</option>`;
                });
                ifaceSelect.innerHTML = html;
            }
        } catch (e) {
            console.error('Error loading interfaces:', e);
        }
    }

    ifaceSelect.addEventListener('change', (e) => {
        currentInterface = e.target.value;
        socket.emit('get_traffic_summary', currentInterface);
        loadPeriods();
        fetchSummary();
        setTab(currentTab);
        setChartMode(currentChartMode);
        loadTopUsers();
    });

    // ==========================================
    // 6. FETCH SUMMARY DATA
    // ==========================================
    async function fetchSummary() {
        try {
            refreshIcon.classList.add('animate-spin');
            const res = await fetch(`/api/traffic/summary?interface=${encodeURIComponent(currentInterface)}`);
            const summary = await res.json();
            updateSummaryUI(summary);
        } catch (e) {
            console.error('Error fetching traffic summary:', e);
        } finally {
            setTimeout(() => refreshIcon.classList.remove('animate-spin'), 600);
        }
    }

    btnRefresh.addEventListener('click', () => {
        fetchSummary();
        setTab(currentTab);
        loadTopUsers();
    });

    // ==========================================
    // 7. CSV EXPORT HANDLER
    // ==========================================
    btnExportCsv.addEventListener('click', () => {
        let url = `/api/traffic/export?interface=${encodeURIComponent(currentInterface)}&period=${currentTab}`;
        if (currentTab === 'daily' && selectedMonth) url += `&month=${encodeURIComponent(selectedMonth)}`;
        if (currentTab === 'monthly' && selectedYear) url += `&year=${encodeURIComponent(selectedYear)}`;
        window.open(url, '_blank');
    });

    // ==========================================
    // 8. MODAL ATUR FUP & BIAYA ISP (Poin 2 & 3)
    // ==========================================
    async function openIspSettingsModal() {
        try {
            const res = await fetch('/api/traffic/isp-config');
            const config = await res.json();
            inputIspName.value = config.ispName || 'Paket Internet ISP';
            inputIspFup.value = config.fupGb || 1000;
            inputIspCost.value = config.monthlyCost || 350000;
            modalIspSettings.classList.remove('hidden');
        } catch (e) {
            alert('Gagal memuat pengaturan ISP: ' + e.message);
        }
    }

    btnOpenIspSettings.addEventListener('click', openIspSettingsModal);
    btnCloseIspModal.addEventListener('click', () => modalIspSettings.classList.add('hidden'));
    btnCancelIspModal.addEventListener('click', () => modalIspSettings.classList.add('hidden'));

    formIspSettings.addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
            const payload = {
                ispName: inputIspName.value.trim(),
                fupGb: parseInt(inputIspFup.value, 10) || 0,
                monthlyCost: parseInt(inputIspCost.value, 10) || 0
            };

            const res = await fetch('/api/traffic/isp-config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await res.json();
            if (result.success) {
                modalIspSettings.classList.add('hidden');
                fetchSummary();
            } else {
                alert('Gagal menyimpan: ' + (result.error || 'Terjadi kesalahan'));
            }
        } catch (err) {
            alert('Error: ' + err.message);
        }
    });

    // ==========================================
    // 9. MODAL BACKUP & RESTORE DATABASE (Poin 5)
    // ==========================================
    btnOpenBackupModal.addEventListener('click', () => {
        restoreStatusMsg.classList.add('hidden');
        restoreFileInput.value = '';
        modalBackup.classList.remove('hidden');
    });
    btnCloseBackupModal.addEventListener('click', () => modalBackup.classList.add('hidden'));

    btnSubmitRestore.addEventListener('click', async () => {
        const file = restoreFileInput.files[0];
        if (!file) {
            alert('Silakan pilih file cadangan (.sqlite) terlebih dahulu.');
            return;
        }

        const type = restoreTargetType.value; // 'vouchers' | 'traffic'
        const typeName = type === 'traffic' ? 'Trafik' : 'Voucher';

        if (!confirm(`PERINGATAN: Apakah Anda yakin ingin memulihkan database ${typeName} dari file "${file.name}"? File database yang ada saat ini akan otomatis dicadangkan sebagai backup .bak sebelum ditimpa.`)) {
            return;
        }

        restoreStatusMsg.classList.remove('hidden');
        restoreStatusMsg.className = 'text-center text-xs text-cyan-400 pt-1 flex items-center justify-center gap-1.5';
        restoreStatusMsg.innerHTML = `<i data-lucide="loader" class="w-3.5 h-3.5 animate-spin"></i><span>Sedang memproses pemulihan database...</span>`;
        if (window.lucide) lucide.createIcons();

        const reader = new FileReader();
        reader.onload = async () => {
            try {
                const base64 = reader.result.split(',')[1];
                const res = await fetch(`/api/backup/restore/${type}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ base64Data: base64 })
                });
                const result = await res.json();

                if (result.success) {
                    restoreStatusMsg.className = 'text-center text-xs text-emerald-400 pt-1 font-bold';
                    restoreStatusMsg.textContent = `✓ ${result.message}`;
                    setTimeout(() => {
                        modalBackup.classList.add('hidden');
                        fetchSummary();
                        setTab(currentTab);
                    }, 1500);
                } else {
                    restoreStatusMsg.className = 'text-center text-xs text-rose-400 pt-1 font-bold';
                    restoreStatusMsg.textContent = `✕ Gagal: ${result.error || 'Terjadi kesalahan'}`;
                }
            } catch (err) {
                restoreStatusMsg.className = 'text-center text-xs text-rose-400 pt-1 font-bold';
                restoreStatusMsg.textContent = `✕ Error: ${err.message}`;
            }
        };
        reader.readAsDataURL(file);
    });

    // ==========================================
    // 10. REAL-TIME SOCKET.IO EVENT HANDLERS
    // ==========================================
    socket.on('initial_state', (state) => {
        if (state.config && state.config.wanInterface) {
            currentInterface = state.config.wanInterface;
        }
        if (state.trafficSummary) {
            updateSummaryUI(state.trafficSummary);
        }
        if (state.traffic) {
            liveRxSpeed.textContent = state.traffic.rxFormatted || '0 bps';
            liveTxSpeed.textContent = state.traffic.txFormatted || '0 bps';
        }
        if (state.resource && state.resource.uptime) {
            liveRouterUptime.textContent = `Uptime: ${state.resource.uptime}`;
        }
    });

    socket.on('stats_update', (data) => {
        if (data.traffic && (data.traffic.interface === currentInterface || !currentInterface)) {
            liveRxSpeed.textContent = data.traffic.rxFormatted || '0 bps';
            liveTxSpeed.textContent = data.traffic.txFormatted || '0 bps';
        }
        if (data.resource && data.resource.uptime) {
            liveRouterUptime.textContent = `Uptime: ${data.resource.uptime}`;
        }
    });

    socket.on('traffic_live_update', (summary) => {
        if (summary && summary.interface === currentInterface) {
            updateSummaryUI(summary);
        }
    });

    // Tab visibility handling (prevent lag on return)
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            fetchSummary();
            setTab(currentTab);
            loadTopUsers();
        }
    });

    // Initializations
    initChart();
    loadInterfaces();
    loadPeriods();
    fetchSummary();
    setTab('daily');
    loadTopUsers();
    if (window.lucide) lucide.createIcons();
});
