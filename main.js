const fs = require('fs');
const util = require('util');

// mở file log (append mode)
const logFile = fs.createWriteStream('app.log', { flags: 'a' });

// ghi đè console.log
console.log = function (...args) {
  // log ra terminal
  process.stdout.write(util.format(...args) + '\n');

  // log ra file
  logFile.write(util.format(...args) + '\n');
};

const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const WebSocketMonitor = require("./src/websocket-monitor");
const TelegramNotifier = require("./src/telegram-notifier");
const ConfigManager = require("./src/config-manager");
const BalanceReporter = require("./src/balance-reporter");

let mainWindow;
let wsMonitor;
let telegramNotifier;
let configManager;
let balanceReporter;
let reportScheduler = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  mainWindow.loadFile("index.html");

  // Open DevTools in development
  if (process.argv.includes("--enable-logging")) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on("closed", () => {
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

  // Initialize Balance Reporter
  if (config.tronscan && config.tronscan.apiKeys && config.tronscan.apiKeys.length > 0) {
    balanceReporter = new BalanceReporter(config.tronscan.apiKeys);
  }

  // Initialize WebSocket Monitor
  wsMonitor = new WebSocketMonitor(config.wallets, config.tronscan.apiKeys || []);

  wsMonitor.on("transaction", (transaction) => {
    // console.log('New transaction detected:', transaction);

    // Send to renderer process
    if (mainWindow) {
      mainWindow.webContents.send("new-transaction", transaction);
    }

    // Send Telegram notification
    if (telegramNotifier) {
      telegramNotifier.sendTransactionNotification(transaction);
    }
  });

  wsMonitor.on("error", (error) => {
    console.error("WebSocket error:", error);
    if (mainWindow) {
      mainWindow.webContents.send("ws-error", error.message);
    }
  });

  wsMonitor.on("connected", () => {
    console.log("WebSocket connected");
    if (mainWindow) {
      mainWindow.webContents.send("ws-status", "connected");
    }
  });

  wsMonitor.on("disconnected", () => {
    console.log("WebSocket disconnected");
    if (mainWindow) {
      mainWindow.webContents.send("ws-status", "disconnected");
    }
  });

  // Setup balance report scheduler
  setupReportScheduler();
}

// IPC Handlers
ipcMain.handle("get-config", () => {
  return configManager.getConfig();
});

ipcMain.handle("save-config", (event, config) => {
  configManager.saveConfig(config);

  // Restart services with new config
  if (wsMonitor) {
    wsMonitor.stop();
  }

  initializeServices();

  return { success: true };
});

ipcMain.handle("add-wallet", (event, wallet) => {
  const config = configManager.getConfig();
  config.wallets.push(wallet);
  configManager.saveConfig(config);

  // Update monitor
  if (wsMonitor) {
    wsMonitor.updateWallets(config.wallets);
  }

  return { success: true };
});

ipcMain.handle("remove-wallet", (event, address) => {
  const config = configManager.getConfig();
  config.wallets = config.wallets.filter((w) => w.address !== address);
  configManager.saveConfig(config);

  // Update monitor
  if (wsMonitor) {
    wsMonitor.updateWallets(config.wallets);
  }

  return { success: true };
});

ipcMain.handle("start-monitoring", () => {
  if (wsMonitor) {
    wsMonitor.start();
    return { success: true };
  }
  return { success: false, error: "Monitor not initialized" };
});

ipcMain.handle("stop-monitoring", () => {
  if (wsMonitor) {
    wsMonitor.stop();
    return { success: true };
  }
  return { success: false, error: "Monitor not initialized" };
});

ipcMain.handle("test-telegram", async () => {
  if (!telegramNotifier) {
    const config = configManager.getConfig();
    if (!config.telegram.botToken || !config.telegram.chatId) {
      return { success: false, error: "Telegram not configured" };
    }
    telegramNotifier = new TelegramNotifier(
      config.telegram.botToken,
      config.telegram.chatId
    );
  }

  try {
    await telegramNotifier.sendMessage(
      "✅ Xin chào! Đây là tin nhắn kiểm tra từ ứng dụng giám sát giao dịch TRON."
    );
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle("test-balance-report", async () => {
  try {
    await sendBalanceReport();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

function setupReportScheduler() {
  // send first time
  sendBalanceReport();
  // Clear existing scheduler
  if (reportScheduler) {
    clearInterval(reportScheduler);
    reportScheduler = null;
  }

  const config = configManager.getConfig();

  if (!config.report || !config.report.enabled || !config.report.time) {
    return;
  }

  // Check every minute if it's time to report
  reportScheduler = setInterval(() => {
    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(
      now.getMinutes()
    ).padStart(2, "0")}`;

    if (currentTime === config.report.time) {
      console.log("Time to send balance report:", currentTime);
      sendBalanceReport();
    }
  }, 60000); // Check every minute

  console.log("Balance report scheduler setup for", config.report.time);
}

async function sendBalanceReport() {
  const config = configManager.getConfig();

  if (
    !balanceReporter ||
    !telegramNotifier ||
    !config.wallets ||
    config.wallets.length === 0
  ) {
    console.log(
      "Cannot send balance report: services not initialized or no wallets"
    );
    return;
  }

  try {
    console.log("Fetching balance for", config.wallets.length, "wallets...");
    const balances = await balanceReporter.getAllWalletsBalance(config.wallets);
    await telegramNotifier.sendBalanceReport(balances);
    console.log("Balance report sent successfully");
  } catch (error) {
    console.error("Error sending balance report:", error);
  }
}

app.whenReady().then(() => {
  createWindow();
  initializeServices();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (wsMonitor) {
    wsMonitor.stop();
  }
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("quit", () => {
  if (wsMonitor) {
    wsMonitor.stop();
  }
});
