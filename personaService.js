const fs = require('fs').promises;
const path = require('path');
const { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } = require('fs');
const { promisify } = require('util');
const lockfile = require('proper-lockfile');
const { v4: uuidv4 } = require('uuid');

// Configure logging
const logger = {
  debug: (...args) => process.env.DEBUG && console.debug('[Persona]', ...args),
  info: (...args) => console.log('[Persona]', ...args),
  warn: (...args) => console.warn('[Persona] WARN', ...args),
  error: (...args) => console.error('[Persona] ERROR', ...args)
};

// In-memory cache with TTL (5 minutes)
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

class PersonaService {
  constructor() {
    this.personaDir = path.join(process.cwd(), 'data', 'personas');
    this.defaultPersona = 'mathemagician';
    this.initialized = false;
    this.initializationPromise = this.initialize();
  }

  /**
   * Initialize the service
   * @private
   */
  async initialize() {
    if (this.initialized) return;
    
    try {
      await this.ensureDirectoryExists();
      await this.createDefaultPersonaIfNeeded();
      this.initialized = true;
      logger.info('PersonaService initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize PersonaService:', error);
      throw new Error(`PersonaService initialization failed: ${error.message}`);
    }
  }

  /**
   * Ensure the personas directory exists
   * @private
   */
  async ensureDirectoryExists() {
    try {
      await fs.mkdir(this.personaDir, { recursive: true });
      logger.debug(`Ensured directory exists: ${this.personaDir}`);
    } catch (error) {
      if (error.code !== 'EEXIST') {
        logger.error(`Failed to create directory ${this.personaDir}:`, error);
        throw new Error(`Failed to initialize personas directory: ${error.message}`);
      }
    }
  }

  /**
   * Create default persona if it doesn't exist
   * @private
   */
  async createDefaultPersonaIfNeeded() {
    const defaultPersonaPath = path.join(this.personaDir, 'mathemagician.json');
    
    try {
      await fs.access(defaultPersonaPath);
      logger.debug('Default persona already exists');
      return;
    } catch (error) {
      if (error.code !== 'ENOENT') {
        logger.error('Error checking default persona:', error);
        throw error;
      }
      
      // Default persona doesn't exist, create it
      logger.info('Creating default persona...');
      const defaultPersona = {
        id: 'mathemagician',
        name: 'THE MATHEMAGICIAN',
        description: 'THE MATHEMAGICIAN persona: technical, precise, visionary. Uses intense, clear, and authoritative tone for automation and PDF tasks.',
        systemPrompt: [
          'You are THE MATHEMAGICIAN. Speak with technical precision, intensity, and visionary clarity.',
          'When replying about PDFs or automation, adopt a concise, directive tone focused on correctness and security.',
          'Always prioritize exact, auditable operations and list concrete steps where appropriate.',
          'Avoid vague language; when presenting code or configuration, provide runnable examples and note security implications.',
          'Be professional, intense, and uncompromising in technical correctness.',
          'Do NOT include unnecessary commentary. Use short explanatory bullets for actions and a single-line summary at the top.'
        ].join(' '),
        parameters: {
          temperature: 0.1,
          top_p: 0.9,
          max_tokens: 1500,
          presence_penalty: 0.1,
          frequency_penalty: 0.1
        },
        greeting: 'I am THE MATHEMAGICIAN — precise, uncompromising, and ready to architect your automation. State the task; I will deliver the exact steps.',
        metadata: {
          version: '1.0.0',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          tags: ['pdf', 'automation', 'admin', 'payments'],
          author: 'System',
          isDefault: true
        }
      };

      await this.savePersona(defaultPersona);
      logger.info('Default persona created successfully');
    }
  }

  /**
   * List all available persona IDs
   * @returns {Promise<string[]>} Array of persona IDs
   */
  async listPersonas() {
    await this.ensureInitialized();
    
    try {
      const files = await fs.readdir(this.personaDir);
      return files
        .filter(file => file.endsWith('.json') && !file.startsWith('.'))
        .map(file => path.basename(file, '.json'));
    } catch (error) {
      logger.error('Error listing personas:', error);
      return [this.defaultPersona];
    }
  }

