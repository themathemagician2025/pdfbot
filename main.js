const settings = require('./settings');
require('./config.js');
const { isBanned } = require('./lib/isBanned');
const fs = require('fs');
const fetch = require('node-fetch');
const path = require('path');
const axios = require('axios');
const { isWelcomeOn, isGoodByeOn } = require('./lib/index');

// PDF command only
const pdfCommand = require('./commands/pdf');
const { handleBadwordDetection } = require('./lib/antibadword');
const { handleMessageRevocation, storeMessage } = require('./commands/antidelete');

// Initialize reactions with default configuration
const initReactions = require('./lib/reactions');
const reactions = initReactions({
    reactions: {
        enabled: true,
        randomChance: 1.0,  // 100% chance to react to every message
        commandEmojis: ['👍', '❤️', '😂', '😮', '😊', '🙏', '👏', '🔥', '🎉', '🤔', '😍', '🤩', '😎', '🤗', '👌', '💯', '✨', '🌟', '🎈', '🎊'],
        groupsOnlyCommands: false,
        minDelay: 100,      // Faster reaction time
        maxDelay: 800,      // Faster reaction time
        alwaysReact: true   // Ensure reactions are always sent
    }
});

// Alias for backward compatibility
const { addReaction } = reactions;

global.packname = settings.packname;
global.author = settings.author;
global.channelLink = "https://whatsapp.com/channel/0029Vb5QCyX2phHT4MEAsq0g";
global.ytch = "The Mathemagician";

let isAutoReactionEnabled = true;

const channelInfo = {
    contextInfo: {
        forwardingScore: 1,
        isForwarded: true,
        forwardedNewsletterMessageInfo: {
            newsletterJid: '120363161513685998@newsletter',
            newsletterName: 'Mathemagician',
            serverMessageId: -1
        }
    }
};

