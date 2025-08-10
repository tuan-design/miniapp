document.addEventListener('DOMContentLoaded', () => {
    // =================================================================
    // CẤU HÌNH VÀ KHỞI TẠO
    // =================================================================
    const apiUrl = 'YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL';
    const tg = window.Telegram.WebApp;
    tg.ready();
    tg.expand();
    tg.setHeaderColor(getComputedStyle(document.documentElement).getPropertyValue('--tg-bg-color').trim());

    // =================================================================
    // LẤY CÁC ĐỐI TƯỢNG DOM
    // =================================================================
    const appContainer = document.getElementById('app-container');
    const monthDisplay = document.getElementById('month-display');
    const incomeEl = document.getElementById('income-amount');
    const expenseEl = document.getElementById('expense-amount');
    const balanceEl = document.getElementById('balance-amount');
    const chartContainer = document.getElementById('chart-container');
    const chartCanvas = document.getElementById('expense-pie-chart');
    const noChartDataEl = document.getElementById('no-chart-data');
    const recentTransactionsListEl = document.getElementById('recent-transactions-list');
    const prevMonthBtn = document.getElementById('prev-month-btn');
    const nextMonthBtn = document.getElementById('next-month-btn');
    const pages = document.querySelectorAll('.page');
    const tabButtons = document.querySelectorAll('.tab-button');
    
    // =================================================================
    // BIẾN TRẠNG THÁI
    // =================================================================
    let currentDate = new Date();
    let currentMonth = currentDate.getMonth() + 1;
    let currentYear = currentDate.getFullYear();
    let expensePieChart;

    // =================================================================
    // HÀM TIỆN ÍCH
    // =================================================================
    const formatCurrency = (amount) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);

    // =================================================================
    // LOGIC ĐIỀU HƯỚNG (NAVIGATION)
    // =================================================================
    function navigateTo(pageId) {
        pages.forEach(page => page.classList.add('hidden'));
        tabButtons.forEach(btn => btn.classList.remove('active'));
        document.getElementById(`page-${pageId}`).classList.remove('hidden');
        document.querySelector(`.tab-button[data-page="${pageId}"]`).classList.add('active');
    }

    tabButtons.forEach(button => {
        button.addEventListener('click', () => navigateTo(button.dataset.page));
    });

    // =================================================================
    // LOGIC TẢI VÀ HIỂN THỊ DỮ LIỆU
    // =================================================================
    async function fetchMainDataForMonth(month, year) {
        try {
            const [summaryRes, transactionsRes] = await Promise.all([
                fetch(`${apiUrl}?action=getFinancialSummary&month=${month}&year=${year}`),
                fetch(`${apiUrl}?action=getTransactions&month=${month}&year=${year}`)
            ]);
            if (!summaryRes.ok || !transactionsRes.ok) throw new Error('Lỗi mạng');
            
            const summaryData = await summaryRes.json();
            const allTransactions = await transactionsRes.json();

            // Cập nhật giao diện sau khi có dữ liệu
            renderDashboard(summaryData, allTransactions);

        } catch (error) {
            tg.showAlert('Đã xảy ra lỗi khi tải dữ liệu: ' + error.message);
        }
    }

    function renderDashboard(summary, transactions) {
        // Cập nhật header
        monthDisplay.textContent = `Tháng ${currentMonth}/${currentYear}`;
        monthDisplay.classList.remove('skeleton', 'skeleton-text');

        // Cập nhật các thẻ tổng quan
        incomeEl.textContent = formatCurrency(summary.income || 0);
        expenseEl.textContent = formatCurrency(summary.expense || 0);
        balanceEl.textContent = formatCurrency(summary.balance || 0);
        incomeEl.classList.remove('skeleton', 'skeleton-line');
        expenseEl.classList.remove('skeleton', 'skeleton-line');
        balanceEl.classList.remove('skeleton', 'skeleton-line');
        balanceEl.classList.toggle('text-red', (summary.balance || 0) < 0);

        // Cập nhật biểu đồ
        chartContainer.classList.remove('skeleton', 'skeleton-block');
        renderPieChart(transactions);
        
        // Cập nhật danh sách giao dịch gần đây
        renderRecentTransactions(transactions);
    }
    
    function renderPieChart(transactions) {
        const expenseTransactions = transactions.filter(t => t.type === 'Chi tiêu');
        if (expenseTransactions.length === 0) {
            chartCanvas.style.display = 'none';
            noChartDataEl.classList.remove('hidden');
            return;
        }
        chartCanvas.style.display = 'block';
        noChartDataEl.classList.add('hidden');
        
        const categoryTotals = expenseTransactions.reduce((acc, curr) => {
            acc[curr.category] = (acc[curr.category] || 0) + curr.amount;
            return acc;
        }, {});

        if (expensePieChart) expensePieChart.destroy();
        expensePieChart = new Chart(chartCanvas, {
            type: 'doughnut',
            data: {
                labels: Object.keys(categoryTotals),
                datasets: [{ 
                    data: Object.values(categoryTotals),
                    backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40'],
                    borderWidth: 0
                }]
            },
            options: { 
                responsive: true, 
                maintainAspectRatio: false, 
                plugins: { 
                    legend: { position: 'bottom', labels: { boxWidth: 12 } } 
                },
                cutout: '60%'
            }
        });
    }

    function renderRecentTransactions(transactions) {
        recentTransactionsListEl.innerHTML = ''; // Xóa các skeleton items
        if (transactions.length === 0) {
            recentTransactionsListEl.innerHTML = '<p class="no-data-message">Không có giao dịch nào.</p>';
            return;
        }
        transactions.slice(0, 3).forEach(t => recentTransactionsListEl.appendChild(createTransactionElement(t)));
    }

    function createTransactionElement(t) {
        const isExpense = t.type === 'Chi tiêu';
        const el = document.createElement('div');
        el.className = 'transaction-item';
        el.innerHTML = `
            <div class="transaction-details">
                <p class="transaction-content">${t.content}</p>
                <p class="transaction-category">${t.category}</p>
            </div>
            <p class="transaction-amount ${isExpense ? 'text-red' : 'text-green'}">
                ${isExpense ? '-' : '+'}${formatCurrency(t.amount)}
            </p>
        `;
        return el;
    }
    
    // =================================================================
    // XỬ LÝ SỰ KIỆN
    // =================================================================
    prevMonthBtn.addEventListener('click', () => {
        currentMonth--;
        if (currentMonth < 1) { currentMonth = 12; currentYear--; }
        fetchMainDataForMonth(currentMonth, currentYear);
    });

    nextMonthBtn.addEventListener('click', () => {
        currentMonth++;
        if (currentMonth > 12) { currentMonth = 1; currentYear++; }
        fetchMainDataForMonth(currentMonth, currentYear);
    });

    // =================================================================
    // KHỞI ĐỘNG ỨNG DỤNG
    // =================================================================
    fetchMainDataForMonth(currentMonth, currentYear);
    navigateTo('dashboard');
});
