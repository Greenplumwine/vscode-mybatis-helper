// MyBatis Helper plugin WebView interaction script

// 获取翻译文本的辅助函数
function t(key) {
    if (window.translations && window.translations[key]) {
        return window.translations[key];
    }
    return key; // 如果找不到翻译，返回键名
}

// 获取VSCode API
const vscode = acquireVsCodeApi();

// 初始化函数
function init() {
    // 注册事件监听器
    registerEventListeners();
    
    // 初始化动画和过渡效果
    initAnimations();
    
    // 处理初始状态
    handleInitialState();
}

// 注册事件监听器
function registerEventListeners() {
    // 复制原始SQL按钮
    document.getElementById('copySQL')?.addEventListener('click', () => {
        sendCommand('copySQL');
    });
    
    // 复制格式化SQL按钮
    document.getElementById('copyFormattedSQL')?.addEventListener('click', () => {
        sendCommand('copyFormattedSQL');
    });
    
    // 生成执行计划按钮
    document.getElementById('runExplain')?.addEventListener('click', () => {
        sendCommand('runExplain');
    });
    
    // 导出按钮
    document.getElementById('exportSQL')?.addEventListener('click', () => {
        sendCommand('exportSQL');
    });
    
    // 重新格式化SQL按钮
    document.getElementById('reformatSQL')?.addEventListener('click', () => {
        sendCommand('reformatSQL');
    });
    
    // 刷新按钮
    document.getElementById('refreshData')?.addEventListener('click', () => {
        sendCommand('refreshData');
    });
    
    // 历史记录项点击
    document.querySelectorAll('.history-item')?.forEach(item => {
        item.addEventListener('click', (e) => {
            const queryId = item.dataset.queryId;
            if (queryId) {
                // 移除所有选中状态
                document.querySelectorAll('.history-item').forEach(el => {
                    el.classList.remove('selected');
                });
                // 添加当前选中状态
                item.classList.add('selected');
                // 发送命令
                sendCommand('selectHistoryItem', { queryId });
            }
        });
    });
    
    // 标签页切换
    document.querySelectorAll('.tab')?.forEach(tab => {
        tab.addEventListener('click', (e) => {
            const tabId = tab.dataset.tabId;
            if (tabId) {
                // 移除所有激活状态
                document.querySelectorAll('.tab').forEach(el => {
                    el.classList.remove('active');
                });
                // 添加当前激活状态
                tab.classList.add('active');
                // 隐藏所有内容面板
                document.querySelectorAll('.tab-content').forEach(panel => {
                    panel.style.display = 'none';
                });
                // 显示当前内容面板
                document.getElementById(tabId)?.style.display = 'block';
                // 发送命令
                sendCommand('switchTab', { tabId });
            }
        });
    });
    
    // 搜索框输入事件
    document.getElementById('searchInput')?.addEventListener('input', (e) => {
        const searchText = e.target.value.toLowerCase();
        sendCommand('searchSQL', { searchText });
    });
    
    // 清空搜索按钮
    document.getElementById('clearSearch')?.addEventListener('click', () => {
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.value = '';
        }
        sendCommand('clearSearch');
    });
    
    // 分页控件点击
    document.querySelectorAll('.pagination button')?.forEach(button => {
        button.addEventListener('click', () => {
            const page = button.dataset.page;
            if (page) {
                sendCommand('changePage', { page: parseInt(page) });
            }
        });
    });
    
    // 窗口大小变化事件
    window.addEventListener('resize', () => {
        handleResize();
    });
}

// 初始化动画和过渡效果
function initAnimations() {
    // 为按钮添加悬停效果
    document.querySelectorAll('button')?.forEach(button => {
        button.addEventListener('mouseenter', () => {
            button.style.transform = 'scale(1.02)';
            button.style.transition = 'transform 0.2s';
        });
        button.addEventListener('mouseleave', () => {
            button.style.transform = 'scale(1)';
        });
    });
    
    // 为SQL内容添加复制提示动画
    const sqlContent = document.getElementById('sqlContent');
    if (sqlContent) {
        sqlContent.addEventListener('click', () => {
            showNotification(t('sqlResult.sqlCopied'), 'success');
            sendCommand('copySQL');
        });
    }
}

// 处理初始状态
function handleInitialState() {
    // 检查是否有初始查询数据
    const initialQueryData = window.initialQueryData;
    if (initialQueryData) {
        updateSQLContent(initialQueryData);
    }
    
    // 检查是否有历史记录数据
    const initialHistoryData = window.initialHistoryData;
    if (initialHistoryData) {
        updateHistoryList(initialHistoryData);
    }
    
    // 默认选中第一个标签页
    const firstTab = document.querySelector('.tab');
    if (firstTab && !firstTab.classList.contains('active')) {
        firstTab.click();
    }
}

// 发送命令到VSCode扩展
function sendCommand(command, data = {}) {
    try {
        vscode.postMessage({
            command,
            ...data
        });
        console.log(`发送命令: ${command}`, data);
    } catch (error) {
        console.error(`发送命令失败: ${command}`, error);
    }
}

