"""
Podcast Streaming Server with Real-time Conversation

This module implements a FastAPI server that provides real-time streaming of podcast audio
and enables interactive conversations with the podcast host using speech-to-text and
generative AI for natural responses.
"""

import os
import asyncio
import time
import json
from typing import List, Dict, Optional
from dataclasses import dataclass
from datetime import datetime

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import google.generativeai as genai
from openai import OpenAI
import psycopg2 

import s3

# Initialize FastAPI app
app = FastAPI(title="Podcast Streaming Server")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Update this with your frontend domain in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Health check endpoint
@app.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.now().isoformat()}

db_access_url = os.environ.get('DB_ACCESS_URL')
OPENAI_API_KEY = os.environ.get('OPENAI_API_KEY')
GOOGLE_API_KEY = os.environ.get('GOOGLE_API_KEY')

# Configure Google AI
genai.configure(api_key=GOOGLE_API_KEY)
model = genai.GenerativeModel('gemini-pro')

# Temporary directory for audio files
TEMP_BASE = "/tmp"

@dataclass
class ConversationContext:
    user_id: str
    podcast_id: str
    episode: str
    history: List[Dict[str, str]]
    current_topic: Optional[str] = None
    last_interaction: datetime = datetime.now()

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}
        self.conversation_contexts: Dict[str, ConversationContext] = {}

    async def connect(self, websocket: WebSocket, user_id: str):
        await websocket.accept()
        self.active_connections[user_id] = websocket

    def disconnect(self, user_id: str):
        if user_id in self.active_connections:
            del self.active_connections[user_id]
        if user_id in self.conversation_contexts:
            del self.conversation_contexts[user_id]

    async def send_audio_chunk(self, user_id: str, chunk: bytes):
        if user_id in self.active_connections:
            await self.active_connections[user_id].send_bytes(chunk)

    async def send_text(self, user_id: str, message: str):
        if user_id in self.active_connections:
            await self.active_connections[user_id].send_text(message)

    def get_context(self, user_id: str) -> Optional[ConversationContext]:
        return self.conversation_contexts.get(user_id)

    def update_context(self, user_id: str, context: ConversationContext):
        self.conversation_contexts[user_id] = context

manager = ConnectionManager()

def update_db(mp3_file_url, podcast_id):
    try:
        conn = psycopg2.connect(dsn=db_access_url)
        cursor = conn.cursor()

        if podcast_id:
            cursor.execute("""
                UPDATE podcasts 
                SET audio_file_url = %s
                WHERE id = %s
            """, (mp3_file_url, podcast_id))
            
            conn.commit()
            print(f"Successfully updated audio_file_url for podcast {podcast_id}")
            return podcast_id

    except psycopg2.Error as e:
        print(f"Database error: {e}")
        if conn:
            conn.rollback()
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()

async def generate_host_response(context: ConversationContext, user_input: str) -> str:
    # Prepare conversation history for the model
    conversation = []
    for msg in context.history[-5:]:  # Keep last 5 messages for context
        conversation.append(f"{msg['role']}: {msg['content']}")
    
    # Add current user input
    conversation.append(f"User: {user_input}")
    
    # Generate response using Google's Generative AI
    prompt = f"""You are a podcast host having a natural conversation with a listener. 
    Previous conversation context:
    {' '.join(conversation)}
    
    Generate a natural, conversational response as the podcast host:"""
    
    response = model.generate_content(prompt)
    return response.text

async def process_audio_response(text: str, voice: str = 'nova') -> bytes:
    client = OpenAI(api_key=OPENAI_API_KEY)
    response = client.audio.speech.create(
        model="tts-1",
        voice=voice,
        input=text,
        response_format='mp3'
    )
    
    audio_bytes = bytearray()
    for chunk in response.iter_bytes(chunk_size=16384):
        audio_bytes.extend(chunk)
    return audio_bytes

@app.websocket("/ws/podcast")
async def stream_podcast(websocket: WebSocket):
    await websocket.accept()
    try:
        print("CONNECTED")
        
        # Wait for the client to send the user ID and script
        data = await websocket.receive_json()
        
        # Extract user ID and script from the received data
        user_id = data.get("user_id")
        podcast_id = data.get("podcast_id")
        episode = data.get("episode")
        turns = data.get("script")
        
        if not podcast_id or not turns:
            await websocket.send_json({"type": "error", "content": "Require user_id, script, episode, podcast_id"})
            return

        # Initialize conversation context
        context = ConversationContext(
            user_id=user_id,
            podcast_id=podcast_id,
            episode=episode,
            history=[{"role": "host", "content": turn} for turn in turns]
        )
        manager.update_context(user_id, context)
        await manager.connect(websocket, user_id)

        # Process initial podcast content
        start_time = time.time()
        client = OpenAI(api_key=OPENAI_API_KEY)
        
        temp_mp3_path = os.path.join(TEMP_BASE, f"podcast_{user_id}.mp3")
        full_audio_bytes = bytearray()
        
        # Process initial turns
        for i, sentence in enumerate(turns):
            voice = 'nova' if i % 2 == 0 else 'onyx'
            try:
                response = client.audio.speech.create(
                    model="tts-1",
                    voice=voice,
                    input=sentence,
                    response_format='mp3'
                )
                
                for chunk in response.iter_bytes(chunk_size=16384):
                    full_audio_bytes.extend(chunk)
                    await manager.send_audio_chunk(user_id, chunk)
                    await asyncio.sleep(0.01)
                
            except Exception as e:
                print(f"Error in turn {i}: {str(e)}")
                await manager.send_text(user_id, json.dumps({
                    "type": "error",
                    "turn": i,
                    "message": str(e)
                }))

        # Save initial podcast content
        with open(temp_mp3_path, 'wb') as f:
            f.write(full_audio_bytes)
        
        s3.save(user_id, episode, 'PODCAST', temp_mp3_path)
        s3_url = s3.get_s3_url(user_id, episode, "PODCAST")
        update_db(s3_url, podcast_id)

        # Enter conversation loop
        while True:
            try:
                # Wait for user input (speech-to-text from client)
                user_input = await websocket.receive_text()
                
                # Generate host response
                host_response = await generate_host_response(context, user_input)
                
                # Update conversation history
                context.history.append({"role": "user", "content": user_input})
                context.history.append({"role": "host", "content": host_response})
                context.last_interaction = datetime.now()
                manager.update_context(user_id, context)
                
                # Convert response to speech and stream
                audio_bytes = await process_audio_response(host_response)
                await manager.send_audio_chunk(user_id, audio_bytes)
                
            except WebSocketDisconnect:
                print(f"Client {user_id} disconnected")
                manager.disconnect(user_id)
                break
            except Exception as e:
                print(f"Error in conversation: {str(e)}")
                await manager.send_text(user_id, json.dumps({
                    "type": "error",
                    "message": str(e)
                }))

    except Exception as e:
        print(f"Unexpected error: {str(e)}")
        if user_id:
            manager.disconnect(user_id)

# Run the server
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
    # uvicorn streaming_server:app