async function handleMessages(sock, messageUpdate, printLog) {
    let message;
    let chatId, senderId, isGroup;

    try {
        if (!sock || !messageUpdate) {
            console.error('❌ Invalid parameters in handleMessages');
            return;
        }

        const { messages, type } = messageUpdate || {};
        if (type !== 'notify' || !Array.isArray(messages) || messages.length === 0) {
            return;
        }

        message = messages[0];
        if (!message?.key?.id || !message?.message) {
            console.log('Skipping invalid message: No key ID or message content');
            return;
        }

        // Skip reaction messages to avoid undefined errors
        if (message.message?.reactionMessage) {
            console.log('Skipping reaction message');
            return;
        }

        const m = require('./lib/myfunc').smsg(sock, message, sock.store);
        chatId = m.key.remoteJid;
        senderId = m.key.participant || m.key.remoteJid;
        isGroup = chatId.endsWith('@g.us');

        // Send welcome guide to new users (private chat only)
        if (!isGroup && senderId) {
            try {
                const { sendWelcomeGuide, hasSeenUser } = require('./lib/userOnboarding');
                const phone = senderId.replace(/:.*$/, '').replace(/@s\.whatsapp\.net|@whatsapp\.net/g, '');
                if (!hasSeenUser(phone)) {
                    await sendWelcomeGuide(sock, chatId, phone);
                }
            } catch (e) {
                console.warn('[main] onboarding check failed', e.message);
            }
        }

        if (message.message) {
            storeMessage(message);
        }

        const messageContent = m.text ||
            m.message?.conversation ||
            m.message?.extendedTextMessage?.text ||
            m.message?.imageMessage?.caption ||
            m.message?.videoMessage?.caption ||
            '';

        const isCommand = messageContent.trim().startsWith('.');

        // Auto-react to non-command messages
        if (!isCommand) {
            try {
                await reactions.addReaction(sock, m, isCommand);
            } catch (error) {
                console.error('Error adding reaction:', error);
            }
        }

        // Skip AI responses entirely (commands only)

        if (m.message?.protocolMessage?.type === 0) {
            await handleMessageRevocation(sock, m);
            return;
        }

        const userMessage = (
            m.message?.conversation?.trim() ||
            m.message?.extendedTextMessage?.text?.trim() ||
            m.message?.imageMessage?.caption?.trim() ||
            m.message?.videoMessage?.caption?.trim() ||
            ''
        ).toLowerCase().replace(/\.\\s+/g, '.').trim();

        const rawText = m.message?.conversation?.trim() ||
            m.message?.extendedTextMessage?.text?.trim() ||
            m.message?.imageMessage?.caption?.trim() ||
            m.message?.videoMessage?.caption?.trim() ||
            '';

        if (userMessage.startsWith('.')) {
            const command = userMessage.split(' ')[0].toLowerCase();
            console.log(`📝 Command used in ${isGroup ? 'group' : 'private'}: ${command}`);

            const commandResponse = async (text, options = {}) => {
                const { isError = false, showCommand = true } = options;
                const header = isError ? '❌ *Command Error* ❌' : '🔹 *Command Response* 🔹';
                const commandInfo = showCommand ? `\n\n_Executing: ${command}_` : '';
                const helpHint = '\n_Type .help for a list of available commands_\n';

                const response = `${header}\n\n${text}${commandInfo}${helpHint}`;
                await sock.sendMessage(chatId, {
                    text: response,
                    ...(options.quoted ? { quoted: m } : {})
                });
                return true;
            };

            m.commandResponse = commandResponse;

            if (command === '.help' || command === '.menu') {
                await showHelpMenu(sock, chatId, m);
                return;
            } else if (command === '.donate') {
                await donateHandler.execute(sock, m, []);
                return;
            }
        } else if (userMessage.trim() !== '') {
            const mathemagicianResponse = async (text, options = {}) => {
                const { isThinking = false } = options;
                const header = isThinking ? '🔍 *Mathemagician is thinking...*' : '✨ *Mathemagician Mode* ✨';
                const helpHint = '\n\n_Type .help to see available commands_\n';

                const response = `${header}\n\n${text}${helpHint}`;
                await sock.sendMessage(chatId, {
                    text: response,
                    ...(options.quoted ? { quoted: m } : {})
                });
                return true;
            };

            m.mathemagicianResponse = mathemagicianResponse;
            m.defaultResponse = mathemagicianResponse;

            await mathemagicianResponse('Analyzing your message...', { isThinking: true });
        }

        // Banned check disabled: allow all users

        if (isGroup && userMessage) {
            await handleBadwordDetection(sock, chatId, m, userMessage, senderId);
        }

        // Removed Ollama AI processing; keep commands-only flow

        // Handle PDF command
        if (userMessage.startsWith('.pdf') || rawText.toLowerCase().startsWith('/pdf') || rawText.toLowerCase().trim().startsWith('pdf')) {
            await pdfCommand(sock, chatId, m, rawText);
            return;
        }

        if (!userMessage.startsWith('.')) {
            if (isGroup) {
                await handleBadwordDetection(sock, chatId, m, userMessage, senderId);
            }
            return;
        }
    } catch (error) {
        console.error('❌ Error in message handler:', error.message);
        console.error('Error stack:', error.stack);

        const errorChatId = chatId || (message?.key?.remoteJid || message?.key?.participant || null);

        if (errorChatId && sock && typeof sock.sendMessage === 'function') {
            try {
                await sock.sendMessage(errorChatId, {
                    text: '❌ An error occurred while processing your message. Please try again later.',
                    ...channelInfo
                });
            } catch (sendError) {
                console.error('❌ Failed to send error message:', sendError.message);
            }
        }
    }
}

async function handleGroupParticipantUpdate(sock, update) {
    try {
        const { id, participants, action } = update;

        if (!id.endsWith('@g.us')) return;

        if (action === 'add') {
            const isWelcomeEnabled = await isWelcomeOn(id);
            if (!isWelcomeEnabled) return;

            const groupMetadata = await sock.groupMetadata(id);
            const groupName = groupMetadata.subject;
            const groupDesc = groupMetadata.desc || 'No description available';

            const data = JSON.parse(fs.readFileSync('./data/userGroupData.json'));
            const welcomeData = data.welcome[id];
            const welcomeMessage = welcomeData?.message || 'Welcome {user} to the group! 🎉';
            const channelId = welcomeData?.channelId || '+916308784662';

            for (const participant of participants) {
                const user = participant.split('@')[0];
                const formattedMessage = welcomeMessage
                    .replace('{user}', `@${user}`)
                    .replace('{group}', groupName)
                    .replace('{description}', groupDesc);

                await sock.sendMessage(id, {
                    text: formattedMessage,
                    mentions: [participant],
                    contextInfo: {
                        forwardingScore: 1,
                        isForwarded: true,
                        forwardedNewsletterMessageInfo: {
                            newsletterJid: channelId,
                            newsletterName: 'KnightBot MD',
                            serverMessageId: -1
                        }
                    }
                });
            }
        }

        if (action === 'remove') {
            const isGoodbyeEnabled = await isGoodByeOn(id);
            if (!isGoodbyeEnabled) return;

            const groupMetadata = await sock.groupMetadata(id);
            const groupName = groupMetadata.subject;

            const data = JSON.parse(fs.readFileSync('./data/userGroupData.json'));
            const goodbyeData = data.goodbye[id];
            const goodbyeMessage = goodbyeData?.message || 'Goodbye {user} 👋';
            const channelId = goodbyeData?.channelId || '+916308784662';

            for (const participant of participants) {
                const user = participant.split('@')[0];
                const formattedMessage = goodbyeMessage
                    .replace('{user}', `@${user}`)
                    .replace('{group}', groupName);

                await sock.sendMessage(id, {
                    text: formattedMessage,
                    mentions: [participant],
                    contextInfo: {
                        forwardingScore: 1,
                        isForwarded: true,
                        forwardedNewsletterMessageInfo: {
                            newsletterJid: channelId,
                            newsletterName: 'KnightBot MD',
                            serverMessageId: -1
                        }
                    }
                });
            }
        }
    } catch (error) {
        console.error('Error in handleGroupParticipantUpdate:', error);
    }
}

