# Podcast WebSocket API

This API route provides WebSocket functionality for streaming podcast audio in real-time.

## Overview

The API uses Next.js Edge Runtime to handle WebSocket connections and streams podcast audio data to clients. It uses OpenAI's TTS API to generate audio for each segment of the podcast script.

## How It Works

1. The client connects to the WebSocket endpoint at `/api/ws/podcast`
2. The server accepts the connection and starts streaming the podcast
3. For each segment of the podcast:
   - The server sends metadata about the segment
   - It generates audio using OpenAI's TTS API
   - It streams the audio data in chunks to the client
   - It sends a completion message when done

## Message Types

The API sends the following types of messages:

- `metadata`: Contains information about the podcast (number of turns)
- `status`: Updates on the streaming progress
- `host`: Indicates which host is speaking
- `segment_end`: Marks the end of a segment
- `complete`: Indicates the podcast streaming is complete
- `error`: Contains error information if something goes wrong

## Usage

Connect to the WebSocket from your client:

```javascript
const ws = new WebSocket(`ws://${window.location.host}/api/ws/podcast`);

ws.onmessage = (event) => {
  if (event.data instanceof ArrayBuffer) {
    // Handle binary audio data
  } else {
    // Handle JSON messages
    const message = JSON.parse(event.data);
    // Process message based on type
  }
};
```

## Environment Variables

- `OPENAI_API_KEY`: Your OpenAI API key for TTS functionality

## Migration from Standalone Server

This API route replaces the standalone WebSocket server that was previously running on port 8080. The functionality remains the same, but it's now integrated into the Next.js application. 
