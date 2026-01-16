const { ipcRenderer } = require('electron');

// State
let config = null;
let isMonitoring = false;
let currentWalletPage = 1;
let walletsPerPage = 20;

// Performance optimization
let updateStatsTimeout = null;
let loadWalletsTimeout = null;

// Debounce function
function debounce(func, delay) {
    return function() {
        const context = this;
        const args = arguments;
        clearTimeout(func.timeout);
        func.timeout = setTimeout(() => func.apply(context, args), delay);
    };
}

// DOM Elements
const pages = document.querySelectorAll('.page');
const navItems = document.querySelectorAll('.nav-item');

// Navigation
navItems.forEach(item => {
    item.addEventListener('click', () => {
        const pageName = item.dataset.page;

        // Update nav
        navItems.forEach(nav => nav.classList.remove('active'));
        item.classList.add('active');

        // Update pages
        pages.forEach(page => page.classList.remove('active'));
        document.getElementById(pageName).classList.add('active');

        // Load page data
        if (pageName === 'wallets') {
            loadWallets();
        } else if (pageName === 'telegram') {
            loadTelegramConfig();
        }
    });
});

// Initialize
async function init() {
    config = await ipcRenderer.invoke('get-config');
    debouncedUpdateStats();
    loadWallets();
}

// Dashboard
document.getElementById('start-btn').addEventListener('click', async () => {
    const result = await ipcRenderer.invoke('start-monitoring');
    if (result.success) {
        isMonitoring = true;
        document.getElementById('start-btn').disabled = true;
        document.getElementById('stop-btn').disabled = false;
    }
});

document.getElementById('stop-btn').addEventListener('click', async () => {
    const result = await ipcRenderer.invoke('stop-monitoring');
    if (result.success) {
        isMonitoring = false;
        document.getElementById('start-btn').disabled = false;
        document.getElementById('stop-btn').disabled = true;
    }
});

// Wallets
document.getElementById('add-wallet-btn').addEventListener('click', async () => {
    const address = document.getElementById('wallet-address').value.trim();
    const name = document.getElementById('wallet-name').value.trim();

    if (!address) {
        showAlert('wallet-alert', 'Vui lòng nhập địa chỉ ví', 'error');
        return;
    }

    const wallet = {
        address: address,
        name: name || address.substring(0, 10) + '...'
    };

    const result = await ipcRenderer.invoke('add-wallet', wallet);

    if (result.success) {
        showAlert('wallet-alert', 'Thêm ví thành công!', 'success');
        document.getElementById('wallet-address').value = '';
        document.getElementById('wallet-name').value = '';
        config = await ipcRenderer.invoke('get-config');
        debouncedLoadWallets();
        debouncedUpdateStats();
    }
});

