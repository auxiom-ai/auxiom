const http = require('http');
const { WebSocketServer, WebSocket } = require('ws');
const OpenAI = require('openai');
require('dotenv').config(); // Load environment variables from .env

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
  console.error("Error: OPENAI_API_KEY is not set. Please configure it in your .env file.");
  process.exit(1); // Exit the process if the API key is missing
}

const podcast_script = "**HOST 1:** Another bill came up this week discussing. **HOST 2:** I read that Senator Jones said a lot about. **HOST 1:** Right, I mean he is a big proponent of. **HOST 2:** Sounds like it will be a big step for. **HOST 1:** - This impacts all the countries in.";

async function streamPodcast(websocket) {
  console.log("Client connected. Starting hardcoded script streaming.");

  const script = podcast_script;
  const turns = script.split('.').map(s => s.trim()).filter(s => s !== '');

  const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

  // Send metadata
  websocket.send(JSON.stringify({
    type: "metadata",
    turns: turns.length,
  }));

  // Stream intro message
  websocket.send(JSON.stringify({
    type: "status",
    message: "Starting podcast streaming..."
  }));

  for (let index = 0; index < turns.length; index++) {
    const sentence = turns[index];
    const host = (index % 2 === 0) ? 1 : 2;
    const voice = (host === 1) ? 'nova' : 'onyx';

    // Send status update
    websocket.send(JSON.stringify({
      type: "status",
      message: `Generating audio for turn ${index + 1}/${turns.length}`,
      progress: (index / turns.length) * 100
    }));

    try {
      const response = await openai.audio.speech.create({
        model: "tts-1",
        voice: voice,
        input: sentence,
        response_format: 'mp3'
      });

      // Send host information
      websocket.send(JSON.stringify({
        type: "host",
        host: host
      }));

      // Stream chunks to client
      const buffer = Buffer.from(await response.arrayBuffer());
      const chunkSize = 4096;
      for (let i = 0; i < buffer.length; i += chunkSize) {
        const chunk = buffer.subarray(i, i + chunkSize);
        websocket.send(chunk);
        await new Promise(resolve => setTimeout(resolve, 50)); // 50ms delay
      }

      // Send end of segment marker
      websocket.send(JSON.stringify({
        type: "segment_end",
        turn: index
      }));

    } catch (error) {
      console.error(`Error generating audio for turn ${index}:`, error);
      websocket.send(JSON.stringify({
        type: "error",
        message: `Error generating audio: ${error.message || String(error)}`
      }));
    }
  }

  // Send completion message
  websocket.send(JSON.stringify({
    type: "complete",
    message: "Podcast streaming completed"
  }));
}

// Create an HTTP server
const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end("WebSocket server is running.");
});

// Create a WebSocket server
const wss = new WebSocketServer({ server });

// Handle WebSocket connections
wss.on('connection', (ws) => {
  console.log("New WebSocket connection.");

  // Stream the default podcast script directly on connection
  streamPodcast(ws);
});

// Start the server
const PORT = 8080;
server.listen(PORT, () => {
  console.log(`Server is listening on port ${PORT}`);
});