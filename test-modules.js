/**
 * Module Test Script
 * Tests that all required modules can be loaded
 */

console.log('🧪 Testing module imports...\n');

const modules = [
    { name: 'PDF Command', path: './killerC/commands/pdf' },
    { name: 'Donate Command', path: './killerC/commands/donate' },
    { name: 'Persona Command', path: './killerC/commands/persona' },
    { name: 'AntiDelete Command', path: './killerC/commands/antidelete' },
    { name: 'Message Handler', path: './killerC/handlers/messageHandler' },
    { name: 'Main Handler', path: './killerC/main' },
];

let passed = 0;
let failed = 0;

for (const module of modules) {
    try {
        require(module.path);
        console.log(`✅ ${module.name}: OK`);
        passed++;
    } catch (error) {
        console.log(`❌ ${module.name}: FAILED`);
        console.log(`   Error: ${error.message}\n`);
        failed++;
    }
}

console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);

if (failed === 0) {
    console.log('✅ All modules loaded successfully!');
    process.exit(0);
} else {
    console.log('❌ Some modules failed to load. Check errors above.');
    process.exit(1);
}
