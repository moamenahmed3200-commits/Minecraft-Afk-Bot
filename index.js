\"use strict\";

const { addLog, getLogs } = require(\"./logger\");
const mineflayer = require(\"mineflayer\");
const { Movements, pathfinder, goals } = require(\"mineflayer-pathfinder\");
const { GoalBlock } = goals;
const config = require(\"./settings.json\");
const express = require(\"express\");
const http = require(\"http\");
const https = require(\"https\");
const fs = require(\"fs\");
const path = require(\"path\");

// ============================================================
// GLOBAL ERROR HANDLERS - Prevent crashes from pathfinding bugs
// ============================================================
let pathfinderErrorCount = 0;
global.pathfinderDisabled = false;

process.on('uncaughtException', (err) => {
    addLog(`[CRITICAL] Uncaught Exception: ${err.message}`);
    if (err.message && err.message.includes('floored')) {
        pathfinderErrorCount++;
        addLog(`[PATHFINDER] Error #${pathfinderErrorCount} - disabling pathfinder for 30s`);
        global.pathfinderDisabled = true;
        setTimeout(() => { 
            global.pathfinderDisabled = false;
            addLog(`[PATHFINDER] Re-enabling pathfinder`);
        }, 30000);
    }
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
        // Try loading from accounts.json first
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
        
        // Fallback: use config accounts
        if (config.accounts && config.accounts.length > 0) {
            this.accounts = config.accounts;
            addLog(`[Accounts] Loaded ${this.accounts.length} accounts from config`);
            return;
        }
        
        // Fallback: generate random cracked accounts
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
        // Try to get an account that isn't banned
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
        
        // All accounts banned - regenerate
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
        addLog(`[Accounts] Rotating to next account`);
    }
}

// ============================================================
// IMMORTAL MODULES - Behavior system
// ============================================================
class ImmortalModules {
    constructor(bot, mcData, defaultMove) {
        this.bot = bot;
        this.mcData = mcData;
        this.defaultMove = defaultMove;
        this.currentTask = 'idle';
        this.lastMoveTime = 0;
        this.pathErrors = 0;
        this.taskSwitchInterval = 5 * 60 * 1000; // 5 minutes
        this.lastTaskSwitch = Date.now();
    }
    
    moveToTarget(target) {
        const now = Date.now();
        if (now - this.lastMoveTime < 500) return null;
        
        let targetMode = config.behavior?.['movement-mode'] || 'aimless';
        let target_obj;
        switch(targetMode) {
            case 'aimless': target_obj = this.getRandomTarget(); break;
            case 'focused': target_obj = this.getFocusedTarget(); break;
            case 'distracted': target_obj = this.getDistractedTarget(); break;
            case 'builder': target_obj = this.getBuilderTarget(); break;
            case 'miner': target_obj = this.getMinerTarget(); break;
            default: target_obj = this.getRandomTarget();
        }
        if (target_obj) {
            try {
                // Check if pathfinder is disabled due to errors
                if (global.pathfinderDisabled) {
                    addLog(`[PATHFINDER] Pathfinder disabled - skipping movement`);
                    return null;
                }
                
                this.bot.pathfinder.setMovements(this.defaultMove);
                this.bot.pathfinder.setGoal(new GoalBlock(
                    Math.floor(target_obj.x),
                    Math.floor(target_obj.y),
                    Math.floor(target_obj.z)
                ));
                this.lastMoveTime = now;
                return target_obj;
            } catch (e) {
                addLog(`[PATHFINDER] Error: ${e.message}`);
                global.pathfinderDisabled = true;
                pathfinderErrorCount++;
                setTimeout(() => { 
                    global.pathfinderDisabled = false;
                    addLog(`[PATHFINDER] Re-enabling after error`);
                }, 30000);
                if (this.pathErrors < 3) {
                    this.pathErrors++;
                    setTimeout(() => {
                        try { this.bot.pathfinder.setGoal(null); } catch(e) {}
                    }, 1000 + Math.random() * 2000);
                } else { this.pathErrors = 0; }
                return null;
            }
        }
        return null;
    }
    
    getRandomTarget() {
        const pos = this.bot.entity.position;
        const angle = Math.random() * Math.PI * 2;
        const distance = 20 + Math.random() * 30;
        return { x: pos.x + Math.cos(angle) * distance, y: pos.y + (Math.random()-0.5)*3, z: pos.z + Math.sin(angle) * distance };
    }
    
    getFocusedTarget() {
        const pos = this.bot.entity.position;
        const angle = Math.random() * Math.PI * 2;
        const distance = 20 + Math.random() * 30;
        return { x: pos.x + Math.cos(angle) * distance, y: pos.y + (Math.random()-0.5)*2, z: pos.z + Math.sin(angle) * distance };
    }
    
    getDistractedTarget() {
        const pos = this.bot.entity.position;
        const angle = Math.random() * Math.PI * 2;
        const distance = 20 + Math.random() * 30;
        return { x: pos.x + Math.cos(angle) * distance, y: pos.y + (Math.random()-0.5)*1.5, z: pos.z + Math.sin(angle) * distance };
    }
    
    getBuilderTarget() {
        const pos = this.bot.entity.position;
        const angle = Math.random() * Math.PI * 2;
        const distance = 20 + Math.random() * 30;
        return { x: pos.x + Math.cos(angle) * distance, y: pos.y, z: pos.z + Math.sin(angle) * distance };
    }
    
    getMinerTarget() {
        const pos = this.bot.entity.position;
        const angle = Math.random() * Math.PI * 2;
        const distance = 20 + Math.random() * 30;
        return { x: pos.x + Math.cos(angle) * distance, y: pos.y - 1 - Math.random() * 3, z: pos.z + Math.sin(angle) * distance };
    }
    
    getExplorerTarget() {
        const pos = this.bot.entity.position;
        const angle = Math.random() * Math.PI * 2;
        const distance = 50 + Math.random() * 100;
        return { x: pos.x + Math.cos(angle) * distance, y: pos.y, z: pos.z + Math.sin(angle) * distance };
    }
    
    getFocusedTarget() {
        const players = Object.values(this.bot.players);
        if (players.length > 0) {
            const target = players[Math.floor(Math.random() * players.length)];
            return target.entity ? target.entity.position : this.getRandomTarget();
        }
        return this.getRandomTarget();
    }
    
    getDistractedTarget() {
        const players = Object.values(this.bot.players);
        if (players.length > 0) {
            const target = players[Math.floor(Math.random() * players.length)];
            if (target.entity) {
                const pos = target.entity.position;
                const angle = Math.random() * Math.PI * 2;
                const distance = 10 + Math.random() * 20;
                return { x: pos.x + Math.cos(angle) * distance, y: pos.y, z: pos.z + Math.sin(angle) * distance };
            }
        }
        return this.getRandomTarget();
    }
    
    getBuilderTarget() {
        const pos = this.bot.entity.position;
        const angle = Math.random() * Math.PI * 2;
        const distance = 15 + Math.random() * 25;
        return { x: pos.x + Math.cos(angle) * distance, y: pos.y + 2, z: pos.z + Math.sin(angle) * distance };
    }
    
    getMinerTarget() {
        const pos = this.bot.entity.position;
        const angle = Math.random() * Math.PI * 2;
        const distance = 20 + Math.random() * 30;
        return { x: pos.x + Math.cos(angle) * distance, y: pos.y - 5 - Math.random() * 10, z: pos.z + Math.sin(angle) * distance };
    }
    
    switchTask() {
        const tasks = ['idle', 'explore', 'build', 'mine'];
        this.currentTask = tasks[Math.floor(Math.random() * tasks.length)];
        addLog(`[Task] Switched to: ${this.currentTask}`);
        this.lastTaskSwitch = Date.now();
    }
    
    update() {
        const now = Date.now();
        if (now - this.lastTaskSwitch > this.taskSwitchInterval) {
            this.switchTask();
        }
        
        if (this.currentTask !== 'idle') {
            this.moveToTarget();
        }
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
    "what's the best build here?"
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
let updateIntervalId = null;
let immortalModules = null;
const accountRotator = new AccountRotator();

function clearBotTimeouts() {
    if (connectionTimeoutId) clearTimeout(connectionTimeoutId);
    if (reconnectTimeoutId) clearTimeout(reconnectTimeoutId);
    if (chatIntervalId) clearInterval(chatIntervalId);
    if (updateIntervalId) clearInterval(updateIntervalId);
}

function scheduleReconnect() {
    if (isReconnecting) return;
    isReconnecting = true;
    
    const delay = Math.min(5000 + botState.reconnectAttempts * 2000, 60000);
    addLog(`[Bot] Reconnecting in ${delay/1000}s (attempt ${botState.reconnectAttempts + 1})`);
    
    reconnectTimeoutId = setTimeout(() => {
        isReconnecting = false;
        botState.reconnectAttempts++;
        createBot();
    }, delay);
}

function initializeModules(bot, mcData, defaultMove) {
    immortalModules = new ImmortalModules(bot, mcData, defaultMove);
    
    chatIntervalId = setInterval(() => {
        if (bot && botState.connected) {
            try {
                bot.chat(getRandomChat());
            } catch (e) {
                addLog(`[Chat] Error: ${e.message}`);
            }
        }
    }, 30000 + Math.random() * 30000);
    
    updateIntervalId = setInterval(() => {
        if (bot && botState.connected && immortalModules) {
            try {
                immortalModules.update();
            } catch (e) {
                addLog(`[Update] Error: ${e.message}`);
            }
        }
    }, 1000);
    
    addLog("[Modules] All modules initialized!");
}

function createBot() {
    if (bot) {
        try {
            bot.removeAllListeners();
            bot.end();
        } catch (e) {}
    }
    
    const account = accountRotator.getNextAccount();
    const botVersion = config.server.version || '1.20.4';
    
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
    
    bot.loadPlugin(pathfinder);
    
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
        
        const mcData = require("minecraft-data")(bot.version);
        const defaultMove = new Movements(bot, mcData);
        defaultMove.allowFreeMotion = false;
        defaultMove.canDig = false;
        defaultMove.liquidCost = 1000;
        defaultMove.fallDamageCost = 1000;
        
        initializeModules(bot, mcData, defaultMove);
        
        setTimeout(() => {
            if (bot && botState.connected && config.server["try-creative"]) {
                bot.chat("/gamemode creative");
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
    
    bot.on("end", () => {
        addLog("[Bot] Disconnected");
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
}

// ============================================================
// EXPRESS SERVER
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
        food: bot ? bot.food : 0
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    addLog(`[Server] Listening on port ${PORT}`);
});

// ============================================================
// START BOT
// ============================================================
addLog("[Bot] Starting Minecraft AFK Bot...");
createBot();

