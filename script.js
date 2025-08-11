// ==========================================================================
// 1. KHỞI TẠO ỨNG DỤNG VÀ QUẢN LÝ TRẠNG THÁI
// ==========================================================================

const AppState = {
    apiUrl: null,
    sheetId: null,
    categories: [], // Cache danh sách danh mục để dùng lại
};

document.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    AppState.apiUrl = urlParams.get('api');
    AppState.sheetId = urlParams.get('sheetId');

    if (!AppState.apiUrl || !AppState.sheetId) {
        showToast("Lỗi: Thiếu API URL hoặc Sheet ID trên URL.", "error");
        document.getElementById('app-content').innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>Không thể tải ứng dụng.</p></div>`;
        return;
    }

    // Tải danh sách danh mục một lần duy nhất khi ứng dụng khởi động
    AppState.categories = await callApi('getCategories');

    setupNavigation();
    navigateTo('dashboard');
});

// ==========================================================================
// 2. ĐIỀU HƯỚNG (ROUTING)
// ==========================================================================

function setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', (event) => {
            event.preventDefault();
            if (item.classList.contains('active')) return;

            document.querySelector('.nav-item.active').classList.remove('active');
            item.classList.add('active');

            const title = item.querySelector('span').textContent;
            document.getElementById('header-title').textContent = title;

            navigateTo(item.dataset.page);
        });
    });
}

function navigateTo(page) {
    const contentArea = document.getElementById('app-content');
    contentArea.innerHTML = '';

    switch (page) {
        case 'dashboard':
            renderDashboard(contentArea);
            break;
        case 'transactions':
            renderTransactionsPage(contentArea);
            break;
        case 'reports':
            renderReportsPage(contentArea);
            break;
        case 'settings':
            renderSettingsPage(contentArea);
            break;
        default:
            contentArea.innerHTML = `<div class="empty-state"><i class="fas fa-question-circle"></i><p>Trang không tồn tại.</p></div>`;
    }
}

// ==========================================================================
// 3. GIAO TIẾP VỚI API (GOOGLE APPS SCRIPT)
// ==========================================================================
const PROXY_URL = 'https://miniappshare.netlify.app/.netlify/functions/proxy?url=';

async function callApi(action, params = {}, method = 'GET', body = null) {
    const loadingOverlay = document.getElementById('loading-overlay');
    loadingOverlay.classList.add('visible');

    try {
        params.action = action;
        params.sheetId = AppState.sheetId;
        
        const finalUrl = PROXY_URL + encodeURIComponent(AppState.apiUrl);
        let response;

        if (method === 'GET') {
            const queryParams = new URLSearchParams(params);
            const targetUrl = `${AppState.apiUrl}?${queryParams.toString()}`;
            response = await fetch(PROXY_URL + encodeURIComponent(targetUrl));
        } else { // POST
            const options = {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...params, ...body })
            };
            response = await fetch(finalUrl, options);
        }

        if (!response.ok) throw new Error(`Lỗi mạng: ${response.statusText}`);
        const data = await response.json();
        if (data.error) throw new Error(data.error);
        
        return data;
    } catch (error) {
        showToast(`Lỗi API: ${error.message}`, "error");
        return null;
    } finally {
        loadingOverlay.classList.remove('visible');
    }
}


// ==========================================================================
// 4. TRANG "TỔNG QUAN" (DASHBOARD)
// ==========================================================================

let expenseChartInstance = null;

async function renderDashboard(container) {
    const dashboardHTML = `
        <div class="card">
            <div class="stats-grid" id="dashboard-stats"></div>
        </div>
        <div class="card">
            <h2 class="card-title"><i class="fas fa-chart-pie"></i>Phân tích Chi tiêu Tháng này</h2>
            <div id="expense-pie-chart-container"><canvas id="expensePieChart"></canvas></div>
        </div>
        <div class="card">
            <h2 class="card-title"><i class="fas fa-history"></i>Giao dịch gần nhất</h2>
            <ul class="transaction-list" id="recent-transactions"></ul>
        </div>
    `;
    container.innerHTML = dashboardHTML;

    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

    const summaryData = await callApi('getFinancialSummary', { startDate: firstDay, endDate: lastDay });
    if (summaryData) {
        displayDashboardStats(summaryData);
        displayExpensePieChart(summaryData.expenseCategories);
    }
    
    const transactionData = await callApi('getTransactionsByMonth', {
        month: now.getMonth() + 1,
        year: now.getFullYear()
    });
    if(transactionData) {
        const recentTransactions = transactionData.sort((a,b) => new Date(b.date.split('/').reverse().join('-')) - new Date(a.date.split('/').reverse().join('-'))).slice(0, 5);
        displayRecentTransactions(document.getElementById('recent-transactions'), recentTransactions);
    }
}

function displayDashboardStats(data) {
    document.getElementById('dashboard-stats').innerHTML = `
        <div class="stat-card income"><div class="label">TỔNG THU</div><div class="amount">${formatCurrency(data.income)}</div></div>
        <div class="stat-card expense"><div class="label">TỔNG CHI</div><div class="amount">${formatCurrency(data.expense)}</div></div>
        <div class="stat-card balance"><div class="label">SỐ DƯ</div><div class="amount">${formatCurrency(data.balance)}</div></div>`;
}

function displayExpensePieChart(chartData) {
    const container = document.getElementById('expense-pie-chart-container');
    const ctx = document.getElementById('expensePieChart').getContext('2d');
    
    if(expenseChartInstance) expenseChartInstance.destroy();
    if (!chartData || chartData.length === 0) {
        container.innerHTML = `<div class="empty-state"><i class="fas fa-chart-pie"></i><p>Không có dữ liệu chi tiêu.</p></div>`;
        return;
    }
    
    expenseChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: chartData.map(item => item.category),
            datasets: [{
                data: chartData.map(item => item.amount),
                backgroundColor: ['#007AFF', '#34C759', '#FF9500', '#FF3B30', '#5856D6', '#AF52DE', '#FF2D55'],
                borderColor: 'var(--card-bg-color)',
                borderWidth: 3
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { font: { family: "'Be Vietnam Pro', sans-serif" } } },
                tooltip: { callbacks: { label: (context) => `${context.label}: ${formatCurrency(context.raw)}` } }
            }
        }
    });
}

function displayRecentTransactions(container, transactions) {
    if (!transactions || transactions.length === 0) {
        container.innerHTML = `<div class="empty-state"><p>Không có giao dịch nào.</p></div>`;
        return;
    }
    let html = '';
    transactions.forEach(tx => {
        html += createTransactionItemHTML(tx);
    });
    container.innerHTML = html;
}

// ==========================================================================
// 5. TRANG "GIAO DỊCH" (TRANSACTIONS)
// ==========================================================================

async function renderTransactionsPage(container) {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    
    container.innerHTML = `
        <div class="card">
            <div class="transactions-header">
                <input type="month" id="month-selector" value="${currentMonth}">
                <button id="add-transaction-btn" class="btn btn-primary"><i class="fas fa-plus"></i> Thêm mới</button>
            </div>
        </div>
        <div class="card">
            <h2 class="card-title"><i class="fas fa-list-ul"></i>Danh sách giao dịch</h2>
            <ul class="transaction-list" id="full-transaction-list"></ul>
        </div>
    `;

    document.getElementById('month-selector').addEventListener('change', fetchAndDisplayTransactions);
    document.getElementById('add-transaction-btn').addEventListener('click', () => renderAddEditModal());

    await fetchAndDisplayTransactions();
}

async function fetchAndDisplayTransactions() {
    const monthSelector = document.getElementById('month-selector');
    const [year, month] = monthSelector.value.split('-');
    
    const data = await callApi('getTransactionsByMonth', { month, year });
    const container = document.getElementById('full-transaction-list');

    if (data) {
        displayFullTransactions(container, data);
    }
}

function displayFullTransactions(container, transactions) {
    if (!transactions || transactions.length === 0) {
        container.innerHTML = `<div class="empty-state"><p>Không có giao dịch nào trong tháng này.</p></div>`;
        return;
    }
    let html = '';
    transactions.forEach(tx => {
        html += createTransactionItemHTML(tx, true); // true để thêm nút edit/delete
    });
    container.innerHTML = html;

    // Gắn sự kiện cho các nút sửa/xóa
    container.querySelectorAll('.edit-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const txData = JSON.parse(btn.dataset.transaction);
            renderAddEditModal(txData);
        });
    });
    container.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const txData = JSON.parse(btn.dataset.transaction);
            handleDeleteTransaction(txData);
        });
    });
}

// ==========================================================================
// 6. TRANG "BÁO CÁO" (REPORTS)
// ==========================================================================

let monthlyChartInstance = null;

async function renderReportsPage(container) {
    const currentYear = new Date().getFullYear();
    let yearOptions = '';
    for (let i = 0; i < 5; i++) {
        const year = currentYear - i;
        yearOptions += `<option value="${year}">${year}</option>`;
    }

    container.innerHTML = `
        <div class="card">
            <div class="card-header">
                <h2 class="card-title">Báo cáo năm</h2>
                <select id="year-selector">${yearOptions}</select>
            </div>
            <div id="monthly-report-chart-container">
                <canvas id="monthlyBarChart"></canvas>
            </div>
        </div>
    `;

    document.getElementById('year-selector').addEventListener('change', fetchAndDisplayReportCharts);
    await fetchAndDisplayReportCharts();
}

async function fetchAndDisplayReportCharts() {
    const year = document.getElementById('year-selector').value;
    const data = await callApi('getMonthlyData', { year });
    if (data) {
        displayMonthlyBarChart(data);
    }
}

function displayMonthlyBarChart(data) {
    const container = document.getElementById('monthly-report-chart-container');
    const ctx = document.getElementById('monthlyBarChart').getContext('2d');

    if (monthlyChartInstance) monthlyChartInstance.destroy();
    if (!data || data.length === 0) {
        container.innerHTML = `<div class="empty-state"><p>Không có dữ liệu cho năm này.</p></div>`;
        return;
    }

    monthlyChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.map(d => `Th ${d.month}`),
            datasets: [
                {
                    label: 'Thu nhập',
                    data: data.map(d => d.income),
                    backgroundColor: 'rgba(40, 167, 69, 0.8)',
                    borderColor: 'rgba(40, 167, 69, 1)',
                    borderWidth: 1
                },
                {
                    label: 'Chi tiêu',
                    data: data.map(d => d.expense),
                    backgroundColor: 'rgba(220, 53, 69, 0.8)',
                    borderColor: 'rgba(220, 53, 69, 1)',
                    borderWidth: 1
                }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: { y: { beginAtZero: true } },
            plugins: {
                tooltip: { callbacks: { label: (context) => `${context.dataset.label}: ${formatCurrency(context.raw)}` } }
            }
        }
    });
}

// ==========================================================================
// 7. TRANG "CÀI ĐẶT" (SETTINGS)
// ==========================================================================

async function renderSettingsPage(container) {
    let categoryOptions = AppState.categories.map(cat => `<option value="${cat}">${cat}</option>`).join('');

    container.innerHTML = `
        <div class="card">
            <h2 class="card-title"><i class="fas fa-plus-circle"></i>Thêm Từ khóa Mới</h2>
            <form id="add-keyword-form">
                <div class="form-group">
                    <label for="category-select">Chọn Danh mục</label>
                    <select id="category-select" required>${categoryOptions}</select>
                </div>
                <div class="form-group">
                    <label for="keyword-input">Từ khóa (phân cách bởi dấu phẩy ,)</label>
                    <input type="text" id="keyword-input" placeholder="ví dụ: cà phê, highlands" required>
                </div>
                <button type="submit" class="btn btn-primary">Thêm Từ khóa</button>
            </form>
        </div>
        <div class="card">
            <h2 class="card-title"><i class="fas fa-key"></i>Danh sách Từ khóa Hiện có</h2>
            <div id="keywords-list"></div>
        </div>
    `;

    document.getElementById('add-keyword-form').addEventListener('submit', handleAddKeyword);
    await fetchAndDisplayKeywords();
}

async function fetchAndDisplayKeywords() {
    const container = document.getElementById('keywords-list');
    const data = await callApi('getKeywords');
    if(data) {
        if (data.length === 0) {
            container.innerHTML = `<div class="empty-state"><p>Chưa có từ khóa nào.</p></div>`;
            return;
        }
        let html = '';
        data.forEach(cat => {
            html += `
                <div class="category-group">
                    <h3>${cat.icon} ${cat.category}</h3>
                    <div class="keywords-container">
                        ${cat.keywords.split(',').map(k => k.trim()).filter(k => k).map(keyword => `
                            <span class="keyword-tag">
                                ${keyword}
                                <button class="delete-keyword-btn" data-category="${cat.category}" data-keyword="${keyword}">&times;</button>
                            </span>
                        `).join('')}
                    </div>
                </div>
            `;
        });
        container.innerHTML = html;
        container.querySelectorAll('.delete-keyword-btn').forEach(btn => {
            btn.addEventListener('click', () => handleDeleteKeyword(btn.dataset.category, btn.dataset.keyword));
        });
    }
}

async function handleAddKeyword(event) {
    event.preventDefault();
    const category = document.getElementById('category-select').value;
    const keywords = document.getElementById('keyword-input').value;
    
    const result = await callApi('addKeyword', {}, 'POST', { category, keywords });
    if(result && result.success) {
        showToast("Thêm từ khóa thành công!");
        document.getElementById('keyword-input').value = '';
        await fetchAndDisplayKeywords();
    }
}

async function handleDeleteKeyword(category, keyword) {
    if(!confirm(`Bạn có chắc muốn xóa từ khóa "${keyword}" khỏi danh mục "${category}"?`)) return;

    const result = await callApi('deleteKeyword', {}, 'POST', { category, keyword });
    if(result && result.success) {
        showToast("Xóa từ khóa thành công!");
        await fetchAndDisplayKeywords();
    }
}


// ==========================================================================
// 8. CÁC HÀM TIỆN ÍCH (UTILITIES)
// ==========================================================================

function createTransactionItemHTML(tx, withActions = false) {
    const isIncome = tx.type === 'Thu nhập';
    const iconClass = isIncome ? 'fa-arrow-down' : 'fa-arrow-up';
    const typeClass = isIncome ? 'income' : 'expense';
    const actionsHTML = withActions ? `
        <div class="transaction-actions">
            <button class="btn-icon edit-btn" data-transaction='${JSON.stringify(tx)}'><i class="fas fa-pen"></i></button>
            <button class="btn-icon delete-btn" data-transaction='${JSON.stringify(tx)}'><i class="fas fa-trash"></i></button>
        </div>
    ` : '';
    return `
        <li class="transaction-item">
            <div class="icon ${typeClass}"><i class="fas ${iconClass}"></i></div>
            <div class="details">
                <div class="content">${tx.content}</div>
                <div class="category">${formatDate(tx.date)} - ${tx.category}</div>
            </div>
            <div class="amount ${typeClass}">${isIncome ? '+' : '-'}${formatCurrency(tx.amount)}</div>
            ${actionsHTML}
        </li>
    `;
}

function showToast(message, type = "success") {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.animation = 'fadeOutUp 0.3s forwards';
        toast.addEventListener('animationend', () => toast.remove());
    }, 3000);
}

function formatCurrency(number) {
    if (typeof number !== 'number') return '0đ';
    return number.toLocaleString('vi-VN') + 'đ';
}

function formatDate(dateString) {
    const parts = dateString.split('/');
    if (parts.length < 3) return dateString;
    return `Ngày ${parts[0]} tháng ${parts[1]}`;
}