async function showHelpMenu(sock, chatId, message) {
    const helpText = `✨ *THE MATHEMAGICIAN — Library usage* ✨

*📚 Core Features:*

🔹 *PDF Library*
\`.pdf\` - List available books
\`.pdf filename\` - Download a specific book
Example: \`.pdf fluid mechanics\`

🔹 *Access & Donations*
\`.donate\` - Donation instructions and how to submit proof (screenshot + details)  
\`.status\` - Check your access status  
\`/trial\` - Start a 1 month free trial (first time only)

🔹 *Commands*
\`.help\` or \`.menu\` - Show this guide


*⏱ Working hours (bot will reply only during these windows):*
• 🇮🇳 IST: 20:00 — 05:00  
• 🇿🇼 CAT: 16:30 — 01:30  
• 🇺🇸 EST: 10:30 — 19:30

*💡 How to Use:*

1️⃣ *Browse Books:* Type \`.pdf\` to see the library.  
2️⃣ *Get Access:* Use \`/trial\` to start a 1 month trial (first time) or follow \`.donate\` to contribute.  
3️⃣ *Submit Proof:* After donating, upload the payment screenshot and reply with the transaction details: \`TXN ID\`, \`Amount\`, \`Payer Phone\`.  
4️⃣ *Wait for Verification:* Verification typically takes ~30 minutes — please be patient.

*🎁 Donation Rewards:*

After your first donation is verified, you'll unlock:
🎉 *Lifetime Access* — Full access to all PDFs

After the trial ends, premium access continues at *$10/month*

*✨ Premium Benefits:*

⚡ *Unlimited Access* – Full, unrestricted access to the entire PDF library with no time limits.
📚 *Exclusive Content* – Priority access to premium or newly added PDFs before free users.
🕒 *Permanent Membership* – Skip the 1-month trial limit and enjoy lifetime reading access.
🚀 *Faster Response Speeds* – Donors get priority in the processing queue for instant replies.
🔒 *Session Memory* – Your reading history and favorites are remembered between sessions.
💬 *Direct Support Line* – Donors can message the admin or bot directly for custom requests.
🌍 *Offline Downloads* – Ability to download PDFs for offline reading.
💎 *Zero Ads or Delays* – Completely ad-free experience; no waiting time for commands.
🧠 *Smart Recommendations* – Personalized book suggestions based on reading patterns.
❤️ *Community Contribution* – Donations keep the bot alive, improving the library and maintaining servers.

*📞 Donation Details:*
• EcoCash: *+263772804180---Name:Beauty Dziwomore* 

*Note:* THE MATHEMAGICIAN speaks plainly and precisely. Donations keep the library running and unlock premium features.`;

    await sock.sendMessage(chatId, { text: helpText, quoted: message });
}

const donateHandler = require('./commands/donate');

module.exports = {
    handleMessages,
    handleGroupParticipantUpdate,
    handleStatus,
    showHelpMenu,
    donateHandler
};

// No-op status handler to ignore status@broadcast updates
async function handleStatus(sock, update) {
    try {
        // Intentionally do nothing for status updates in commands-only mode
        return;
    } catch (e) {
        console.warn('[main] handleStatus error', e.message);
    }
}

module.exports = {
    handleMessages,
    handleGroupParticipantUpdate,
    handleStatus
};