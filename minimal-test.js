// Minimal test to identify the root cause
console.log('=== MINIMAL TEST STARTING ===');

// Test 1: Basic console output
console.log('Test 1: Basic console output - PASSED');

// Test 2: Basic require
console.log('\nTest 2: Requiring core modules...');
try {
    const fs = require('fs');
    const path = require('path');
    console.log('  Core modules required successfully');
    console.log('  Current directory:', process.cwd());
    console.log('  Directory contents:', fs.readdirSync('.').join(', '));
    console.log('✅ Test 2: PASSED');
} catch (error) {
    console.error('❌ Test 2: FAILED -', error.message);
    process.exit(1);
}

// Test 3: Require local file
console.log('\nTest 3: Requiring local file...');
try {
    const config = require('./src/config');
    console.log('  Local config loaded successfully');
    console.log('  Config:', JSON.stringify(config, null, 2));
    console.log('✅ Test 3: PASSED');
} catch (error) {
    console.error('❌ Test 3: FAILED -', error.message);
    // Don't exit, continue to next test
}

// Test 4: Require Baileys
console.log('\nTest 4: Requiring Baileys...');
try {
    const baileys = require('@whiskeysockets/baileys');
    console.log('  Baileys loaded successfully');
    console.log('  Available exports:', Object.keys(baileys).join(', '));
    console.log('✅ Test 4: PASSED');
} catch (error) {
    console.error('❌ Test 4: FAILED -', error.message);
    console.error('  Error stack:', error.stack);
    process.exit(1);
}

console.log('\n=== ALL TESTS COMPLETED ===');
