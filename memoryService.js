const fs = require('fs');
const path = require('path');

class MemoryService {
    constructor() {
        this.memoryDir = path.join(__dirname, '..', 'data', 'memory');
        this.ensureDirectoryExists();
    }

    ensureDirectoryExists() {
        if (!fs.existsSync(this.memoryDir)) {
            fs.mkdirSync(this.memoryDir, { recursive: true });
        }
    }

    getMemoryPath(chatId) {
        return path.join(this.memoryDir, `${chatId}.json`);
    }

    async loadMemory(chatId) {
        const memoryPath = this.getMemoryPath(chatId);
        try {
            if (fs.existsSync(memoryPath)) {
                const data = await fs.promises.readFile(memoryPath, 'utf8');
                return JSON.parse(data);
            }
        } catch (error) {
            console.error(`[Memory] Error loading memory for ${chatId}:`, error);
        }
        return [];
    }

    async saveMemory(chatId, messages) {
        const memoryPath = this.getMemoryPath(chatId);
        try {
            // Keep only the last 20 messages to prevent memory bloat
            const recentMessages = messages.slice(-20);
            await fs.promises.writeFile(
                memoryPath,
                JSON.stringify(recentMessages, null, 2),
                'utf8'
            );
        } catch (error) {
            console.error(`[Memory] Error saving memory for ${chatId}:`, error);
        }
    }

    async addMessage(chatId, role, content) {
        const messages = await this.loadMemory(chatId);
        messages.push({ role, content, timestamp: new Date().toISOString() });
        await this.saveMemory(chatId, messages);
        return messages;
    }

    async getConversationHistory(chatId, maxMessages = 10) {
        const messages = await this.loadMemory(chatId);
        return messages.slice(-maxMessages);
    }
}

module.exports = new MemoryService();
