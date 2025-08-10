document.addEventListener('DOMContentLoaded', () => {

    // =================================================================
    // CẤU HÌNH VÀ KHỞI TẠO
    // =================================================================

    // QUAN TRỌNG: Dán URL Google Apps Script Web App của bạn vào đây
    const apiUrl = 'YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL';

    // Khởi tạo Telegram Web App
    const tg = window.Telegram.WebApp;
    tg.ready();
    tg.expand();

    // =================================================================
    // LẤY CÁC ĐỐI TƯỢNG DOM (ELEMENTS)
    // =================================================================
    
    // Chung
    const loader = document.getElementById('loader');
    const pagesContainer = document.getElementById('pages-container');
    const monthDisplay = document.getElementById('month-display');
    const prevMonthBtn = document.getElementById('prev-month-btn');
    const nextMonthBtn = document.getElementById('next-month-btn');
    
    // Điều hướng
    const pages = document.querySelectorAll('.page');
    const tabButtons = document.querySelectorAll('.tab-button');

    // Trang Tổng quan
    const incomeEl = document.getElementById('income-amount');
    const expenseEl = document.getElementById('expense-amount');
    const balanceEl = document.getElementById('balance-amount');
    const noChartDataEl = document.getElementById('no-chart-data');
    const recentTransactionsListEl = document.getElementById('recent-transactions-list');
    const chartCanvas = document.getElementById('expense-pie-chart');

    // Trang Giao dịch
    const searchInput = document.getElementById('search-input');
    const filterButtonsContainer = document.getElementById('filter-buttons');
    const fullTransactionsListEl = document.getElementById('full-transactions-list');

    // Trang Báo cáo
    const incomeExpenseBarChartCanvas = document.getElementById('income-expense-bar-chart');
    const trendsLineChartCanvas = document.getElementById('trends-line-chart');

    // Trang Ngân sách
    const budgetsListEl = document.getElementById('budgets-list');
    const saveBudgetsBtn = document.getElementById('save-budgets-btn');

    // Trang Cài đặt
    const settingsListEl = document.getElementById('settings-list');
    const saveSettingsBtn = document.getElementById('save-settings-btn');
    
    // =================================================================
    // BIẾN TRẠNG THÁI CỦA ỨNG DỤNG
    // =================================================================

    let currentDate = new Date();
    let currentMonth = currentDate.getMonth() + 1;
    let currentYear = currentDate.getFullYear();
    
    // Biến lưu trữ dữ liệu
    let allTransactions = [];
    let yearlySummary = [];
    let allCategories = [];
    
    // Biến lưu trữ các biểu đồ
    let expensePieChart, incomeExpenseBarChart, trendsLineChart;
    
    // =================================================================
    // HÀM TIỆN ÍCH
    // =================================================================
    
    const formatCurrency = (amount) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
    
    function showLoader(show) {
        loader.style.display = show ? 'flex' : 'none';
        pagesContainer.classList.toggle('hidden', show);
    }

    // =================================================================
    // LOGIC ĐIỀU HƯỚNG (NAVIGATION)
    // =================================================================

    function navigateTo(pageId) {
        pages.forEach(page => page.classList.add('hidden'));
        tabButtons.forEach(btn => btn.classList.remove('active'));

        document.getElementById(`page-${pageId}`).classList.remove('hidden');
        document.querySelector(`.tab-button[data-page="${pageId}"]`).classList.add('active');

        // Khi chuyển tab, có thể cần tải dữ liệu đặc thù cho tab đó
        switch(pageId) {
            case 'reports':
                fetchAndRenderYearlyData(currentYear);
                break;
            case 'budgets':
                fetchAndRenderBudgets(currentMonth, currentYear);
                break;
            case 'settings':
                fetchAndRenderSettings();
                break;
        }
    }

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const pageId = button.dataset.page;
            navigateTo(pageId);
        });
    });

    // =================================================================
    // LOGIC TẢI DỮ LIỆU TỪ BACKEND
    // =================================================================

    async function fetchMainDataForMonth(month, year) {
        showLoader(true);
        monthDisplay.textContent = `Tháng ${month}/${year};
        try {
            const [summaryRes, transactionsRes] = await Promise.all([
                fetch(`${apiUrl}?action=getFinancialSummary&month=${month}&year=${year}`),
                fetch(`${apiUrl}?action=getTransactions&month=${month}&year=${year}`)
            ]);
            if (!summaryRes.ok || !transactionsRes.ok) throw new Error('Lỗi mạng');
            const summaryData = await summaryRes.json();
            allTransactions = await transactionsRes.json();

            // Cập nhật các trang dùng dữ liệu tháng
            renderDashboard(summaryData, allTransactions);
            renderTransactionsPage(allTransactions);

        } catch (error) {
            tg.showAlert('Đã xảy ra lỗi khi tải dữ liệu chính.');
        } finally {
            showLoader(false);
        }
    }

    async function fetchAndRenderYearlyData(year) {
        // Chỉ fetch lại nếu dữ liệu của năm đó chưa có
        if (yearlySummary.length > 0 && yearlySummary.year === year) {
            renderReportsPage(yearlySummary.data);
            return;
        }
        showLoader(true);
        try {
             const res = await fetch(`${apiUrl}?action=getYearlySummary&year=${year}`);
             if (!res.ok) throw new Error('Lỗi mạng');
             const data = await res.json();
             yearlySummary = { year: year, data: data }; // Cache lại
             renderReportsPage(data);
        } catch (e) {
             tg.showAlert('Lỗi tải dữ liệu báo cáo năm.');
        } finally {
            showLoader(false);
        }
    }

    async function fetchAndRenderBudgets(month, year) {
        showLoader(true);
        try {
            const [budgetsRes, categoriesRes] = await Promise.all([
                fetch(`${apiUrl}?action=getBudgets&month=${month}&year=${year}`),
                fetch(`${apiUrl}?action=getCategoriesAndKeywords`)
            ]);
             if (!budgetsRes.ok || !categoriesRes.ok) throw new Error('Lỗi mạng');
             const budgetsData = await budgetsRes.json();
             const categoriesData = await categoriesRes.json();
             allCategories = categoriesData;
             renderBudgetsPage(budgetsData, allTransactions, categoriesData, month, year);
        } catch(e) {
            tg.showAlert('Lỗi tải dữ liệu ngân sách.');
        } finally {
            showLoader(false);
        }
    }

    async function fetchAndRenderSettings() {
        if(allCategories.length > 0) {
            renderSettingsPage(allCategories);
            return;
        }
        showLoader(true);
        try {
            const res = await fetch(`${apiUrl}?action=getCategoriesAndKeywords`);
            if (!res.ok) throw new Error('Lỗi mạng');
            allCategories = await res.json();
            renderSettingsPage(allCategories);
        } catch (e) {
            tg.showAlert('Lỗi tải dữ liệu cài đặt.');
        } finally {
            showLoader(false);
        }
    }

    // =================================================================
    // LOGIC HIỂN THỊ (RENDER) CHO TỪNG TRANG
    // =================================================================
    
    // Trang 1: Tổng quan
    function renderDashboard(summary, transactions) {
        incomeEl.textContent = formatCurrency(summary.income || 0);
        expenseEl.textContent = formatCurrency(summary.expense || 0);
        balanceEl.textContent = formatCurrency(summary.balance || 0);
        balanceEl.classList.toggle('text-red', (summary.balance || 0) < 0);
        renderPieChart(transactions);
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
            type: 'pie',
            data: {
                labels: Object.keys(categoryTotals),
                datasets: [{ 
                    data: Object.values(categoryTotals),
                    backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40', '#E7E9ED']
                }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
        });
    }

    function renderRecentTransactions(transactions) {
        recentTransactionsListEl.innerHTML = '';
        if (transactions.length === 0) {
            recentTransactionsListEl.innerHTML = '<p class="no-data-message">Không có giao dịch nào.</p>';
            return;
        }
        transactions.slice(0, 5).forEach(t => recentTransactionsListEl.appendChild(createTransactionElement(t)));
    }
    
    // Trang 2: Giao dịch
    function renderTransactionsPage(transactions) {
        fullTransactionsListEl.innerHTML = '';
        if (transactions.length === 0) {
            fullTransactionsListEl.innerHTML = '<p class="no-data-message" style="text-align: center; padding: 1rem 0;">Không có giao dịch nào.</p>';
            return;
        }

        const groupedByDate = transactions.reduce((groups, t) => {
            const date = t.date;
            if (!groups[date]) groups[date] = [];
            groups[date].push(t);
            return groups;
        }, {});

        // Sắp xếp các ngày từ mới nhất đến cũ nhất
        const sortedDates = Object.keys(groupedByDate).sort((a,b) => compareDates(b, a));

        for (const date of sortedDates) {
            const dateHeader = document.createElement('h3');
            dateHeader.className = 'transaction-group-header';
            dateHeader.textContent = date;
            fullTransactionsListEl.appendChild(dateHeader);
            groupedByDate[date].forEach(t => fullTransactionsListEl.appendChild(createTransactionElement(t)));
        }
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
    
    // Trang 3: Báo cáo
    function renderReportsPage(data) {
        const months = ["T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8", "T9", "T10", "T11", "T12"];
        const incomeData = data.map(m => m.income);
        const expenseData = data.map(m => m.expense);

        if (incomeExpenseBarChart) incomeExpenseBarChart.destroy();
        incomeExpenseBarChart = new Chart(incomeExpenseBarChartCanvas, {
            type: 'bar',
            data: {
                labels: months,
                datasets: [
                    { label: 'Thu nhập', data: incomeData, backgroundColor: 'rgba(75, 192, 192, 0.6)' },
                    { label: 'Chi tiêu', data: expenseData, backgroundColor: 'rgba(255, 99, 132, 0.6)' }
                ]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });

        if (trendsLineChart) trendsLineChart.destroy();
        trendsLineChart = new Chart(trendsLineChartCanvas, {
            type: 'line',
            data: {
                labels: months,
                datasets: [
                    { label: 'Thu nhập', data: incomeData, borderColor: 'rgba(75, 192, 192, 1)', fill: false, tension: 0.1 },
                    { label: 'Chi tiêu', data: expenseData, borderColor: 'rgba(255, 99, 132, 1)', fill: false, tension: 0.1 }
                ]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }

    // Trang 4: Ngân sách
    function renderBudgetsPage(budgets, transactions, categories, month, year) {
        budgetsListEl.innerHTML = '';
        document.querySelector('.current-budget-month').textContent = `${month}/${year}`;
        const expenseByCategory = transactions.filter(t => t.type === 'Chi tiêu').reduce((acc, curr) => {
            acc[curr.category] = (acc[curr.category] || 0) + curr.amount;
            return acc;
        }, {});
        
        categories.forEach(cat => {
            if (cat.category === "Khác") return; // Bỏ qua ngân sách cho "Khác"
            const categoryName = cat.category;
            const budgetAmount = budgets[categoryName] || 0;
            const spentAmount = expenseByCategory[categoryName] || 0;
            const progress = budgetAmount > 0 ? Math.min((spentAmount / budgetAmount) * 100, 100) : 0;

            const itemEl = document.createElement('div');
            itemEl.className = 'budget-item';
            itemEl.innerHTML = `
                <div class="info">
                    <span>${cat.icon} ${categoryName}</span>
                    <span>${formatCurrency(spentAmount)} /</span>
                    <input type="number" class="budget-input" data-category="${categoryName}" value="${budgetAmount}" placeholder="Đặt ngân sách">
                </div>
                <div class="progress-bar">
                    <div class="progress" style="width: ${progress}%; background-color: ${progress > 90 ? '#EF4444' : (progress > 70 ? '#F59E0B' : '#10B981')}"></div>
                </div>
            `;
            budgetsListEl.appendChild(itemEl);
        });
    }

    // Trang 5: Cài đặt
    function renderSettingsPage(categories) {
        settingsListEl.innerHTML = '';
        categories.forEach(cat => {
            const catEl = document.createElement('div');
            catEl.className = 'setting-category';
            catEl.innerHTML = `
                <div class="setting-category-header">
                    <span>${cat.icon} ${cat.category}</span>
                    <span>${cat.keywords.length} từ khóa &nbsp; ▼</span>
                </div>
                <div class="keyword-tags hidden">
                    ${cat.keywords.map(kw => `
                        <span class="keyword-tag">
                            ${kw}
                            <span class="delete-keyword" data-keyword="${kw}">&times;</span>
                        </span>
                    `).join('')}
                    <input class="add-keyword-input" placeholder="+ Thêm">
                </div>
            `;
            settingsListEl.appendChild(catEl);
        });
    }

    // =================================================================
    // LOGIC XỬ LÝ SỰ KIỆN (EVENT LISTENERS)
    // =================================================================
    
    // Thay đổi tháng
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

    // Lọc và Tìm kiếm giao dịch
    function applyFilters() {
        const searchTerm = searchInput.value.toLowerCase();
        const activeFilter = filterButtonsContainer.querySelector('.active').dataset.filter;
        
        const filteredTransactions = allTransactions.filter(t => {
            const matchesFilter = activeFilter === 'all' || t.type === activeFilter;
            const matchesSearch = t.content.toLowerCase().includes(searchTerm) || t.category.toLowerCase().includes(searchTerm) || (t.note && t.note.toLowerCase().includes(searchTerm));
            return matchesFilter && matchesSearch;
        });
        renderTransactionsPage(filteredTransactions);
    }
    searchInput.addEventListener('input', applyFilters);
    filterButtonsContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('filter-btn')) {
            filterButtonsContainer.querySelector('.active').classList.remove('active');
            e.target.classList.add('active');
            applyFilters();
        }
    });

    // Lưu Ngân sách
    saveBudgetsBtn.addEventListener('click', async () => {
        const budgetInputs = budgetsListEl.querySelectorAll('.budget-input');
        const budgets = {};
        budgetInputs.forEach(input => {
            budgets[input.dataset.category] = parseFloat(input.value) || 0;
        });

        tg.showPopup({
            title: 'Xác nhận',
            message: 'Bạn có chắc muốn lưu lại cài đặt ngân sách này?',
            buttons: [{ id: 'save', type: 'default', text: 'Lưu' }, { type: 'cancel' }]
        }, async (buttonId) => {
            if (buttonId === 'save') {
                tg.showProgress();
                try {
                    const res = await fetch(apiUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'saveBudgets', payload: { month: currentMonth, year: currentYear, budgets } })
                    });
                    const result = await res.json();
                    if(!result.success) throw new Error(result.error);
                    tg.showAlert('Đã lưu ngân sách thành công!');
                } catch(e) {
                    tg.showAlert('Lưu ngân sách thất bại: ' + e.message);
                } finally {
                    tg.hideProgress();
                }
            }
        });
    });

    // Sự kiện cho trang Cài đặt (bắt sự kiện trên toàn bộ list)
    settingsListEl.addEventListener('click', (e) => {
        // Mở/đóng accordion
        if (e.target.closest('.setting-category-header')) {
            const keywordTags = e.target.closest('.setting-category').querySelector('.keyword-tags');
            keywordTags.classList.toggle('hidden');
        }
        // Xóa từ khóa
        if (e.target.classList.contains('delete-keyword')) {
            e.target.parentElement.remove(); // Xóa tag khỏi giao diện
        }
    });

    settingsListEl.addEventListener('keypress', (e) => {
        // Thêm từ khóa mới
        if (e.target.classList.contains('add-keyword-input') && e.key === 'Enter') {
            e.preventDefault();
            const newKeyword = e.target.value.trim();
            if (newKeyword) {
                const newTag = document.createElement('span');
                newTag.className = 'keyword-tag';
                newTag.innerHTML = `${newKeyword} <span class="delete-keyword" data-keyword="${newKeyword}">&times;</span>`;
                e.target.before(newTag); // Thêm tag mới vào trước ô input
                e.target.value = ''; // Xóa nội dung ô input
            }
        }
    });

    saveSettingsBtn.addEventListener('click', () => {
        const finalCategories = [];
        settingsListEl.querySelectorAll('.setting-category').forEach(catEl => {
            const category = catEl.querySelector('.setting-category-header span').textContent.split(' ').slice(1).join(' ');
            const icon = catEl.querySelector('.setting-category-header span').textContent.split(' ')[0];
            const keywords = [];
            catEl.querySelectorAll('.keyword-tag').forEach(tag => {
                keywords.push(tag.textContent.trim().slice(0, -1).trim());
            });
            finalCategories.push({ category, icon, keywords });
        });
        
        tg.showPopup({
            title: 'Xác nhận',
            message: 'Lưu lại các thay đổi về danh mục và từ khóa?',
            buttons: [{ id: 'save', type: 'default', text: 'Lưu' }, { type: 'cancel' }]
        }, async (buttonId) => {
            if (buttonId === 'save') {
                tg.showProgress();
                try {
                     const res = await fetch(apiUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'saveCategoriesAndKeywords', payload: finalCategories })
                    });
                    const result = await res.json();
                    if(!result.success) throw new Error(result.error);
                    tg.showAlert('Đã lưu cài đặt thành công!');
                    allCategories = []; // Xóa cache để lần sau vào lại sẽ tải mới
                } catch(e) {
                     tg.showAlert('Lưu cài đặt thất bại: ' + e.message);
                } finally {
                    tg.hideProgress();
                }
            }
        });
    });


    // =================================================================
    // KHỞI ĐỘNG ỨNG DỤNG
    // =================================================================
    fetchMainDataForMonth(currentMonth, currentYear);
    navigateTo('dashboard');
});
