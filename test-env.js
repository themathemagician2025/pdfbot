// Test if environment variables are loading correctly
require('dotenv').config();

console.log('Environment Variables Test');
console.log('========================');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('BOT_NAME:', process.env.BOT_NAME);
console.log('LOG_LEVEL:', process.env.LOG_LEVEL);
console.log('MONGODB_URI:', process.env.MONGODB_URI ? '*** Set ***' : 'Not Set');
console.log('OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? '*** Set ***' : 'Not Set');
