const TelegramBot = require('node-telegram-bot-api');

class TelegramNotifier {
    constructor(botToken, chatId) {
        this.botToken = botToken;
        this.chatId = chatId;
        this.bot = null;

        if (botToken) {
            try {
                this.bot = new TelegramBot(botToken, { polling: false });
            } catch (error) {
                console.error('Error initializing Telegram bot:', error);
            }
        }
    }

    async sendMessage(text, options = {}) {
        if (!this.bot) {
            throw new Error('Telegram bot not initialized');
        }

        try {
            await this.bot.sendMessage(this.chatId, text, {
                parse_mode: 'HTML',
                disable_web_page_preview: true,
                ...options
            });
            return true;
        } catch (error) {
            console.error('Error sending Telegram message:', error);
            throw error;
        }
    }

    async sendTransactionNotification(transaction) {
        if (!this.bot) {
            console.warn('Telegram bot not configured, skipping notification');
            return;
        }

        try {
            const message = this.formatTransactionMessage(transaction);
            await this.sendMessage(message);
        } catch (error) {
            console.error('Error sending transaction notification:', error);
        }
    }

    formatTransactionMessage(tx) {
        const emoji = this.getTransactionEmoji(tx);
        const date = new Date(tx.timestamp);
        const dateStr = date.toLocaleString();

        // Determine transaction direction
        let direction = '🔄 Giao dịch';
        const fromWallet = tx.matchedWallets.find(w => w.type === 'from');
        const toWallet = tx.matchedWallets.find(w => w.type === 'to');

        if (fromWallet && toWallet) {
            direction = '🔄 Chuyển nội bộ';
        } else if (fromWallet) {
            direction = '📤 Đi ra';
        } else if (toWallet) {
            direction = '📥 Đi vào';
        }

        let message = `${emoji} <b>${direction}</b>\n\n`;

        // From
        message += `<b>Đi từ:</b> ${this.formatAddress(tx.from.address, tx.from.name)}\n`;

        // To
        message += `<b>Đi đến:</b> ${this.formatAddress(tx.to.address, tx.to.name)}\n\n`;

        // Amount
        if (parseFloat(tx.amount) >= 0) {
            message += `<b>Số lượng:</b> ${this.formatAmount(tx.amount)} ${tx.token.abbr.toUpperCase()}\n`;
        }

        // Token info
        if (tx.token.name && tx.token.name.toLowerCase() !== 'trx') {
            message += `<b>Token:</b> ${tx.token.name} (${tx.token.abbr})\n`;
        }

        // Contract type
        const contractTypeName = this.getContractTypeName(tx.contractType);
        message += `<b>Loại:</b> ${contractTypeName}\n\n`;

        // Block and time
        // message += `<b>Block:</b> ${tx.block}\n`;
        message += `<b>Thời gian:</b> ${dateStr}\n\n`;
        // Transaction link
        message += `<a href="https://tronscan.org/#/transaction/${tx.hash}">Xem trên Tronscan</a>`;

        return message;
    }

    formatAddress(address, name) {
        if (name) {
            return `${name} (<code>${address || 'Unknown'}</code>)`;
        }
        return `<code>${address || 'Unknown'}</code>`;
    }

    formatAmount(amount) {
        const num = parseFloat(amount);
        if (num === 0) return '0';
        if (num < 0.000001) return num.toExponential(2);
        if (num < 1) return num.toFixed(6);
        if (num < 1000) return num.toFixed(2);
        return num.toLocaleString('en-US', { maximumFractionDigits: 2 });
    }

    getTransactionEmoji(tx) {
        const contractType = tx.contractType;

        // Map contract types to emojis
        const emojiMap = {
            '1': '💸',  // Transfer
            '2': '🔐',  // Transfer Asset
            '4': '🗳️',  // Vote
            '11': '🆕',  // Create Token
            '31': '⚡',  // Trigger Smart Contract
            '57': '🔄',  // Account Permission Update
            default: '📝'
        };

        return emojiMap[contractType] || emojiMap.default;
    }

    getContractTypeName(contractType) {
        const typeMap = {
            '1': 'Transfer',
            '2': 'Transfer Asset',
            '4': 'Vote Witness',
            '11': 'Create Token',
            '31': 'Trigger Smart Contract',
            '44': 'Exchange Transaction',
            '57': 'Account Permission Update',
        };

        return typeMap[contractType] || `Contract Type ${contractType}`;
    }

    updateConfig(botToken, chatId) {
        this.botToken = botToken;
        this.chatId = chatId;

        if (botToken) {
            try {
                this.bot = new TelegramBot(botToken, { polling: false });
            } catch (error) {
                console.error('Error reinitializing Telegram bot:', error);
            }
        }
    }
}

module.exports = TelegramNotifier;
