const axios = require('axios');

// Ollama configuration
const config = {
	// Base URL for Ollama API (default: http://localhost:11434)
	baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
	
	// Model configuration
	models: {
    default: process.env.OLLAMA_MODEL || 'llava:7b',
		embedding: process.env.OLLAMA_EMBEDDING_MODEL || 'nomic-embed-text'
	},
	
	// System prompts
	systemPrompts: {
		default: 'You are a helpful AI assistant.'
	},
	
	// Generation parameters
	generation: {
		temperature: parseFloat(process.env.OLLAMA_TEMPERATURE) || 0.7,
		topP: parseFloat(process.env.OLLAMA_TOP_P) || 0.9,
		maxTokens: parseInt(process.env.OLLAMA_MAX_TOKENS) || 1000,
		timeout: parseInt(process.env.OLLAMA_TIMEOUT) || 120000 // 2 minutes
	},
	
	// Memory settings
	memory: {
		maxHistory: parseInt(process.env.OLLAMA_MAX_HISTORY) || 20
	},
	
	// API settings
	api: {
		maxRetries: parseInt(process.env.OLLAMA_MAX_RETRIES) || 3,
		retryDelay: parseInt(process.env.OLLAMA_RETRY_DELAY) || 1000
	}
};

/**
 * Verify if a model is available in Ollama
 * @param {string} modelName - The name of the model to verify
 * @returns {Promise<boolean>} - True if model is available, false otherwise
 */
async function verifyModel(modelName) {
	try {
		const response = await axios.get(`${config.baseUrl}/api/tags`, {
			timeout: 5000
		});
		const models = response.data?.models || [];
		return models.some(model => 
			model.name === modelName || 
			model.name.startsWith(modelName + ':') ||
			model.name === modelName
		);
	} catch (error) {
		console.warn(`⚠️  Failed to verify model ${modelName}:`, error.message);
		return false;
	}
}

/**
 * Check if Ollama server is running
 * @returns {Promise<boolean>}
 */
async function isServerRunning() {
	try {
		const response = await axios.get(`${config.baseUrl}/api/tags`, {
			timeout: 5000
		});
		return response.status === 200;
	} catch (error) {
		return false;
	}
}

module.exports = {
	...config,
	verifyModel,
	isServerRunning
};