async function loadWallets() {
    config = await ipcRenderer.invoke('get-config');
    const walletList = document.getElementById('wallet-list');

    if (!config.wallets || config.wallets.length === 0) {
        walletList.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">👛</div>
        <div>Chưa cấu hình ví nào</div>
      </div>
    `;
        return;
    }

    // Pagination for better performance with many wallets
    const startIndex = (currentWalletPage - 1) * walletsPerPage;
    const endIndex = startIndex + walletsPerPage;
    const walletsToShow = config.wallets.slice(startIndex, endIndex);

    // Use DocumentFragment for better performance
    const fragment = document.createDocumentFragment();
    
    walletsToShow.forEach(wallet => {
        const li = document.createElement('li');
        li.className = 'wallet-item';
        li.innerHTML = `
            <div class="wallet-info">
                <div class="wallet-name">${wallet.name}</div>
                <div class="wallet-address">${wallet.address}</div>
            </div>
            <button class="btn btn-danger" onclick="removeWallet('${wallet.address}')">
                🗑️
            </button>
        `;
        fragment.appendChild(li);
    });
    
    // Add pagination controls if needed
    if (config.wallets.length > walletsPerPage) {
        const paginationDiv = document.createElement('div');
        paginationDiv.className = 'pagination-controls';
        paginationDiv.style.cssText = 'text-align: center; margin-top: 15px;';
        
        const totalPages = Math.ceil(config.wallets.length / walletsPerPage);
        const prevBtn = document.createElement('button');
        prevBtn.className = 'btn btn-secondary';
        prevBtn.style.marginRight = '10px';
        prevBtn.textContent = '← Trước';
        prevBtn.disabled = currentWalletPage === 1;
        prevBtn.onclick = () => {
            if (currentWalletPage > 1) {
                currentWalletPage--;
                loadWallets();
            }
        };
        
        const pageInfo = document.createElement('span');
        pageInfo.style.margin = '0 10px';
        pageInfo.textContent = `Trang ${currentWalletPage}/${totalPages} (${config.wallets.length} ví)`;
        
        const nextBtn = document.createElement('button');
        nextBtn.className = 'btn btn-secondary';
        nextBtn.style.marginLeft = '10px';
        nextBtn.textContent = 'Sau →';
        nextBtn.disabled = currentWalletPage === totalPages;
        nextBtn.onclick = () => {
            if (currentWalletPage < totalPages) {
                currentWalletPage++;
                loadWallets();
            }
        };
        
        paginationDiv.appendChild(prevBtn);
        paginationDiv.appendChild(pageInfo);
        paginationDiv.appendChild(nextBtn);
        fragment.appendChild(paginationDiv);
    }
    
    // Clear and append all at once
    walletList.innerHTML = '';
    walletList.appendChild(fragment);
}

async function removeWallet(address) {
    if (!confirm('Bạn có chắc chắn muốn xóa ví này?')) {
        return;
    }

    const result = await ipcRenderer.invoke('remove-wallet', address);
    if (result.success) {
        showAlert('wallet-alert', 'Xóa ví thành công!', 'success');
        config = await ipcRenderer.invoke('get-config');
        
        // Reset to first page if current page would be empty
        const totalPages = Math.ceil(config.wallets.length / walletsPerPage);
        if (currentWalletPage > totalPages && totalPages > 0) {
            currentWalletPage = totalPages;
        } else if (config.wallets.length === 0) {
            currentWalletPage = 1;
        }
        
        debouncedLoadWallets();
        debouncedUpdateStats();
    }
}

// Make removeWallet available globally
window.removeWallet = removeWallet;

// Telegram
async function loadTelegramConfig() {
    config = await ipcRenderer.invoke('get-config');
    document.getElementById('bot-token').value = config.telegram.botToken || '';
    document.getElementById('chat-id').value = config.telegram.chatId || '';

    // Load Tronscan API keys
    loadApiKeys();

    // Load report config
    document.getElementById('report-enabled').checked = config.report?.enabled || false;
    document.getElementById('report-time').value = config.report?.time || '09:00';
}

document.getElementById('save-telegram-btn').addEventListener('click', async () => {
    const botToken = document.getElementById('bot-token').value.trim();
    const chatId = document.getElementById('chat-id').value.trim();

    if (!botToken || !chatId) {
        showAlert('telegram-alert', 'Vui lòng điền đầy đủ cả hai trường', 'error');
        return;
    }

    config.telegram.botToken = botToken;
    config.telegram.chatId = chatId;

    const result = await ipcRenderer.invoke('save-config', config);

    if (result.success) {
        showAlert('telegram-alert', 'Lưu cấu hình thành công!', 'success');
    } else {
        showAlert('telegram-alert', 'Không thể lưu cấu hình', 'error');
    }
});

document.getElementById('test-telegram-btn').addEventListener('click', async () => {
    const result = await ipcRenderer.invoke('test-telegram');

    if (result.success) {
        showAlert('telegram-alert', 'Gửi tin nhắn thử thành công! Kiểm tra Telegram của bạn.', 'success');
    } else {
        showAlert('telegram-alert', `Không thể gửi tin nhắn thử: ${result.error}`, 'error');
    }
});

// API Key Management
document.getElementById('add-api-key-btn').addEventListener('click', async () => {
    const apiKey = document.getElementById('tronscan-api-key').value.trim();

    if (!apiKey) {
        showAlert('api-key-alert', 'Vui lòng nhập API key', 'error');
        return;
    }

    if (!config.tronscan) {
        config.tronscan = {};
    }
    if (!config.tronscan.apiKeys) {
        config.tronscan.apiKeys = [];
    }

    // Check if API key already exists
    if (config.tronscan.apiKeys.includes(apiKey)) {
        showAlert('api-key-alert', 'API key này đã tồn tại', 'error');
        return;
    }

    config.tronscan.apiKeys.push(apiKey);

    const result = await ipcRenderer.invoke('save-config', config);

    if (result.success) {
        showAlert('api-key-alert', 'Thêm API key thành công!', 'success');
        document.getElementById('tronscan-api-key').value = '';
        loadApiKeys();
    } else {
        showAlert('api-key-alert', 'Không thể lưu API key', 'error');
    }
});

async function loadApiKeys() {
    config = await ipcRenderer.invoke('get-config');
    const apiKeyList = document.getElementById('api-key-list');

    if (!config.tronscan || !config.tronscan.apiKeys || config.tronscan.apiKeys.length === 0) {
        apiKeyList.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">🔑</div>
                <div>Chưa có API key nào</div>
            </div>
        `;
        return;
    }

    const fragment = document.createDocumentFragment();
    
    config.tronscan.apiKeys.forEach((apiKey, index) => {
        const li = document.createElement('li');
        li.className = 'wallet-item';
        li.innerHTML = `
            <div class="wallet-info">
                <div class="wallet-name">API Key #${index + 1}</div>
                <div class="wallet-address">${apiKey.substring(0, 20)}...${apiKey.substring(apiKey.length - 10)}</div>
            </div>
            <button class="btn btn-danger" onclick="removeApiKey('${apiKey}')">
                🗑️
            </button>
        `;
        fragment.appendChild(li);
    });
    
    apiKeyList.innerHTML = '';
    apiKeyList.appendChild(fragment);
}

