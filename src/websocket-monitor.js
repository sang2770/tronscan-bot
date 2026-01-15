const WebSocket = require('ws');
const EventEmitter = require('events');

class WebSocketMonitor extends EventEmitter {
    constructor(wallets = []) {
        super();
        this.wallets = wallets;
        this.ws = null;
        this.reconnectInterval = 5000;
        this.reconnectTimer = null;
        this.isRunning = false;
        this.wsUrl = 'wss://apilist.tronscan.org/api/tronsocket/homepage';
        this.processedTransactions = new Set(); // To avoid duplicate notifications
    }

    start() {
        if (this.isRunning) {
            console.log('Monitor already running');
            return;
        }

        this.isRunning = true;
        this.connect();
    }

    stop() {
        this.isRunning = false;
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }

    connect() {
        if (!this.isRunning) return;

        console.log('Connecting to WebSocket:', this.wsUrl);

        try {
            this.ws = new WebSocket(this.wsUrl);

            this.ws.on('open', () => {
                console.log('WebSocket connected');
                this.emit('connected');
            });

            this.ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data.toString());
                    this.handleMessage(message);
                } catch (error) {
                    console.error('Error parsing WebSocket message:', error);
                }
            });

            this.ws.on('error', (error) => {
                console.error('WebSocket error:', error);
                this.emit('error', error);
            });

            this.ws.on('close', () => {
                console.log('WebSocket disconnected');
                this.emit('disconnected');
                this.ws = null;

                // Attempt to reconnect if still running
                if (this.isRunning) {
                    console.log(`Reconnecting in ${this.reconnectInterval / 1000} seconds...`);
                    this.reconnectTimer = setTimeout(() => {
                        this.connect();
                    }, this.reconnectInterval);
                }
            });
        } catch (error) {
            console.error('Error creating WebSocket:', error);
            this.emit('error', error);

            if (this.isRunning) {
                this.reconnectTimer = setTimeout(() => {
                    this.connect();
                }, this.reconnectInterval);
            }
        }
    }

    handleMessage(message) {
        // Check if message contains transaction info
        if (message.latest_transaction_info && message.latest_transaction_info.data) {
            const transactions = message.latest_transaction_info.data;

            if (Array.isArray(transactions)) {
                transactions.forEach(tx => {
                    this.processTransaction(tx);
                });
            }
        }
    }

    processTransaction(tx) {
        if (!tx || !tx.hash) return;

        // Check if already processed (avoid duplicates)
        if (this.processedTransactions.has(tx.hash)) {
            return;
        }

        // Check if transaction involves any of our monitored wallets
        const matchedWallets = this.findMatchingWallets(tx);

        if (matchedWallets.length > 0) {
            this.processedTransactions.add(tx.hash);

            // Clean up old transactions from the set to prevent memory issues
            if (this.processedTransactions.size > 1000) {
                const iterator = this.processedTransactions.values();
                for (let i = 0; i < 500; i++) {
                    this.processedTransactions.delete(iterator.next().value);
                }
            }

            // Emit transaction event with enriched data
            const enrichedTx = this.enrichTransaction(tx, matchedWallets);
            this.emit('transaction', enrichedTx);
        } else {
            // get first 1 transaction only for testing
            this.processedTransactions.add(tx.hash);
            const enrichedTx = this.enrichTransaction(tx, matchedWallets);
            this.emit('transaction', enrichedTx);
        }
    }

    findMatchingWallets(tx) {
        const matched = [];
        const walletMap = new Map(this.wallets.map(w => [w.address.toLowerCase(), w]));

        // Check owner address (from)
        if (tx.ownerAddress) {
            const wallet = walletMap.get(tx.ownerAddress.toLowerCase());
            if (wallet) {
                matched.push({ ...wallet, type: 'from' });
            }
        }

        // Check to address
        if (tx.toAddress) {
            const wallet = walletMap.get(tx.toAddress.toLowerCase());
            if (wallet) {
                matched.push({ ...wallet, type: 'to' });
            }
        }

        // Check to address list
        if (tx.toAddressList && Array.isArray(tx.toAddressList)) {
            tx.toAddressList.forEach(addr => {
                const wallet = walletMap.get(addr.toLowerCase());
                if (wallet && !matched.find(m => m.address === wallet.address)) {
                    matched.push({ ...wallet, type: 'to' });
                }
            });
        }

        return matched;
    }

    enrichTransaction(tx, matchedWallets) {
        const fromWallet = matchedWallets.find(w => w.type === 'from');
        const toWallet = matchedWallets.find(w => w.type === 'to');

        // Calculate amount with decimals
        let amount = '0';
        if (tx.amount && tx.tokenDecimal) {
            amount = (parseFloat(tx.amount) / Math.pow(10, tx.tokenDecimal)).toFixed(tx.tokenDecimal);
        }

        return {
            hash: tx.hash,
            from: {
                address: tx.ownerAddress,
                name: fromWallet ? fromWallet.name : null
            },
            to: {
                address: tx.toAddress,
                name: toWallet ? toWallet.name : null
            },
            amount: amount,
            token: {
                name: tx.tokenName,
                abbr: tx.tokenAbbr,
                logo: tx.tokenLogo,
                type: tx.tokenType
            },
            contractType: tx.contractType,
            timestamp: tx.timestamp,
            block: tx.block,
            matchedWallets: matchedWallets,
            raw: tx
        };
    }

    updateWallets(wallets) {
        this.wallets = wallets;
        console.log('Wallets updated:', wallets.length);
    }

    getStatus() {
        return {
            running: this.isRunning,
            connected: this.ws && this.ws.readyState === WebSocket.OPEN,
            walletsCount: this.wallets.length
        };
    }
}

module.exports = WebSocketMonitor;
