const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const logger = require('./logger');

class APIKeyManager {
    constructor(config = {}) {
        // Configuration
        this.config = {
            keyFile: path.join(__dirname, '../OPEN_API_KEY.ini'),
            rotationStrategy: 'round-robin', // 'round-robin', 'failover', 'adaptive'
            maxRetries: 3,
            retryDelay: 1000, // ms
            rateLimitBuffer: 5, // Switch key when we're this many requests from the limit
            ...config
        };

        // State
        this.keys = [];
        this.currentKeyIndex = 0;
        this.keyStats = new Map(); // key -> { totalRequests: number, errors: number, lastUsed: Date, rateLimit: { limit: number, remaining: number, reset: number } }
        this.initialized = false;
    }

    /**
     * Initialize the key manager by loading keys from the key file
     */
    async init() {
        try {
            // Read keys from file
            const keyData = fs.readFileSync(this.config.keyFile, 'utf8');
            this.keys = keyData
                .split('\n')
                .map(key => key.trim())
                .filter(key => key && !key.startsWith('#')); // Skip empty lines and comments

            if (this.keys.length === 0) {
                throw new Error('No valid API keys found in the key file');
            }

            // Initialize stats for each key
            this.keys.forEach(key => {
                const keyId = this._getKeyId(key);
                this.keyStats.set(keyId, {
                    totalRequests: 0,
                    errors: 0,
                    lastUsed: null,
                    rateLimit: {
                        limit: 0,
                        remaining: 0,
                        reset: 0
                    }
                });
            });

            this.initialized = true;
            logger.info(`API Key Manager initialized with ${this.keys.length} keys`);
        } catch (error) {
            logger.error('Failed to initialize API Key Manager:', error);
            throw error;
        }
    }

    /**
     * Get the next available API key based on the rotation strategy
     * @returns {string} The API key to use
     */
    getNextKey() {
        if (!this.initialized) {
            throw new Error('API Key Manager not initialized. Call init() first.');
        }

        if (this.keys.length === 0) {
            throw new Error('No API keys available');
        }

        let selectedKey;
        let selectedKeyIndex;

        switch (this.config.rotationStrategy) {
            case 'round-robin':
                selectedKeyIndex = this.currentKeyIndex;
                this.currentKeyIndex = (this.currentKeyIndex + 1) % this.keys.length;
                selectedKey = this.keys[selectedKeyIndex];
                break;

            case 'failover':
                // Start with the current key, find the next working one
                for (let i = 0; i < this.keys.length; i++) {
                    const keyIndex = (this.currentKeyIndex + i) % this.keys.length;
                    const key = this.keys[keyIndex];
                    const keyId = this._getKeyId(key);
                    const stats = this.keyStats.get(keyId);
                    
                    // Skip keys with recent errors
                    if (stats.errors > 0 && stats.lastUsed && (Date.now() - stats.lastUsed.getTime()) < 60000) {
                        continue;
                    }

                    selectedKey = key;
                    selectedKeyIndex = keyIndex;
                    this.currentKeyIndex = (keyIndex + 1) % this.keys.length;
                    break;
                }
                
                // If all keys have errors, use the first one anyway
                if (!selectedKey) {
                    selectedKeyIndex = 0;
                    selectedKey = this.keys[0];
                    this.currentKeyIndex = 1 % this.keys.length;
                }
                break;

            case 'adaptive':
                // Find the key with the highest remaining rate limit
                let bestKey = null;
                let bestRemaining = -1;
                let bestIndex = 0;

                for (let i = 0; i < this.keys.length; i++) {
                    const key = this.keys[i];
                    const keyId = this._getKeyId(key);
                    const stats = this.keyStats.get(keyId);
                    
                    // Skip keys with recent errors
                    if (stats.errors > 0 && stats.lastUsed && (Date.now() - stats.lastUsed.getTime()) < 60000) {
                        continue;
                    }

                    const remaining = stats.rateLimit?.remaining || 0;
                    
                    // If this key has more remaining than our current best, or if it's the first key we're checking
                    if (remaining > bestRemaining) {
                        bestKey = key;
                        bestRemaining = remaining;
                        bestIndex = i;
                    }
                }

                if (bestKey) {
                    selectedKey = bestKey;
                    selectedKeyIndex = bestIndex;
                    // Move to the next key for the next call to distribute load
                    this.currentKeyIndex = (bestIndex + 1) % this.keys.length;
                } else {
                    // Fall back to round-robin if no key has rate limit info
                    selectedKeyIndex = this.currentKeyIndex;
                    selectedKey = this.keys[selectedKeyIndex];
                    this.currentKeyIndex = (this.currentKeyIndex + 1) % this.keys.length;
                }
                break;

            default:
                throw new Error(`Unknown rotation strategy: ${this.config.rotationStrategy}`);
        }

        // Update stats for the selected key
        const keyId = this._getKeyId(selectedKey);
        const stats = this.keyStats.get(keyId);
        stats.totalRequests++;
        stats.lastUsed = new Date();
        
        logger.debug(`Using API key ${selectedKeyIndex + 1}/${this.keys.length} (${keyId})`);
        
        return selectedKey;
    }

