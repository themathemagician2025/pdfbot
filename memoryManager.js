const os = require('os');
const logger = require('./logger');
const monitoringConfig = require('../../config/monitoring');

class MemoryManager {
    constructor() {
        this.monitorInterval = null;
        this.lowMemoryThreshold = monitoringConfig.memory?.lowMemoryThreshold || 0.85; // 85% usage
        this.checkInterval = monitoringConfig.memory?.checkInterval || 30000; // 30 seconds
        this.maxMemoryUsage = monitoringConfig.memory?.maxMemoryUsage || 0.95; // 95% max
        this.minFreeMemoryMB = monitoringConfig.memory?.minFreeMemory || 200; // 200MB min free
        this.gcEnabled = typeof global.gc === 'function';
    }

    /**
     * Get current memory usage statistics
     */
    getMemoryUsage() {
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const usedMem = totalMem - freeMem;
        const usage = usedMem / totalMem;

        return {
            total: this.formatBytes(totalMem),
            used: this.formatBytes(usedMem),
            free: this.formatBytes(freeMem),
            freeMB: freeMem / (1024 * 1024),
            usage: parseFloat((usage * 100).toFixed(2)),
            isCritical: usage > this.lowMemoryThreshold,
            isOverLimit: usage > this.maxMemoryUsage
        };
    }

    /**
     * Format bytes to human-readable format
     */
    formatBytes(bytes, decimals = 2) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }

    /**
     * Check if there's enough memory available
     */
    hasEnoughMemory(requiredMB = 0) {
        const mem = this.getMemoryUsage();
        const hasEnough = mem.freeMB >= Math.max(requiredMB, this.minFreeMemoryMB);
        
        return {
            hasEnough,
            available: mem.freeMB,
            required: Math.max(requiredMB, this.minFreeMemoryMB),
            usage: mem.usage,
            isCritical: mem.isCritical
        };
    }

    /**
     * Attempt to free up memory
     */
    freeUpMemory(force = false) {
        const memBefore = this.getMemoryUsage();
        
        try {
            logger.warn('Attempting to free up memory...', {
                before: `${memBefore.usage}% used (${memBefore.free} free)`
            });

            // 1. Clear Node.js module cache (except for critical modules)
            const clearedModules = this.clearModuleCache();
            
            // 2. Run garbage collection if available
            const freedByGC = this.runGarbageCollection();
            
            // 3. Clear any large caches if they exist
            this.clearApplicationCaches();
            
            const memAfter = this.getMemoryUsage();
            const freedMB = (memAfter.freeMB - memBefore.freeMB).toFixed(2);
            
            logger.info('Memory cleanup completed', {
                before: `${memBefore.usage}% used (${memBefore.free} free)`,
                after: `${memAfter.usage}% used (${memAfter.free} free)`,
                freed: `${freedMB}MB`,
                clearedModules,
                freedByGC: this.formatBytes(freedByGC || 0)
            });
            
            return {
                success: true,
                freed: freedMB,
                memory: memAfter
            };
            
        } catch (error) {
            logger.error('Error freeing up memory:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Clear Node.js module cache
     */
    clearModuleCache() {
        try {
            const cache = require.cache;
            let cleared = 0;
            
            // Don't clear these modules
            const keepModules = [
                'internal/process',
                'internal/modules',
                'internal/bootstrap',
                'vm',
                'fs',
                'path'
            ];
            
            Object.keys(cache).forEach(modulePath => {
                // Don't clear core modules or node_modules
                if (!modulePath.includes('node_modules') && 
                    !keepModules.some(m => modulePath.includes(m))) {
                    delete cache[modulePath];
                    cleared++;
                }
            });
            
            logger.info(`Cleared ${cleared} modules from cache`);
            return cleared;
            
        } catch (error) {
            logger.error('Error clearing module cache:', error);
            return 0;
        }
    }

    /**
     * Run garbage collection if available
     */
    runGarbageCollection() {
        try {
            if (this.gcEnabled) {
                const usedBefore = process.memoryUsage().heapUsed;
                global.gc();
                const usedAfter = process.memoryUsage().heapUsed;
                const freed = usedBefore - usedAfter;
                
                logger.info(`Garbage collection freed ${this.formatBytes(freed)}`);
                return freed;
            } else if (process.env.NODE_ENV === 'development') {
                logger.warn('Garbage collection not enabled. Run with --expose-gc flag');
            }
            return 0;
        } catch (error) {
            logger.error('Error during garbage collection:', error);
            return 0;
        }
    }

    /**
     * Clear application-specific caches
     */
    clearApplicationCaches() {
        try {
            // Clear any require cache for application files
            Object.keys(require.cache).forEach(key => {
                if (key.includes('node_modules')) return;
                delete require.cache[key];
            });

            // Clear any other known caches
            if (global.caches) {
                caches.keys().then(cacheNames => {
                    return Promise.all(cacheNames.map(cacheName => caches.delete(cacheName)));
                }).catch(error => {
                    logger.error('Error clearing caches:', error);
                });
            }
            
            // Clear any other global caches your app might be using
            if (global.someCache) {
                global.someCache.clear();
            }
            
            return true;
        } catch (error) {
            logger.error('Error clearing application caches:', error);
            return false;
        }
    }

    /**
     * Start memory monitoring
     */
    startMonitoring() {
        if (this.monitorInterval) {
            logger.warn('Memory monitoring is already running');
            return;
        }

        logger.info('Starting memory monitoring...');
        this.monitorInterval = setInterval(() => {
            try {
                const mem = this.getMemoryUsage();
                
                if (mem.isOverLimit) {
                    logger.error('CRITICAL: Memory usage over limit!', {
                        usage: `${mem.usage}%`,
                        free: mem.free,
                        total: mem.total
                    });
                    
                    // Take immediate action
                    this.freeUpMemory(true);
                } else if (mem.isCritical) {
                    logger.warn('High memory usage detected', {
                        usage: `${mem.usage}%`,
                        free: mem.free,
                        total: mem.total
                    });
                    
                    // Try to free up memory
                    this.freeUpMemory();
                }
            } catch (error) {
                logger.error('Error in memory monitor:', error);
            }
        }, this.checkInterval);
    }

    /**
     * Stop memory monitoring
     */
    stopMonitoring() {
        if (this.monitorInterval) {
            clearInterval(this.monitorInterval);
            this.monitorInterval = null;
            logger.info('Stopped memory monitoring');
        }
    }
}

// Create a singleton instance
const memoryManager = new MemoryManager();

// Start monitoring automatically in production
if (process.env.NODE_ENV === 'production') {
    memoryManager.startMonitoring();
}

module.exports = memoryManager;
