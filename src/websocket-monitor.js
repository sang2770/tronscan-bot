const EventEmitter = require("events");
const https = require("https");
const fs = require("fs");
const path = require("path");
const { app } = require("electron");
const ApiKeyAllocator = require("./api-key-allocator");

class WebSocketMonitor extends EventEmitter {
  constructor(wallets = [], apiKeys) {
    super();
    this.apiKeyAllocator = new ApiKeyAllocator(apiKeys);
    this.wallets = wallets;
    this.pollingInterval = 10000; // 10 seconds
    this.pollingTimer = null;
    this.isRunning = false;
    this.lastProcessedTimestamp = {}; // Track last processed timestamp per wallet
    this.hasNewTransactions = false; // Flag to track if there are new transactions
    this.apiUrl = "https://apilist.tronscan.org/api/filter/trc20/transfers";
    this.dataFilePath = path.join(
      app.getPath("userData"),
      "wallet-timestamps.json"
    );

    // Load saved timestamps
    this.loadTimestamps();
  }

  start() {
    if (this.isRunning) {
      console.log("Monitor already running");
      return;
    }

    this.isRunning = true;
    this.emit("connected");
    this.pollTransactions();
  }

  stop() {
    this.isRunning = false;
    if (this.pollingTimer) {
      clearTimeout(this.pollingTimer);
      this.pollingTimer = null;
    }
    // Save timestamps when stopping
    this.saveTimestamps();
    this.emit("disconnected");
  }

  loadTimestamps() {
    try {
      if (fs.existsSync(this.dataFilePath)) {
        const data = fs.readFileSync(this.dataFilePath, "utf8");
        this.lastProcessedTimestamp = JSON.parse(data);
        console.log(
          "Loaded timestamps for",
          Object.keys(this.lastProcessedTimestamp).length,
          "wallets"
        );
      }
    } catch (error) {
      console.error("Error loading timestamps:", error);
      this.lastProcessedTimestamp = {};
    }
  }

  saveTimestamps() {
    try {
      fs.writeFileSync(
        this.dataFilePath,
        JSON.stringify(this.lastProcessedTimestamp, null, 2),
        "utf8"
      );
      console.log(
        "Saved timestamps for",
        Object.keys(this.lastProcessedTimestamp).length,
        "wallets"
      );
    } catch (error) {
      console.error("Error saving timestamps:", error);
    }
  }

  async pollTransactions() {
    if (!this.isRunning) return;

    this.hasNewTransactions = false; // Reset flag

    try {
      // Poll transactions for each wallet with delay to avoid rate limiting
      for (let i = 0; i < this.wallets.length; i++) {
        const wallet = this.wallets[i];

        try {
          await this.fetchWalletTransactions(wallet);

          // Add delay between requests to avoid rate limiting (300ms)
          if (i < this.wallets.length - 1) {
            await this.sleep(300);
          }
        } catch (error) {
          console.error(
            `Error fetching transactions for wallet ${wallet.address}:`,
            error
          );
          // Continue with next wallet even if one fails
        }
      }

      // Only save timestamps if there are new transactions
      if (this.hasNewTransactions) {
        this.saveTimestamps();
      } else {
        console.log("No new transactions");
      }
    } catch (error) {
      console.error("Error polling transactions:", error);
      this.emit("error", error);
    }

    // Schedule next poll
    if (this.isRunning) {
      this.pollingTimer = setTimeout(() => {
        this.pollTransactions();
      }, this.pollingInterval);
    }
  }

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async fetchWalletTransactions(wallet) {
    return new Promise((resolve, reject) => {
      const url = `${this.apiUrl}?limit=20&start=0&sort=-timestamp&count=true&filterTokenValue=0&relatedAddress=${wallet.address}`;
      const apiKey = this.apiKeyAllocator.getNextKey();
      const options = {
        headers: {
          "TRON-PRO-API-KEY": apiKey,
        },
      };
      const timeout = setTimeout(() => {
        reject(new Error("Request timeout"));
      }, 15000); // 15 second timeout

      https
        .get(url, options, (res) => {
          let data = "";

          res.on("data", (chunk) => {
            data += chunk;
          });

          res.on("end", () => {
            clearTimeout(timeout);
            try {
              const response = JSON.parse(data);
              this.handleApiResponse(response, wallet);
              resolve();
            } catch (error) {
              console.error("Error parsing API response:", error);
              reject(error);
            }
          });
        })
        .on("error", (error) => {
          clearTimeout(timeout);
          console.error("API request error:", error);
          reject(error);
        });
    });
  }

