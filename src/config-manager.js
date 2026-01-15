const fs = require('fs');
const path = require('path');
const { app } = require('electron');

class ConfigManager {
    constructor() {
        this.configPath = path.join(app.getPath('userData'), 'config.json');
        this.defaultConfig = {
            telegram: {
                botToken: '',
                chatId: ''
            },
            tronscan: {
                apiKey: ''
            },
            report: {
                enabled: false,
                time: '09:00', // HH:mm format
                timezone: 'Asia/Ho_Chi_Minh'
            },
            wallets: [],
            monitoring: {
                enabled: false,
                reconnectInterval: 5000
            }
        };

        this.ensureConfigExists();
    }

    ensureConfigExists() {
        if (!fs.existsSync(this.configPath)) {
            this.saveConfig(this.defaultConfig);
        }
    }

    getConfig() {
        try {
            const data = fs.readFileSync(this.configPath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            console.error('Error reading config:', error);
            return this.defaultConfig;
        }
    }

    saveConfig(config) {
        try {
            const dir = path.dirname(this.configPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2), 'utf8');
            return true;
        } catch (error) {
            console.error('Error saving config:', error);
            return false;
        }
    }

    addWallet(wallet) {
        const config = this.getConfig();
        // Check if wallet already exists
        const exists = config.wallets.find(w => w.address === wallet.address);
        if (exists) {
            return false;
        }
        config.wallets.push(wallet);
        return this.saveConfig(config);
    }

    removeWallet(address) {
        const config = this.getConfig();
        config.wallets = config.wallets.filter(w => w.address !== address);
        return this.saveConfig(config);
    }

    updateWallet(address, updates) {
        const config = this.getConfig();
        const walletIndex = config.wallets.findIndex(w => w.address === address);
        if (walletIndex === -1) {
            return false;
        }
        config.wallets[walletIndex] = { ...config.wallets[walletIndex], ...updates };
        return this.saveConfig(config);
    }

    getWallets() {
        const config = this.getConfig();
        return config.wallets;
    }
}

module.exports = ConfigManager;
