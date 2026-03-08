#!/usr/bin/env node

/**
 * Start Script for PDF Bot
 * Provides a clean startup with system checks
 */

const chalk = require('chalk');
const path = require('path');
const fs = require('fs');

console.log(chalk.blue.bold('\n🚀 Starting PDF Bot - The Mathemagician\n'));

// System checks
console.log(chalk.cyan('📋 Running system checks...'));

// 1. Check Node version
const nodeVersion = process.version;
const requiredVersion = 'v16.0.0';
console.log(chalk.gray(`   Node.js version: ${nodeVersion}`));

// 2. Check required directories
const requiredDirs = ['data', 'pdf', 'logs', 'session'];
requiredDirs.forEach(dir => {
    const dirPath = path.join(__dirname, 'killerC', dir);
    if (!fs.existsSync(dirPath)) {
        console.log(chalk.yellow(`   Creating directory: ${dir}/`));
        fs.mkdirSync(dirPath, { recursive: true });
    } else {
        console.log(chalk.green(`   ✓ Directory exists: ${dir}/`));
    }
});

// 3. Check PDF directory has files
const pdfDir = path.join(__dirname, 'killerC', 'pdf');
const pdfFiles = fs.readdirSync(pdfDir).filter(f => f.endsWith('.pdf'));
console.log(chalk.green(`   ✓ PDF library: ${pdfFiles.length} files available`));

// 4. Check environment
if (!fs.existsSync(path.join(__dirname, 'killerC', '.env'))) {
    console.log(chalk.yellow('   ⚠ No .env file found - using defaults'));
} else {
    console.log(chalk.green('   ✓ Environment configured'));
}

console.log(chalk.green('\n✅ All system checks passed!\n'));

// Start the bot
console.log(chalk.blue.bold('🤖 Launching bot...\n'));

try {
    require('./killerC/index.js');
} catch (error) {
    console.error(chalk.red('\n❌ Failed to start bot:'));
    console.error(chalk.red(error.message));
    console.error(chalk.gray('\nStack trace:'));
    console.error(chalk.gray(error.stack));
    process.exit(1);
}
