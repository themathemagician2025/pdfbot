const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const fs = require('fs-extra');
const path = require('path');
const logger = require('../utils/logger');
const monitoringConfig = require('../../config/monitoring');

class SessionManager {
    constructor() {
        this.sessions = new Map();
        this.sessionDir = path.join(__dirname, '../../data/sessions');
        this.cleanupInterval = null;
        
        // Ensure session directory exists
        fs.ensureDirSync(this.sessionDir);
        
        // Start session cleanup job
        this.startCleanupJob();
    }
    
    /**
     * Create a new session for a user
     * @param {string} userId - User ID
     * @param {Object} userData - User data to store in the session
     * @returns {Object} Session data
     */
    async createSession(userId, userData = {}) {
        try {
            // Generate session ID
            const sessionId = uuidv4();
            const now = Date.now();
            const expiresAt = now + monitoringConfig.session.timeout;
            
            // Create session data
            const sessionData = {
                sessionId,
                userId,
                createdAt: now,
                expiresAt,
                lastActive: now,
                userAgent: userData.userAgent || '',
                ipAddress: userData.ipAddress || '',
                data: userData.data || {}
            };
            
            // Store in memory
            this.sessions.set(sessionId, sessionData);
            
            // Persist to disk
            await this.persistSession(sessionData);
            
            logger.debug('Created new session', { 
                sessionId, 
                userId,
                expiresAt: new Date(expiresAt).toISOString()
            });
            
            return sessionData;
            
        } catch (error) {
            logger.error('Error creating session:', error);
            throw new Error('Failed to create session');
        }
    }
    
    /**
     * Get session by ID
     * @param {string} sessionId - Session ID
     * @returns {Object|null} Session data or null if not found/expired
     */
    async getSession(sessionId) {
        try {
            // Check in-memory cache first
            if (this.sessions.has(sessionId)) {
                const session = this.sessions.get(sessionId);
                
                // Check if session is expired
                if (session.expiresAt < Date.now()) {
                    await this.destroySession(sessionId);
                    return null;
                }
                
                // Update last active time
                session.lastActive = Date.now();
                this.sessions.set(sessionId, session);
                
                return session;
            }
            
            // If not in memory, try to load from disk
            const session = await this.loadSession(sessionId);
            if (session) {
                // Add to memory cache
                this.sessions.set(sessionId, session);
                return session;
            }
            
            return null;
            
        } catch (error) {
            logger.error('Error getting session:', error);
            return null;
        }
    }
    
    /**
     * Update session data
     * @param {string} sessionId - Session ID
     * @param {Object} updates - Updates to apply to the session
     * @returns {boolean} True if update was successful
     */
    async updateSession(sessionId, updates) {
        try {
            const session = await this.getSession(sessionId);
            if (!session) return false;
            
            // Apply updates
            Object.assign(session, {
                ...updates,
                lastActive: Date.now()
            });
            
            // Update in memory
            this.sessions.set(sessionId, session);
            
            // Persist to disk
            await this.persistSession(session);
            
            return true;
            
        } catch (error) {
            logger.error('Error updating session:', error);
            return false;
        }
    }
    
    /**
     * Destroy a session
     * @param {string} sessionId - Session ID
     * @returns {boolean} True if session was destroyed
     */
    async destroySession(sessionId) {
        try {
            // Remove from memory
            this.sessions.delete(sessionId);
            
            // Remove from disk
            const sessionFile = this.getSessionFilePath(sessionId);
            if (await fs.pathExists(sessionFile)) {
                await fs.remove(sessionFile);
            }
            
            logger.debug('Destroyed session', { sessionId });
            return true;
            
        } catch (error) {
            logger.error('Error destroying session:', error);
            return false;
        }
    }
    
    /**
     * Clean up expired sessions
     * @returns {Promise<number>} Number of sessions cleaned up
     */
    async cleanupSessions() {
        try {
            logger.info('Starting session cleanup...');
            
            let cleanedUp = 0;
            const now = Date.now();
            
            // Clean up in-memory sessions
            for (const [sessionId, session] of this.sessions.entries()) {
                if (session.expiresAt < now) {
                    this.sessions.delete(sessionId);
                    cleanedUp++;
                }
            }
            
            // Clean up on-disk sessions
            const files = await fs.readdir(this.sessionDir);
            
            for (const file of files) {
                if (!file.endsWith('.json')) continue;
                
                const sessionId = path.basename(file, '.json');
                const session = await this.loadSession(sessionId);
                
                if (!session || session.expiresAt < now) {
                    await this.destroySession(sessionId);
                    cleanedUp++;
                }
            }
            
            logger.info(`Session cleanup completed. Removed ${cleanedUp} expired sessions.`);
            return cleanedUp;
            
        } catch (error) {
            logger.error('Error cleaning up sessions:', error);
            throw error;
        }
    }
    
    /**
     * Start the session cleanup job
     */
    startCleanupJob() {
        // Run cleanup every hour
        this.cleanupInterval = setInterval(() => {
            this.cleanupSessions().catch(error => {
                logger.error('Session cleanup job failed:', error);
            });
        }, monitoringConfig.session.cleanupInterval);
        
        // Clean up on process exit
        process.on('exit', () => {
            this.stopCleanupJob();
        });
        
        logger.info('Session cleanup job started');
    }
    
    /**
     * Stop the session cleanup job
     */
    stopCleanupJob() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
            logger.info('Session cleanup job stopped');
        }
    }
    
    /**
     * Get the file path for a session
     * @private
     */
    getSessionFilePath(sessionId) {
        return path.join(this.sessionDir, `${sessionId}.json`);
    }
    
    /**
     * Persist session to disk
     * @private
     */
    async persistSession(session) {
        try {
            const sessionFile = this.getSessionFilePath(session.sessionId);
            await fs.writeJson(sessionFile, session, { spaces: 2 });
        } catch (error) {
            logger.error('Error persisting session:', error);
            throw error;
        }
    }
    
    /**
     * Load session from disk
     * @private
     */
    async loadSession(sessionId) {
        try {
            const sessionFile = this.getSessionFilePath(sessionId);
            
            if (!(await fs.pathExists(sessionFile))) {
                return null;
            }
            
            const session = await fs.readJson(sessionFile);
            
            // Check if session is expired
            if (session.expiresAt < Date.now()) {
                await fs.remove(sessionFile);
                return null;
            }
            
            return session;
            
        } catch (error) {
            logger.error('Error loading session:', error);
            return null;
        }
    }
    
    /**
     * Generate a secure token
     * @param {number} length - Token length in bytes
     * @returns {string} Secure random token
     */
    generateToken(length = 32) {
        return crypto.randomBytes(length).toString('hex');
    }
    
    /**
     * Hash a token (e.g., for API keys)
     * @param {string} token - Token to hash
     * @returns {string} Hashed token
     */
    hashToken(token) {
        return crypto
            .createHash('sha256')
            .update(token)
            .digest('hex');
    }
}

// Create a singleton instance
const sessionManager = new SessionManager();

module.exports = sessionManager;
