// lib/userOnboarding.js
// Sends helpful welcome/guide messages to users on first contact

const fs = require('fs');
const path = require('path');
const personaService = require('../server/lib/personaService');

const DATA_DIR = path.join(__dirname, '..', 'data');
const SEEN_USERS_FILE = path.join(DATA_DIR, 'seen_users.json');

function ensureSeenFile() {
	if (!fs.existsSync(DATA_DIR)) {
		fs.mkdirSync(DATA_DIR, { recursive: true });
	}
	if (!fs.existsSync(SEEN_USERS_FILE)) {
		fs.writeFileSync(SEEN_USERS_FILE, '{}', 'utf8');
	}
}

function hasSeenUser(phone) {
	ensureSeenFile();
	try {
		const seen = JSON.parse(fs.readFileSync(SEEN_USERS_FILE, 'utf8'));
		return !!seen[phone];
	} catch (e) {
		return false;
	}
}

function markUserSeen(phone) {
	ensureSeenFile();
	try {
		const seen = JSON.parse(fs.readFileSync(SEEN_USERS_FILE, 'utf8'));
		seen[phone] = { firstSeen: new Date().toISOString() };
		fs.writeFileSync(SEEN_USERS_FILE, JSON.stringify(seen, null, 2), 'utf8');
	} catch (e) {
		console.warn('[onboarding] failed to mark seen', e.message);
	}
}

async function sendWelcomeGuide(sock, chatId, phone) {
	if (hasSeenUser(phone)) {
		return false; // already seen
	}
	markUserSeen(phone);

	const guide = `✨ *Welcome to THE MATHEMAGICIAN* ✨\n\n` +
		`I'm your intelligent assistant for accessing books, solving problems, and more.\n\n` +
		`📚 *Core Commands:*\n` +
		`• \`.pdf\` - List available PDF books\n` +
		`• \`.pdf <filename>\` - Download a specific book\n` +
		`• \`.help\` or \`.menu\` - Show all commands\n\n` +
		`💳 *Access & Payment:*\n` +
		`• \`.pay\` - Get payment instructions ($7/week)\n` +
		`• \`.status\` - Check your subscription status\n` +
		`• \`/trial\` - Start a 1-hour free trial\n\n` +
		`🧑‍🎭 *Persona Modes:*\n` +
		`• \`.persona list\` - See available AI personas\n` +
		`• \`.persona set <name>\` - Switch persona (mathemagician, pro, enhanced)\n\n` +
		`💡 *Tip:* Just type your question normally and I'll help you. Or use \`.help\` anytime!\n\n` +
		`_Getting started: Try \`.pdf\` to browse our library!_`;

	try {
		const framed = await personaService.frameMessage(phone, guide);
		await sock.sendMessage(chatId, { text: framed });
		return true;
	} catch (e) {
		// Fallback without persona framing
		await sock.sendMessage(chatId, { text: guide });
		return true;
	}
}

module.exports = { hasSeenUser, markUserSeen, sendWelcomeGuide };


