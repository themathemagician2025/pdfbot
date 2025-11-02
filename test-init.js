// Minimal test script to verify basic functionality
console.log('=== STARTING MINIMAL TEST ===');

// Test 1: Basic Node.js functionality
try {
    console.log('Test 1: Basic Node.js functionality...');
    console.log('Node.js version:', process.version);
    console.log('Current directory:', process.cwd());
    console.log('✅ Test 1 passed');
} catch (error) {
    console.error('❌ Test 1 failed:', error);
    process.exit(1);
}

// Test 2: Core module imports
try {
    console.log('\nTest 2: Core module imports...');
    const fs = require('fs');
    const path = require('path');
    console.log('Core modules imported successfully');
    console.log('✅ Test 2 passed');
} catch (error) {
    console.error('❌ Test 2 failed:', error);
    process.exit(1);
}

// Test 3: Third-party module imports
try {
    console.log('\nTest 3: Third-party module imports...');
    const chalk = require('chalk');
    console.log('Chalk version:', chalk.version);
    console.log('✅ Test 3 passed');
} catch (error) {
    console.error('❌ Test 3 failed:', error);
    process.exit(1);
}

// Test 4: Local module imports
try {
    console.log('\nTest 4: Local module imports...');
    const config = require('./src/config');
    console.log('Config loaded successfully');
    console.log('✅ Test 4 passed');
} catch (error) {
    console.error('❌ Test 4 failed:', error);
    process.exit(1);
}

// Test 5: Environment variables
try {
    console.log('\nTest 5: Environment variables...');
    require('dotenv').config();
    console.log('NODE_ENV:', process.env.NODE_ENV || 'Not set');
    console.log('✅ Test 5 passed');
} catch (error) {
    console.error('❌ Test 5 failed:', error);
    process.exit(1);
}

console.log('\n=== ALL TESTS COMPLETED SUCCESSFULLY ===');
