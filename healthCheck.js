const os = require('os');
const fs = require('fs');
const { exec } = require('child_process');
const util = require('util');
const logger = require('../utils/logger');
const monitoringConfig = require('../../config/monitoring');

const execPromise = util.promisify(exec);

class HealthCheckService {
    constructor() {
        this.checks = [];
        this.metrics = {
            cpu: { current: 0, threshold: monitoringConfig.monitoring.thresholds.cpu },
            memory: { current: 0, threshold: monitoringConfig.monitoring.thresholds.memory },
            disk: { current: 0, threshold: 0.9 }, // 90% disk usage threshold
            queue: { current: 0, threshold: monitoringConfig.monitoring.thresholds.queue },
            uptime: 0,
            lastCheck: null,
            status: 'healthy',
            errors: []
        };
        
        // Register default health checks
        this.registerCheck('System CPU Usage', this.checkCpuUsage.bind(this));
        this.registerCheck('System Memory Usage', this.checkMemoryUsage.bind(this));
        this.registerCheck('Disk Space', this.checkDiskSpace.bind(this));
    }
    
    /**
     * Register a new health check
     * @param {string} name - Name of the health check
     * @param {Function} checkFn - Async function that returns a boolean indicating health status
     */
    registerCheck(name, checkFn) {
        this.checks.push({ name, check: checkFn });
    }
    
    /**
     * Run all health checks
     */
    async runChecks() {
        this.metrics.lastCheck = new Date().toISOString();
        this.metrics.status = 'healthy';
        this.metrics.errors = [];
        
        const results = await Promise.all(
            this.checks.map(async ({ name, check }) => {
                try {
                    const result = await check();
                    if (!result.healthy) {
                        this.metrics.errors.push({
                            check: name,
                            error: result.message || 'Check failed',
                            timestamp: new Date().toISOString()
                        });
                        return false;
                    }
                    return true;
                } catch (error) {
                    this.metrics.errors.push({
                        check: name,
                        error: error.message,
                        stack: error.stack,
                        timestamp: new Date().toISOString()
                    });
                    return false;
                }
            })
        );
        
        // Update overall status
        if (this.metrics.errors.length > 0) {
            this.metrics.status = 'degraded';
            
            // If critical errors, mark as unhealthy
            const criticalErrors = this.metrics.errors.filter(e => 
                e.check.includes('CPU') || 
                e.check.includes('Memory') || 
                e.check.includes('Disk')
            );
            
            if (criticalErrors.length > 0) {
                this.metrics.status = 'unhealthy';
            }
        }
        
        // Log status
        if (this.metrics.status !== 'healthy') {
            logger.warn(`Health check completed with status: ${this.metrics.status}`, {
                errors: this.metrics.errors,
                metrics: this.getMetrics()
            });
        } else {
            logger.debug('Health check completed successfully', {
                metrics: this.getMetrics()
            });
        }
        
        return this.getStatus();
    }
    
    /**
     * Get current health status
     */
    getStatus() {
        return {
            status: this.metrics.status,
            timestamp: this.metrics.lastCheck,
            metrics: this.getMetrics(),
            errors: this.metrics.errors
        };
    }
    
    /**
     * Get current metrics
     */
    getMetrics() {
        return {
            cpu: this.metrics.cpu,
            memory: this.metrics.memory,
            disk: this.metrics.disk,
            queue: this.metrics.queue,
            uptime: process.uptime(),
            timestamp: new Date().toISOString()
        };
    }
    
    /**
     * Check CPU usage
     */
    async checkCpuUsage() {
        try {
            // Get CPU usage percentage
            const cpus = os.cpus();
            const totalIdle = cpus.reduce((acc, cpu) => acc + cpu.times.idle, 0);
            const totalTick = cpus.reduce((acc, cpu) => {
                return acc + Object.values(cpu.times).reduce((a, b) => a + b, 0);
            }, 0);
            
            const idle = totalIdle / cpus.length;
            const total = totalTick / cpus.length;
            let usage = 100 - (100 * idle / total);
            
            // Update metrics
            this.metrics.cpu.current = parseFloat(usage.toFixed(2));
            
            // Check against threshold
            if (this.metrics.cpu.current > this.metrics.cpu.threshold * 100) {
                return {
                    healthy: false,
                    message: `High CPU usage: ${this.metrics.cpu.current}%`
                };
            }
            
            return { healthy: true };
        } catch (error) {
            logger.error('Error checking CPU usage:', error);
            return {
                healthy: false,
                message: `Failed to check CPU usage: ${error.message}`
            };
        }
    }
    
