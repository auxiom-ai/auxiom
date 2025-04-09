import { NextRequest } from 'next/server';
import OpenAI from 'openai';

// This is needed for Edge Runtime
export const runtime = 'edge';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function GET(req: NextRequest) {
  console.log("Received SSE connection request");
  console.log("Request URL:", req.url);
  
  // Create a new ReadableStream for SSE
  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Get script from query parameters
  const { searchParams } = new URL(req.url);
        const scriptParam = searchParams.get('script');
  
        if (!scriptParam) {
          controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type: 'error', message: 'No script provided' })}\n\n`));
          controller.close();
          return;
        }
        
        let script: string[];
        try {
          script = JSON.parse(scriptParam);
          if (!Array.isArray(script)) {
            throw new Error('Script must be an array');
          }
  } catch (error) {
          controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type: 'error', message: 'Invalid script format' })}\n\n`));
          controller.close();
          return;
        }
        
        // Send metadata
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type: 'metadata', turns: script.length })}\n\n`));

        // Send status update
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type: 'status', message: 'Starting streaming' })}\n\n`));
        
        // Process the script
        await processScript(controller, script);
        
        // Send completion message
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type: 'complete', message: 'Podcast streaming completed' })}\n\n`));
        
        // Close the stream
        controller.close();
    } catch (error) {
        console.error('Streaming error:', error);
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type: 'error', message: `Streaming error: ${error instanceof Error ? error.message : String(error)}` })}\n\n`));
        controller.close();
      }
    }
  });

  // Return the stream as an SSE response
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

async function processScript(controller: ReadableStreamDefaultController, turns: string[]) {
  console.log(`Processing script with ${turns.length} turns`);
  
  for (let index = 0; index < turns.length; index++) {
    const sentence = turns[index];
    console.log(`Processing turn ${index + 1}/${turns.length}: "${sentence}"`);
    
    const host = (index % 2 === 0) ? 1 : 2;
    const voice = (host === 1) ? 'nova' : 'onyx';

    // Send status update
    controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({
      type: "status",
      message: `Generating audio for turn ${index + 1}/${turns.length}`,
      progress: (index / turns.length) * 100
    })}\n\n`));

    try {
      console.log(`Generating audio for turn ${index + 1} with voice ${voice}`);
      const response = await openai.audio.speech.create({
        model: "tts-1",
        voice: voice,
        input: sentence,
        response_format: 'mp3'
      });

      // Send host information
      controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({
        type: "host",
        host: host
      })}\n\n`));

      // Stream audio data
      const buffer = Buffer.from(await response.arrayBuffer());
      console.log(`Streaming ${buffer.length} bytes of audio data for turn ${index + 1}`);
      
      // Send audio data in chunks
      const chunkSize = 4096;
      for (let i = 0; i < buffer.length; i += chunkSize) {
        const chunk = buffer.subarray(i, i + chunkSize);
        // Convert chunk to base64 for SSE
        const base64Chunk = Buffer.from(chunk).toString('base64');
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({
          type: "audio",
          data: base64Chunk
        })}\n\n`));
        
        // Add a small delay between chunks
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      // Send end of segment marker
      controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({
        type: "segment_end",
        turn: index
      })}\n\n`));

    } catch (error) {
      console.error(`Error generating audio for turn ${index}:`, error);
      controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({
        type: "error",
        message: `Error generating audio: ${error instanceof Error ? error.message : String(error)}`
      })}\n\n`));
    }
  }
} 