    /**
     * Update rate limit information for a key
     * @param {string} key - The API key
     * @param {Object} rateLimit - Rate limit information
     * @param {number} rateLimit.limit - Total number of requests allowed in the period
     * @param {number} rateLimit.remaining - Number of requests remaining
     * @param {number} rateLimit.reset - Timestamp when the rate limit resets
     */
    updateRateLimit(key, { limit, remaining, reset }) {
        const keyId = this._getKeyId(key);
        if (!this.keyStats.has(keyId)) {
            logger.warn(`Attempted to update rate limit for unknown key: ${keyId}`);
            return;
        }

        const stats = this.keyStats.get(keyId);
        stats.rateLimit = { limit, remaining, reset };
        
        // If we're getting close to the rate limit, log a warning
        if (remaining <= this.config.rateLimitBuffer) {
            logger.warn(`Key ${keyId} is approaching rate limit: ${remaining}/${limit} requests remaining`);
        }
    }

    /**
     * Record an error for a key
     * @param {string} key - The API key that had an error
     * @param {Error} error - The error that occurred
     */
    recordError(key, error) {
        const keyId = this._getKeyId(key);
        if (!this.keyStats.has(keyId)) {
            logger.warn(`Attempted to record error for unknown key: ${keyId}`);
            return;
        }

        const stats = this.keyStats.get(keyId);
        stats.errors++;
        stats.lastError = {
            message: error.message,
            timestamp: new Date(),
            code: error.code
        };

        logger.error(`Error with key ${keyId}: ${error.message}`);
    }

    /**
     * Get statistics for all keys
     * @returns {Object} Statistics for all keys
     */
    getStats() {
        const stats = {};
        this.keys.forEach((key, index) => {
            const keyId = this._getKeyId(key);
            stats[`key_${index + 1}`] = {
                id: keyId,
                ...this.keyStats.get(keyId)
            };
        });
        return stats;
    }

    /**
     * Generate a consistent ID for a key (first 8 chars of hash)
     * @private
     */
    _getKeyId(key) {
        return crypto.createHash('sha256').update(key).digest('hex').substring(0, 8);
    }

    /**
     * Set the rotation strategy
     * @param {string} strategy - The rotation strategy to use ('round-robin', 'failover', 'adaptive')
     */
    setRotationStrategy(strategy) {
        if (!['round-robin', 'failover', 'adaptive'].includes(strategy)) {
            throw new Error(`Invalid rotation strategy: ${strategy}`);
        }
        this.config.rotationStrategy = strategy;
        logger.info(`Rotation strategy set to: ${strategy}`);
    }
}

// Create a singleton instance
const apiKeyManager = new APIKeyManager();

// Initialize with default config
apiKeyManager.init().catch(error => {
    logger.error('Failed to initialize API Key Manager:', error);
});

module.exports = apiKeyManager;
