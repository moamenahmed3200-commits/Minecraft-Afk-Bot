"use strict";

const { addLog, getLogs } = require("./logger");
const mineflayer = require("mineflayer");
const { Movements, pathfinder, goals } = require("mineflayer-pathfinder");
const { GoalBlock } = goals;
const config = require("./settings.json");
const express = require("express");
const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");

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
            addLog(`[Accounts] ⚠️ Account marked as banned: ${username}`);
        }
        // Move to next account
        this.currentIndex = (this.currentIndex + 1) % this.accounts.length;
    }
    
    shouldRotate() {
        const should = Date.now() - this.lastRotation > this.rotationInterval;
        if (should) {
            addLog('[Accounts] Rotation interval reached - rotating accounts');
        }
        return should;
    }
    
    rotate() {
        this.currentIndex = (this.currentIndex + 1) % this.accounts.length;
        this.lastRotation = Date.now();
        const account = this.accounts[this.currentIndex];
        addLog(`[Accounts] Rotated to: ${account.username}`);
        return account;
    }
}

// ============================================================
// SESSION ROTATOR - IP change and session management
// ============================================================
class SessionRotator {
    constructor() {
        this.sessionId = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
        this.lastSessionChange = Date.now();
        this.sessionInterval = 12 * 60 * 60 * 1000; // 12 hours
        this.ips = [];
        this.currentIpIndex = 0;
        this.loadProxies();
    }
    
    loadProxies() {
        const proxyPath = path.join(__dirname, 'proxies.json');
        if (fs.existsSync(proxyPath)) {
            try {
                const data = JSON.parse(fs.readFileSync(proxyPath, 'utf8'));
                this.ips = data.proxies || [];
                addLog(`[Session] Loaded ${this.ips.length} proxies`);
            } catch (e) {
                addLog(`[Session] Failed to load proxies: ${e.message}`);
            }
        }
        
        // Generate random session ID if no proxies
        this.sessionId = Date.now().toString(36) + Math.random().toString(36).substr(2, 8);
    }
    
    getSessionHeaders() {
        const userAgents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/119.0',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        ];
        
        const headers = {
            'User-Agent': userAgents[Math.floor(Math.random() * userAgents.length)],
            'Accept-Language': ['en-US,en;q=0.9', 'en-GB,en;q=0.9', 'en-AU,en;q=0.9'][Math.floor(Math.random() * 3)],
            'Accept-Encoding': 'gzip, deflate, br',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
            'Sec-Ch-Ua-Mobile': '?0',
            'Sec-Ch-Ua-Platform': '"Windows"',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Upgrade-Insecure-Requests': '1',
            'Cache-Control': 'max-age=0',
            'Connection': 'keep-alive'
        };
        
        // Add proxy if available
        if (this.ips.length > 0) {
            const proxy = this.ips[this.currentIpIndex % this.ips.length];
            if (proxy) {
                headers['X-Forwarded-For'] = proxy.ip || proxy;
                headers['X-Real-IP'] = proxy.ip || proxy;
                this.currentIpIndex++;
            }
        }
        
        return headers;
    }
    
    shouldRotate() {
        const should = Date.now() - this.lastSessionChange > this.sessionInterval;
        if (should) {
            addLog('[Session] Session rotation interval reached');
        }
        return should;
    }
    
    rotate() {
        this.sessionId = Date.now().toString(36) + Math.random().toString(36).substr(2, 8);
        this.lastSessionChange = Date.now();
        this.sessionInterval = 8 * 60 * 60 * 1000 + Math.random() * 8 * 60 * 60 * 1000; // 8-16 hours
        addLog(`[Session] New session ID: ${this.sessionId}`);
        
        // Cycle IP
        if (this.ips.length > 0) {
            this.currentIpIndex = (this.currentIpIndex + 1) % this.ips.length;
            addLog(`[Session] Switched to IP index: ${this.currentIpIndex}`);
        }
        
        return this.sessionId;
    }
    
    // Generate random fingerprints
    getFingerprint() {
        const canvas = Math.random().toString(36).substr(2, 10);
        const webgl = Math.random().toString(36).substr(2, 10);
        const audio = Math.random().toString(36).substr(2, 8);
        return {
            canvas: canvas,
            webgl: webgl,
            audio: audio,
            userAgent: this.getSessionHeaders()['User-Agent'],
            screen: `${window?.screen?.width || 1920}x${window?.screen?.height || 1080}`,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
            language: navigator?.language || 'en-US'
        };
    }
}

// ============================================================
// HUMANIZATION ENGINE
// ============================================================
class Humanizer {
    constructor() {
        this.seed = Date.now() % 2147483647;
        this.activityHistory = [];
        this.currentTask = 'idle';
        this.taskStartTime = 0;
        this.boredomThreshold = 60000 + Math.random() * 120000;
    }
    
    randomNormal(mean, stddev) {
        let u = 0, v = 0;
        while (u === 0) u = Math.random();
        while (v === 0) v = Math.random();
        const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
        return mean + stddev * z;
    }
    
    reactionTime() {
        return Math.max(80, Math.min(600, this.randomNormal(250, 100) + (Math.random() * 50 - 25)));
    }
    
    actionInterval() {
        const base = this.randomNormal(15000, 12000);
        return Math.max(2000, Math.min(120000, base));
    }
    
    movementJitter(value) {
        const jitter = 1 + (Math.random() - 0.5) * 0.3;
        const spike = Math.random() > 0.95 ? 1.5 : 1.0;
        return value * jitter * spike;
    }
    
    randomAngle() {
        return (Math.random() * Math.PI * 2) + (Math.random() - 0.5) * 0.5;
    }
    
    smoothTurn(current, target, steps) {
        const diff = target - current;
        const step = diff / steps;
        const result = [];
        for (let i = 0; i < steps; i++) {
            result.push(current + step * i + (Math.random() - 0.5) * 0.02);
        }
        return result;
    }
    
    recordActivity(activity) {
        this.activityHistory.push({ activity, time: Date.now() });
        if (this.activityHistory.length > 100) {
            this.activityHistory.shift();
        }
        this.currentTask = activity;
        this.taskStartTime = Date.now();
    }
    
