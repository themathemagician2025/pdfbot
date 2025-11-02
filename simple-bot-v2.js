// Simple Bot v2 - Minimal WhatsApp bot with error handling

// Basic error handling
process.on('uncaughtException', (error) => {
    console.error('UNCAUGHT EXCEPTION:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason) => {
    console.error('UNHANDLED REJECTION:', reason);
    process.exit(1);
});

// Load environment variables
require('dotenv').config();

async function startSimpleBot() {
    console.log('=== STARTING SIMPLE BOT v2 ===');
    
    try {
        // 1. Import required modules
        console.log('1. Importing modules...');
        const { makeWASocket, useMultiFileAuthState } = await import('@whiskeysockets/baileys');
        const pino = require('pino');
        const path = require('path');
        
        // 2. Set up logging
        console.log('2. Setting up logging...');
        const logger = pino({ level: 'debug' });
        
        // 3. Initialize auth state
        console.log('3. Initializing auth state...');
        const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
        
        // 4. Create socket connection
        console.log('4. Creating socket connection...');
        const sock = makeWASocket({
            logger: pino({ level: 'silent' }), // Disable Baileys logging
            printQRInTerminal: true,
            auth: {
                creds: state.creds,
                keys: state.keys,
            },
        });
        
        // 5. Set up event handlers
        console.log('5. Setting up event handlers...');
        
        // Handle credentials update
        sock.ev.on('creds.update', saveCreds);
        
        // Handle connection updates
        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect } = update;
            console.log('Connection update:', connection);
            
            if (connection === 'close') {
                const shouldReconnect = (lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut);
                console.log('Connection closed. Reconnecting:', shouldReconnect);
                if (shouldReconnect) {
                    startSimpleBot();
                }
            } else if (connection === 'open') {
                console.log('Connected to WhatsApp!');
            }
        });
        
        // Handle incoming messages
        sock.ev.on('messages.upsert', async (m) => {
            try {
                const message = m.messages[0];
                if (!message.message) return;
                
                const text = message.message.conversation || '';
                console.log('Received message:', text);
                
                // Echo back the message
                if (text) {
                    await sock.sendMessage(message.key.remoteJid, { 
                        text: `You said: ${text}` 
                    });
                }
            } catch (error) {
                console.error('Error processing message:', error);
            }
        });
        
        console.log('=== BOT IS RUNNING ===');
        console.log('Scan the QR code to connect...');
        
    } catch (error) {
        console.error('FATAL ERROR:', error);
        process.exit(1);
    }
}

// Start the bot
startSimpleBot().catch(console.error);
