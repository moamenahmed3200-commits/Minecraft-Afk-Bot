\"use strict\";

const { addLog, getLogs } = require(\"./logger\");
const mineflayer = require(\"mineflayer\");
const config = require(\"./settings.json\");
const express = require(\"express\");
const fs = require(\"fs\");
const path = require(\"path\");

// ============================================================
// GLOBAL ERROR HANDLERS
// ============================================================
process.on('uncaughtException', (err) => {
    addLog(`[ERROR] Uncaught: ${err.message}`);
});

process.on('unhandledRejection', (reason) => {
    addLog(`[ERROR] Unhandled: ${reason}`);
});

// ============================================================
// ACCOUNT ROTATOR
// ============================================================
class AccountRotator {
    constructor() {
        this.accounts = [];
        this.currentIndex = 0;
        this.bannedAccounts = [];
        this.rotationInterval = 8 * 60 * 60 * 1000;
        this.lastRotation = Date.now();
        this.loadAccounts();
    }
    
    loadAccounts() {
        const accountsPath = path.join(__dirname, 'accounts.json');
        if (fs.existsSync(accountsPath)) {
            try {
                const data = JSON.parse(fs.readFileSync(accountsPath, 'utf8'));
                if (data.accounts && data.accounts.length > 0) {
                    this.accounts = data.accounts;
                    addLog(`[Accounts] Loaded ${this.accounts.length} accounts`);
                    return;
                }
            } catch (e) {}
        }
        
        if (config.accounts && config.accounts.length > 0) {
            this.accounts = config.accounts;
            addLog(`[Accounts] Loaded ${this.accounts.length} accounts from config`);
            return;
        }
        
        this.generateRandomAccounts(5);
    }
    
    generateRandomAccounts(count) {
        const names = ['Steve', 'Alex', 'Miner', 'Builder', 'Explorer', 'Crafty', 'Digger'];
        this.accounts = [];
        for (let i = 0; i < count; i++) {
            const name = names[Math.floor(Math.random() * names.length)] + Math.floor(Math.random() * 1000);
            this.accounts.push({ username: name, password: '', type: 'offline' });
        }
        addLog(`[Accounts] Generated ${count} accounts`);
    }
    
    getNextAccount() {
        let attempts = 0;
        while (attempts < this.accounts.length) {
            const account = this.accounts[this.currentIndex];
            if (!this.bannedAccounts.includes(account.username)) {
                return account;
            }
            this.currentIndex = (this.currentIndex + 1) % this.accounts.length;
            attempts++;
        }
        this.bannedAccounts = [];
        return this.accounts[0];
    }
    
    markBanned(username) {
        if (!this.bannedAccounts.includes(username)) {
            this.bannedAccounts.push(username);
            addLog(`[Accounts] Banned: ${username}`);
        }
    }
}

// ============================================================
// CHAT SYSTEM
// ============================================================
const chatMessages = [
    "I'm exploring", "found diamonds!", "anyone need help?",
    "check out my build!", "I'm building a base", "I'm making a farm",
    "mining for ores", "just vibing", "anyone want to trade?",
    "what's the best build here?", "this server is cool"
];

function getRandomChat() {
    return chatMessages[Math.floor(Math.random() * chatMessages.length)];
}

// ============================================================
// MAIN BOT
// ============================================================
let bot = null;
let botState = { connected: false, reconnectAttempts: 0 };
let isReconnecting = false;
let chatIntervalId = null;
let lookIntervalId = null;
let reconnectTimeoutId = null;
const accountRotator = new AccountRotator();

function scheduleReconnect() {
    if (isReconnecting) return;
    isReconnecting = true;
    const delay = Math.min(5000 + botState.reconnectAttempts * 2000, 60000);
    addLog(`[Bot] Reconnecting in ${Math.round(delay/1000)}s...`);
    reconnectTimeoutId = setTimeout(() => {
        isReconnecting = false;
        botState.reconnectAttempts++;
        createBot();
    }, delay);
}

function startAFK() {
    // Look around periodically
    if (lookIntervalId) clearInterval(lookIntervalId);
    lookIntervalId = setInterval(() => {
        if (!bot || !bot.entity) return;
        try {
            const yaw = Math.random() * Math.PI * 2;
            const pitch = (Math.random() - 0.5) * Math.PI / 3;
            bot.look(yaw, pitch, false);
        } catch (e) {}
    }, 2000 + Math.random() * 2000);
    
    // Chat periodically
    if (chatIntervalId) clearInterval(chatIntervalId);
    chatIntervalId = setInterval(() => {
        if (bot && botState.connected) {
            try {
                bot.chat(getRandomChat());
            } catch (e) {}
        }
    }, 30000 + Math.random() * 30000);
}

function createBot() {
    if (bot) {
        try {
            bot.end();
        } catch (e) {}
    }
    
    const account = accountRotator.getNextAccount();
    const botVersion = config.server.version || '1.20.4';
    
    try {
        bot = mineflayer.createBot({
            username: account.username,
            password: account.password || undefined,
            auth: account.type || 'offline',
            host: config.server.ip,
            port: config.server.port,
            version: botVersion,
        });
    } catch (e) {
        addLog(`[Bot] Create error: ${e.message}`);
        scheduleReconnect();
        return;
    }
    
    let spawnHandled = false;
    bot.once('spawn', () => {
        if (spawnHandled) return;
        spawnHandled = true;
        botState.connected = true;
        botState.reconnectAttempts = 0;
        isReconnecting = false;
        addLog(`[Bot] Spawned! Account: ${bot.username} Version: ${bot.version}`);
        startAFK();
        
        setTimeout(() => {
            if (bot && botState.connected && config.server['try-creative']) {
                try { bot.chat('/gamemode creative'); } catch (e) {}
            }
        }, 3000);
    });
    
    bot.on('kicked', (reason) => {
        addLog(`[Bot] Kicked`);
        accountRotator.markBanned(account.username);
        botState.connected = false;
        scheduleReconnect();
    });
    
    bot.on('end', () => {
        addLog(`[Bot] Disconnected`);
        botState.connected = false;
        if (!isReconnecting) scheduleReconnect();
    });
    
    bot.on('error', (err) => {
        addLog(`[Bot] Error: ${err.message}`);
        botState.connected = false;
        scheduleReconnect();
    });
}

// ============================================================
// EXPRESS SERVER
// ============================================================
const app = express();

app.get('/logs', (req, res) => {
    res.json({ logs: getLogs() });
});

app.get('/status', (req, res) => {
    res.json({
        connected: botState.connected,
        account: bot ? bot.username : 'none',
        position: bot && bot.entity ? {
            x: Math.floor(bot.entity.position.x),
            y: Math.floor(bot.entity.position.y),
            z: Math.floor(bot.entity.position.z)
        } : null
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    addLog(`[Server] Listening on port ${PORT}`);
});

// ============================================================
// START
// ============================================================
addLog('[Bot] Starting Minecraft AFK Bot (Stable)');
createBot();