// 显示通知
function showNotification(message, type = 'info') {
    // 创建通知元素
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    // 添加到页面
    document.body.appendChild(notification);
    
    // 3秒后移除通知
    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transition = 'opacity 0.3s';
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 300);
    }, 3000);
}

// 更新SQL内容
function updateSQLContent(data) {
    const { sql, formattedSQL, highlightedSQL, parameters, executedTime, databaseType } = data;
    
    // 更新数据库信息
    const databaseInfo = document.querySelector('.database-info');
    if (databaseInfo) {
        databaseInfo.textContent = `${t('sqlResult.databaseType')}: ${databaseType}`;
    }
    
    // 更新SQL内容
    const sqlContent = document.getElementById('sqlContent');
    if (sqlContent) {
        sqlContent.innerHTML = highlightedSQL || sql;
    }
    
    // 更新参数信息
    const parametersContainer = document.querySelector('.parameters-container');
    if (parametersContainer) {
        if (parameters && parameters.length > 0) {
            parametersContainer.innerHTML = parameters.map((param, index) => `
                <div class="parameter-item">
                    <span class="parameter-name">${t('sqlResult.parameter')} ${index + 1}:</span>
                    <span class="parameter-value">${param.value}</span>
                    <span class="parameter-type">(${param.type})</span>
                </div>
            `).join('');
            parametersContainer.style.display = 'block';
        } else {
            parametersContainer.style.display = 'none';
        }
    }
    
    // 更新执行时间信息
    const executionInfo = document.querySelector('.execution-info');
    if (executionInfo) {
        if (executedTime !== undefined) {
            executionInfo.innerHTML = `
                <span class="execution-info-icon">⏱️</span>
                <span>${t('sqlResult.executionTime')}: ${executedTime}ms</span>
            `;
            
            // 根据执行时间添加警告样式
            if (executedTime > 1000) {
                executionInfo.classList.add('warning');
            } else {
                executionInfo.classList.remove('warning');
            }
            
            executionInfo.style.display = 'flex';
        } else {
            executionInfo.style.display = 'none';
        }
    }
}

// 更新历史记录列表
function updateHistoryList(history) {
    const historyList = document.querySelector('.history-list');
    if (historyList) {
        if (history.queries && history.queries.length > 0) {
            historyList.innerHTML = history.queries.map(query => `
                <div class="history-item" data-query-id="${query.id}">
                    <div class="history-item-time">${new Date(query.timestamp).toLocaleString()}</div>
                    <div class="history-item-sql">${query.preparing}</div>
                </div>
            `).join('');
            
            // 重新注册点击事件
            registerHistoryItemListeners();
        } else {
            historyList.innerHTML = `
                <div class="empty-history">
                    <p>${t('sqlResult.emptyHistory')}</p>
                </div>
            `;
        }
    }
}

// 注册历史记录项监听器
function registerHistoryItemListeners() {
    document.querySelectorAll('.history-item').forEach(item => {
        item.addEventListener('click', (e) => {
            const queryId = item.dataset.queryId;
            if (queryId) {
                // 移除所有选中状态
                document.querySelectorAll('.history-item').forEach(el => {
                    el.classList.remove('selected');
                });
                // 添加当前选中状态
                item.classList.add('selected');
                // 发送命令
                sendCommand('selectHistoryItem', { queryId });
            }
        });
    });
}

// 处理窗口大小变化
function handleResize() {
    // 调整SQL内容区域的最大高度
    const sqlContent = document.getElementById('sqlContent');
    if (sqlContent) {
        const windowHeight = window.innerHeight;
        const containerTop = sqlContent.getBoundingClientRect().top;
        const maxHeight = windowHeight - containerTop - 100; // 留出底部空间
        sqlContent.style.maxHeight = `${maxHeight}px`;
    }
    
    // 调整历史记录列表的最大高度
    const historyList = document.querySelector('.history-list');
    if (historyList) {
        const windowHeight = window.innerHeight;
        const containerTop = historyList.getBoundingClientRect().top;
        const maxHeight = windowHeight - containerTop - 100; // 留出底部空间
        historyList.style.maxHeight = `${maxHeight}px`;
    }
}

// 显示加载状态
function showLoading(show = true) {
    const loadingElement = document.createElement('div');
    loadingElement.className = 'loading';
    loadingElement.id = 'loadingIndicator';
    loadingElement.innerHTML = `
        <div class="loading-spinner"></div>
        <span>${t('sqlResult.loading')}</span>
    `;
    
    if (show) {
        // 检查是否已存在加载指示器
        const existingLoading = document.getElementById('loadingIndicator');
        if (!existingLoading) {
            document.body.appendChild(loadingElement);
        }
    } else {
        // 移除加载指示器
        const existingLoading = document.getElementById('loadingIndicator');
        if (existingLoading) {
            document.body.removeChild(existingLoading);
        }
    }
}

