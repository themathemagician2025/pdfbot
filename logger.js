const pino = require('pino');
const path = require('path');
const fs = require('fs-extra');

// Ensure logs directory exists
const logDir = path.join(__dirname, '..', 'logs');
fs.ensureDirSync(logDir);

// Create a logger instance
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    targets: [
      {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:dd-mm-yyyy HH:MM:ss',
          ignore: 'pid,hostname',
        },
        level: process.env.LOG_LEVEL || 'info',
      },
      {
        target: 'pino/file',
        options: {
          destination: path.join(logDir, 'knightbot.log'),
          mkdir: true,
        },
        level: 'debug',
      },
    ],
  },
});

// Add a method to log memory operations
logger.memory = (message, data = {}) => {
  logger.info({ memory: true, ...data }, message);
};

module.exports = logger;
