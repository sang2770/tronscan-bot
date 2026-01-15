const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const WebSocketMonitor = require('./src/websocket-monitor');
const TelegramNotifier = require('./src/telegram-notifier');
const ConfigManager = require('./src/config-manager');

let mainWindow;
let wsMonitor;
let telegramNotifier;
let configManager;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1000,
        height: 700,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
    });

    mainWindow.loadFile('index.html');

    // Open DevTools in development
    if (process.argv.includes('--enable-logging')) {
        mainWindow.webContents.openDevTools();
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

function initializeServices() {
    configManager = new ConfigManager();
    const config = configManager.getConfig();

    // Initialize Telegram Notifier
    if (config.telegram.botToken && config.telegram.chatId) {
        telegramNotifier = new TelegramNotifier(
            config.telegram.botToken,
            config.telegram.chatId
        );
    }

    // Initialize WebSocket Monitor
    wsMonitor = new WebSocketMonitor(config.wallets);

    wsMonitor.on('transaction', (transaction) => {
        console.log('New transaction detected:', transaction);

        // Send to renderer process
        if (mainWindow) {
            mainWindow.webContents.send('new-transaction', transaction);
        }

        // Send Telegram notification
        if (telegramNotifier) {
            telegramNotifier.sendTransactionNotification(transaction);
        }
    });

    wsMonitor.on('error', (error) => {
        console.error('WebSocket error:', error);
        if (mainWindow) {
            mainWindow.webContents.send('ws-error', error.message);
        }
    });

    wsMonitor.on('connected', () => {
        console.log('WebSocket connected');
        if (mainWindow) {
            mainWindow.webContents.send('ws-status', 'connected');
        }
    });

    wsMonitor.on('disconnected', () => {
        console.log('WebSocket disconnected');
        if (mainWindow) {
            mainWindow.webContents.send('ws-status', 'disconnected');
        }
    });
}

// IPC Handlers
ipcMain.handle('get-config', () => {
    return configManager.getConfig();
});

ipcMain.handle('save-config', (event, config) => {
    configManager.saveConfig(config);

    // Restart services with new config
    if (wsMonitor) {
        wsMonitor.stop();
    }

    initializeServices();

    return { success: true };
});

ipcMain.handle('add-wallet', (event, wallet) => {
    const config = configManager.getConfig();
    config.wallets.push(wallet);
    configManager.saveConfig(config);

    // Update monitor
    if (wsMonitor) {
        wsMonitor.updateWallets(config.wallets);
    }

    return { success: true };
});

ipcMain.handle('remove-wallet', (event, address) => {
    const config = configManager.getConfig();
    config.wallets = config.wallets.filter(w => w.address !== address);
    configManager.saveConfig(config);

    // Update monitor
    if (wsMonitor) {
        wsMonitor.updateWallets(config.wallets);
    }

    return { success: true };
});

ipcMain.handle('start-monitoring', () => {
    if (wsMonitor) {
        wsMonitor.start();
        return { success: true };
    }
    return { success: false, error: 'Monitor not initialized' };
});

ipcMain.handle('stop-monitoring', () => {
    if (wsMonitor) {
        wsMonitor.stop();
        return { success: true };
    }
    return { success: false, error: 'Monitor not initialized' };
});

ipcMain.handle('test-telegram', async () => {
    if (!telegramNotifier) {
        const config = configManager.getConfig();
        if (!config.telegram.botToken || !config.telegram.chatId) {
            return { success: false, error: 'Telegram not configured' };
        }
        telegramNotifier = new TelegramNotifier(
            config.telegram.botToken,
            config.telegram.chatId
        );
    }

    try {
        await telegramNotifier.sendMessage('✅ Xin chào! Đây là tin nhắn kiểm tra từ ứng dụng giám sát giao dịch TRON.');
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

app.whenReady().then(() => {
    createWindow();
    initializeServices();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (wsMonitor) {
        wsMonitor.stop();
    }
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('quit', () => {
    if (wsMonitor) {
        wsMonitor.stop();
    }
});
