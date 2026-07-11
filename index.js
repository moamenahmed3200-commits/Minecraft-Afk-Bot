\"use strict\";

const { addLog, getLogs } = require(\"./logger\");
const mineflayer = require(\"mineflayer\");
const config = require(\"./settings.json\");
const express = require(\"express\");
const http = require(\"http\");
const https = require(\"https\");
const fs = require(\"fs\");
const path = require(\"path\");

// ============================================================
// GLOBAL ERROR HANDLERS - Prevent any crashes
// ============================================================
process.on('uncaughtException', (err) => {
    addLog(`[CRITICAL] Uncaught Exception: ${err.message}`);
    // Don't exit - keep running
});

process.on('unhandledRejection', (reason) => {
    addLog(`[CRITICAL] Unhandled Rejection: ${reason}`);
});

// ============================================================
// ACCOUNT ROTATOR - Auto-switch accounts when banned
// ============================================================
class AccountRotator {
    constructor() {
        this.accounts = [];
        this.currentIndex = 0;
        this.bannedAccounts = [];
        this.rotationInterval = 8 * 60 * 60 * 1000; // 8 hours default
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
                    this.rotationInterval = data.rotationInterval || 8 * 60 * 60 * 1000;
                    addLog(`[Accounts] Loaded ${this.accounts.length} accounts from accounts.json`);
                    return;
                }
            } catch (e) {
                addLog(`[Accounts] Failed to load accounts.json: ${e.message}`);
            }
        }
        
        if (config.accounts && config.accounts.length > 0) {
            this.accounts = config.accounts;
            addLog(`[Accounts] Loaded ${this.accounts.length} accounts from config`);
            return;
        }
        
        addLog("[Accounts] No accounts found - generating random cracked accounts");
        this.generateRandomAccounts(10);
    }
    
    generateRandomAccounts(count) {
        const names = [
            'Steve', 'Alex', 'Miner', 'Builder', 'Explorer', 'Crafty',
            'Digger', 'Hopper', 'Picker', 'Smelter', 'Farmer', 'Fisher',
            'Hunter', 'Mason', 'Shepherd', 'Lumber', 'Miner22', 'CraftPro',
            'BlockMaster', 'RedstoneGuy', 'PistonPusher', 'NetherWalker',
            'EndRunner', 'DiamondHunter', 'IronMan', 'GoldDigger',
            'VillagerTamer', 'WitherSlayer', 'DragonBane', 'EnchantMaster'
        ];
        
        this.accounts = [];
        for (let i = 0; i < count; i++) {
            const name = names[Math.floor(Math.random() * names.length)] + 
                        (Math.floor(Math.random() * 1000) + 1).toString();
            this.accounts.push({
                username: name,
                password: '',
                type: 'offline'
            });
        }
        addLog(`[Accounts] Generated ${count} random cracked accounts`);
    }
    
    getNextAccount() {
        let attempts = 0;
        while (attempts < this.accounts.length * 2) {
            const account = this.accounts[this.currentIndex];
            if (!this.bannedAccounts.includes(account.username)) {
                addLog(`[Accounts] Using account: ${account.username}`);
                return account;
            }
            this.currentIndex = (this.currentIndex + 1) % this.accounts.length;
            attempts++;
        }
        
        addLog("[Accounts] All accounts banned! Regenerating...");
        this.bannedAccounts = [];
        this.generateRandomAccounts(15);
        return this.accounts[0];
    }
    
    markBanned(username) {
        if (!this.bannedAccounts.includes(username)) {
            this.bannedAccounts.push(username);
            addLog(`[Accounts] Marked ${username} as banned`);
        }
    }

    rotateAccount() {
        this.currentIndex = (this.currentIndex + 1) % this.accounts.length;
        addLog(`[Accounts] Rotation interval reached - rotating accounts`);
        addLog(`[Accounts] Rotated to: ${this.accounts[this.currentIndex].username}`);
    }
}

// ============================================================
// SIMPLE ANTI-AFK MODULE (No pathfinding - just look around and jump)
// ============================================================
class SimpleAntiAFK {
    constructor(bot) {
        this.bot = bot;
        this.lookInterval = null;
        this.jumpInterval = null;
        this.rotationY = 0;
        this.start();
    }
    
    start() {
        // Periodically look around
        this.lookInterval = setInterval(() => {
            if (!this.bot || !this.bot.entity) return;
            try {
                this.rotationY += (Math.random() - 0.5) * Math.PI / 4;
                this.rotationY = this.rotationY % (Math.PI * 2);
                const pitch = (Math.random() - 0.5) * Math.PI / 3;
                this.bot.look(this.rotationY, pitch, false);
            } catch (e) {}
        }, 2000 + Math.random() * 3000);
        
        // Periodically jump and move slightly
        this.jumpInterval = setInterval(() => {
            if (!this.bot || !this.bot.entity || !this.bot.player) return;
            try {
                // Random chance to jump or move
                const action = Math.random();
                if (action < 0.3) {
                    // Jump
                    this.bot.setControlState('jump', true);
                    setTimeout(() => this.bot.setControlState('jump', false), 100);
                } else if (action < 0.6) {
                    // Strafe left
                    this.bot.setControlState('left', true);
                    setTimeout(() => this.bot.setControlState('left', false), 500);
                } else if (action < 0.9) {
                    // Strafe right
                    this.bot.setControlState('right', true);
                    setTimeout(() => this.bot.setControlState('right', false), 500);
                }
            } catch (e) {}
        }, 3000 + Math.random() * 4000);
    }
    
    stop() {
        if (this.lookInterval) clearInterval(this.lookInterval);
        if (this.jumpInterval) clearInterval(this.jumpInterval);
    }
}

// ============================================================
// CHAT SYSTEM
// ============================================================
const chatMessages = [
    "I'm exploring",
    "found some diamonds!",
    "anyone need help?",
    "check out my build!",
    "I'm building a base",
    "I'm making a farm",
    "mining for ores",
    "just vibing",
    "anyone want to trade?",
    "what's the best build here?",
    "this server is cool",
    "I like this server",
    "anyone here?",
    "the weather is nice",
    "I'm having fun",
    "this area is nice",
    "found a cave!",
    "let's go mining",
    "any cool builds around?",
    "this is fun"
];

function getRandomChat() {
    return chatMessages[Math.floor(Math.random() * chatMessages.length)];
}

// ============================================================
// MAIN BOT LOGIC
// ============================================================
let bot = null;
let botState = { connected: false, lastActivity: Date.now(), reconnectAttempts: 0 };
let isReconnecting = false;
let connectionTimeoutId = null;
let reconnectTimeoutId = null;
let chatIntervalId = null;
let antiafkModule = null;
const accountRotator = new AccountRotator();

function clearBotTimeouts() {
    if (connectionTimeoutId) clearTimeout(connectionTimeoutId);
    if (reconnectTimeoutId) clearTimeout(reconnectTimeoutId);
    if (chatIntervalId) clearInterval(chatIntervalId);
}

function scheduleReconnect() {
    if (isReconnecting) return;
    isReconnecting = true;
    
    const delay = Math.min(5000 + botState.reconnectAttempts * 2000, 60000);
    addLog(`[Bot] Reconnecting in ${Math.round(delay/1000)}s (attempt ${botState.reconnectAttempts + 1})`);
    
    reconnectTimeoutId = setTimeout(() => {
        isReconnecting = false;
        botState.reconnectAttempts++;
        createBot();
    }, delay);
}

function initializeModules(bot) {
    // Stop any previous anti-AFK module
    if (antiafkModule) antiafkModule.stop();
    
    // Start simple anti-AFK (no pathfinding)
    antiafkModule = new SimpleAntiAFK(bot);
    addLog("[AntiAFK] Started simple anti-AFK module (no pathfinding)");
    
    // Chat every 30-60 seconds
    if (chatIntervalId) clearInterval(chatIntervalId);
    chatIntervalId = setInterval(() => {
        if (bot && botState.connected) {
            try {
                bot.chat(getRandomChat());
            } catch (e) {
                addLog(`[Chat] Error: ${e.message}`);
            }
        }
    }, 30000 + Math.random() * 30000);
    
    addLog("[Modules] All modules initialized!");
}

function createBot() {
    if (bot) {
        try {
            if (antiafkModule) antiafkModule.stop();
            bot.removeAllListeners();
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
            hideErrors: false,
            checkTimeoutInterval: 600000,
        });
    } catch (e) {
        addLog(`[Bot] Failed to create bot: ${e.message}`);
        scheduleReconnect();
        return;
    }
    
    clearBotTimeouts();
    connectionTimeoutId = setTimeout(() => {
        if (!botState.connected) {
            addLog("[Bot] Connection timeout");
            try { bot.removeAllListeners(); bot.end(); } catch(e) {}
            bot = null;
            scheduleReconnect();
        }
    }, 150000);
    
    let spawnHandled = false;
    bot.once("spawn", () => {
        if (spawnHandled) return;
        spawnHandled = true;
        clearBotTimeouts();
        botState.connected = true;
        botState.lastActivity = Date.now();
        botState.reconnectAttempts = 0;
        isReconnecting = false;
        addLog(`[Bot] Spawned successfully! (${bot.version})`);
        
        // Initialize anti-AFK module
        initializeModules(bot);
        
        // Try creative mode if configured
        setTimeout(() => {
            if (bot && botState.connected && config.server["try-creative"]) {
                try {
                    bot.chat("/gamemode creative");
                } catch (e) {}
            }
        }, 3000);
    });
    
    bot.on("kicked", (reason) => {
        const kickReason = typeof reason === "object" ? JSON.stringify(reason) : reason;
        addLog(`[Bot] Kicked: ${kickReason}`);
        accountRotator.markBanned(account.username);
        botState.connected = false;
        scheduleReconnect();
    });
    
    bot.on("end", (reason) => {
        addLog(`[Bot] Disconnected: ${reason || 'unknown'}`);
        botState.connected = false;
        if (!isReconnecting) {
            scheduleReconnect();
        }
    });
    
    bot.on("error", (err) => {
        addLog(`[Bot] Error: ${err.message}`);
        botState.connected = false;
        scheduleReconnect();
    });
    
    bot.on("login", () => {
        addLog(`[Bot] Logged in`);
    });
}

// ============================================================
// EXPRESS SERVER FOR MONITORING
// ============================================================
const app = express();
app.use(express.json());

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
        } : null,
        health: bot ? bot.health : 0,
        food: bot ? bot.food : 0,
        dimension: bot ? bot.game.dimension : 'unknown'
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    addLog(`[Server] Listening on port ${PORT}`);
});

// ============================================================
// STARTUP
// ============================================================
addLog("[Bot] Starting Minecraft AFK Bot (Stable Edition)...");
addLog("[Bot] This version uses simple anti-AFK without pathfinding");
createBot();

// Periodically rotate accounts
setInterval(() => {
    if (Date.now() - accountRotator.lastRotation > accountRotator.rotationInterval) {
        accountRotator.lastRotation = Date.now();
        accountRotator.rotateAccount();
        if (bot && botState.connected) {
            try {
                bot.removeAllListeners();
                bot.end();
            } catch (e) {}
            bot = null;
            botState.connected = false;
            scheduleReconnect();
        }
    }
}, 60000);