    shouldSwitchTask() {
        if (Date.now() - this.taskStartTime > this.boredomThreshold) {
            this.boredomThreshold = 60000 + Math.random() * 120000;
            return true;
        }
        return false;
    }
    
    getInterestingBlocks() {
        return ['stone', 'dirt', 'grass_block', 'oak_log', 'spruce_log',
            'birch_log', 'oak_planks', 'spruce_planks', 'cobblestone',
            'iron_ore', 'coal_ore', 'gold_ore', 'diamond_ore',
            'sand', 'gravel', 'water', 'lava', 'oak_leaves'];
    }
}

const human = new Humanizer();

// ============================================================
// BLOCK PLACEMENT SIMULATOR
// ============================================================
class BlockSimulator {
    constructor(bot) {
        this.bot = bot;
        this.placedBlocks = [];
        this.currentBuild = null;
        this.buildProgress = 0;
        this.builds = [];
        this.materials = [];
        this.lastPlaceTime = 0;
        this.placementCount = 0;
        
        this.buildPatterns = [
            { name: 'wall', width: 5 + Math.floor(Math.random() * 4), height: 3 + Math.floor(Math.random() * 3) },
            { name: 'tower', width: 3 + Math.floor(Math.random() * 2), height: 6 + Math.floor(Math.random() * 5) },
            { name: 'floor', width: 8 + Math.floor(Math.random() * 5), height: 1 },
            { name: 'stairs', width: 4 + Math.floor(Math.random() * 3), height: 4 + Math.floor(Math.random() * 3) },
            { name: 'pillar', width: 1, height: 8 + Math.floor(Math.random() * 6) },
        ];
    }
    
    scanMaterials() {
        if (!this.bot || !this.bot.inventory) return [];
        const items = this.bot.inventory.items();
        const materials = [];
        for (const item of items) {
            if (item.name && !item.name.includes('tool') && !item.name.includes('sword') && 
                !item.name.includes('pickaxe') && !item.name.includes('axe') &&
                !item.name.includes('shovel') && !item.name.includes('helmet') &&
                !item.name.includes('chestplate') && !item.name.includes('leggings') &&
                !item.name.includes('boots') && !item.name.includes('food') &&
                !item.name.includes('bucket') && item.count > 5) {
                materials.push(item);
            }
        }
        return materials;
    }
    
    startBuild() {
        if (!this.bot || !this.bot.entity) return false;
        const materials = this.scanMaterials();
        if (materials.length === 0) return false;
        
        const material = materials[Math.floor(Math.random() * materials.length)];
        const pattern = this.buildPatterns[Math.floor(Math.random() * this.buildPatterns.length)];
        const pos = this.bot.entity.position;
        
        this.currentBuild = {
            pattern: pattern,
            material: material,
            startPos: {
                x: Math.floor(pos.x) + (Math.random() - 0.5) * 10,
                y: Math.floor(pos.y),
                z: Math.floor(pos.z) + (Math.random() - 0.5) * 10
            },
            progress: 0,
            totalBlocks: pattern.width * pattern.height,
            direction: Math.floor(Math.random() * 4)
        };
        
        this.buildProgress = 0;
        this.placedBlocks = [];
        return true;
    }
    
    placeBlock() {
        if (!this.bot || !this.bot.entity || !this.currentBuild) return false;
        if (!this.bot.heldItem || this.bot.heldItem.name !== this.currentBuild.material.name) {
            const item = this.bot.inventory.items().find(i => i.name === this.currentBuild.material.name);
            if (!item) { this.currentBuild = null; return false; }
            this.bot.equip(item, 'hand').catch(() => {});
            return false;
        }
        
        const build = this.currentBuild;
        const pos = this.bot.entity.position;
        const offsetX = Math.floor(build.progress / build.pattern.height) % build.pattern.width;
        const offsetY = build.progress % build.pattern.height;
        const offsetZ = Math.floor(build.progress / (build.pattern.width * build.pattern.height));
        
        let dx = 0, dz = 0;
        switch(build.direction) {
            case 0: dx = offsetX; dz = offsetZ; break;
            case 1: dx = -offsetZ; dz = offsetX; break;
            case 2: dx = -offsetX; dz = -offsetZ; break;
            case 3: dx = offsetZ; dz = -offsetX; break;
        }
        
        const targetPos = {
            x: Math.floor(build.startPos.x) + dx,
            y: Math.floor(build.startPos.y) + offsetY,
            z: Math.floor(build.startPos.z) + dz
        };
        
        const block = this.bot.blockAt(targetPos);
        if (block && block.name !== 'air') { build.progress++; return false; }
        
        const lookTarget = { x: targetPos.x + 0.5, y: targetPos.y + 0.5, z: targetPos.z + 0.5 };
        const targetYaw = Math.atan2(lookTarget.z - pos.z, lookTarget.x - pos.x);
        const targetPitch = Math.atan2(lookTarget.y - pos.y - 1.6, 
            Math.sqrt(Math.pow(lookTarget.x - pos.x, 2) + Math.pow(lookTarget.z - pos.z, 2)));
        this.bot.look(targetYaw, targetPitch, false);
        
        try {
            this.bot.placeBlock(this.bot.blockAt(targetPos) || { position: targetPos });
            this.placedBlocks.push(targetPos);
            build.progress++;
            this.placementCount++;
            this.lastPlaceTime = Date.now();
            human.recordActivity('building');
            return true;
        } catch (e) { return false; }
    }
    
    isBuildComplete() {
        if (!this.currentBuild) return true;
        return this.currentBuild.progress >= this.currentBuild.totalBlocks;
    }
    
    cleanupBuild() {
        if (this.placedBlocks.length === 0) return;
        const removeCount = Math.floor(this.placedBlocks.length * (0.1 + Math.random() * 0.1));
        for (let i = 0; i < removeCount && this.placedBlocks.length > 0; i++) {
            const idx = Math.floor(Math.random() * this.placedBlocks.length);
            const pos = this.placedBlocks[idx];
            if (pos && this.bot) {
                try { this.bot.dig(this.bot.blockAt(pos) || { position: pos }); } catch (e) {}
            }
            this.placedBlocks.splice(idx, 1);
        }
    }
}