  handleApiResponse(response, wallet) {
    if (response.token_transfers && Array.isArray(response.token_transfers)) {
      const walletKey = wallet.address.toLowerCase();
      const lastTimestamp = this.lastProcessedTimestamp[walletKey] || 0;

      // Filter only new transactions
      const newTransactions = response.token_transfers.filter(
        (tx) => tx.block_ts > lastTimestamp
      );

      if (newTransactions.length > 0) {
        this.hasNewTransactions = true; // Mark that we have new transactions

        // Process transactions in reverse order (oldest first)
        newTransactions.reverse().forEach((tx) => {
          this.processTransaction(tx, wallet);
        });

        // Update last processed timestamp to the newest transaction
        const newestTimestamp = Math.max(
          ...response.token_transfers.map((tx) => tx.block_ts)
        );
        this.lastProcessedTimestamp[walletKey] = newestTimestamp;
      } else {
        console.log(`No new transactions for wallet ${wallet.address}`);
      }
    } else {
      console.error("Unexpected API response format:", response);
    }
  }

  processTransaction(tx, wallet) {
    if (!tx || !tx.transaction_id) return;

    // Emit transaction event with enriched data
    const enrichedTx = this.enrichTransaction(tx, wallet);
    this.emit("transaction", enrichedTx);
  }

  enrichTransaction(tx, wallet) {
    // Determine transaction direction
    const isIncoming =
      tx.to_address.toLowerCase() === wallet.address.toLowerCase();
    const transferType = isIncoming ? "In" : "Out";

    // Calculate amount with decimals
    let amount = "0";
    if (tx.quant && tx.tokenInfo && tx.tokenInfo.tokenDecimal) {
      amount = (
        parseFloat(tx.quant) / Math.pow(10, tx.tokenInfo.tokenDecimal)
      ).toFixed(tx.tokenInfo.tokenDecimal);
    }

    // Find wallet names
    const fromWallet = this.wallets.find(
      (w) => w.address.toLowerCase() === tx.from_address.toLowerCase()
    );
    const toWallet = this.wallets.find(
      (w) => w.address.toLowerCase() === tx.to_address.toLowerCase()
    );

    return {
      hash: tx.transaction_id,
      from: {
        address: tx.from_address,
        name: fromWallet ? fromWallet.name : null,
      },
      to: {
        address: tx.to_address,
        name: toWallet ? toWallet.name : null,
      },
      amount: amount,
      token: {
        name: tx.tokenInfo.tokenName,
        abbr: tx.tokenInfo.tokenAbbr,
        logo: tx.tokenInfo.tokenLogo,
        type: tx.tokenInfo.tokenType,
      },
      contractType: transferType,
      timestamp: tx.block_ts,
      block: tx.block,
      matchedWallets: [
        {
          ...wallet,
          type: isIncoming ? "to" : "from",
        },
      ],
      transferType: transferType,
      raw: tx,
    };
  }

  updateWallets(wallets) {
    this.wallets = wallets;
    console.log("Wallets updated:", wallets.length);
  }

  updateApiKeys(apiKeys) {
    this.apiKeyAllocator.updateKeys(apiKeys);
    console.log("API Keys updated:", this.apiKeyAllocator.getKeysCount());
  }

  getStatus() {
    return {
      running: this.isRunning,
      connected: this.isRunning,
      walletsCount: this.wallets.length,
      apiKeysCount: this.apiKeyAllocator.getKeysCount(),
    };
  }
}

module.exports = WebSocketMonitor;
