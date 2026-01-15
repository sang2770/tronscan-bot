# Tronscan Transaction Monitor

Electron app that monitors Tron blockchain transactions and sends notifications to Telegram.

## Features

- 📡 Real-time transaction monitoring via WebSocket
- 👛 Configure multiple wallet addresses to monitor
- 📱 Telegram bot integration for instant notifications
- 🎨 Beautiful Electron GUI
- 📊 Transaction history and statistics

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Telegram Bot

1. Create a new Telegram bot:

   - Open Telegram and search for [@BotFather](https://t.me/BotFather)
   - Send `/newbot` and follow the instructions
   - Save the bot token provided

2. Get your Chat ID:
   - Add your bot to a group or start a chat with it
   - Use [@userinfobot](https://t.me/userinfobot) to get your chat ID
   - For groups, the Chat ID will start with `-`

### 3. Configure Wallets

1. Launch the app
2. Go to the "Wallets" tab
3. Add wallet addresses you want to monitor
4. Optionally add a name for each wallet

### 4. Configure Telegram

1. Go to the "Telegram" tab
2. Enter your Bot Token and Chat ID
3. Click "Test Connection" to verify
4. Save the configuration

## Usage

1. **Start Monitoring**: Click "Start Monitoring" on the Dashboard
2. **View Transactions**: See real-time transactions in the Dashboard
3. **Telegram Notifications**: Receive instant notifications in your Telegram group

## Run the App

```bash
npm start
```

For development mode with DevTools:

```bash
npm run dev
```

## How It Works

### WebSocket Connection

The app connects to Tronscan's WebSocket API:

```
wss://apilist.tronscan.org/api/tronsocket/homepage
```

### Transaction Detection

When a transaction is received:

1. Checks if it involves any of your monitored wallets
2. Parses transaction details (from, to, amount, type)
3. Sends formatted notification to Telegram
4. Displays in the app's UI

### Notification Format

Telegram notifications include:

- Transaction direction (Incoming/Outgoing/Internal)
- From and To addresses (with names if configured)
- Amount and token type
- Contract type
- Block number and timestamp
- Link to view on Tronscan

## Project Structure

```
tronscan/
├── main.js                      # Main Electron process
├── index.html                   # UI layout
├── renderer.js                  # UI logic
├── package.json                 # Dependencies
└── src/
    ├── config-manager.js        # Configuration management
    ├── websocket-monitor.js     # WebSocket connection & transaction monitoring
    └── telegram-notifier.js     # Telegram bot integration
```

## Configuration File

Config is stored in:

- macOS: `~/Library/Application Support/tronscan-notifier/config.json`
- Windows: `%APPDATA%/tronscan-notifier/config.json`
- Linux: `~/.config/tronscan-notifier/config.json`

## Troubleshooting

### WebSocket Connection Issues

- Check your internet connection
- The app will automatically reconnect if disconnected

### Telegram Notifications Not Working

- Verify your Bot Token is correct
- Ensure your bot is added to the group
- Check that the Chat ID is correct (should start with `-` for groups)
- Use "Test Connection" button to verify

### Transactions Not Detected

- Ensure wallets are added correctly
- Wallet addresses must be valid Tron addresses (34 characters, starting with 'T')
- Click "Start Monitoring" to begin

## License

ISC
