"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";

export default function WebSocketTest() {
  const [messages, setMessages] = useState<string[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mediaSourceRef = useRef<MediaSource | null>(null);
  const sourceBufferRef = useRef<SourceBuffer | null>(null);
  const audioQueueRef = useRef<ArrayBuffer[]>([]);

  useEffect(() => {
    // Create audio element
    audioRef.current = new Audio();
    audioRef.current.controls = true;
    
    // Create MediaSource
    mediaSourceRef.current = new MediaSource();
    const mediaSourceUrl = URL.createObjectURL(mediaSourceRef.current);
    if (audioRef.current) {
      audioRef.current.src = mediaSourceUrl;
    }

    // Append the audio player to the DOM
    const audioContainer = document.getElementById("audio-player-container");
    if (audioContainer && audioRef.current) {
      audioContainer.appendChild(audioRef.current);
    }

    // Set up MediaSource
    mediaSourceRef.current.addEventListener("sourceopen", () => {
      try {
        const mimeType = "audio/mpeg";
        if (!MediaSource.isTypeSupported(mimeType)) {
          setError(`MIME type ${mimeType} is not supported`);
          return;
        }

        const sourceBuffer = mediaSourceRef.current?.addSourceBuffer(mimeType);
        sourceBufferRef.current = sourceBuffer || null;

        sourceBuffer?.addEventListener("updateend", () => {
          if (audioQueueRef.current.length > 0 && !sourceBuffer.updating) {
            const nextChunk = audioQueueRef.current.shift();
            if (nextChunk) {
              try {
                sourceBuffer.appendBuffer(nextChunk);
              } catch (error) {
                console.error("Error appending buffer:", error);
              }
            }
          }
        });
      } catch (error) {
        console.error("Error setting up MediaSource:", error);
        setError(`Error setting up MediaSource: ${error}`);
      }
    });

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
      }
    };
  }, []);

  const connectWebSocket = () => {
    try {
      // Use secure WebSocket if the page is served over HTTPS
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/api/ws/podcast`;
      console.log("Connecting to WebSocket:", wsUrl);
      
      // Add connection timeout
      const connectionTimeout = setTimeout(() => {
        if (wsRef.current && wsRef.current.readyState !== WebSocket.OPEN) {
          console.error("WebSocket connection timeout");
          setError("Connection timeout. Please try again.");
          wsRef.current.close();
        }
      }, 5000);
      
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.binaryType = "arraybuffer";

      ws.onopen = () => {
        clearTimeout(connectionTimeout);
        setConnected(true);
        setMessages((prev) => [...prev, "Connected to WebSocket"]);
        
        // Send initial message to start the podcast streaming
        ws.send(JSON.stringify({
          type: "script",
          script: ["Hello, this is a test podcast.", "This is the second turn of the podcast."]
        }));
      };

      ws.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
          // Handle binary audio data
          if (sourceBufferRef.current && !sourceBufferRef.current.updating) {
            try {
              sourceBufferRef.current.appendBuffer(event.data);
            } catch (error) {
              console.error("Error appending buffer:", error);
              audioQueueRef.current.push(event.data);
            }
          } else {
            audioQueueRef.current.push(event.data);
          }
        } else {
          // Handle JSON messages
          try {
            const message = JSON.parse(event.data as string);
            setMessages((prev) => [...prev, `Message: ${JSON.stringify(message)}`]);
            
            // Auto-play when we receive the first audio chunk
            if (message.type === "host" && audioRef.current && audioRef.current.paused) {
              audioRef.current.play().catch(err => console.error("Playback error:", err));
            }
          } catch (error) {
            console.error("Error parsing message:", error);
          }
        }
      };

      ws.onerror = (error) => {
        console.error("WebSocket error:", error);
        setError("WebSocket connection error");
      };

      ws.onclose = () => {
        setConnected(false);
        setMessages((prev) => [...prev, "WebSocket connection closed"]);
      };
    } catch (error) {
      console.error("Error connecting to WebSocket:", error);
      setError(`Error connecting: ${error}`);
    }
  };

  return (
    <div className="container mx-auto p-4 max-w-2xl">
      <h1 className="text-2xl font-bold mb-4">WebSocket Test</h1>
      
      <div className="mb-4">
        <Button 
          onClick={connectWebSocket} 
          disabled={connected}
          className="mr-2"
        >
          Connect
        </Button>
        
        <Button 
          onClick={() => {
            if (wsRef.current) {
              wsRef.current.close();
            }
          }}
          disabled={!connected}
          variant="destructive"
        >
          Disconnect
        </Button>
      </div>
      
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}
      
      <div className="mb-4">
        <h2 className="text-xl font-semibold mb-2">Audio Player</h2>
        <div id="audio-player-container"></div>
      </div>
      
      <div className="mb-4">
        <h2 className="text-xl font-semibold mb-2">Messages</h2>
        <div className="bg-gray-100 p-4 rounded h-64 overflow-y-auto">
          {messages.map((msg, index) => (
            <div key={index} className="mb-1">{msg}</div>
          ))}
        </div>
      </div>
    </div>
  );
} 