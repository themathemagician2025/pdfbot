const path = require('path');

module.exports = {
	// Base directory to persist simple JSON memories
	dir: path.join(process.cwd(), 'data', 'memory'),
	// Optional vector store identifier (unused by default implementation)
	vectorStore: 'faiss',
	// Embeddings model hint for future upgrades
	embeddingsModel: process.env.OLLAMA_MODEL || 'nomic-embed-text'
};



