const personaManager = require('../persona/manager');
const logger = require('../utils/logger');

module.exports = {
    name: 'persona',
    aliases: ['role', 'character'],
    description: 'Manage and switch between different AI personas',
    category: 'System',
    usage: '/persona [list|set|create|delete] [name]',

    async execute(sock, message, args) {
        const [action, ...rest] = args;
        const name = rest.join(' ');
        const chat = message.key.remoteJid;
        const isAdmin = message.key.participant === message.key.remoteJid;

        try {
            switch (action) {
                case 'list':
                    await this.listPersonas(sock, chat);
                    break;

                case 'set':
                    if (!name) {
                        return await sock.sendMessage(chat, {
                            text: 'Please specify a persona name. Use /persona list to see available personas.'
                        });
                    }
                    await this.setPersona(sock, chat, name);
                    break;

                case 'create':
                    if (!isAdmin) {
                        return await sock.sendMessage(chat, {
                            text: '❌ Only admins can create personas.'
                        });
                    }
                    await this.createPersona(sock, chat, rest.join(' '));
                    break;

                case 'delete':
                    if (!isAdmin) {
                        return await sock.sendMessage(chat, {
                            text: '❌ Only admins can delete personas.'
                        });
                    }
                    if (!name) {
                        return await sock.sendMessage(chat, {
                            text: 'Please specify a persona name to delete.'
                        });
                    }
                    await this.deletePersona(sock, chat, name);
                    break;

                default:
                    await this.showHelp(sock, chat);
            }
        } catch (error) {
            logger.error('Persona command error:', error);
            await sock.sendMessage(chat, {
                text: '❌ An error occurred while processing your request.'
            });
        }
    },

    async listPersonas(sock, chat) {
        const personas = personaManager.getAllPersonas();
        const activePersona = personaManager.getActivePersona();

        if (personas.length === 0) {
            return await sock.sendMessage(chat, {
                text: 'No personas available. Using default settings.'
            });
        }

        const personaList = personas.map(p =>
            `${p.isActive ? '⭐ ' : '  '}*${p.name}* (${p.model})\n   ${p.description}`
        ).join('\n\n');

        await sock.sendMessage(chat, {
            text: `🧑‍🎭 *Available Personas*\n\n${personaList}\n\n` +
                `Current persona: *${activePersona?.name || 'Default'}*\n` +
                `Use /persona set <name> to switch personas.`
        });
    },

    async setPersona(sock, chat, name) {
        const success = personaManager.setActivePersona(name.toLowerCase());
        const persona = personaManager.getPersona(name.toLowerCase());

        if (success && persona) {
            await sock.sendMessage(chat, {
                text: `🎭 *Persona Activated*\n\n` +
                    `*${persona.name}* is now active.\n\n` +
                    `_${persona.personality.tone}_\n` +
                    `Model: ${persona.model || 'Default'}\n` +
                    `\n${this.getRandomGreeting(persona)}`
            });
        } else {
            await sock.sendMessage(chat, {
                text: `❌ Persona "${name}" not found. Use /persona list to see available personas.`
            });
        }
    },

    async createPersona(sock, chat, input) {
        try {
            // This is a simplified version - in a real implementation, you'd want a more robust way to create personas
            await sock.sendMessage(chat, {
                text: 'To create a new persona, please provide the following details in JSON format:\n\n' +
                    '```json\n' +
                    '{\n' +
                    '  "name": "Persona Name",\n' +
                    '  "model": "qwen3:4b",\n' +
                    '  "description": "Brief description of the persona",\n' +
                    '  "personality": {\n' +
                    '    "tone": "descriptive tone",\n' +
                    '    "style": "speaking style",\n' +
                    '    "quirks": ["list", "of", "quirks"]\n' +
                    '  }\n' +
                    '}\n' +
                    '```\n\n' +
                    'Send this as a code block with the command /persona create.'
            });
        } catch (error) {
            logger.error('Error in createPersona:', error);
            throw error;
        }
    },

    async deletePersona(sock, chat, name) {
        try {
            const success = await personaManager.deletePersona(name);
            if (success) {
                await sock.sendMessage(chat, {
                    text: `✅ Persona "${name}" has been deleted.`
                });
            } else {
                await sock.sendMessage(chat, {
                    text: `❌ Could not find persona "${name}" to delete.`
                });
            }
        } catch (error) {
            logger.error('Error deleting persona:', error);
            throw error;
        }
    },

    async showHelp(sock, chat) {
        const helpText = `🧑‍🎭 *Persona Management*\n\n` +
            `*Usage*: /persona <command> [name]\n\n` +
            `*Commands*:\n` +
            `• *list* - Show available personas\n` +
            `• *set* <name> - Switch to a different persona\n` +
            `• *create* - Create a new persona (Admin only)\n` +
            `• *delete* <name> - Delete a persona (Admin only)\n\n` +
            `Example: /persona set mathemagician`;

        await sock.sendMessage(chat, { text: helpText });
    },

    getRandomGreeting(persona) {
        const greetings = [
            `*${persona.name}* is ready to assist you!`,
            `The great *${persona.name}* stands before you!`,
            `*${persona.name}* has entered the chat.`,
            `Channeling the essence of *${persona.name}*...`,
            `*${persona.name}* is now your guide.`
        ];

        return greetings[Math.floor(Math.random() * greetings.length)];
    }
};