// ============================================================
// MINING SIMULATOR
// ============================================================
class MiningSimulator {
    constructor(bot) {
        this.bot = bot;
        this.miningTarget = null;
        this.lastMineTime = 0;
        this.mineCount = 0;
        this.oresMined = 0;
        this.currentVein = null;
        this.veinProgress = 0;
        this.orePriority = ['diamond_ore', 'emerald_ore', 'gold_ore', 'iron_ore',
            'coal_ore', 'redstone_ore', 'lapis_ore', 'copper_ore'];
    }
    
    findOres(radius = 8) {
        if (!this.bot || !this.bot.entity) return [];
        const pos = this.bot.entity.position;
        const ores = [];
        for (let x = -radius; x <= radius; x++) {
            for (let y = -radius; y <= radius; y++) {
                for (let z = -radius; z <= radius; z++) {
                    const block = this.bot.blockAt({
                        x: Math.floor(pos.x) + x,
                        y: Math.floor(pos.y) + y,
                        z: Math.floor(pos.z) + z
                    });
                    if (block && block.name && block.name.includes('ore')) {
                        ores.push(block);
                    }
                }
            }
        }
        ores.sort((a, b) => {
            const idxA = this.orePriority.indexOf(a.name);
            const idxB = this.orePriority.indexOf(b.name);
            if (idxA === -1 && idxB === -1) return 0;
            if (idxA === -1) return 1;
            if (idxB === -1) return -1;
            return idxA - idxB;
        });
        return ores;
    }
    
    startMining() {
        if (!this.bot || !this.bot.entity) return false;
        const ores = this.findOres();
        if (ores.length === 0) return false;
        this.miningTarget = ores[0];
        this.currentVein = this.miningTarget;
        this.veinProgress = 0;
        human.recordActivity('mining');
        return true;
    }
    
    mineTarget() {
        if (!this.bot || !this.bot.entity || !this.miningTarget) return false;
        if (!this.bot.heldItem || !this.bot.heldItem.name.includes('pickaxe')) {
            const pickaxe = this.bot.inventory.items().find(i => i.name.includes('pickaxe'));
            if (pickaxe) { this.bot.equip(pickaxe, 'hand').catch(() => {}); }
            return false;
        }
        
        const now = Date.now();
        const minDelay = 600 + Math.random() * 400;
        if (now - this.lastMineTime < minDelay) return false;
        
        try {
            const target = this.miningTarget;
            const block = this.bot.blockAt(target.position);
            if (!block || block.name === 'air') { this.miningTarget = null; return false; }
            
            const pos = this.bot.entity.position;
            const targetYaw = Math.atan2(target.position.z - pos.z, target.position.x - pos.x);
            const targetPitch = Math.atan2(target.position.y - pos.y - 1.6, 
                Math.sqrt(Math.pow(target.position.x - pos.x, 2) + Math.pow(target.position.z - pos.z, 2)));
            this.bot.look(targetYaw, targetPitch, false);
            this.bot.dig(block);
            this.lastMineTime = now;
            this.mineCount++;
            this.veinProgress++;
            if (block.name && block.name.includes('ore')) {
                this.oresMined++;
                addLog(`[Mining] Mined ${block.name}`);
            }
            if (Math.random() < 0.05) {
                setTimeout(() => {
                    if (this.bot && this.bot.inventory) { this.bot.inventory.items(); }
                }, 1000 + Math.random() * 2000);
            }
            return true;
        } catch (e) { this.miningTarget = null; return false; }
    }
    
    isVeinDepleted() {
        if (!this.currentVein) return true;
        const block = this.bot.blockAt(this.currentVein.position);
        return !block || block.name === 'air' || this.veinProgress > 20;
    }
    
    findMiningSpot() {
        if (!this.bot || !this.bot.entity) return null;
        const pos = this.bot.entity.position;
        for (let radius = 10; radius < 30; radius += 5) {
            for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 4) {
                const x = Math.floor(pos.x + Math.cos(angle) * radius);
                const z = Math.floor(pos.z + Math.sin(angle) * radius);
                const y = Math.floor(pos.y);
                const block = this.bot.blockAt({x, y, z});
                if (block && (block.name === 'stone' || block.name === 'cobblestone' || 
                    block.name === 'andesite' || block.name === 'diorite' || block.name === 'granite')) {
                    const above = this.bot.blockAt({x, y: y + 1, z});
                    const above2 = this.bot.blockAt({x, y: y + 2, z});
                    if (above && above.name === 'air' && above2 && above2.name === 'air') {
                        return {x, y, z};
                    }
                }
            }
        }
        return null;
    }
}

// ============================================================
// CHAT SIMULATOR
// ============================================================
class ChatSimulator {
    constructor(bot) {
        this.bot = bot;
        this.lastMessageTime = 0;
        this.messageCount = 0;
        this.currentMood = 'neutral';
        this.personalities = [
            { name: 'friendly', emoji: '😊', talkative: 0.4 },
            { name: 'chill', emoji: '😎', talkative: 0.25 },
            { name: 'curious', emoji: '🤔', talkative: 0.35 },
            { name: 'hyper', emoji: '🔥', talkative: 0.55 },
            { name: 'builder', emoji: '🏗️', talkative: 0.3 },
            { name: 'miner', emoji: '⛏️', talkative: 0.2 },
        ];
        this.currentPersonality = this.personalities[0];
        this.responses = {
            'hello': ['hello!', 'hi there!', 'hey!', 'sup!', 'howdy!', 'hi!'],
            'how are you': ['good, you?', 'doing well!', 'great!', 'not bad, you?'],
            'what are you doing': ['building', 'mining', 'exploring', 'just hanging out', 'working on a project'],
            'nice': ['thanks!', 'ty!', 'appreciate it!', 'thanks dude!'],
            'bye': ['bye!', 'cya!', 'later!', 'see you!'],
            'thanks': ['np!', 'anytime!', 'sure thing!', 'of course!'],
            'building': ['yeah I\'m building a base', 'working on a project', 'just building something cool'],
            'mine': ['yeah I\'m mining some ores', 'found some good stuff!', 'mining for diamonds'],
        };
    }
    
