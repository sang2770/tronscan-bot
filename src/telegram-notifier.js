const TelegramBot = require('node-telegram-bot-api');

class TelegramNotifier {
    constructor(botToken, chatId) {
        this.botToken = botToken;
        this.chatId = chatId;
        this.bot = null;
        this.messageQueue = [];
        this.isProcessing = false;
        this.minDelay = 3000; // 3 seconds between messages
        this.lastSentTime = 0;

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
            // Wait if needed to respect rate limits
            const now = Date.now();
            const timeSinceLastSent = now - this.lastSentTime;
            if (timeSinceLastSent < this.minDelay) {
                await this.sleep(this.minDelay - timeSinceLastSent);
            }

            await this.bot.sendMessage(this.chatId, text, {
                parse_mode: 'HTML',
                disable_web_page_preview: true,
                ...options
            });

            this.lastSentTime = Date.now();
            return true;
        } catch (error) {
            // Handle rate limit error
            if (error.response && error.response.body && error.response.body.parameters) {
                const retryAfter = error.response.body.parameters.retry_after;
                if (retryAfter) {
                    console.log(`Rate limited. Waiting ${retryAfter} seconds...`);
                    await this.sleep(retryAfter * 1000);
                    // Retry once after waiting
                    return this.sendMessage(text, options);
                }
            }
            console.error('Error sending Telegram message:', error);
            throw error;
        }
    }

    async sendTransactionNotification(transaction) {
        if (!this.bot) {
            console.warn('Telegram bot not configured, skipping notification');
            return;
        }

        // Add to queue instead of sending immediately
        this.messageQueue.push(transaction);

        // Start processing queue if not already processing
        if (!this.isProcessing) {
            this.processQueue();
        }
    }

    async processQueue() {
        if (this.isProcessing || this.messageQueue.length === 0) {
            return;
        }

        this.isProcessing = true;

        while (this.messageQueue.length > 0) {
            const transaction = this.messageQueue.shift();

            try {
                const message = this.formatTransactionMessage(transaction);
                await this.sendMessage(message);
            } catch (error) {
                console.error('Error sending transaction notification:', error);
                // If error persists, wait longer before continuing
                await this.sleep(5000);
            }
        }

        this.isProcessing = false;
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async sendBalanceReport(balances) {
        if (!this.bot) {
            console.warn('Telegram bot not configured, skipping balance report');
            return;
        }

        try {
            const message = this.formatBalanceReport(balances);
            await this.sendMessage(message);
        } catch (error) {
            console.error('Error sending balance report:', error);
        }
    }

    formatBalanceReport(balances) {
        const date = new Date();
        const dateStr = date.toLocaleString('vi-VN', { 
            year: 'numeric', 
            month: '2-digit', 
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });

        let message = `📊 <b>BÁO CÁO SỐ DƯ VÍ</b>\n`;
        message += `🕐 Thời gian: ${dateStr}\n\n`;

        let totalBalance = 0;
        let successCount = 0;

        balances.forEach((item, index) => {
            const walletName = item.wallet.name || `Ví ${index + 1}`;
            
            if (item.error) {
                message += `❌ <b>${walletName}</b>\n`;
                message += `   Lỗi: ${item.error}\n\n`;
            } else {
                const balance = parseFloat(item.balance);
                totalBalance += balance;
                successCount++;

                message += `💼 <b>${walletName}</b>\n`;
                message += `   Số dư: <b>$${this.formatAmount(balance)}</b>\n`;
                message += `   Địa chỉ: <code>${item.wallet.address}</code>\n\n`;
            }
        });

        message += `━━━━━━━━━━━━━━━━━━\n`;
        message += `💰 <b>TỔNG SỐ DƯ</b>: <b>$${this.formatAmount(totalBalance)}</b>\n`;
        message += `✅ Thành công: ${successCount}/${balances.length} ví`;

        return message;
    }

    formatTransactionMessage(tx) {
        const emoji = this.getTransactionEmoji(tx);
        const date = new Date(tx.timestamp);
        const dateStr = date.toLocaleString('vi-VN');

        // Determine transaction direction based on transferType
        let direction = '🔄 Giao dịch';

        if (tx.transferType === 'In') {
            direction = '📥 Tiền vào';
        } else if (tx.transferType === 'Out') {
            direction = '📤 Tiền ra';
        } else {
            // Fallback to old logic
            const fromWallet = tx.matchedWallets.find(w => w.type === 'from');
            const toWallet = tx.matchedWallets.find(w => w.type === 'to');

            if (fromWallet && toWallet) {
                direction = '🔄 Chuyển nội bộ';
            } else if (fromWallet) {
                direction = '📤 Tiền ra';
            } else if (toWallet) {
                direction = '📥 Tiền vào';
            }
        }

        let message = `${emoji} <b>${direction}</b>\n\n`;

        // From
        message += `<b>Từ:</b> ${this.formatAddress(tx.from.address, tx.from.name)}\n`;

        // To
        message += `<b>Đến:</b> ${this.formatAddress(tx.to.address, tx.to.name)}\n\n`;

        // Amount
        if (parseFloat(tx.amount) >= 0) {
            message += `<b>Số lượng:</b> ${direction.includes('Tiền vào') ? '+' : (direction.includes('Tiền ra') ? '-' : '')} ${this.formatAmount(tx.amount)} ${tx.token.abbr.toUpperCase()}\n`;
        }

        // Token info
        message += `<b>Token:</b> ${tx.token.name} (${tx.token.abbr})\n`;

        // Block and time
        message += `<b>Khối:</b> ${tx.block}\n`;
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
