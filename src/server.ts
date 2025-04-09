// auxiom/src/server.ts
import { createServer, IncomingMessage, ServerResponse } from 'http';
import { parse } from 'url';
import next from 'next';
import { WebSocketServer, WebSocket } from 'ws';
import { Socket } from 'net';
import OpenAI from 'openai';
import * as dotenv from 'dotenv';

dotenv.config();

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    if (req.headers.upgrade === 'websocket') {
      wss.handleUpgrade(req, req.socket, Buffer.alloc(0), ws => {
        wss.emit('connection', ws, req);
      });
    } else {
      const parsedUrl = parse(req.url!, true);
      handle(req, res, parsedUrl);
    }
  });

  const wss = new WebSocketServer({ noServer: true });

  wss.on('connection', async ws => {
    console.log('WebSocket connection attempt received.');
    console.log('WebSocket connected');
    ws.send(JSON.stringify({ type: 'server_ready', payload: { message: 'WebSocket ready' } }));

    ws.on('message', async message => {
      try {
        const parsedMessage = JSON.parse(message.toString());
        if (parsedMessage.type === 'request_tts') {
          const { text } = parsedMessage.payload;
          if (text) {
            console.log('Received TTS request:', text);
            try {
              const mp3 = await openai.audio.speech.withResponse({
                model: "tts-1",
                voice: "alloy",
                input: text,
                response_format: "opus"
              });

              if (mp3.status === 200) {
                const arrayBuffer = await mp3.arrayBuffer();
                ws.send(Buffer.from(arrayBuffer), { binary: true });
              } else {
                console.error('OpenAI TTS request failed:', mp3.status, mp3.statusText);
                ws.send(JSON.stringify({ type: 'tts_error', payload: { message: `OpenAI TTS failed: ${mp3.statusText}` } }));
              }
            } catch (error: any) {
              console.error('Error calling OpenAI TTS:', error);
              ws.send(JSON.stringify({ type: 'tts_error', payload: { message: `Error calling OpenAI TTS: ${error.message}` } }));
            }
          } else {
            ws.send(JSON.stringify({ type: 'tts_error', payload: { message: 'Text payload missing in TTS request' } }));
          }
        }
      } catch (error) {
        console.error('Error processing WebSocket message:', error);
        ws.send(JSON.stringify({ type: 'error', payload: { message: 'Error processing message' } }));
      }
    });

    ws.on('close', () => {
      console.log('WebSocket connection closed');
    });

    ws.on('error', error => {
      console.error('WebSocket error:', error);
    });
  });

  server.on('upgrade', (req, socket, head) => {
    wss.handleUpgrade(req, socket, head, ws => {
      wss.emit('connection', ws, req);
    });
  });

  server.listen(port, (err?: any) => {
    if (err) throw err;
    console.log(`> Server listening at http://${hostname}:${port}`);
  });
});