async function removeApiKey(apiKey) {
    if (!confirm('Bạn có chắc chắn muốn xóa API key này?')) {
        return;
    }

    if (!config.tronscan || !config.tronscan.apiKeys) {
        return;
    }

    config.tronscan.apiKeys = config.tronscan.apiKeys.filter(key => key !== apiKey);

    const result = await ipcRenderer.invoke('save-config', config);

    if (result.success) {
        showAlert('api-key-alert', 'Xóa API key thành công!', 'success');
        loadApiKeys();
    } else {
        showAlert('api-key-alert', 'Không thể xóa API key', 'error');
    }
}

// Make removeApiKey available globally
window.removeApiKey = removeApiKey;

document.getElementById('save-report-btn').addEventListener('click', async () => {
    const reportEnabled = document.getElementById('report-enabled').checked;
    const reportTime = document.getElementById('report-time').value;

    if (!config.report) {
        config.report = {};
    }
    config.report.enabled = reportEnabled;
    config.report.time = reportTime;

    const result = await ipcRenderer.invoke('save-config', config);

    if (result.success) {
        showAlert('telegram-alert', 'Lưu cấu hình báo cáo thành công!', 'success');
    } else {
        showAlert('telegram-alert', 'Không thể lưu cấu hình báo cáo', 'error');
    }
});

document.getElementById('test-report-btn').addEventListener('click', async () => {
    const result = await ipcRenderer.invoke('test-balance-report');

    if (result.success) {
        showAlert('telegram-alert', 'Đã gửi báo cáo số dư! Kiểm tra Telegram của bạn.', 'success');
    } else {
        showAlert('telegram-alert', `Không thể gửi báo cáo: ${result.error}`, 'error');
    }
});

// WebSocket Events
ipcRenderer.on('ws-status', (event, status) => {
    const statusElement = document.getElementById('connection-status');

    if (status === 'connected') {
        statusElement.innerHTML = `
      <span class="status-indicator status-connected"></span>
      Đã Kết Nối
    `;
    } else {
        statusElement.innerHTML = `
      <span class="status-indicator status-disconnected"></span>
      Đã Ngắt Kết Nối
    `;
    }
});

ipcRenderer.on('new-transaction', (event, transaction) => {
    console.log('New transaction received:', transaction);
    
    // Update UI 
    debouncedUpdateStats();
});

ipcRenderer.on('ws-error', (event, error) => {
    console.error('WebSocket error:', error);
});

// Helper functions
function updateStats() {
    const walletCount = config ? config.wallets.length : 0;

    document.getElementById('wallet-count').textContent = walletCount;
}

// Create debounced versions of performance-critical functions
const debouncedUpdateStats = debounce(updateStats, 100);
const debouncedLoadWallets = debounce(loadWallets, 200);

function showAlert(elementId, message, type) {
    const alert = document.getElementById(elementId);
    alert.textContent = message;
    alert.className = `alert alert-${type} show`;

    setTimeout(() => {
        alert.classList.remove('show');
    }, 5000);
}

// Initialize on load
init();
