const https = require('https');
const ApiKeyAllocator = require('./api-key-allocator');

class BalanceReporter {
    constructor(apiKeys) {
        this.apiKeyAllocator = new ApiKeyAllocator(apiKeys);
        this.apiUrl = 'https://apilist.tronscanapi.com/api/account/token_asset_overview';
    }

    async getWalletBalance(address) {
        return new Promise((resolve, reject) => {
            const url = `${this.apiUrl}?address=${address}`;
            const apiKey = this.apiKeyAllocator.getNextKey();

            const options = {
                headers: {
                    'TRON-PRO-API-KEY': apiKey
                }
            };

            https.get(url, options, (res) => {
                let data = '';

                res.on('data', (chunk) => {
                    data += chunk;
                });

                res.on('end', () => {
                    try {
                        const response = JSON.parse(data);
                        resolve(response);
                    } catch (error) {
                        console.error('Error parsing balance response:', error);
                        reject(error);
                    }
                });
            }).on('error', (error) => {
                console.error('Balance API request error:', error);
                reject(error);
            });
        });
    }

    async getAllWalletsBalance(wallets) {
        const balances = [];

        for (const wallet of wallets) {
            try {
                const balance = await this.getWalletBalance(wallet.address);
                balances.push({
                    wallet: wallet,
                    balance: balance.totalAssetInUsd || 0,
                    data: balance
                });

                // Add delay to avoid rate limiting
                await this.sleep(500);
            } catch (error) {
                console.error(`Error fetching balance for ${wallet.address}:`, error);
                balances.push({
                    wallet: wallet,
                    balance: 0,
                    error: error.message
                });
            }
        }

        return balances;
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    updateApiKeys(apiKeys) {
        this.apiKeyAllocator.updateKeys(apiKeys);
        console.log('API Keys updated:', this.apiKeyAllocator.getKeysCount());
    }
}

module.exports = BalanceReporter;
