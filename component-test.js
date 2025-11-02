// Component test to identify initialization issues
console.log('=== COMPONENT TEST STARTING ===');

// Basic error handling
process.on('uncaughtException', (error) => {
    console.error('UNCAUGHT EXCEPTION:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason) => {
    console.error('UNHANDLED REJECTION:', reason);
    process.exit(1);
});

async function testComponent(name, testFn) {
    console.log(`\n=== TESTING: ${name} ===`);
    try {
        await testFn();
        console.log(`✅ ${name}: PASSED`);
        return true;
    } catch (error) {
        console.error(`❌ ${name}: FAILED -`, error.message);
        console.error('Error stack:', error.stack);
        return false;
    }
}

async function runTests() {
    // Test 1: Basic Node.js functionality
    await testComponent('Basic Node.js', async () => {
        const fs = require('fs');
        const path = require('path');
        console.log('  Node.js version:', process.version);
        console.log('  Current directory:', process.cwd());
        console.log('  Directory exists:', fs.existsSync('.'));
    });

    // Test 2: Environment variables
    await testComponent('Environment Variables', async () => {
        require('dotenv').config();
        console.log('  NODE_ENV:', process.env.NODE_ENV || 'Not set');
        console.log('  BOT_NAME:', process.env.BOT_NAME || 'Not set');
    });

    // Test 3: Core dependencies
    await testComponent('Core Dependencies', async () => {
        const chalk = require('chalk');
        const pino = require('pino');
        console.log('  Chalk version:', chalk.version);
        console.log('  Pino version:', require('pino/package.json').version);
    });

    // Test 4: Baileys connection
    await testComponent('Baileys Connection', async () => {
        const { makeWASocket, useMultiFileAuthState } = await import('@whiskeysockets/baileys');
        console.log('  Baileys imported successfully');
        
        // Test auth state
        const { state } = await useMultiFileAuthState('auth_info_baileys');
        console.log('  Auth state initialized');
        
        // Create socket with minimal options
        const sock = makeWASocket({
            printQRInTerminal: true,
            auth: {
                creds: state.creds,
                keys: state.keys,
            },
        });
        
        // Close the socket immediately for testing
        await sock.ev.once('connection.update', (update) => {
            console.log('  Connection update:', update.connection);
            if (update.qr) {
                console.log('  QR code received');
            }
        });
        
        // Close after a short delay
        setTimeout(() => {
            console.log('  Test complete, closing connection');
            sock.ws.close();
        }, 5000);
    });

    console.log('\n=== COMPONENT TEST COMPLETE ===');
}

// Run all tests
runTests().catch(console.error);