    /**
     * Check memory usage
     */
    async checkMemoryUsage() {
        try {
            const totalMem = os.totalmem();
            const freeMem = os.freemem();
            const usedMem = totalMem - freeMem;
            const usage = (usedMem / totalMem) * 100;
            
            // Update metrics
            this.metrics.memory.current = parseFloat(usage.toFixed(2));
            
            // Convert to human-readable format
            const formatMemory = (bytes) => {
                const units = ['B', 'KB', 'MB', 'GB', 'TB'];
                let size = bytes;
                let unitIndex = 0;
                
                while (size >= 1024 && unitIndex < units.length - 1) {
                    size /= 1024;
                    unitIndex++;
                }
                
                return `${size.toFixed(2)} ${units[unitIndex]}`;
            };
            
            this.metrics.memory.details = {
                total: formatMemory(totalMem),
                used: formatMemory(usedMem),
                free: formatMemory(freeMem),
                usage: `${this.metrics.memory.current}%`
            };
            
            // Check against threshold
            if (this.metrics.memory.current > this.metrics.memory.threshold * 100) {
                return {
                    healthy: false,
                    message: `High memory usage: ${this.metrics.memory.current}%`
                };
            }
            
            return { healthy: true };
        } catch (error) {
            logger.error('Error checking memory usage:', error);
            return {
                healthy: false,
                message: `Failed to check memory usage: ${error.message}`
            };
        }
    }
    
    /**
     * Check disk space
     */
    async checkDiskSpace() {
        try {
            // Check root directory by default
            const path = process.cwd();
            const stats = await fs.promises.statfs(path);
            
            const total = stats.blocks * stats.bsize;
            const available = stats.bfree * stats.bsize;
            const used = total - available;
            const usage = (used / total) * 100;
            
            // Update metrics
            this.metrics.disk.current = parseFloat(usage.toFixed(2));
            
            // Convert to human-readable format
            const formatBytes = (bytes) => {
                const units = ['B', 'KB', 'MB', 'GB', 'TB'];
                let size = bytes;
                let unitIndex = 0;
                
                while (size >= 1024 && unitIndex < units.length - 1) {
                    size /= 1024;
                    unitIndex++;
                }
                
                return `${size.toFixed(2)} ${units[unitIndex]}`;
            };
            
            this.metrics.disk.details = {
                path,
                total: formatBytes(total),
                used: formatBytes(used),
                available: formatBytes(available),
                usage: `${this.metrics.disk.current}%`
            };
            
            // Check against threshold
            if (this.metrics.disk.current > this.metrics.disk.threshold * 100) {
                return {
                    healthy: false,
                    message: `High disk usage (${path}): ${this.metrics.disk.current}%`
                };
            }
            
            return { healthy: true };
        } catch (error) {
            logger.error('Error checking disk space:', error);
            return {
                healthy: false,
                message: `Failed to check disk space: ${error.message}`
            };
        }
    }
    
    /**
     * Start periodic health checks
     * @param {number} interval - Check interval in milliseconds
     */
    start(interval = monitoringConfig.monitoring.healthCheckInterval) {
        logger.info(`Starting health checks every ${interval}ms`);
        
        // Run initial check
        this.runChecks().catch(error => {
            logger.error('Initial health check failed:', error);
        });
        
        // Set up periodic checks
        this.intervalId = setInterval(() => {
            this.runChecks().catch(error => {
                logger.error('Periodic health check failed:', error);
            });
        }, interval);
        
        return this.intervalId;
    }
    
    /**
     * Stop periodic health checks
     */
    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            logger.info('Stopped health checks');
        }
    }
}

// Create a singleton instance
const healthCheckService = new HealthCheckService();

module.exports = healthCheckService;