// 更新分页控件
function updatePagination(currentPage, totalPages) {
    const paginationContainer = document.querySelector('.pagination');
    if (paginationContainer) {
        let paginationHTML = '';
        
        // 上一页按钮
        paginationHTML += `<button ${currentPage === 1 ? 'disabled' : ''} data-page="${currentPage - 1}">${t('sqlResult.previousPage')}</button>`;
        
        // 页码按钮
        const maxVisiblePages = 5;
        let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
        let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
        
        // 调整起始页码，确保显示足够的页码
        if (endPage - startPage + 1 < maxVisiblePages) {
            startPage = Math.max(1, endPage - maxVisiblePages + 1);
        }
        
        // 第一页按钮
        if (startPage > 1) {
            paginationHTML += `<button data-page="1">1</button>`;
            if (startPage > 2) {
                paginationHTML += `<span>...</span>`;
            }
        }
        
        // 中间页码按钮
        for (let i = startPage; i <= endPage; i++) {
            paginationHTML += `<button ${i === currentPage ? 'disabled class="primary"' : ''} data-page="${i}">${i}</button>`;
        }
        
        // 最后一页按钮
        if (endPage < totalPages) {
            if (endPage < totalPages - 1) {
                paginationHTML += `<span>...</span>`;
            }
            paginationHTML += `<button data-page="${totalPages}">${totalPages}</button>`;
        }
        
        // 下一页按钮
        paginationHTML += `<button ${currentPage === totalPages ? 'disabled' : ''} data-page="${currentPage + 1}">${t('sqlResult.nextPage')}</button>`;
        
        paginationContainer.innerHTML = paginationHTML;
        
        // 重新注册分页按钮事件
        registerPaginationListeners();
    }
}

// 注册分页控件监听器
function registerPaginationListeners() {
    document.querySelectorAll('.pagination button').forEach(button => {
        button.addEventListener('click', () => {
            if (button.hasAttribute('disabled')) {
                return;
            }
            const page = button.dataset.page;
            if (page) {
                sendCommand('changePage', { page: parseInt(page) });
            }
        });
    });
}

// 更新统计信息
function updateStats(stats) {
    const { totalQueries, executionTimeRange, avgExecutionTime } = stats;
    
    const statsInfo = document.querySelector('.stats-info');
    if (statsInfo) {
        statsInfo.innerHTML = `
            <div class="stats-item">
                <span>${t('sqlResult.totalQueries')}: ${totalQueries}</span>
            </div>
            ${executionTimeRange ? `
            <div class="stats-item">
                <span>${t('sqlResult.executionTimeRange')}: ${executionTimeRange}</span>
            </div>
            ` : ''}
            ${avgExecutionTime ? `
            <div class="stats-item">
                <span>${t('sqlResult.avgExecutionTime')}: ${avgExecutionTime}ms</span>
            </div>
            ` : ''}
        `;
    }
}

// 初始化SQL语法高亮（客户端增强版）
function enhanceSQLHighlighting() {
    const sqlContent = document.getElementById('sqlContent');
    if (sqlContent && sqlContent.innerHTML) {
        // 这里可以添加更高级的客户端语法高亮逻辑
        // 例如根据数据库类型应用不同的高亮规则
        const databaseType = document.querySelector('.database-info')?.textContent;
        if (databaseType) {
            // 根据数据库类型调整高亮样式
            if (databaseType.includes('mysql')) {
                // MySQL特定的高亮调整
            } else if (databaseType.includes('oracle')) {
                // Oracle特定的高亮调整
            }
            // 其他数据库类型...
        }
    }
}

// 处理键盘快捷键
function handleKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Ctrl+Shift+C: 复制SQL
        if (e.ctrlKey && e.shiftKey && e.key === 'C') {
            e.preventDefault();
            sendCommand('copySQL');
            showNotification(t('sqlResult.sqlCopied'), 'success');
        }
        
        // Ctrl+Shift+F: 复制格式化SQL
        if (e.ctrlKey && e.shiftKey && e.key === 'F') {
            e.preventDefault();
            sendCommand('copyFormattedSQL');
            showNotification(t('sqlResult.formattedSqlCopied'), 'success');
        }
        
        // Ctrl+Shift+E: 生成执行计划
        if (e.ctrlKey && e.shiftKey && e.key === 'E') {
            e.preventDefault();
            sendCommand('runExplain');
        }
        
        // Escape: 关闭面板
        if (e.key === 'Escape') {
            sendCommand('closePanel');
        }
    });
}

// 导出SQL为文件
function exportSQLToFile(sql, filename = 'export.sql') {
    // 创建Blob对象
    const blob = new Blob([sql], { type: 'text/sql' });
    
    // 创建下载链接
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    
    // 模拟点击下载
    document.body.appendChild(a);
    a.click();
    
    // 清理
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// 应用主题
function applyTheme(theme) {
    // 这里可以根据VSCode的主题设置调整webview的主题
    // 例如，检测是否为深色主题并应用相应的样式
    document.body.dataset.theme = theme;
}

// 当DOM加载完成后初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

// 暴露全局函数供VSCode调用
window.updateSQLContent = updateSQLContent;
window.updateHistoryList = updateHistoryList;
window.showNotification = showNotification;
window.showLoading = showLoading;
window.updatePagination = updatePagination;
window.updateStats = updateStats;
window.exportSQLToFile = exportSQLToFile;
window.applyTheme = applyTheme;