  /**
   * Get a persona by ID with caching
   * @param {string} personaId - The ID of the persona to retrieve
   * @returns {Promise<Object>} The persona object
   */
  async getPersona(personaId) {
    if (!personaId || typeof personaId !== 'string') {
      logger.warn(`Invalid personaId: ${personaId}`);
      return this.getDefaultPersona();
    }

    await this.ensureInitialized();

    // Check cache first
    const cacheKey = `persona_${personaId}`;
    const cached = cache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
      logger.debug(`Cache hit for persona: ${personaId}`);
      return cached.data;
    }

    const personaPath = path.join(this.personaDir, `${personaId}.json`);
    
    try {
      // Use file lock to prevent concurrent reads/writes
      const release = await lockfile.lock(personaPath, { retries: 3 });
      
      try {
        const data = await fs.readFile(personaPath, 'utf8');
        const persona = JSON.parse(data);
        
        // Validate persona structure
        if (!this.validatePersona(persona)) {
          throw new Error(`Invalid persona structure in ${personaId}.json`);
        }

        // Update cache
        cache.set(cacheKey, {
          data: persona,
          timestamp: Date.now()
        });

        logger.debug(`Loaded persona: ${personaId}`);
        return persona;
      } finally {
        await release();
      }
    } catch (error) {
      if (error.code === 'ENOENT') {
        logger.warn(`Persona not found: ${personaId}, falling back to default`);
      } else {
        logger.error(`Error loading persona ${personaId}:`, error);
      }
      return this.getDefaultPersona();
    }
  }

  /**
   * Get the default persona
   * @private
   */
  async getDefaultPersona() {
    try {
      return await this.getPersona(this.defaultPersona);
    } catch (error) {
      logger.error('Failed to load default persona, using fallback', error);
      return {
        id: this.defaultPersona,
        name: 'THE MATHEMAGICIAN',
        systemPrompt: 'You are THE MATHEMAGICIAN: precise, technical, and clear. Focus on correctness and actionable steps.',
        parameters: { 
          temperature: 0.1, 
          top_p: 0.9, 
          max_tokens: 1500,
          presence_penalty: 0.1,
          frequency_penalty: 0.1
        },
        greeting: 'THE MATHEMAGICIAN ready.',
        metadata: {
          isFallback: true,
          createdAt: new Date().toISOString()
        }
      };
    }
  }

  /**
   * Validate persona object structure
   * @private
   */
  validatePersona(persona) {
    if (!persona || typeof persona !== 'object') return false;
    if (!persona.id || typeof persona.id !== 'string') return false;
    if (!persona.name || typeof persona.name !== 'string') return false;
    if (!persona.systemPrompt || typeof persona.systemPrompt !== 'string') return false;
    
    // Validate parameters if they exist
    if (persona.parameters) {
      const params = persona.parameters;
      if (params.temperature !== undefined && (isNaN(params.temperature) || params.temperature < 0 || params.temperature > 2)) {
        return false;
      }
      if (params.top_p !== undefined && (isNaN(params.top_p) || params.top_p <= 0 || params.top_p > 1)) {
        return false;
      }
      if (params.max_tokens !== undefined && (!Number.isInteger(params.max_tokens) || params.max_tokens <= 0)) {
        return false;
      }
    }
    
    return true;
  }

  /**
   * Get the active persona for a specific chat
   * @param {string} chatId - The chat/thread ID
   * @returns {Promise<Object>} The active persona for the chat
   */
  async getActivePersona(chatId) {
    if (!chatId) {
      logger.warn('No chatId provided, returning default persona');
      return this.getDefaultPersona();
    }

    // Check cache first
    const cacheKey = `active_${chatId}`;
    const cached = cache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < (CACHE_TTL / 2)) {
      logger.debug(`Cache hit for active persona in chat ${chatId}`);
      return cached.data;
    }

    try {
      // Try to get from memory service if available
      const memoryService = await this.getMemoryService();
      if (memoryService && typeof memoryService.getMessages === 'function') {
        const msgs = await memoryService.getMessages(chatId, { 
          role: 'system', 
          limit: 20 
        }).catch(error => {
          logger.warn('Error getting messages from memory service:', error);
          return [];
        });

        if (Array.isArray(msgs) && msgs.length > 0) {
          // Look for the most recent persona change
          for (let i = msgs.length - 1; i >= 0; i--) {
            const msg = msgs[i];
            if (msg && msg.role === 'system' && msg.content) {
              const match = msg.content.match(/Persona changed to\s*:?\s*([A-Za-z0-9_\- ]+)/i);
              if (match && match[1]) {
                const candidate = match[1].trim().toLowerCase().replace(/\s+/g, '');
                logger.debug(`Found persona change to: ${candidate} in chat ${chatId}`);
                
                try {
                  const persona = await this.getPersona(candidate);
                  if (persona) {
                    // Update cache
                    cache.set(cacheKey, {
                      data: persona,
                      timestamp: Date.now()
                    });
                    return persona;
                  }
                } catch (error) {
                  logger.warn(`Failed to load persona ${candidate}:`, error);
                  // Continue to next message
                }
              }
            }
          }
        }
      }
    } catch (error) {
      logger.error('Error in getActivePersona:', error);
    }

    // Fall back to default persona
    logger.debug(`No active persona found for chat ${chatId}, using default`);
    return this.getDefaultPersona();
  }

  /**
   * Safely get memory service with error handling
   * @private
   */
  async getMemoryService() {
    try {
      // Dynamic import to avoid circular dependencies
      const memoryService = require('./memoryService');
      // Verify it has the expected methods
      if (memoryService && 
          typeof memoryService.getMessages === 'function' && 
          typeof memoryService.addMessage === 'function') {
        return memoryService;
      }
    } catch (error) {
      logger.debug('Memory service not available:', error.message);
    }
    return null;
  }

  /**
   * Set the active persona for a chat
   * @param {string} chatId - The chat/thread ID
   * @param {string} personaId - The ID of the persona to activate
   * @returns {Promise<Object|null>} The activated persona or null if not found
   */
  async setActivePersona(chatId, personaId) {
    if (!chatId || !personaId) {
      throw new Error('chatId and personaId are required');
    }

    try {
      const persona = await this.getPersona(personaId);
      if (!persona) {
        logger.warn(`Persona not found: ${personaId}`);
        return null;
      }

      const systemMsg = `Persona changed to: ${persona.name}\n${persona.systemPrompt.substring(0, 200)}...`;
      
      // Update cache
      const cacheKey = `active_${chatId}`;
      cache.set(cacheKey, {
        data: persona,
        timestamp: Date.now()
      });

      // Persist to memory service if available
      try {
        const memoryService = await this.getMemoryService();
        if (memoryService) {
          await memoryService.addMessage(chatId, 'system', systemMsg);
          logger.info(`Set active persona for chat ${chatId} to ${personaId}`);
        } else {
          // Fallback: log to file
          await this.logPersonaChange(chatId, personaId, systemMsg);
        }
      } catch (error) {
        logger.error('Error persisting persona change:', error);
        // Continue even if persistence fails
      }

      return persona;
    } catch (error) {
      logger.error(`Error setting active persona ${personaId} for chat ${chatId}:`, error);
      throw new Error(`Failed to set active persona: ${error.message}`);
    }
  }

  /**
   * Log persona change to file (fallback when memory service is unavailable)
   * @private
   */
  async logPersonaChange(chatId, personaId, message) {
    const logEntry = `[${new Date().toISOString()}] CHAT:${chatId} PERSONA:${personaId} - ${message}\n`;
    const logPath = path.join(this.personaDir, 'persona_changes.log');
    
    try {
      await fs.appendFile(logPath, logEntry, 'utf8');
      logger.debug(`Logged persona change to ${logPath}`);
    } catch (error) {
      logger.error('Failed to log persona change:', error);
    }
  }

  /**
   * Apply persona framing to a message
   * @param {string} chatId - The chat/thread ID
   * @param {string} message - The message to frame
   * @param {Object} [options] - Additional options
   * @param {boolean} [options.includeSignature=true] - Whether to include the persona signature
   * @returns {Promise<string>} The framed message
   */
  async frameMessage(chatId, message, options = {}) {
    if (!message) return '';
    
    const {
      includeSignature = true,
      trim = true
    } = options;

    try {
      const persona = await this.getActivePersona(chatId);
      
      if (!includeSignature) {
        return trim ? message.trim() : message;
      }

      // Extract first meaningful sentence from system prompt
      let firstSentence = (persona.systemPrompt || '')
        .replace(/\s+/g, ' ')
        .replace(/([.!?])(\s+[A-Z])/g, '$1|$2')
        .split('|')[0]
        .trim();

      // Fallback to name if no sentence found
      if (!firstSentence) {
        firstSentence = persona.name;
      }

      // Create signature
      const signature = `[${persona.name} — ${firstSentence}]`;
      
      // Combine and clean up whitespace
      let framed = `${signature} ${message}`;
      if (trim) {
        framed = framed.replace(/\s+/g, ' ').trim();
      }
      
      return framed;
    } catch (error) {
      logger.error('Error in frameMessage:', error);
      return message; // Return original message on error
    }
  }

  /**
   * Save or update a persona
   * @param {Object} personaData - The persona data to save
   * @returns {Promise<Object>} The saved persona
   */
  async savePersona(personaData) {
    if (!personaData || typeof personaData !== 'object') {
      throw new Error('personaData must be an object');
    }

    // Create a clean copy with required fields
    const now = new Date().toISOString();
    const persona = {
      id: String(personaData.id || uuidv4()),
      name: String(personaData.name || 'Unnamed Persona'),
      description: String(personaData.description || ''),
      systemPrompt: String(personaData.systemPrompt || ''),
      parameters: {
        temperature: this.clampValue(Number(personaData.parameters?.temperature || 0.1), 0, 2),
        top_p: this.clampValue(Number(personaData.parameters?.top_p || 0.9), 0, 1),
        max_tokens: Math.max(1, Math.min(Number(personaData.parameters?.max_tokens || 1000), 4000)),
        presence_penalty: this.clampValue(Number(personaData.parameters?.presence_penalty || 0), -2, 2),
        frequency_penalty: this.clampValue(Number(personaData.parameters?.frequency_penalty || 0), -2, 2)
      },
      greeting: String(personaData.greeting || ''),
      metadata: {
        ...(personaData.metadata || {}),
        updatedAt: now,
        version: personaData.metadata?.version || '1.0.0',
        // Preserve created date or set to now
        createdAt: personaData.metadata?.createdAt || now
      }
    };

    // Validate the persona
    if (!this.validatePersona(persona)) {
      throw new Error('Invalid persona structure');
    }

    const targetPath = path.join(this.personaDir, `${persona.id}.json`);
    
    try {
      // Ensure directory exists
      await this.ensureDirectoryExists();
      
      // Use file lock to prevent concurrent writes
      const release = await lockfile.lock(targetPath, { retries: 3 });
      
      try {
        // Write the file
        await fs.writeFile(targetPath, JSON.stringify(persona, null, 2), 'utf8');
        
        // Update cache
        const cacheKey = `persona_${persona.id}`;
        cache.set(cacheKey, {
          data: persona,
          timestamp: Date.now()
        });
        
        logger.info(`Saved persona: ${persona.id}`);
        return persona;
      } finally {
        await release();
      }
    } catch (error) {
      logger.error(`Failed to save persona ${persona.id}:`, error);
      throw new Error(`Failed to save persona: ${error.message}`);
    }
  }

  /**
   * Delete a persona by ID
   * @param {string} personaId - The ID of the persona to delete
   * @returns {Promise<boolean>} True if deleted, false if not found
   */
  async deletePersona(personaId) {
    if (!personaId) {
      throw new Error('personaId is required');
    }

    // Don't allow deleting the default persona
    if (personaId === this.defaultPersona) {
      throw new Error('Cannot delete the default persona');
    }

    const targetPath = path.join(this.personaDir, `${personaId}.json`);
    
    try {
      // Check if file exists
      try {
        await fs.access(targetPath);
      } catch (error) {
        if (error.code === 'ENOENT') {
          logger.warn(`Persona not found for deletion: ${personaId}`);
          return false;
        }
        throw error;
      }

      // Use file lock to prevent concurrent operations
      const release = await lockfile.lock(targetPath, { retries: 3 });
      
      try {
        // Delete the file
        await fs.unlink(targetPath);
        
        // Clear from cache
        cache.delete(`persona_${personaId}`);
        
        logger.info(`Deleted persona: ${personaId}`);
        return true;
      } finally {
        await release();
      }
    } catch (error) {
      logger.error(`Failed to delete persona ${personaId}:`, error);
      throw new Error(`Failed to delete persona: ${error.message}`);
    }
  }

  /**
   * Ensure the service is initialized
   * @private
   */
  async ensureInitialized() {
    if (!this.initialized) {
      await this.initializationPromise;
    }
  }

  /**
   * Clamp a value between min and max
   * @private
   */
  clampValue(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }
}

// Export a singleton instance
const personaService = new PersonaService();

// Handle process termination to clean up resources
process.on('SIGINT', async () => {
  logger.info('Shutting down PersonaService...');
  // Add any cleanup logic here if needed
  process.exit(0);
});

module.exports = personaService;
