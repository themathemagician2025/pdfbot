const fs = require('fs');
const path = require('path');

// List of emojis for command reactions
const commandEmojis = [
    // Original emojis
    '👍', '❤️', '😂', '😮', '😢', '🙏', '👏', '🔥', '🎉', '🤔', '🤣', '😍', '🤯', '👀', '💯',
    // Additional emojis
    '😊', '😎', '😴', '😡', '😇', '😈', '🤩', '😳', '😜', '😪',
    '🙌', '🤝', '✌️', '👌', '👊', '🤗', '🤓', '😬', '😷', '🥳',
    '🐶', '🐱', '🐻', '🦁', '🐼', '🐨', '🐵', '🦒', '🦊', '🐝',
    '🌟', '✨', '⚡️', '💥', '☀️', '🌈', '☁️', '❄️', '🌊', '🌸',
    '🍎', '🍕', '🍦', '🍔', '🍟', '☕', '🍷', '🍺', '🍽️', '🍫',
    '💻', '📱', '🎮', '🎸', '🎤', '🎥', '📷', '✈️', '🚗', '🚀',
    '🏀', '⚽', '🎾', '🏈', '⛳', '🎿', '🏄‍♂️', '🏊‍♀️', '🚴', '🏋️‍♂️',
    '💰', '💎', '🎁', '🎄', '🎃', '🎂', '🎈', '🏆', '🥇', '📚',
    '✍️', '🔍', '⚙️', '🔧', '💡', '🔒', '🔔', '📢', '⏰', '🗳️'
];

// Path for storing auto-reaction state
const USER_GROUP_DATA = path.join(__dirname, '../data/userGroupData.json');

// Load auto-reaction state from file
function loadAutoReactionState() {
    try {
        if (fs.existsSync(USER_GROUP_DATA)) {
            const data = JSON.parse(fs.readFileSync(USER_GROUP_DATA));
            return data.autoReaction || false;
        }
    } catch (error) {
        console.error('Error loading auto-reaction state:', error);
    }
    return false;
}

// Save auto-reaction state to file
function saveAutoReactionState(state) {
    try {
        const data = fs.existsSync(USER_GROUP_DATA) 
            ? JSON.parse(fs.readFileSync(USER_GROUP_DATA))
            : { groups: [], chatbot: {} };
        
        data.autoReaction = state;
        fs.writeFileSync(USER_GROUP_DATA, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('Error saving auto-reaction state:', error);
    }
}

// Store auto-reaction state
let isAutoReactionEnabled = loadAutoReactionState();

function getRandomEmoji() {
    const randomIndex = Math.floor(Math.random() * commandEmojis.length);
    return commandEmojis[randomIndex];
}

// Function to add a reaction to any message
async function addReaction(sock, message, isCommand = false) {
    try {
        // Basic validation
        if (!isAutoReactionEnabled || !message?.key?.id || !sock) return false;
        
        // Skip if it's a reaction message itself to prevent loops
        if (message.message?.reactionMessage) return false;
        
        // Skip if we don't have a valid remoteJid
        if (!message.key.remoteJid) return false;
        
        const isGroup = message.key.remoteJid.endsWith('@g.us');
        
        // Skip group messages if configured to only react to commands in groups
        if (isGroup && isCommand === false && config?.reactions?.groupsOnlyCommands) {
            return false;
        }
        
        // Skip if it's a media message and we're not explicitly handling it
        const hasMedia = message.message?.imageMessage || 
                        message.message?.videoMessage ||
                        message.message?.audioMessage ||
                        message.message?.documentMessage;
                        
        if (hasMedia && !config?.reactions?.reactToMedia) {
            return false;
        }
        
        // Get a random emoji (can be filtered based on message content if needed)
        const emoji = getRandomEmoji();
        
        // Add a small delay to make it feel more natural
        await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 1000));
        
        await sock.sendMessage(message.key.remoteJid, {
            react: {
                text: emoji,
                key: message.key
            }
        });
        return true;
    } catch (error) {
        console.error('Error adding reaction:', error);
        return false;
    }
}

// Alias for backward compatibility
const addCommandReaction = addReaction;

// Function to handle areact command
async function handleAreactCommand(sock, chatId, message, isOwner) {
    try {
        if (!isOwner) {
            await sock.sendMessage(chatId, { 
                text: '❌ This command is only available for the owner!',
                quoted: message
            });
            return;
        }

        const args = message.message?.conversation?.split(' ') || [];
        const action = args[1]?.toLowerCase();

        if (action === 'on') {
            isAutoReactionEnabled = true;
            saveAutoReactionState(true);
            await sock.sendMessage(chatId, { 
                text: '✅ Auto-reactions have been enabled globally',
                quoted: message
            });
        } else if (action === 'off') {
            isAutoReactionEnabled = false;
            saveAutoReactionState(false);
            await sock.sendMessage(chatId, { 
                text: '✅ Auto-reactions have been disabled globally',
                quoted: message
            });
        } else {
            const currentState = isAutoReactionEnabled ? 'enabled' : 'disabled';
            await sock.sendMessage(chatId, { 
                text: `Auto-reactions are currently ${currentState} globally.\n\nUse:\n.areact on - Enable auto-reactions\n.areact off - Disable auto-reactions`,
                quoted: message
            });
        }
    } catch (error) {
        console.error('Error handling areact command:', error);
        await sock.sendMessage(chatId, { 
            text: '❌ Error controlling auto-reactions',
            quoted: message
        });
    }
}

// Default configuration
const defaultConfig = {
    reactions: {
        enabled: true,
        groupsOnlyCommands: true, // If true, only react to commands in groups (not regular messages)
        randomChance: 0.99, // 30% chance to react to non-command messages
        minDelay: 500, // Minimum delay before reacting (ms)
        maxDelay: 2000, // Maximum delay before reacting (ms)
        reactToMedia: true // Whether to react to media messages (images, videos, etc.)
    }
};

let config = { ...defaultConfig };

// Initialize with custom config
function initReactions(customConfig = {}) {
    config = { ...defaultConfig, ...customConfig };
    return {
        addReaction,
        addCommandReaction,
        handleAreactCommand,
        isAutoReactionEnabled: () => isAutoReactionEnabled,
        setConfig: (newConfig) => {
            config = { ...config, ...newConfig };
            return config;
        }
    };
}

module.exports = initReactions; 