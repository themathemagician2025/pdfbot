// Simple bot test file
console.log('=== STARTING SIMPLE BOT TEST ===');

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
console.log('Loading environment variables...');
require('dotenv').config();

// Test basic imports
try {
    console.log('Testing basic imports...');
    const path = require('path');
    const fs = require('fs');
    const chalk = require('chalk');
    console.log(chalk.green('Basic imports successful'));
} catch (error) {
    console.error('Failed to load basic imports:', error);
    process.exit(1);
}

// Test Baileys connection
async function testBaileys() {
    console.log('\nTesting Baileys connection...');
    try {
        const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = await import('@whiskeysockets/baileys');
        console.log('Baileys imported successfully');
        
        // Test auth state
        const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
        console.log('Auth state initialized');
        
        // Create socket
        const sock = makeWASocket({
            printQRInTerminal: true,
            auth: {
                creds: state.creds,
                keys: state.keys,
            },
        });
        
        // Handle connection updates
        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect } = update;
            if (connection === 'close') {
                console.log('Connection closed, reconnecting...');
                testBaileys();
            } else if (connection === 'open') {
                console.log('Connected to WhatsApp!');
                console.log('Bot is ready!');
            }
        });
        
        // Handle credentials update
        sock.ev.on('creds.update', saveCreds);
        
        // Handle incoming messages
        sock.ev.on('messages.upsert', async (m) => {
            console.log('Received message:', JSON.stringify(m, null, 2));
            if (m.messages && m.messages[0]) {
                const message = m.messages[0];
                console.log('Processing message from:', message.key.remoteJid);
                
                // Echo back the message
                if (message.message.conversation) {
                    await sock.sendMessage(message.key.remoteJid, { 
                        text: `You said: ${message.message.conversation}` 
                    });
                }
            }
        });
        
    } catch (error) {
        console.error('Baileys test failed:', error);
        process.exit(1);
    }
}

// Start the test
testBaileks().catch(console.error);
