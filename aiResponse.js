const axios = require('axios');
const { default: makeWASocket } = require('@whiskeysockets/baileys');
const fs = require('fs');
const path = require('path');
const ollamaConfig = require('../config/ollama');
const logger = require('./logger');
const memoryManager = require('../memory');

class AIResponseHandler {
    constructor(config = {}) {
        // Merge default config with provided config
        this.config = {
            baseUrl: ollamaConfig.baseUrl,
            model: ollamaConfig.models.default,
            systemPrompt: ollamaConfig.systemPrompts?.default || 'You are a helpful AI assistant.',
            ...ollamaConfig.generation,
            ...config
        };
        
        this.messageHistory = new Map(); // Store conversation history by chat ID
        this.maxHistory = ollamaConfig.memory?.maxHistory || 20;
        this.maxRetries = ollamaConfig.api?.maxRetries || 3;
        this.retryDelay = ollamaConfig.api?.retryDelay || 1000;
        this.logDir = path.join(__dirname, '..', 'logs');
        this.logFile = path.join(this.logDir, 'ai_errors.log');
        
        // Ensure log directory exists
        if (!fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir, { recursive: true });
        }
    }

    /**
     * Make an API request with automatic retry and key rotation
     * @private
     */
    async _makeRequest(url, data, options = {}) {
        let lastError;
        
        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                logger.debug(`Making request to ${url} (attempt ${attempt}/${this.maxRetries})`, {
                    model: data?.model,
                    promptLength: data?.prompt?.length
                });
                
                const response = await axios({
                    method: 'post',
                    url,
                    headers: {
                        'Content-Type': 'application/json',
                        ...options.headers
                    },
                    data,
                    timeout: options.timeout || this.config.timeout || 120000, // 2 minutes default
                    ...options
                });
                
                logger.debug(`Request successful (status: ${response.status})`, {
                    status: response.status,
                    statusText: response.statusText,
                    dataLength: JSON.stringify(response.data)?.length
                });
                
                return response;
                
            } catch (error) {
                lastError = error;
                const errorDetails = {
                    attempt,
                    status: error.response?.status,
                    statusText: error.response?.statusText,
                    message: error.message,
                    url: error.config?.url,
                    data: error.response?.data
                };
                
                logger.error(`API request attempt ${attempt} failed:`, errorDetails);
                
                // If it's a client error (4xx) that's not a 429, don't retry
                const isClientError = error.response?.status >= 400 && error.response?.status < 500;
                if (isClientError && error.response?.status !== 429) {
                    logger.error('Client error, not retrying:', errorDetails);
                    break;
                }
                
                // If we're out of retries, break
                if (attempt >= this.maxRetries) {
                    logger.error('Max retries reached, giving up');
                    break;
                }
                
                // Wait before retrying with exponential backoff
                const delay = this.retryDelay * Math.pow(2, attempt - 1);
                logger.warn(`Retrying in ${delay}ms... (attempt ${attempt + 1}/${this.maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
        
        // If we get here, all retries failed
        let errorMessage = 'Failed to make API request';
        
        if (lastError?.response?.data?.error) {
            errorMessage = lastError.response.data.error;
        } else if (lastError?.response?.data) {
            errorMessage = JSON.stringify(lastError.response.data);
        } else if (lastError?.message) {
            errorMessage = lastError.message;
        }
        
        const error = new Error(errorMessage);
        error.originalError = lastError;
        error.status = lastError?.response?.status;
        
        throw error;
    }

    /**
     * Generate a response using the configured AI model
     * @param {string} message - The user's message
     * @param {string} chatId - The chat ID for maintaining conversation history
     * @returns {Promise<string>} - The generated response
     */
    async generateResponse(message, chatId, userId, isGroup = false) {
        try {
            // Store the user's message in memory
            await memoryManager.storeMessage({
                userId,
                chatId,
                content: message,
                isGroup,
                metadata: {
                    isCommand: message.startsWith('.')
                }
            });

            // Get conversation context (last 10 messages)
            const context = await memoryManager.getConversationContext(chatId, 10);
            
            // Prepare the conversation context for the AI
            const messages = [
                { 
                    role: 'system', 
                    content: this.config.systemPrompt + (isGroup ? 
                        '\nYou are in a group chat. Keep responses concise and relevant to the conversation.' :
                        '\nYou are in a private chat. Provide detailed and helpful responses.')
                },
                ...context.map(msg => ({
                    role: msg.userId === userId ? 'user' : 'assistant',
                    content: msg.content
                }))
            ];

            // Prepare the prompt from messages (simplified for Ollama)
            const prompt = messages.map(msg => {
                return `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`;
            }).join('\n') + '\nAssistant:';
            
            // Log the prompt for debugging
            logger.debug('Sending prompt to Ollama:', { prompt: prompt.substring(0, 100) + '...' });
            
            // Make the API request to Ollama with simplified parameters
            const response = await this._makeRequest(
                `${this.config.baseUrl}/api/generate`,
                {
                    model: this.config.model,
                    prompt: prompt,
                    stream: false,
                    temperature: this.config.temperature || 0.7,
                    top_p: this.config.topP || 0.9,
                    num_predict: this.config.maxTokens || 1000
                },
                {
                    headers: { 'Content-Type': 'application/json' },
                    timeout: this.config.timeout || 120000 // 2 minutes timeout
                }
            );
            
            let aiResponse = "I'm sorry, I couldn't generate a response at the moment.";
            
            // Handle different response formats from Ollama
            if (response.data) {
                if (response.data.response) {
                    aiResponse = response.data.response.trim();
                } else if (response.data.choices && response.data.choices[0]?.message?.content) {
                    aiResponse = response.data.choices[0].message.content.trim();
                } else if (response.data.text) {
                    aiResponse = response.data.text.trim();
                } else {
                    logger.warn('Unexpected response format from Ollama:', JSON.stringify(response.data));
                }
                
                // Store the AI's response in memory
                await memoryManager.storeMessage({
                    userId: 'assistant',
                    chatId,
                    content: aiResponse,
                    isGroup,
                    metadata: {
                        isResponse: true
                    }
                });
            }
            
            return aiResponse;
            
        } catch (error) {
            // Store error in memory
            await memoryManager.storeMessage({
                userId: 'system',
                chatId,
                content: `Error: ${error.message}`,
                isGroup: false,
                metadata: {
                    isError: true,
                    stack: error.stack
                }
            });
            
            logger.error('❌ Error generating AI response:', {
                statusText: error.response?.statusText,
                data: error.response?.data,
                config: {
                    url: error.config?.url,
                    method: error.config?.method,
                    timeout: error.config?.timeout,
                    data: error.config?.data
                }
            });
            
            let errorMessage = "I encountered an error while processing your request. ";
            
            // Add more specific error messages based on the error type
            if (error.code === 'ECONNREFUSED') {
                errorMessage += "The AI service is currently unavailable. Please check if the Ollama server is running.";
            } else if (error.response?.status === 404) {
                errorMessage += "The requested model or endpoint was not found. Please check your configuration.";
            } else if (error.response?.status === 429) {
                errorMessage += "Too many requests. Please try again later.";
            } else if (error.message?.includes('timeout')) {
                errorMessage += "The request timed out. The AI service might be under heavy load.";
            } else {
                errorMessage += `(Error: ${error.message || 'Unknown error'})`;
            }
            
            return errorMessage;
        }
    }
    
    /**
     * Handle an incoming message and generate a response
     * @param {Object} sock - The WhatsApp socket
     * @param {Object} message - The incoming message object
     * @param {string} chatId - The chat ID
     * @param {string} userId - The user ID
     * @param {boolean} isGroup - Whether the message is from a group
     */
    async handleIncomingMessage(sock, message, chatId, userId, isGroup = false) {
        let messageText = '';
        
        try {
            // Extract message text from different message types
            messageText = message.message?.conversation || 
                         message.message?.extendedTextMessage?.text || 
                         message.message?.imageMessage?.caption ||
                         message.message?.videoMessage?.caption ||
                         '';

            if (!messageText.trim()) {
                logger.debug('Empty message received, skipping');
                return; // Skip empty messages
            }

            logger.info(`Processing message from ${userId} in ${isGroup ? 'group' : 'DM'} ${chatId}`);
            
            // Generate response using the AI model with memory context
            const response = await this.generateResponse(messageText, chatId, userId, isGroup);

            if (response) {
                logger.debug('Sending response to chat', { chatId, responseLength: response.length });
                
                // Check if the socket is still connected
                if (!sock?.user?.id) {
                    throw new Error('WhatsApp connection lost. Please restart the bot.');
                }
                
                // Send the response back to the chat
                await sock.sendMessage(chatId, { 
                    text: response,
                    quoted: message // Quote the original message
                });
                
                logger.debug('Response sent successfully');
            }
        } catch (error) {
            const errorDetails = {
                timestamp: new Date().toISOString(),
                error: error.message,
                stack: error.stack,
                chatId,
                userId,
                isGroup,
                message: messageText.substring(0, 100) + (messageText.length > 100 ? '...' : '')
            };
            
            logger.error('❌ Error handling incoming message:', errorDetails);
            
            // Try to send error message to user if the error is not related to the connection
            if (!error.message.includes('Connection Closed') && !error.message.includes('connection lost')) {
                try {
                    let errorMessage = "❌ An error occurred while processing your message. ";

                    if (error.message.includes('timeout')) {
                        errorMessage += "The request timed out. The AI service might be under heavy load.";
                    } else if (error.message.includes('ECONNREFUSED')) {
                        errorMessage += "The AI service is currently unavailable. Please check if the Ollama server is running.";
                    } else if (error.message.includes('500')) {
                        errorMessage += "The AI service encountered an internal error. Please try again later.";
                    } else if (error.message) {
                        errorMessage += `(Error: ${error.message})`;
                    }

                    await sock.sendMessage(chatId, { 
                        text: errorMessage,
                        quoted: message
                    });
                } catch (sendError) {
                    logger.error('❌ Failed to send error message:', {
                        error: sendError.message,
                        originalError: error.message
                    });
                }
            } else {
                logger.error('Connection error, not sending error message to user to prevent spam');
            }

            // Log to file
            try {
                if (!fs.existsSync(this.logDir)) {
                    fs.mkdirSync(this.logDir, { recursive: true });
                }
                
                fs.appendFileSync(
                    this.logFile, 
                    `[${errorDetails.timestamp}] ${JSON.stringify(errorDetails, null, 2)}\n\n`,
                    'utf8'
                );
            } catch (logError) {
                console.error('❌ Failed to write to error log:', logError);
            }
            
            // Re-throw connection-related errors to trigger reconnection
            if (error.message.includes('Connection Closed') || 
                error.message.includes('connection lost') ||
                error.message.includes('ECONN')) {
                throw error;
            }
        }
    }

    /**
     * Clear conversation history for a chat
     * @param {string} chatId - The chat ID to clear history for
     * @returns {boolean} - True if history was cleared, false if no history existed
     */
    clearHistory(chatId) {
        if (this.messageHistory.has(chatId)) {
            this.messageHistory.delete(chatId);
            return true;
        }
        return false;
    }
}

// Create a singleton instance
const aiResponseHandler = new AIResponseHandler();

module.exports = aiResponseHandler;