    getRandomMessage() {
        const now = Date.now();
        const minInterval = 45000 + Math.random() * 135000;
        if (now - this.lastMessageTime < minInterval && this.messageCount > 0) return null;
        if (Math.random() < 0.02) {
            this.currentPersonality = this.personalities[Math.floor(Math.random() * this.personalities.length)];
        }
        const messages = this.generateMessages();
        const msg = messages[Math.floor(Math.random() * messages.length)];
        this.lastMessageTime = now;
        this.messageCount++;
        return msg;
    }
    
    generateMessages() {
        const base = [
            'anyone else building?', 'found some diamonds!', 'this server is cool',
            'what\'s everyone working on?', 'I\'m building a base', 'mining for ores',
            'any cool builds around?', 'I need more wood', 'anyone have extra iron?',
            'check out my build!', 'this area is nice', 'I\'m making a farm',
            'anyone want to trade?', 'I\'m exploring', 'found a cave!',
            'this is fun', 'I like this server', 'what\'s the best build here?',
            'I\'m afk but not really', 'just vibing', 'anyone need help?'
        ];
        if (this.currentPersonality.name === 'builder') {
            base.push('building a castle', 'working on my base', 'need more materials', 'this build is gonna be huge');
        }
        if (this.currentPersonality.name === 'miner') {
            base.push('found some iron', 'mining for diamonds', 'need more torches', 'found a cave system');
        }
        if (this.currentPersonality.name === 'hyper') {
            base.push('LET\'S GO!', 'THIS IS AMAZING!', 'I\'M SO EXCITED!', 'WOOHOO!');
        }
        return base;
    }
    
    respondToMessage(username, message) {
        const lower = message.toLowerCase();
        for (const [key, responses] of Object.entries(this.responses)) {
            if (lower.includes(key)) {
                return responses[Math.floor(Math.random() * responses.length)];
            }
        }
        return null;
    }
}

// ============================================================
// MOVEMENT SIMULATOR
// ============================================================
class MovementSimulator {
    constructor(bot, defaultMove) {
        this.bot = bot;
        this.defaultMove = defaultMove;
        this.lastMoveTime = 0;
        this.styles = ['explorer', 'aimless', 'focused', 'distracted', 'builder', 'miner'];
        this.currentStyle = 'aimless';
        this.currentGoal = null;
        this.pathErrors = 0;
    }
    
