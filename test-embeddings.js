const { getEmbeddings } = require('./config/embeddings');
const axios = require('axios');
const net = require('net');

async function checkOllamaServer(baseUrl, retries = 3, delay = 1000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await axios.get(`${baseUrl}/api/version`, { timeout: 2000 });
      console.log('🔍 Ollama server is running.');
      return true;
    } catch (error) {
      console.error(`❌ Failed to connect to Ollama server (attempt ${attempt}/${retries}):`, error.message);
      if (attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  return false;
}

async function checkPortAvailability(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`❌ Port ${port} is already in use.`);
        resolve(false);
      }
    });
    server.once('listening', () => {
      server.close();
      resolve(true);
    });
    server.listen(port, '127.0.0.1');
  });
}

async function isOllamaOnPort(baseUrl) {
  try {
    const response = await axios.get(`${baseUrl}/api/version`, { timeout: 2000 });
    return response.status === 200;
  } catch {
    return false;
  }
}

async function checkOllamaModel(modelName, baseUrl) {
  try {
    const response = await axios.get(`${baseUrl}/api/tags`, { timeout: 2000 });
    const models = response.data.models || [];
    return models.some(model => model.name.includes(modelName));
  } catch (error) {
    console.error('Error checking Ollama models:', error.message);
    return false;
  }
}

async function pullOllamaModel(modelName, baseUrl, retries = 3, delay = 1000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`Pulling model ${modelName} (attempt ${attempt}/${retries})...`);
      await axios.post(`${baseUrl}/api/pull`, { name: modelName }, { timeout: 60000 });
      console.log(`Model ${modelName} pulled successfully.`);
      return true;
    } catch (error) {
      console.error(`Failed to pull model ${modelName} (attempt ${attempt}/${retries}):`, error.message);
      if (attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  return false;
}

async function testEmbeddings() {
    try {
        console.log("🔍 Testing Ollama embeddings...");
        
        const baseUrl = 'http://127.0.0.1:11434';
        const modelName = 'nomic-embed-text';
        const port = 11434;

        // Check if port is available
        const portAvailable = await checkPortAvailability(port);
        if (!portAvailable) {
            const isOllama = await isOllamaOnPort(baseUrl);
            if (isOllama) {
                console.log('🔍 Detected Ollama server running on port 11434.');
            } else {
                console.log("\nTroubleshooting port conflict:");
                console.log("1. Identify the process using port 11434: 'netstat -a -n -o | find \"11434\"'");
                console.log("2. Terminate the conflicting process: 'taskkill /PID <pid> /F'");
                console.log("3. Start the Ollama server: 'ollama serve'");
                console.log("4. Verify with: 'ollama list'");
                return false;
            }
        }

        // Check if Ollama server is running
        const serverRunning = await checkOllamaServer(baseUrl);
        if (!serverRunning) {
            console.log("\nTroubleshooting steps:");
            console.log("1. Make sure Ollama is installed from: https://ollama.ai/download");
            console.log("2. Start the Ollama server: 'ollama serve'");
            console.log("3. Pull the model: 'ollama pull nomic-embed-text'");
            console.log("4. Verify the model is available: 'ollama list'");
            return false;
        }

        // Check if model is available
        const modelExists = await checkOllamaModel(modelName, baseUrl);
        if (!modelExists) {
            console.log(`Model ${modelName} not found. Attempting to pull it...`);
            const pulled = await pullOllamaModel(modelName, baseUrl);
            if (!pulled) {
                console.log("\nTroubleshooting steps:");
                console.log("1. Make sure Ollama is installed from: https://ollama.ai/download");
                console.log("2. Start the Ollama server: 'ollama serve'");
                console.log("3. Pull the model: 'ollama pull nomic-embed-text'");
                console.log("4. Verify the model is available: 'ollama list'");
                return false;
            }
        }

        // This will automatically test the connection
        const embeddings = await getEmbeddings();
        
        // Test with a sample query
        const testText = "This is a test of the Ollama embeddings";
        console.log("\n🧪 Generating embeddings for text:", testText);
        
        const startTime = Date.now();
        const vector = await embeddings.embedQuery(testText);
        const duration = Date.now() - startTime;
        
        console.log("\n✅ Success! Embedding vector generated:");
        console.log(`- Vector length: ${vector.length} dimensions`);
        console.log(`- First 5 values: [${vector.slice(0, 5).map(n => n.toFixed(6)).join(', ')}]`);
        console.log(`- Generation time: ${duration}ms`);
        
        return true;
    } catch (error) {
        console.error("\n❌ Test failed:", error.message);
        console.log("\nTroubleshooting steps:");
        console.log("1. Make sure Ollama is installed from: https://ollama.ai/download");
        console.log("2. Start the Ollama server: 'ollama serve'");
        console.log("3. Pull the model: 'ollama pull nomic-embed-text'");
        console.log("4. Verify the model is available: 'ollama list'");
        return false;
    }
}

// Run the test
(async () => {
    const success = await testEmbeddings();
    process.exit(success ? 0 : 1);
})();