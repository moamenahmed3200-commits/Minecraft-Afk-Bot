"use strict";

const { addLog } = require('./logger');

class LeaveRejoinManager {
    constructor(bot, accountRotator) {
        this.bot = bot;
        this.accountRotator = accountRotator;
        this.isLeaving = false;
        this.rejoinDelay = 10000 + Math.random() * 20000; // 10-30s
        this.leaveReasons = [
            'random_leave',
            'simulate_crash',
            'connection_lost',
            'player_disconnect'
        ];
    }
    
    // Human-like random disconnects
    shouldLeave() {
        // 0.5% chance per minute to "randomly" leave
        return Math.random() < 0.005;
    }
    
    // Simulate a player leaving
    leave() {
        if (this.isLeaving || !this.bot || !this.botState?.connected) return;
        
        const reason = this.leaveReasons[Math.floor(Math.random() * this.leaveReasons.length)];
        addLog(`[LeaveRejoin] Simulating leave: ${reason}`);
        
        this.isLeaving = true;
        
        // End the bot connection
        try {
            this.bot.end();
        } catch (e) {
            // Ignore
        }
        
        // Rejoin after human-like delay
        setTimeout(() => {
            this.isLeaving = false;
            addLog('[LeaveRejoin] Rejoining...');
            
            // If account rotator exists, rotate account
            if (this.accountRotator && Math.random() < 0.3) {
                // 30% chance to switch accounts on rejoin
                const account = this.accountRotator.rotate();
                addLog(`[LeaveRejoin] Rotated to account: ${account.username}`);
            }
            
            // Trigger reconnect
            if (typeof scheduleReconnect === 'function') {
                scheduleReconnect();
            }
        }, this.rejoinDelay + Math.random() * 10000);
    }
    
    // Handle server kicks gracefully
    handleKick(reason) {
        addLog(`[LeaveRejoin] Kicked: ${reason}`);
        
        // If it's a ban, mark account
        if (reason.toLowerCase().includes('ban') || reason.toLowerCase().includes('banned')) {
            if (this.accountRotator) {
                this.accountRotator.markBanned(this.bot?.username || 'unknown');
            }
        }
        
        // Rejoin after delay
        setTimeout(() => {
            if (typeof scheduleReconnect === 'function') {
                scheduleReconnect();
            }
        }, 15000 + Math.random() * 15000);
    }
    
    // Start the leave/rejoin cycle
    start() {
        // Random leave check
        setInterval(() => {
            if (this.shouldLeave() && !this.isLeaving) {
                this.leave();
            }
        }, 60000); // Check every minute
        
        addLog('[LeaveRejoin] Started (random leave chance: 0.5%/min)');
    }
}

// Export factory function
function createLeaveRejoinManager(bot, accountRotator) {
    return new LeaveRejoinManager(bot, accountRotator);
}

module.exports = {
    LeaveRejoinManager,
    createLeaveRejoinManager
};
