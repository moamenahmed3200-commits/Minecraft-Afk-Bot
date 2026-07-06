"use strict";

const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, 'bot.log');
const MAX_LOG_SIZE = 10 * 1024 * 1024; // 10MB

let logs = [];
let logStream = null;

// Initialize log file
try {
    if (fs.existsSync(LOG_FILE)) {
        const stats = fs.statSync(LOG_FILE);
        if (stats.size > MAX_LOG_SIZE) {
            fs.renameSync(LOG_FILE, LOG_FILE + '.old');
        }
    }
    logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });
} catch (e) {
    console.error('Failed to open log file:', e.message);
}

function addLog(message) {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${message}`;
    
    // Console
    console.log(logEntry);
    
    // Memory
    logs.push(logEntry);
    if (logs.length > 1000) {
        logs = logs.slice(-500);
    }
    
    // File
    if (logStream) {
        logStream.write(logEntry + '\n');
    }
}

function getLogs() {
    return logs;
}

function getLogsFromFile(count = 100) {
    try {
        if (!fs.existsSync(LOG_FILE)) return [];
        const content = fs.readFileSync(LOG_FILE, 'utf8');
        const lines = content.split('\n').filter(line => line.trim());
        return lines.slice(-count);
    } catch (e) {
        return [];
    }
}

// Add account rotation logging
function logAccountChange(oldAccount, newAccount, reason = 'rotation') {
    addLog(`[ACCOUNT] ${oldAccount} → ${newAccount} (${reason})`);
}

function logBan(account, reason) {
    addLog(`[BAN] 🚫 ${account} banned: ${reason}`);
}

function logSessionChange(oldSession, newSession) {
    addLog(`[SESSION] ${oldSession} → ${newSession}`);
}

// Rotate log file daily
setInterval(() => {
    try {
        if (fs.existsSync(LOG_FILE)) {
            const stats = fs.statSync(LOG_FILE);
            if (stats.size > MAX_LOG_SIZE) {
                if (logStream) {
                    logStream.end();
                }
                fs.renameSync(LOG_FILE, LOG_FILE + `.${Date.now()}`);
                logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });
                addLog('[LOG] Log file rotated');
            }
        }
    } catch (e) {
        // Silent fail
    }
}, 24 * 60 * 60 * 1000);

module.exports = { 
    addLog, 
    getLogs, 
    getLogsFromFile,
    logAccountChange,
    logBan,
    logSessionChange
};
