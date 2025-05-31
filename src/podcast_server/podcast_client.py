"""
Podcast Client

This module implements a client for the podcast streaming server that handles:
1. Initial podcast content streaming
2. Real-time speech-to-text for user input
3. Audio playback of host responses
"""

import asyncio
import json
import websockets
import sounddevice as sd
import numpy as np
import speech_recognition as sr
from pydub import AudioSegment
import io
import wave
import threading
import queue

class PodcastClient:
    def __init__(self, server_url="ws://localhost:8000/ws/podcast"):
        self.server_url = server_url
        self.websocket = None
        self.audio_queue = queue.Queue()
        self.is_playing = False
        self.recognizer = sr.Recognizer()
        self.microphone = sr.Microphone()
        
        # Adjust for ambient noise
        with self.microphone as source:
            self.recognizer.adjust_for_ambient_noise(source)
    
    async def connect(self, user_id: str, podcast_id: str, episode: str, script: list):
        """Connect to the podcast server and send initial data"""
        try:
            self.websocket = await websockets.connect(self.server_url)
            
            # Send initial data
            await self.websocket.send(json.dumps({
                "user_id": user_id,
                "podcast_id": podcast_id,
                "episode": episode,
                "script": script
            }))
            
            # Start audio playback thread
            threading.Thread(target=self._audio_playback_worker, daemon=True).start()
            
            # Start listening for server messages
            await self._handle_server_messages()
            
        except Exception as e:
            print(f"Connection error: {str(e)}")
            if self.websocket:
                await self.websocket.close()
    
    def _audio_playback_worker(self):
        """Background thread for audio playback"""
        while True:
            if not self.audio_queue.empty():
                audio_data = self.audio_queue.get()
                self._play_audio(audio_data)
            else:
                asyncio.sleep(0.1)
    
    def _play_audio(self, audio_data: bytes):
        """Play audio data using sounddevice"""
        try:
            # Convert MP3 bytes to WAV format
            audio = AudioSegment.from_mp3(io.BytesIO(audio_data))
            wav_data = audio.export(format="wav")
            
            # Read WAV data
            with wave.open(io.BytesIO(wav_data.read()), 'rb') as wav_file:
                # Get audio parameters
                n_channels = wav_file.getnchannels()
                sample_width = wav_file.getsampwidth()
                framerate = wav_file.getframerate()
                n_frames = wav_file.getnframes()
                
                # Read audio data
                audio_data = wav_file.readframes(n_frames)
                
                # Convert to numpy array
                audio_array = np.frombuffer(audio_data, dtype=np.int16)
                
                # Play audio
                sd.play(audio_array, framerate)
                sd.wait()  # Wait until audio is finished playing
                
        except Exception as e:
            print(f"Error playing audio: {str(e)}")
    
    async def _handle_server_messages(self):
        """Handle incoming messages from the server"""
        try:
            while True:
                message = await self.websocket.recv()
                
                if isinstance(message, bytes):
                    # Audio data received
                    self.audio_queue.put(message)
                else:
                    # Text message received
                    try:
                        data = json.loads(message)
                        if data.get("type") == "error":
                            print(f"Error from server: {data.get('message')}")
                    except json.JSONDecodeError:
                        print(f"Received text message: {message}")
                        
        except websockets.exceptions.ConnectionClosed:
            print("Connection to server closed")
        except Exception as e:
            print(f"Error handling server messages: {str(e)}")
    
    async def start_conversation(self):
        """Start the conversation loop"""
        print("Starting conversation mode. Press Ctrl+C to exit.")
        try:
            while True:
                print("\nListening... (Speak now)")
                
                # Listen for user input
                with self.microphone as source:
                    audio = self.recognizer.listen(source)
                
                try:
                    # Convert speech to text
                    text = self.recognizer.recognize_google(audio)
                    print(f"You said: {text}")
                    
                    # Send text to server
                    await self.websocket.send(text)
                    
                except sr.UnknownValueError:
                    print("Could not understand audio")
                except sr.RequestError as e:
                    print(f"Could not request results; {str(e)}")
                
        except KeyboardInterrupt:
            print("\nExiting conversation mode")
        finally:
            if self.websocket:
                await self.websocket.close()

async def main():
    # Example usage
    client = PodcastClient()
    
    # Example data
    user_id = "user123"
    podcast_id = "podcast456"
    episode = "episode789"
    script = [
        "Welcome to our podcast!",
        "Today we're discussing AI and its impact on society.",
        "Let's dive right in!"
    ]
    
    # Connect and start conversation
    await client.connect(user_id, podcast_id, episode, script)
    await client.start_conversation()

if __name__ == "__main__":
    asyncio.run(main()) 