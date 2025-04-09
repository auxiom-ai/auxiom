import { IncomingMessage, ServerResponse } from 'http';
import * as http from 'http';
import { WebSocketServer, WebSocket as WS } from 'ws'; // Alias WebSocket to avoid conflicts

const server = http.createServer((req: IncomingMessage, res: ServerResponse) => {
  res.writeHead(200);
  res.end("WebSocket server is running.");
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws: WS, req: IncomingMessage) => {
  ws.on('message', async (message: WS.Data) => {
    console.log(`Received: ${message}`);
    // Do something with the message
  });

  ws.on('close', () => {
    console.log('Client disconnected');
  });

  ws.on('error', (error: Error) => {
    console.error('WebSocket error:', error);
  });
});

server.listen(8080, () => {
  console.log('Server is listening on port 8080');
});
