/**
 * Test script for Node.js to Python bridge communication
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Configure logging
const logFile = 'bridge_test.log';
const logStream = fs.createWriteStream(logFile, { flags: 'w' });

function log(message, isError = false) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}\n`;
    
    // Write to console
    if (isError) {
        console.error(logMessage.trim());
    } else {
        console.log(logMessage.trim());
    }
    
    // Write to log file
    logStream.write(logMessage);
}

// Path to the Python bridge script
const bridgeScript = path.join(__dirname, 'selfrewritingmodel', 'knightbot_bridge.py');

// Test message to send to the bridge
const testMessage = {
    text: "Hello, this is a test message from Node.js",
    context: {
        userId: "test_user_123",
        sessionId: "test_session_456",
        timestamp: new Date().toISOString()
    }
};

log(`Starting bridge test at ${new Date().toISOString()}`);
log(`Node.js version: ${process.version}`);
log(`Python bridge script: ${bridgeScript}`);
log(`Working directory: ${process.cwd()}`);
log("Test message: " + JSON.stringify(testMessage, null, 2));

// Check if the bridge script exists
if (!fs.existsSync(bridgeScript)) {
    log(`❌ Error: Bridge script not found at ${bridgeScript}`, true);
    log(`Current directory contents: ${fs.readdirSync('.')}`, true);
    process.exit(1);
}

log("\n=== Starting Python Process ===");
log(`Command: python ${bridgeScript}`);

// Spawn the Python process with full path to Python executable
const pythonProcess = spawn('python', [bridgeScript], {
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: true
});

// Log process events
pythonProcess.on('error', (err) => {
    log(`❌ Error spawning Python process: ${err.stack || err}`, true);
    process.exit(1);
});

pythonProcess.on('exit', (code, signal) => {
    if (code === 0) {
        log(`✅ Python process exited successfully with code ${code}`);
    } else {
        log(`❌ Python process exited with code ${code} and signal ${signal}`, true);
    }
    process.exit(code || 0);
});

// Handle stdout data from Python
let stdoutBuffer = '';
pythonProcess.stdout.on('data', (data) => {
    const str = data.toString();
    stdoutBuffer += str;
    
    // Try to parse complete JSON objects
    const lines = stdoutBuffer.split('\n');
    for (let i = 0; i < lines.length - 1; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        try {
            const response = JSON.parse(line);
            log("\n✅ Received valid JSON response from Python:");
            log(JSON.stringify(response, null, 2));
        } catch (e) {
            log(`⚠️  Received non-JSON output: ${line}`);
        }
    }
    
    // Keep the last (possibly incomplete) line in the buffer
    stdoutBuffer = lines[lines.length - 1];
});

// Handle stderr from Python
pythonProcess.stderr.on('data', (data) => {
    const str = data.toString().trim();
    if (str) {
        log(`Python stderr: ${str}`, true);
    }
});

// Send test message to Python
setTimeout(() => {
    const messageStr = JSON.stringify(testMessage);
    log(`\n=== Sending test message to Python ===`);
    log(`Message: ${messageStr}`);
    
    pythonProcess.stdin.write(messageStr + '\n', (err) => {
        if (err) {
            log(`❌ Error writing to Python process: ${err}`, true);
        } else {
            log("✅ Message sent successfully");
        }
    });
    
    // Set a timeout to close the process if no response is received
    setTimeout(() => {
        log("\n❌ Timeout waiting for response from Python", true);
        if (!pythonProcess.killed) {
            pythonProcess.kill();
        }
    }, 15000); // 15 second timeout
}, 1000); // Wait 1 second before sending the message

// Handle script termination
process.on('SIGINT', () => {
    log("\nReceived SIGINT. Shutting down...");
    if (!pythonProcess.killed) {
        pythonProcess.kill();
    }
    process.exit(0);
});

// Log unhandled errors
process.on('uncaughtException', (err) => {
    log(`❌ Uncaught exception: ${err.stack || err}`, true);
    if (!pythonProcess.killed) {
        pythonProcess.kill();
    }
    process.exit(1);
});
