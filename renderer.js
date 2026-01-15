const { ipcRenderer } = require('electron');

// State
let config = null;
let transactions = [];
let isMonitoring = false;

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
        } else if (pageName === 'transactions') {
            loadTransactionHistory();
        }
    });
});

// Initialize
async function init() {
    config = await ipcRenderer.invoke('get-config');
    updateStats();
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

    if (!address.startsWith('T') || address.length !== 34) {
        showAlert('wallet-alert', 'Địa chễ ví Tron không hợp lệ', 'error');
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
        loadWallets();
        updateStats();
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

    walletList.innerHTML = config.wallets.map(wallet => `
    <li class="wallet-item">
      <div class="wallet-info">
        <div class="wallet-name">${wallet.name}</div>
        <div class="wallet-address">${wallet.address}</div>
      </div>
      <button class="btn btn-danger" onclick="removeWallet('${wallet.address}')">
        🗑️
      </button>
    </li>
  `).join('');
}

async function removeWallet(address) {
    if (!confirm('Bạn có chắc chắn muốn xóa ví này?')) {
        return;
    }

    const result = await ipcRenderer.invoke('remove-wallet', address);
    if (result.success) {
        showAlert('wallet-alert', 'Xóa ví thành công!', 'success');
        config = await ipcRenderer.invoke('get-config');
        loadWallets();
        updateStats();
    }
}

// Make removeWallet available globally
window.removeWallet = removeWallet;

// Telegram
async function loadTelegramConfig() {
    config = await ipcRenderer.invoke('get-config');
    document.getElementById('bot-token').value = config.telegram.botToken || '';
    document.getElementById('chat-id').value = config.telegram.chatId || '';
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

// Transactions
function loadTransactionHistory() {
    const historyContainer = document.getElementById('transaction-history');

    if (transactions.length === 0) {
        historyContainer.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📜</div>
        <div>Chưa có giao dịch nào được ghi nhận</div>
      </div>
    `;
        return;
    }

    historyContainer.innerHTML = transactions.map(tx => renderTransaction(tx)).join('');
}

function renderTransaction(tx) {
    const date = new Date(tx.timestamp);
    const timeStr = date.toLocaleString();

    const fromName = tx.from.name ? `${tx.from.name}` : shortenAddress(tx.from.address);
    const toName = tx.to.name ? `${tx.to.name}` : shortenAddress(tx.to.address);

    return `
    <div class="transaction-item">
      <div class="transaction-header">
        <div class="transaction-amount">
          ${tx.amount} ${tx.token.abbr.toUpperCase()}
        </div>
        <div class="transaction-time">${timeStr}</div>
      </div>
      <div class="transaction-details">
        <div><strong>Từ:</strong> ${fromName}</div>
        <div><strong>Đến:</strong> ${toName}</div>
        <div><strong>Loại:</strong> ${getContractTypeName(tx.contractType)}</div>
        <div><strong>Khối:</strong> ${tx.block}</div>
      </div>
      <a href="https://tronscan.org/#/transaction/${tx.hash}" target="_blank" class="transaction-link">
        Xem trên Tronscan →
      </a>
    </div>
  `;
}

function shortenAddress(address) {
    if (!address) return 'Không rõ';
    if (address.length <= 12) return address;
    return `${address.substring(0, 6)}...${address.substring(address.length - 6)}`;
}

function getContractTypeName(contractType) {
    const typeMap = {
        '1': 'Chuyển Tiền',
        '2': 'Chuyển Tài Sản',
        '4': 'Bầu Witness',
        '11': 'Tạo Token',
        '31': 'Gọi Smart Contract',
        '44': 'Giao Dịch Exchange',
        '57': 'Cập Nhật Quyền Tài Khoản',
    };
    return typeMap[contractType] || `Loại Hợp Đồng ${contractType}`;
}

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

    // Add to transactions array
    transactions.unshift(transaction);

    // Keep only last 100 transactions
    if (transactions.length > 100) {
        transactions = transactions.slice(0, 100);
    }

    // Update UI
    updateStats();
    updateRecentTransactions();

    // Update transaction history if on that page
    const historyPage = document.getElementById('transactions');
    if (historyPage.classList.contains('active')) {
        loadTransactionHistory();
    }
});

ipcRenderer.on('ws-error', (event, error) => {
    console.error('WebSocket error:', error);
});

// Helper functions
function updateStats() {
    const walletCount = config ? config.wallets.length : 0;
    const today = new Date().setHours(0, 0, 0, 0);
    const todayTransactions = transactions.filter(tx => tx.timestamp >= today).length;

    document.getElementById('wallet-count').textContent = walletCount;
    document.getElementById('transaction-count').textContent = todayTransactions;
}

function updateRecentTransactions() {
    const container = document.getElementById('recent-transactions');
    const recentTxs = transactions.slice(0, 5);

    if (recentTxs.length === 0) {
        container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📭</div>
        <div>Chưa có giao dịch nào</div>
      </div>
    `;
        return;
    }

    container.innerHTML = recentTxs.map(tx => renderTransaction(tx)).join('');
}

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
