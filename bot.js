// Core Dependencies
const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@adiwajshing/baileys-md');
const logger = require('./utils/logger');
const personaManager = require('./persona/manager');
const memoryManager = require('./memory');
const { memoryMiddleware } = require('./middleware/memoryMiddleware');

class KnightBot {
    constructor() {
        this.sock = null;
        this.commands = new Map();
        this.commandAliases = new Map();
        this.initialized = false;
    }

    async initialize() {
        if (this.initialized) return;
        
        try {
            // Initialize core systems
            await this.loadCommands();
            await memoryManager.initialize();
            await personaManager.initialize();
            
            // Connect to WhatsApp
            await this.connectToWhatsApp();
            
            this.initialized = true;
            logger.info('✅ KnightBot initialized successfully');
        } catch (error) {
            logger.error('❌ Failed to initialize KnightBot:', error);
            throw error;
        }
    }

    async loadCommands() {
        const commandFiles = ['help', 'ping', 'memory'].map(cmd => `${cmd}.js`);
        
        for (const file of commandFiles) {
            try {
                const command = require(`./commands/${file}`);
                this.commands.set(command.name, command);
                
                if (command.aliases) {
                    command.aliases.forEach(alias => {
                        this.commandAliases.set(alias, command.name);
                    });
                }
            } catch (error) {
                logger.error(`Error loading command ${file}:`, error);
            }
        }
    }

    getCommand(name) {
        return this.commands.get(name) || this.commands.get(this.commandAliases.get(name));
    }

    async connectToWhatsApp() {
        const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
        
        this.sock = makeWASocket({
            printQRInTerminal: true,
            auth: {
                creds: state.creds,
                keys: {},
            },
        });

        this.setupEventHandlers(saveCreds);
    }

    setupEventHandlers(saveCreds) {
        const { sock } = this;
        
        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            if (qr) {
                require('qrcode-terminal').generate(qr, { small: true });
            }
            
            if (connection === 'close') {
                const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
                if (shouldReconnect) this.connectToWhatsApp();
            } else if (connection === 'open') {
                logger.info('Connected to WhatsApp');
            }
        });

        sock.ev.on('creds.update', saveCreds);
        
        sock.ev.on('messages.upsert', async ({ messages, type }) => {
            if (type !== 'notify') return;
            
            for (const msg of messages) {
                await this.handleMessage(msg);
            }
        });
    }

    async handleMessage(msg) {
        if (!msg.message) return;
        
        const chat = msg.key.remoteJid;
        const text = this.extractText(msg.message);
        if (!text) return;

        // Apply memory middleware
        await memoryMiddleware(this.sock, { ...msg, body: text, chat }, async () => {
            // Process commands
            if (text.startsWith('/')) {
                await this.handleCommand(text, msg);
            }
            
            // Process AI responses
            const activePersona = personaManager.getActivePersona();
            if (activePersona && this.shouldRespondToMessage(text, activePersona)) {
                await this.generateAIReply(text, msg, activePersona);
            }
        });
    }

    async handleCommand(text, msg) {
        const args = text.slice(1).trim().split(/\s+/);
        const cmd = args.shift().toLowerCase();
        const command = this.getCommand(cmd);
        
        if (command) {
            try {
                await command.execute(this.sock, msg, args, { memoryManager, personaManager });
            } catch (error) {
                logger.error('Command execution error:', error);
                await this.sock.sendMessage(msg.key.remoteJid, { 
                    text: '❌ An error occurred while executing the command.' 
                });
            }
        }
    }

    async generateAIReply(text, msg, persona) {
        try {
            // Enhanced response generation would go here
            const response = `*${persona.name} says:*\n\nI'm still learning how to respond to that.`;
            
            await this.sock.sendMessage(msg.key.remoteJid, { 
                text: response,
                quoted: msg
            });
        } catch (error) {
            logger.error('AI response error:', error);
        }
    }

    extractText(message) {
        return (
            message.conversation ||
            (message.extendedTextMessage && message.extendedTextMessage.text) ||
            ''
        ).trim();
    }

    shouldRespondToMessage(text, persona) {
        const name = persona.name.toLowerCase();
        const textLower = text.toLowerCase();
        return (
            textLower.startsWith(name) ||
            textLower.includes(`@${name}`) ||
            textLower.includes(`${name},`) ||
            textLower.endsWith(`?`) && Math.random() > 0.5
        );
    }
}

// Initialize and start the bot
const bot = new KnightBot();
bot.initialize().catch(error => {
    logger.error('Fatal error in KnightBot:', error);
    process.exit(1);
});

// Handle graceful shutdown
process.on('SIGINT', async () => {
    logger.info('Shutting down KnightBot...');
    process.exit(0);
});
