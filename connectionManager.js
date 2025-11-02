const EventEmitter = require('events');
const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const logger = require('./utils/logger');
const monitoringConfig = require('../config/monitoring');
const path = require('path');
const fs = require('fs-extra');
const { v4: uuidv4 } = require('uuid');

class ConnectionManager extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.options = {
            authDir: path.join(__dirname, '..', 'auth'),
            printQRInTerminal: true,
            browser: ['AI Bot', 'Chrome', '1.0.0'],
            ...options
        };
        
        this.socket = null;
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = monitoringConfig.monitoring.maxConnectionRetries;
        this.reconnectDelay = monitoringConfig.monitoring.retryBackoff;
        this.connectionCheckInterval = null;
        this.sessionId = uuidv4();
        this.pendingMessages = new Map();
        
        // Ensure auth directory exists
        fs.ensureDirSync(this.options.authDir);
        
        // Bind methods
        this.initialize = this.initialize.bind(this);
        this.connect = this.connect.bind(this);
        this.disconnect = this.disconnect.bind(this);
        this.handleConnectionUpdate = this.handleConnectionUpdate.bind(this);
        this.handleReconnect = this.handleReconnect.bind(this);
        this.startConnectionMonitor = this.startConnectionMonitor.bind(this);
        this.stopConnectionMonitor = this.stopConnectionMonitor.bind(this);
        this.cleanupStaleSessions = this.cleanupStaleSessions.bind(this);
    }
    
    async initialize() {
        try {
            logger.info('Initializing connection manager...');
            await this.cleanupStaleSessions();
            await this.connect();
            this.startConnectionMonitor();
            return this.socket;
        } catch (error) {
            logger.error('Failed to initialize connection manager:', error);
            throw error;
        }
    }
    
    async connect() {
        try {
            logger.info('Connecting to WhatsApp...');
            
            // Load authentication state
            const { state, saveCreds } = await useMultiFileAuthState(this.options.authDir);
            
            // Create socket
            this.socket = makeWASocket({
                printQRInTerminal: this.options.printQRInTerminal,
                auth: {
                    creds: state.creds,
                    keys: state.keys,
                },
                browser: this.options.browser,
                generateHighQualityLinkPreview: true,
                syncFullHistory: false,
                markOnlineOnConnect: true,
                logger: logger,
                shouldIgnoreJid: (jid) => false,
                shouldSyncHistoryMessage: () => false,
                retryRequestDelayMs: 1000,
                connectTimeoutMs: 30000,
                keepAliveIntervalMs: 25000,
            });
            
            // Set up event handlers
            this.socket.ev.on('connection.update', this.handleConnectionUpdate);
            this.socket.ev.on('creds.update', saveCreds);
            
            // Handle incoming messages
            this.socket.ev.on('messages.upsert', (data) => {
                this.emit('message', data);
            });
            
            // Handle connection close
            this.socket.ev.on('connection.close', (close) => {
                logger.warn('Connection closed', { close });
                this.isConnected = false;
                this.emit('disconnected', close);
                this.handleReconnect();
            });
            
            logger.info('WhatsApp connection established');
            this.isConnected = true;
            this.reconnectAttempts = 0;
            this.emit('connected');
            
            return this.socket;
            
        } catch (error) {
            logger.error('Failed to connect to WhatsApp:', error);
            this.isConnected = false;
            this.emit('error', error);
            this.handleReconnect();
            throw error;
        }
    }
    
    async disconnect() {
        try {
            logger.info('Disconnecting from WhatsApp...');
            this.stopConnectionMonitor();
            
            if (this.socket) {
                await this.socket.ws.close();
                this.socket = null;
            }
            
            this.isConnected = false;
            this.emit('disconnected');
            logger.info('Successfully disconnected from WhatsApp');
            
        } catch (error) {
            logger.error('Error disconnecting from WhatsApp:', error);
            throw error;
        }
    }
    
    async handleConnectionUpdate(update) {
        const { connection, lastDisconnect, qr, isNewLogin } = update;
        
        logger.debug('Connection update:', { 
            connection, 
            isNewLogin,
            qr: qr ? 'QR received' : 'No QR'
        });
        
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut);
            
            if (shouldReconnect) {
                logger.warn('Connection closed, attempting to reconnect...');
                this.handleReconnect();
            } else {
                logger.error('Connection closed. Please log in again.');
                this.emit('auth_failure');
            }
            
            this.isConnected = false;
            this.emit('disconnected', { lastDisconnect });
            
        } else if (connection === 'open') {
            logger.info('Successfully connected to WhatsApp');
            this.isConnected = true;
            this.reconnectAttempts = 0;
            this.emit('connected');
        }
        
        if (qr) {
            this.emit('qr', qr);
        }
    }
    
    async handleReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            logger.error(`Max reconnection attempts (${this.maxReconnectAttempts}) reached. Giving up.`);
            this.emit('reconnect_failed');
            return;
        }
        
        this.reconnectAttempts++;
        const delay = Math.min(
            this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
            60000 // Max 1 minute
        );
        
        logger.warn(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts}) in ${delay}ms...`);
        
        setTimeout(async () => {
            try {
                await this.connect();
            } catch (error) {
                logger.error('Reconnection attempt failed:', error);
                this.handleReconnect();
            }
        }, delay);
    }
    
    startConnectionMonitor() {
        this.stopConnectionMonitor();
        
        this.connectionCheckInterval = setInterval(() => {
            if (!this.isConnected) {
                logger.warn('Connection check: Not connected, attempting to reconnect...');
                this.handleReconnect();
                return;
            }
            
            // Check if socket is still alive
            if (this.socket && this.socket.ws) {
                const isAlive = this.socket.ws.readyState === 1; // 1 = OPEN
                
                if (!isAlive) {
                    logger.warn('Connection check: Socket not alive, reconnecting...');
                    this.isConnected = false;
                    this.handleReconnect();
                } else {
                    logger.debug('Connection check: Healthy');
                }
            } else {
                logger.warn('Connection check: Socket not initialized');
                this.isConnected = false;
                this.handleReconnect();
            }
        }, monitoringConfig.monitoring.healthCheckInterval);
    }
    
    stopConnectionMonitor() {
        if (this.connectionCheckInterval) {
            clearInterval(this.connectionCheckInterval);
            this.connectionCheckInterval = null;
        }
    }
    
    async cleanupStaleSessions() {
        try {
            logger.info('Cleaning up stale sessions...');
            const authDir = this.options.authDir;
            const authFiles = await fs.readdir(authDir);
            const now = Date.now();
            
            for (const file of authFiles) {
                const filePath = path.join(authDir, file);
                const stats = await fs.stat(filePath);
                const fileAge = now - stats.mtimeMs;
                const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
                
                if (fileAge > maxAge) {
                    logger.info(`Removing stale session file: ${file}`);
                    await fs.remove(filePath);
                }
            }
            
            logger.info('Session cleanup completed');
        } catch (error) {
            logger.error('Error cleaning up stale sessions:', error);
        }
    }
    
    async sendMessage(jid, content, options = {}) {
        if (!this.isConnected || !this.socket) {
            throw new Error('Not connected to WhatsApp');
        }
        
        const messageId = uuidv4();
        const timer = logger.startTimer('sendMessage');
        
        try {
            const message = await this.socket.sendMessage(jid, content, {
                quoted: options.quoted,
                ephemeralExpiration: options.ephemeralExpiration,
                ...options
            });
            
            timer.end({ messageId, status: 'success' });
            return message;
            
        } catch (error) {
            const errorContext = {
                messageId,
                jid,
                error: error.message,
                code: error.code,
                stack: error.stack
            };
            
            logger.error('Failed to send message', errorContext);
            timer.end({ ...errorContext, status: 'error' });
            
            // If it's a connection error, trigger reconnection
            if (['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT'].includes(error.code)) {
                this.isConnected = false;
                this.handleReconnect();
            }
            
            throw error;
        }
    }
}

module.exports = ConnectionManager;