    getNextMove() {
        if (!this.bot || !this.bot.entity) return null;
        const now = Date.now();
        const minInterval = 5000 + Math.random() * 15000;
        if (now - this.lastMoveTime < minInterval) return null;
        if (Math.random() < 0.05) {
            this.currentStyle = this.styles[Math.floor(Math.random() * this.styles.length)];
        }
        if (Math.random() < 0.12) {
            this.bot.setControlState('forward', false);
            const yaw = Math.random() * Math.PI * 2;
            const pitch = (Math.random() * Math.PI) / 2 - Math.PI / 4;
            this.bot.look(yaw, pitch, false);
            this.lastMoveTime = now;
            return null;
        }
        let target = null;
        switch(this.currentStyle) {
            case 'explorer': target = this.getExplorerTarget(); break;
            case 'aimless': target = this.getRandomTarget(); break;
            case 'focused': target = this.getFocusedTarget(); break;
            case 'distracted': target = this.getDistractedTarget(); break;
            case 'builder': target = this.getBuilderTarget(); break;
            case 'miner': target = this.getMinerTarget(); break;
            default: target = this.getRandomTarget();
        }
        if (target) {
            try {
                this.bot.pathfinder.setMovements(this.defaultMove);
                this.bot.pathfinder.setGoal(new GoalBlock(
                    Math.floor(target.x),
                    Math.floor(target.y),
                    Math.floor(target.z)
                ));
                this.lastMoveTime = now;
                return target;
            } catch (e) {
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
    
    getExplorerTarget() {
        const pos = this.bot.entity.position;
        const distance = 10 + Math.random() * 20;
        const angle = Math.random() * Math.PI * 2;
        return { x: pos.x + Math.cos(angle) * distance, y: pos.y + (Math.random()-0.5)*3, z: pos.z + Math.sin(angle) * distance };
    }
    
    getRandomTarget() {
        const pos = this.bot.entity.position;
        const distance = 5 + Math.random() * 15;
        const angle = Math.random() * Math.PI * 2;
        return { x: pos.x + Math.cos(angle) * distance, y: pos.y + (Math.random()-0.5)*2, z: pos.z + Math.sin(angle) * distance };
    }
    
    getFocusedTarget() {
        if (!this.currentGoal || Math.random() < 0.05) {
            this.currentGoal = this.getRandomTarget();
        }
        return this.currentGoal;
    }
    
    getDistractedTarget() {
        const pos = this.bot.entity.position;
        const distance = 3 + Math.random() * 8;
        const angle = Math.random() * Math.PI * 2;
        return { x: pos.x + Math.cos(angle) * distance, y: pos.y + (Math.random()-0.5)*1.5, z: pos.z + Math.sin(angle) * distance };
    }
    
    getBuilderTarget() {
        const pos = this.bot.entity.position;
        const distance = 8 + Math.random() * 15;
        const angle = Math.random() * Math.PI * 2;
        return { x: pos.x + Math.cos(angle) * distance, y: pos.y, z: pos.z + Math.sin(angle) * distance };
    }
    
    getMinerTarget() {
        const pos = this.bot.entity.position;
        const distance = 10 + Math.random() * 20;
        const angle = Math.random() * Math.PI * 2;
        return { x: pos.x + Math.cos(angle) * distance, y: pos.y - 1 - Math.random() * 3, z: pos.z + Math.sin(angle) * distance };
    }
}

// ============================================================
// TASK MANAGER
// ============================================================
class TaskManager {
    constructor(bot) {
        this.bot = bot;
        this.currentTask = 'idle';
        this.taskTimer = 0;
        this.taskDuration = 60000 + Math.random() * 180000;
        this.tasks = ['build', 'mine', 'explore', 'idle', 'build', 'mine'];
        this.lastTaskChange = Date.now();
        this.isActive = false;
        this.building = false;
        this.mining = false;
    }
    
    update() {
        if (!this.bot || !botState.connected) return;
        const now = Date.now();
        if (now - this.lastTaskChange > this.taskDuration || 
            (this.currentTask === 'build' && blockSim && blockSim.isBuildComplete()) ||
            (this.currentTask === 'mine' && mineSim && mineSim.isVeinDepleted())) {
            if (this.currentTask === 'build' && blockSim) { blockSim.cleanupBuild(); }
            this.pickNewTask();
            this.lastTaskChange = now;
            this.taskDuration = 60000 + Math.random() * 180000;
        }
        switch(this.currentTask) {
            case 'build': this.executeBuild(); break;
            case 'mine': this.executeMine(); break;
            case 'explore': this.executeExplore(); break;
            case 'idle': this.executeIdle(); break;
        }
    }
    
    pickNewTask() {
        const weights = { 'build': 0.3, 'mine': 0.3, 'explore': 0.2, 'idle': 0.2 };
        if (this.currentTask === 'build') weights['build'] = 0.1;
        if (this.currentTask === 'mine') weights['mine'] = 0.1;
        const rand = Math.random();
        let cumulative = 0;
        for (const [task, weight] of Object.entries(weights)) {
            cumulative += weight;
            if (rand < cumulative) { this.currentTask = task; break; }
        }
        if (this.currentTask === 'build' && blockSim) { blockSim.startBuild(); }
        if (this.currentTask === 'mine' && mineSim) {
            if (!mineSim.startMining()) { this.currentTask = 'explore'; }
        }
        addLog(`[Task] Switched to: ${this.currentTask}`);
    }
    
    executeBuild() {
        if (!blockSim) return;
        const blocksToPlace = 1 + Math.floor(Math.random() * 3);
        for (let i = 0; i < blocksToPlace; i++) {
            if (blockSim.placeBlock()) { botState.humanScore++; }
        }
    }
    
    executeMine() {
        if (!mineSim) return;
        const blocksToMine = 2 + Math.floor(Math.random() * 4);
        for (let i = 0; i < blocksToMine; i++) {
            if (mineSim.mineTarget()) {
                botState.humanScore++;
                botState.lastActivity = Date.now();
            }
        }
        if (mineSim.isVeinDepleted()) {
            mineSim.miningTarget = null;
            if (!mineSim.startMining()) { this.currentTask = 'explore'; }
        }
    }
    
    executeExplore() {
        if (moveSim && Math.random() < 0.3) {
            moveSim.getNextMove();
            botState.lastActivity = Date.now();
        }
        if (Math.random() < 0.05) {
            const yaw = Math.random() * Math.PI * 2;
            const pitch = (Math.random() * Math.PI) / 2 - Math.PI / 4;
            this.bot.look(yaw, pitch, false);
        }
    }
    
    executeIdle() {
        if (Math.random() < 0.1) {
            const yaw = Math.random() * Math.PI * 2;
            const pitch = (Math.random() * Math.PI) / 2 - Math.PI / 4;
            this.bot.look(yaw, pitch, false);
        }
        if (Math.random() < 0.05) {
            try { this.bot.inventory.items(); } catch(e) {}
        }
    }
}

// ============================================================
// EXPRESS SERVER
// ============================================================
const app = express();
app.use(express.json());
const PORT = process.env.PORT || 5000;

let botState = {
    connected: false,
    lastActivity: Date.now(),
    reconnectAttempts: 0,
    startTime: Date.now(),
    errors: [],
    wasThrottled: false,
    humanScore: 0,
    currentAccount: '',
    sessionId: '',
};

app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>AFK Bot - Immortal</title>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
            <style>
                * { box-sizing: border-box; }
                body {
                    font-family: 'Inter', sans-serif;
                    background: #0d1117;
                    color: #e6edf3;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    min-height: 100vh;
                    margin: 0;
                    padding: 24px;
                }
                main { max-width: 520px; width: 100%; }
                .card {
                    background: #161b22;
                    border: 1px solid #21262d;
                    border-radius: 12px;
                    padding: 24px;
                    margin-bottom: 12px;
                }
                .status {
                    padding: 12px 16px;
                    border-radius: 8px;
                    font-weight: 600;
                    margin-bottom: 12px;
                }
                .status.online { background: #0d2218; border: 2px solid #238636; color: #3fb950; }
                .status.offline { background: #200d0d; border: 2px solid #da3633; color: #f85149; }
                .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
                .stat { background: #0d1117; padding: 10px 12px; border-radius: 8px; }
                .stat-label { font-size: 10px; color: #8b949e; text-transform: uppercase; letter-spacing: 0.5px; }
                .stat-value { font-size: 16px; font-weight: 700; margin-top: 2px; }
                .btn {
                    padding: 10px 16px;
                    border: none;
                    border-radius: 8px;
                    font-weight: 600;
                    cursor: pointer;
                    font-family: inherit;
                    transition: all 0.2s;
                }
                .btn:hover { filter: brightness(1.1); }
                .btn-start { background: #238636; color: white; }
                .btn-stop { background: #da3633; color: white; }
                .flex { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
                .text-muted { color: #8b949e; font-size: 12px; }
                .badge { 
                    background: #21262d; 
                    padding: 2px 10px; 
                    border-radius: 12px; 
                    font-size: 11px; 
                    color: #8b949e;
                }
            </style>
        </head>
        <body>
            <main>
                <div class="card">
                    <h1 style="margin:0; font-size:22px;">🛡️ Immortal Bot</h1>
                    <p class="text-muted" style="margin:4px 0 0;">Auto-rotate accounts + sessions</p>
                </div>

                <div id="status" class="status offline">🔴 Disconnected</div>

                <div class="card">
                    <div class="grid">
                        <div class="stat"><div class="stat-label">Uptime</div><div class="stat-value" id="uptime">--</div></div>
                        <div class="stat"><div class="stat-label">Human Score</div><div class="stat-value" id="humanScore">0</div></div>
                        <div class="stat"><div class="stat-label">Blocks</div><div class="stat-value" id="placed">0</div></div>
                        <div class="stat"><div class="stat-label">Ores</div><div class="stat-value" id="mined">0</div></div>
                    </div>
                    <div style="margin-top:10px; display:flex; gap:8px; flex-wrap:wrap; font-size:12px; color:#8b949e;">
                        <span>👤 <span id="account">-</span></span>
                        <span>🔄 <span id="session">-</span></span>
                    </div>
                </div>

                <div class="card">
                    <div class="flex">
                        <button class="btn btn-start" onclick="startBot()">▶ Start</button>
                        <button class="btn btn-stop" onclick="stopBot()">⏹ Stop</button>
                        <button class="btn btn-start" onclick="forceRotate()" style="background:#1f6feb;color:white;">🔄 Rotate Now</button>
                    </div>
                    <div class="flex">
                        <a href="/accounts" class="btn" style="background:#21262d;color:#8b949e;text-decoration:none;font-size:12px;">📋 Accounts</a>
                        <a href="/logs" class="btn" style="background:#21262d;color:#8b949e;text-decoration:none;font-size:12px;">📋 Logs</a>
                    </div>
                </div>

                <div class="card">
                    <p class="text-muted" style="margin:0; font-size:11px;">
                        ⚡ Auto-rotates accounts every 8-16h • Changes session fingerprints • Banned accounts auto-skipped
                    </p>
                </div>
            </main>
            <script>
                function formatUptime(s) {
                    const h = Math.floor(s/3600);
                    const m = Math.floor((s%3600)/60);
                    return h > 0 ? h+'h '+m+'m' : m+'m';
                }
                
                async function update() {
                    try {
                        const r = await fetch('/health');
                        const data = await r.json();
                        const online = data.status === 'connected';
                        document.getElementById('status').className = 'status ' + (online ? 'online' : 'offline');
                        document.getElementById('status').textContent = online ? '🟢 Connected' : '🔴 Disconnected';
                        document.getElementById('uptime').textContent = formatUptime(data.uptime);
                        document.getElementById('humanScore').textContent = data.humanScore || 0;
                        document.getElementById('placed').textContent = data.blocksPlaced || 0;
                        document.getElementById('mined').textContent = data.oresMined || 0;
                        document.getElementById('account').textContent = data.currentAccount || '-';
                        document.getElementById('session').textContent = data.sessionId ? data.sessionId.slice(0,8) : '-';
                    } catch(e) {}
                }
                
                async function startBot() {
                    await fetch('/start', { method: 'POST' });
                    update();
                }
                
                async function stopBot() {
                    await fetch('/stop', { method: 'POST' });
                    update();
                }
                
                async function forceRotate() {
                    await fetch('/rotate', { method: 'POST' });
                    update();
                }
                
                setInterval(update, 3000);
                update();
            </script>
        </body>
        </html>
    `);
});

app.get("/health", (req, res) => {
    res.json({
        status: botState.connected ? "connected" : "disconnected",
        uptime: Math.floor((Date.now() - botState.startTime) / 1000),
        humanScore: botState.humanScore,
        blocksPlaced: blockSim ? blockSim.placementCount : 0,
        oresMined: mineSim ? mineSim.oresMined : 0,
        currentAccount: botState.currentAccount || '-',
        sessionId: botState.sessionId || '-',
    });
});

app.post("/rotate", (req, res) => {
    addLog('[Control] Manual account rotation triggered');
    forceAccountRotation();
    res.json({ success: true });
});

app.get("/accounts", (req, res) => {
    const acc = accountRotator ? accountRotator.accounts : [];
    const banned = accountRotator ? accountRotator.bannedAccounts : [];
    res.send(`
        <!DOCTYPE html>
        <html>
        <head><title>Accounts</title>
        <style>
            body { background: #0d1117; color: #e6edf3; font-family: monospace; padding: 20px; }
            .banned { color: #f85149; }
            .active { color: #3fb950; }
            .pending { color: #e3b341; }
        </style>
        </head>
        <body>
            <a href="/" style="color:#58a6ff;">← Back</a>
            <h2>Accounts (${acc.length})</h2>
            <p>Banned: ${banned.length}</p>
            <ul>
                ${acc.map((a, i) => `
                    <li class="${banned.includes(a.username) ? 'banned' : (i === accountRotator?.currentIndex ? 'active' : 'pending')}">
                        ${a.username} ${banned.includes(a.username) ? '🚫 BANNED' : (i === accountRotator?.currentIndex ? '✅ ACTIVE' : '')}
                    </li>
                `).join('')}
            </ul>
        </body>
        </html>
    `);
});

app.get("/ping", (req, res) => res.send("pong"));

app.get("/logs", (req, res) => {
    const logs = getLogs();
    res.send(`
        <!DOCTYPE html>
        <html>
        <head><title>Logs</title>
        <style>
            body { background: #0d1117; color: #e6edf3; font-family: monospace; padding: 20px; }
            pre { white-space: pre-wrap; word-wrap: break-word; }
            .error { color: #ff7b72; }
            .success { color: #3fb950; }
            .control { color: #58a6ff; }
            .warn { color: #e3b341; }
        </style>
        <script>setTimeout(()=>location.reload(),3000);</script>
        </head>
        <body>
            <a href="/" style="color:#58a6ff;">← Back</a>
            <h2>Live Logs</h2>
            <pre>
                ${logs.slice(-200).map(l => {
                    const lower = l.toLowerCase();
                    let cls = '';
                    if (lower.includes('error') || lower.includes('fail')) cls = 'error';
                    else if (lower.includes('success') || lower.includes('connected')) cls = 'success';
                    else if (lower.includes('control')) cls = 'control';
                    else if (lower.includes('warn') || lower.includes('banned')) cls = 'warn';
                    return `<span class="${cls}">${l}</span>`;
                }).join('\n')}
            </pre>
        </body>
        </html>
    `);
});

let botRunning = true;

app.post("/start", (req, res) => {
    if (botRunning) return res.json({ success: false, msg: "Already running" });
    botRunning = true;
    createBot();
    addLog("[Control] Bot started");
    res.json({ success: true });
});

app.post("/stop", (req, res) => {
    if (!botRunning) return res.json({ success: false, msg: "Already stopped" });
    botRunning = false;
    if (bot) { bot.end(); bot = null; }
    clearAllIntervals();
    addLog("[Control] Bot stopped");
    res.json({ success: true });
});

const server = app.listen(PORT, "0.0.0.0", () => {
    addLog(`[Server] Started on port ${server.address().port}`);
});

// ============================================================
// GLOBALS
// ============================================================
let bot = null;
let activeIntervals = [];
let reconnectTimeoutId = null;
let connectionTimeoutId = null;
let isReconnecting = false;
let blockSim = null;
let mineSim = null;
let chatSim = null;
let moveSim = null;
let taskManager = null;
let accountRotator = null;
let sessionRotator = null;
let lastDiscordSend = 0;
const DISCORD_RATE_LIMIT_MS = 5000;

global.blockSim = null;
global.mineSim = null;

function formatUptime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h}h ${m}m ${s}s`;
}

function clearAllIntervals() {
    activeIntervals.forEach(id => clearInterval(id));
    activeIntervals = [];
}

function addInterval(callback, delay) {
    const id = setInterval(callback, delay);
    activeIntervals.push(id);
    return id;
}

function clearBotTimeouts() {
    if (reconnectTimeoutId) { clearTimeout(reconnectTimeoutId); reconnectTimeoutId = null; }
    if (connectionTimeoutId) { clearTimeout(connectionTimeoutId); connectionTimeoutId = null; }
}

function getReconnectDelay() {
    if (botState.wasThrottled) {
        botState.wasThrottled = false;
        return 60000 + Math.random() * 60000;
    }
    const baseDelay = config.utils["auto-reconnect-delay"] || 3000;
    const maxDelay = config.utils["max-reconnect-delay"] || 30000;
    const delay = Math.min(baseDelay * Math.pow(2, botState.reconnectAttempts), maxDelay);
    return delay + Math.floor(Math.random() * 2000);
}

function scheduleReconnect() {
    clearBotTimeouts();
    if (isReconnecting) return;
    isReconnecting = true;
    botState.reconnectAttempts++;
    const delay = getReconnectDelay();
    addLog(`[Bot] Reconnecting in ${delay/1000}s (attempt ${botState.reconnectAttempts})`);
    reconnectTimeoutId = setTimeout(() => {
        reconnectTimeoutId = null;
        isReconnecting = false;
        createBot();
    }, delay);
}

function forceAccountRotation() {
    if (accountRotator) {
        const account = accountRotator.rotate();
        botState.currentAccount = account.username;
        addLog(`[Control] Forced rotation to: ${account.username}`);
        // Recreate bot with new account
        if (bot) {
            try { bot.end(); } catch(e) {}
            bot = null;
        }
        clearAllIntervals();
        setTimeout(() => createBot(), 2000);
    }
}

function sendDiscordWebhook(content, color = 0x0099ff) {
    if (!config.discord || !config.discord.enabled) return;
    // rate limited
}

// ============================================================
// BOT CREATION
// ============================================================
function createBot() {
    if (isReconnecting) { addLog("[Bot] Already reconnecting"); return; }
    if (bot) {
        clearAllIntervals();
        try { bot.removeAllListeners(); bot.end(); } catch(e) {}
        bot = null;
    }
    
    // Initialize rotators if not done
    if (!accountRotator) {
        accountRotator = new AccountRotator();
    }
    if (!sessionRotator) {
        sessionRotator = new SessionRotator();
    }
    
    // Check if account should rotate
    if (accountRotator.shouldRotate()) {
        accountRotator.rotate();
    }
    
    // Check if session should rotate
    if (sessionRotator.shouldRotate()) {
        sessionRotator.rotate();
    }
    
    const account = accountRotator.getNextAccount();
    botState.currentAccount = account.username;
    botState.sessionId = sessionRotator.sessionId;
    
    addLog(`[Bot] Creating bot instance...`);
    addLog(`[Bot] Account: ${account.username}`);
    addLog(`[Bot] Session: ${botState.sessionId.slice(0,8)}`);
    addLog(`[Bot] Connecting to ${config.server.ip}:${config.server.port}`);
    
    try {
        const botVersion = config.server.version && config.server.version.trim() ? config.server.version : false;
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
            botState.connected = false;
            clearAllIntervals();
            
            // Check if it's a ban
            const reasonStr = String(kickReason).toLowerCase();
            if (reasonStr.includes("ban") || reasonStr.includes("perm") || 
                reasonStr.includes("banned") || reasonStr.includes("suspended")) {
                addLog(`[Bot] 🚫 Account appears banned! Marking as banned.`);
                accountRotator.markBanned(botState.currentAccount);
                // Force rotation
                accountRotator.rotate();
            }
            
            if (reasonStr.includes("throttl") || reasonStr.includes("too fast")) {
                botState.wasThrottled = true;
            }
        });
        
        bot.on("end", (reason) => {
            addLog(`[Bot] Disconnected: ${reason || "Unknown"}`);
            botState.connected = false;
            clearAllIntervals();
            spawnHandled = false;
            scheduleReconnect();
        });
        
        bot.on("error", (err) => {
            const msg = err.message || "";
            addLog(`[Bot] Error: ${msg}`);
            // If it's a login error, mark account as banned
            if (msg.includes("invalid") || msg.includes("login") || msg.includes("auth")) {
                accountRotator.markBanned(botState.currentAccount);
            }
        });
    } catch (err) {
        addLog(`[Bot] Failed: ${err.message}`);
        scheduleReconnect();
    }
}

// ============================================================
// MODULE INITIALIZATION
// ============================================================
function initializeModules(bot, mcData, defaultMove) {
    addLog("[Modules] Initializing immortal modules...");
    
    chatSim = new ChatSimulator(bot);
    moveSim = new MovementSimulator(bot, defaultMove);
    blockSim = new BlockSimulator(bot);
    mineSim = new MiningSimulator(bot);
    taskManager = new TaskManager(bot);
    
    global.blockSim = blockSim;
    global.mineSim = mineSim;
    
    // ========== CHAT ==========
    if (config.utils["chat-messages"] && config.utils["chat-messages"].enabled) {
        const chatInterval = setInterval(() => {
            if (!bot || !botState.connected) return;
            if (Math.random() < 0.3) return;
            const msg = chatSim.getRandomMessage();
            if (msg) {
                bot.chat(msg);
                botState.lastActivity = Date.now();
                botState.humanScore++;
                addLog(`[Chat] ${msg}`);
            }
        }, 45000 + Math.random() * 135000);
        activeIntervals.push(chatInterval);
        
        bot.on("chat", (username, message) => {
            if (username === bot.username) return;
            const response = chatSim.respondToMessage(username, message);
            if (response) {
                setTimeout(() => {
                    if (bot && botState.connected) {
                        bot.chat(response);
                        botState.humanScore++;
                    }
                }, human.reactionTime());
            }
        });
    }
    
    // ========== MOVEMENT ==========
    if (config.movement && config.movement.enabled !== false) {
        const moveInterval = setInterval(() => {
            if (!bot || !botState.connected) return;
            if (Math.random() < 0.25) {
                const yaw = Math.random() * Math.PI * 2;
                const pitch = (Math.random() * Math.PI) / 2 - Math.PI / 4;
                bot.look(yaw, pitch, false);
                return;
            }
            const target = moveSim.getNextMove();
            if (target) { botState.lastActivity = Date.now(); }
        }, 4000 + Math.random() * 8000);
        activeIntervals.push(moveInterval);
    }
    
    // ========== TASK MANAGER ==========
    const taskInterval = setInterval(() => {
        if (!bot || !botState.connected) return;
        taskManager.update();
    }, 3000 + Math.random() * 5000);
    activeIntervals.push(taskInterval);
    
    // ========== ANTI-AFK ==========
    if (config.utils["anti-afk"] && config.utils["anti-afk"].enabled) {
        const swingInterval = setInterval(() => {
            if (!bot || !botState.connected) return;
            if (Math.random() < 0.4) {
                try { bot.swingArm(); } catch(e) {}
            }
        }, 20000 + Math.random() * 40000);
        activeIntervals.push(swingInterval);
    }
    
    // ========== ACCOUNT ROTATION CHECK ==========
    const rotationCheck = setInterval(() => {
        if (!bot || !botState.connected) return;
        if (accountRotator && accountRotator.shouldRotate()) {
            addLog('[Rotation] Auto-rotating account...');
            forceAccountRotation();
        }
        if (sessionRotator && sessionRotator.shouldRotate()) {
            addLog('[Rotation] Auto-rotating session...');
            sessionRotator.rotate();
            botState.sessionId = sessionRotator.sessionId;
        }
    }, 60000); // Check every minute
    
    activeIntervals.push(rotationCheck);
    
    // ========== AUTO AUTH ==========
    if (config.utils["auto-auth"] && config.utils["auto-auth"].enabled) {
        const password = config.utils["auto-auth"].password;
        let authHandled = false;
        const tryAuth = (type) => {
            if (authHandled || !bot || !botState.connected) return;
            authHandled = true;
            bot.chat(type === "register" ? `/register ${password} ${password}` : `/login ${password}`);
            addLog(`[Auth] Sent ${type}`);
        };
        bot.on("messagestr", (message) => {
            if (authHandled) return;
            const msg = message.toLowerCase();
            if (msg.includes("/register") || msg.includes("register ")) tryAuth("register");
            else if (msg.includes("/login") || msg.includes("login ")) tryAuth("login");
        });
        setTimeout(() => {
            if (!authHandled && bot && botState.connected) {
                bot.chat(`/login ${password}`);
                authHandled = true;
            }
        }, 10000);
    }
    
    addLog("[Modules] All modules initialized!");
}

// ============================================================
// CRASH RECOVERY
// ============================================================
process.on("uncaughtException", (err) => {
    const msg = err.message || "Unknown";
    addLog(`[FATAL] ${msg}`);
    clearAllIntervals();
    botState.connected = false;
    if (isReconnecting) {
        isReconnecting = false;
        if (reconnectTimeoutId) { clearTimeout(reconnectTimeoutId); reconnectTimeoutId = null; }
    }
    // If it's a fatal error, force account rotation
    if (msg.includes("login") || msg.includes("auth") || msg.includes("invalid")) {
        if (accountRotator) {
            accountRotator.markBanned(botState.currentAccount);
        }
    }
    setTimeout(scheduleReconnect, 10000);
});

process.on("unhandledRejection", (reason) => {
    const msg = String(reason);
    addLog(`[FATAL] Rejection: ${msg}`);
    if (msg.includes("ECONNRESET") || msg.includes("ETIMEDOUT")) {
        clearAllIntervals();
        botState.connected = false;
        if (bot) { try { bot.end(); } catch(e) {} }
        scheduleReconnect();
    }
});

process.on("SIGTERM", () => addLog("[System] SIGTERM ignored"));
process.on("SIGINT", () => addLog("[System] SIGINT ignored"));

// ============================================================
// START
// ============================================================
addLog("=".repeat(60));
addLog("  🛡️ MINECRAFT AFK BOT v4.0 - IMMORTAL EDITION");
addLog("=".repeat(60));
addLog(`Server: ${config.server.ip}:${config.server.port}`);
addLog("Features:");
addLog("  🔄 Auto-account rotation (8-16h intervals)");
addLog("  🚫 Ban detection + auto-skip");
addLog("  🌐 Session fingerprint rotation");
addLog("  🏗️ Building + Mining simulation");
addLog("  💬 Human-like chat with personality");
addLog("  🎯 Task switching (build/mine/explore/idle)");
addLog("=".repeat(60));

// Initialize account rotator early
accountRotator = new AccountRotator();
sessionRotator = new SessionRotator();

createBot();
