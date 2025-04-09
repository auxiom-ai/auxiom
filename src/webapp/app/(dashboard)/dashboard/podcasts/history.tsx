"use client"

import { useState, useMemo, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Slider } from "@/components/ui/slider"
import { PlayCircle, PauseCircle, BookOpen, SkipBack, SkipForward, CheckCircle, Gauge, Radio } from "lucide-react"
import Image from "next/image"
import { setListened } from "@/lib/actions"
import { Toast } from "@/components/ui/toast"
import dotenv from 'dotenv';

dotenv.config();

export default function LearningProgress({
  podcasts,
}: {
  podcasts: Array<{
    id: number
    title: string
    episodeNumber: number
    date: string
    duration: string
    listened: boolean
    articles: { title: string; description: string; url: string }[]
    script: string[]
  }>
}) {
  const [expandedPodcast, setExpandedPodcast] = useState<number | null>(null)
  const [playerOpen, setPlayerOpen] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [playbackSpeed, setPlaybackSpeed] = useState(1)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentPodcast, setCurrentPodcast] = useState<{
    id: number
    title: string
    episodeNumber: number
    date: string
    duration: string
    listened: boolean
    articles: { title: string; description: string; url: string }[]
    script: string[]
  } | null>(null)
  const [listenedPodcasts, setListenedPodcasts] = useState<Record<number, boolean>>(() => {
    const initialState: Record<number, boolean> = {}
    podcasts.forEach((podcast) => {
      initialState[podcast.id] = podcast.listened
    })
    return initialState
  })
  const websocketRef = useRef<WebSocket | null>(null)
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null)
  const mediaSourceRef = useRef<MediaSource | null>(null)
  const sourceBufferRef = useRef<SourceBuffer | null>(null)
  const audioQueueRef = useRef<ArrayBuffer[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [currentTranscript, setCurrentTranscript] = useState("")
  const [currentHost, setCurrentHost] = useState(1)
  const eventSourceRef = useRef<EventSource | null>(null)
  const [isBuffering, setIsBuffering] = useState(true)
  const bufferSizeRef = useRef<number>(0)
  const hasStartedPlayingRef = useRef<boolean>(false)
  const bufferTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const [isLive, setIsLive] = useState(true)
  const [totalStreamedTime, setTotalStreamedTime] = useState(0)
  const streamStartTimeRef = useRef<number>(0)
  const audioChunksRef = useRef<ArrayBuffer[]>([])
  const [isSeeking, setIsSeeking] = useState(false)

  const sortedPodcasts = useMemo(() => {
    return [...podcasts].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }, [podcasts])

  const togglePodcast = (id: number) => {
    setExpandedPodcast(expandedPodcast === id ? null : id)
  }

  const formatTime = (time: number) => {
    if (isNaN(time)) return "0:00"
    const minutes = Math.floor(time / 60)
    const seconds = Math.floor(time % 60)
    return `${minutes}:${seconds.toString().padStart(2, "0")}`
  }

  const handlePlayPodcast = async (podcast: {
    id: number;
    title: string;
    episodeNumber: number;
    date: string;
    duration: string;
    listened: boolean;
    articles: { title: string; description: string; url: string }[];
    script: string[];
  }) => {
    console.log("Starting podcast playback:", podcast.title);
    setCurrentPodcast(podcast);
    setPlayerOpen(true);
    setIsStreaming(true);
    setIsBuffering(true);
    hasStartedPlayingRef.current = false;
    bufferSizeRef.current = 0;
    setIsLive(true);
    setTotalStreamedTime(0);
    streamStartTimeRef.current = Date.now();
    audioChunksRef.current = [];
    
    // Clean up existing MediaSource and related references for a new podcast
    if (mediaSourceRef.current) {
      URL.revokeObjectURL(audioPlayerRef.current?.src || "");
      mediaSourceRef.current = null;
      sourceBufferRef.current = null;
      audioQueueRef.current = [];
    }
    
    // Close any existing EventSource
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    
    // Clear any existing timeout
    if (bufferTimeoutRef.current) {
      clearTimeout(bufferTimeoutRef.current);
      bufferTimeoutRef.current = null;
    }

    // Create a new MediaSource object
    mediaSourceRef.current = new MediaSource();
    const mediaSourceUrl = URL.createObjectURL(mediaSourceRef.current);
    if (audioPlayerRef.current) {
      audioPlayerRef.current.src = mediaSourceUrl;
    }

    mediaSourceRef.current.addEventListener("sourceopen", () => {
      console.log("MediaSource opened");
      const mimeType = "audio/mpeg"; // Consider making this configurable

      if (!MediaSource.isTypeSupported(mimeType)) {
        console.error(`MIME type "${mimeType}" is not supported`);
        return;
      }

      const sourceBuffer = mediaSourceRef.current?.addSourceBuffer(mimeType);
      sourceBufferRef.current = sourceBuffer || null;

      sourceBuffer?.addEventListener("updateend", () => {
        // Process the next chunk in the queue
        processAudioQueue();
      });
      
      // Set a timeout to force start playback if buffering takes too long
      bufferTimeoutRef.current = setTimeout(() => {
        if (isBuffering && audioPlayerRef.current && sourceBufferRef.current && 
            sourceBufferRef.current.buffered.length > 0) {
          console.log("Buffer timeout reached, forcing playback start");
          hasStartedPlayingRef.current = true;
          setIsBuffering(false);
          setIsPlaying(true);
          audioPlayerRef.current.play().catch(err => {
            console.error("Error starting playback after timeout:", err);
          });
        }
      }, 5000); // 5 seconds timeout
    });

    // Connect to SSE
    console.log("Connecting to SSE endpoint with podcast script");
    try {
      eventSourceRef.current = await connectToWebSocket(podcast.script);
    } catch (error) {
      console.error("Failed to connect to SSE:", error);
      setIsStreaming(false);
      setIsBuffering(false);
    }
  };

  const connectToWebSocket = async (script: string[]) => {
    try {
      console.log("Attempting to connect to SSE endpoint...");
      script = ['hello, I am mark', 'hi mark, I am rahil', 'please work'];
      
      // Create EventSource for SSE
      const sseUrl = `/api/ws/podcast?script=${encodeURIComponent(JSON.stringify(script))}`;
      console.log("Connecting to SSE URL:", sseUrl);
      
      const eventSource = new EventSource(sseUrl);
      
      // Set up event handlers
      eventSource.onopen = () => {
        console.log("SSE connection established");
      };
      
      eventSource.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          console.log("Received message:", message.type);
          
          switch (message.type) {
            case 'metadata':
              console.log(`Received metadata: ${message.turns} turns`);
              break;
              
            case 'status':
              console.log(`Status update: ${message.message}`);
              if (message.progress !== undefined) {
                console.log(`Progress: ${message.progress}%`);
              }
              break;
              
            case 'host':
              console.log(`Host change: ${message.host}`);
              setCurrentHost(message.host);
              break;
              
            case 'audio':
              // Handle audio data (base64 encoded)
              console.log("Received audio data chunk");
              if (message.data) {
                try {
                  // Convert base64 to ArrayBuffer
                  const binaryString = atob(message.data);
                  const bytes = new Uint8Array(binaryString.length);
                  for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                  }
                  
                  // Add to audio queue
                  audioQueueRef.current.push(bytes.buffer);
                  
                  // Process queue if source buffer is ready
                  if (sourceBufferRef.current && !sourceBufferRef.current.updating) {
                    processAudioQueue();
                  }
                } catch (error) {
                  console.error("Error processing audio data:", error);
                }
              }
              break;
              
            case 'segment_end':
              console.log(`Segment ${message.turn} completed`);
              break;
              
            case 'complete':
              console.log("Streaming completed");
              eventSource.close();
              break;
              
            case 'error':
              console.error("Server error:", message.message);
              eventSource.close();
              break;
              
            default:
              console.warn("Unknown message type:", message.type);
          }
        } catch (error) {
          console.error("Error processing message:", error);
        }
      };
      
      eventSource.onerror = (error) => {
        console.error("SSE error:", error);
        // Don't close the connection on error, it might recover
        // Only close if we get a specific error message
      };
      
      return eventSource;
    } catch (error) {
      console.error("Error connecting to SSE:", error);
      throw error;
    }
  };

  // Function to process the audio queue
  const processAudioQueue = () => {
    if (!sourceBufferRef.current || sourceBufferRef.current.updating || audioQueueRef.current.length === 0) {
      return;
    }
    
    const nextChunk = audioQueueRef.current.shift();
    if (nextChunk) {
      try {
        // Check if the source buffer is in a valid state
        if (sourceBufferRef.current.updating) {
          console.log("Source buffer is still updating, adding chunk back to queue");
          audioQueueRef.current.unshift(nextChunk);
          return;
        }
        
        // Store the chunk for seeking
        audioChunksRef.current.push(nextChunk);
        
        // Try to append the buffer
        sourceBufferRef.current.appendBuffer(nextChunk);
        
        // Update buffer size
        bufferSizeRef.current += nextChunk.byteLength;
        
        // Update total streamed time
        if (!isSeeking) {
          const elapsedTime = (Date.now() - streamStartTimeRef.current) / 1000;
          setTotalStreamedTime(elapsedTime);
        }
        
        // Check if we should start playing (after 2000 bytes)
        if (!hasStartedPlayingRef.current && bufferSizeRef.current >= 2000 && audioPlayerRef.current) {
          console.log("Buffer size reached 2000 bytes, starting playback");
          hasStartedPlayingRef.current = true;
          setIsBuffering(false);
          setIsPlaying(true);
          
          // Clear any existing timeout
          if (bufferTimeoutRef.current) {
            clearTimeout(bufferTimeoutRef.current);
            bufferTimeoutRef.current = null;
          }
          
          audioPlayerRef.current.play().catch(err => {
            console.error("Error starting playback:", err);
            // If autoplay is prevented, we need to wait for user interaction
            if (err.name === "NotAllowedError") {
              console.log("Autoplay prevented by browser");
              setIsBuffering(false);
              setIsPlaying(false);
            }
          });
        }
      } catch (error) {
        console.error("Error appending buffer:", error);
        
        // If we get an error, try to recover
        if (error instanceof DOMException && error.name === "QuotaExceededError") {
          console.log("Buffer quota exceeded, removing old data");
          try {
            // Remove data from the beginning of the buffer
            if (sourceBufferRef.current.buffered.length > 0) {
              const start = sourceBufferRef.current.buffered.start(0);
              const end = sourceBufferRef.current.buffered.end(0);
              const removeEnd = Math.min(end, start + 1); // Remove 1 second of data
              
              sourceBufferRef.current.remove(start, removeEnd);
              console.log(`Removed data from ${start} to ${removeEnd}`);
            }
          } catch (removeError) {
            console.error("Error removing buffer data:", removeError);
          }
        }
        
        // Add the chunk back to the queue to try again later
        audioQueueRef.current.unshift(nextChunk);
      }
    }
  };

  const togglePlayPause = () => {
    if (audioPlayerRef.current) {
      if (isPlaying) {
        audioPlayerRef.current.pause();
      } else {
        // If we're still buffering, don't try to play yet
        if (isBuffering) {
          console.log("Still buffering, cannot play yet");
          return;
        }
        
        audioPlayerRef.current.play().catch((err) => {
          console.error("Error starting playback:", err);
        });
      }
      // Note: We don't set isPlaying here anymore, it's handled by the event listeners
    }
  }

  const handleSkipForward = () => {
    if (audioPlayerRef.current) {
      audioPlayerRef.current.currentTime = Math.min(
        audioPlayerRef.current.currentTime + 10,
        duration || audioPlayerRef.current.duration || 0,
      )
      setCurrentTime(audioPlayerRef.current.currentTime)
    }
  }

  const handleSkipBackward = () => {
    if (audioPlayerRef.current) {
      audioPlayerRef.current.currentTime = Math.max(audioPlayerRef.current.currentTime - 10, 0)
      setCurrentTime(audioPlayerRef.current.currentTime)
    }
  }

  useEffect(() => {
    // Create audio element
    audioPlayerRef.current = new Audio();
    audioPlayerRef.current.controls = true; // Make the audio player visible for debugging
    audioPlayerRef.current.autoplay = false; // Important: don't autoplay until we're ready

    // Append the audio player to the DOM for debugging
    const audioContainer = document.getElementById("audio-debug-container");
    if (audioContainer && audioPlayerRef.current) {
      audioContainer.appendChild(audioPlayerRef.current);
    }

    // Add debug listeners
    const handleCanPlay = () => {
      console.log("Audio can play now");
      // Don't automatically play here, we'll handle that in the buffer processing
    };

    const handlePlaying = () => {
      console.log("Audio is playing");
      setIsPlaying(true);
      setIsBuffering(false);
    };
    
    const handlePause = () => {
      console.log("Audio is paused");
      setIsPlaying(false);
    };
    
    const handleWaiting = () => {
      console.log("Audio waiting for more data");
      setIsBuffering(true);
    };
    
    const handleStalled = () => {
      console.log("Audio playback has stalled");
      setIsBuffering(true);
    };
    
    const handleError = (e: ErrorEvent) => {
      console.error("Audio error:", e);
      setIsBuffering(false);
    };

    if (audioPlayerRef.current) {
      audioPlayerRef.current.addEventListener("canplay", handleCanPlay);
      audioPlayerRef.current.addEventListener("playing", handlePlaying);
      audioPlayerRef.current.addEventListener("pause", handlePause);
      audioPlayerRef.current.addEventListener("waiting", handleWaiting);
      audioPlayerRef.current.addEventListener("stalled", handleStalled);
      audioPlayerRef.current.addEventListener("error", handleError);
    }

    // Cleanup logic
    return () => {
      if (audioPlayerRef.current) {
        audioPlayerRef.current.removeEventListener("canplay", handleCanPlay);
        audioPlayerRef.current.removeEventListener("playing", handlePlaying);
        audioPlayerRef.current.removeEventListener("pause", handlePause);
        audioPlayerRef.current.removeEventListener("waiting", handleWaiting);
        audioPlayerRef.current.removeEventListener("stalled", handleStalled);
        audioPlayerRef.current.removeEventListener("error", handleError);
        audioPlayerRef.current.pause();
        audioPlayerRef.current.src = "";
        audioPlayerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (audioPlayerRef.current) {
      if (isPlaying) {
        // Only try to play if we have a valid source
        if (audioPlayerRef.current.src) {
          console.log("Attempting to play audio")
          const playPromise = audioPlayerRef.current.play()
          if (playPromise !== undefined) {
            playPromise.catch((err) => {
              console.error("Failed to start playback:", err)
              // If autoplay is prevented, we need to wait for user interaction
              if (err.name === "NotAllowedError") {
                console.log("Autoplay prevented. Waiting for user interaction.")
                setIsPlaying(false)
              }
            })
          }
        } else {
          console.log("Cannot play - no audio source available")
          setIsPlaying(false)
        }
      } else {
        audioPlayerRef.current.pause()
      }
    }
  }, [isPlaying])

  useEffect(() => {
    if (playerOpen && currentPodcast?.script) {
      // SSE connection is handled in handlePlayPodcast
    } else {
      // Clean up if player is closed or no podcast is selected
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      
      // Clear any existing timeout
      if (bufferTimeoutRef.current) {
        clearTimeout(bufferTimeoutRef.current);
        bufferTimeoutRef.current = null;
      }
      
      if (mediaSourceRef.current && mediaSourceRef.current.readyState === "open") {
        mediaSourceRef.current.endOfStream();
        URL.revokeObjectURL(audioPlayerRef.current?.src || "");
        mediaSourceRef.current = null;
        sourceBufferRef.current = null;
        audioQueueRef.current = [];
        if (audioPlayerRef.current) {
          audioPlayerRef.current.src = "";
          audioPlayerRef.current.load();
        }
      }
      setIsStreaming(false);
      setIsPlaying(false);
    }
  }, [playerOpen, currentPodcast?.script])

  useEffect(() => {
    const updateTime = () => {
      if (audioPlayerRef.current) {
        if (isLive && !isSeeking) {
          // For live playback, use the total streamed time
          setCurrentTime(totalStreamedTime);
          setDuration(totalStreamedTime);
        } else {
          // For seeking, use the audio element's time
          setCurrentTime(audioPlayerRef.current.currentTime);
          setDuration(audioPlayerRef.current.duration || totalStreamedTime);
        }
      }
    }

    if (audioPlayerRef.current) {
      audioPlayerRef.current.addEventListener("timeupdate", updateTime)
      audioPlayerRef.current.addEventListener("loadedmetadata", updateTime) // Get initial duration

      // Set playback speed when the audio is ready
      audioPlayerRef.current.playbackRate = playbackSpeed
    }

    return () => {
      if (audioPlayerRef.current) {
        audioPlayerRef.current.removeEventListener("timeupdate", updateTime)
        audioPlayerRef.current.removeEventListener("loadedmetadata", updateTime)
      }
    }
  }, [playbackSpeed, isLive, totalStreamedTime, isSeeking])

  useEffect(() => {
    if (audioPlayerRef.current) {
      audioPlayerRef.current.playbackRate = playbackSpeed
    }
  }, [playbackSpeed])

  const handleSeek = (value: number[]) => {
    if (!audioPlayerRef.current || !sourceBufferRef.current) return;
    
    setIsSeeking(true);
    setIsLive(false);
    
    // Calculate the target time
    const targetTime = value[0];
    
    // If seeking to the end (live position)
    if (targetTime >= totalStreamedTime - 0.5) {
      setIsLive(true);
      audioPlayerRef.current.currentTime = totalStreamedTime;
      return;
    }
    
    // Otherwise, seek to the specified position
    audioPlayerRef.current.currentTime = targetTime;
  };
  
  const handleSeekEnd = () => {
    setIsSeeking(false);
    
    // If we're at the end, switch back to live mode
    if (audioPlayerRef.current && 
        audioPlayerRef.current.currentTime >= totalStreamedTime - 0.5) {
      setIsLive(true);
    }
  };

  return (
    <div className="min-h-screen py-6 sm:py-12 px-2 sm:px-4">
      <div className="container mx-auto max-w-4xl">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 mb-2">Learning Progress</h1>
        <p className="text-gray-600 mb-6">
          Track your podcast history and explore related articles to deepen your knowledge.
        </p>
        <Separator className="my-6" />

        <div className="space-y-6">
          {sortedPodcasts.length > 0 ? (
            sortedPodcasts.map((podcast, index) => (
              <Card
                key={podcast.id}
                className="backdrop-blur-lg bg-black bg-opacity-10 border-none overflow-hidden shadow-md"
              >
                <CardContent className="p-0">
                  <div
                    className="p-6 cursor-pointer transition-all duration-300"
                    onClick={() => togglePodcast(podcast.id)}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between w-full gap-2">
                      <div className="flex flex-col items-start">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className="text-sm font-semibold text-gray-500 bg-gray-200 bg-opacity-50 px-2 py-0.5 rounded-full inline-block whitespace-nowrap">
                            Episode {podcast.episodeNumber}
                          </span>
                          <h2 className={`text-xl font-normal text-gray-800 break-words`}>
                            {podcast.title}
                            {listenedPodcasts[podcast.id] && (
                              <span className="inline-flex items-center ml-2 text-green-600">
                                <CheckCircle className="h-4 w-4 mr-1" />
                                <span className="text-xs">Listened</span>
                              </span>
                            )}
                          </h2>
                        </div>
                        <div className="flex items-center gap-4">
                          <p className="text-sm text-gray-500">
                            {new Date(podcast.date).toLocaleDateString("en-US", {
                              year: "numeric",
                              month: "long",
                              day: "numeric",
                            })}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 self-end sm:self-center mt-2 sm:mt-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="rounded-full hover:bg-gray-200 hover:bg-opacity-50"
                          onClick={(e) => {
                            e.stopPropagation()
                            handlePlayPodcast(podcast)
                          }}
                        >
                          <PlayCircle className="h-6 w-6 text-gray-800" />
                        </Button>
                      </div>
                    </div>
                  </div>

                  <AnimatePresence>
                    {expandedPodcast === podcast.id && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.3 }}
                      >
                        <div className="px-6 py-4 border-t border-gray-100">
                          <h3 className="text-lg font-semibold mb-4 flex items-center text-gray-800">
                            <BookOpen className="h-5 w-5 mr-2" />
                            Related Articles
                          </h3>
                          <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2">
                            {podcast.articles.map((article, index) => (
                              <div key={index} className="flex flex-col items-start gap-2">
                                <a
                                  href={article.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-gray-800 hover:underline font-bold"
                                >
                                  {article.title}
                                </a>
                                <p className="text-gray-500 text-sm">{article.description}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </CardContent>
              </Card>
            ))
          ) : (
            <Card className="backdrop-blur-lg bg-black bg-opacity-10 border-none overflow-hidden shadow-md">
              <CardContent className="p-6 text-center">
                <div className="flex flex-col items-center justify-center py-8 space-y-4">
                  <div className="rounded-full bg-gray-200 p-4">
                    <PlayCircle className="h-10 w-10 text-gray-500" />
                  </div>
                  <h3 className="text-xl font-medium text-gray-800">No podcasts yet</h3>
                  <p className="text-gray-600 max-w-md">
                    Your podcasts will appear here once you start listening. Check back soon for new content!
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Popup Podcast Player */}
      <Dialog open={playerOpen} onOpenChange={setPlayerOpen}>
        <DialogContent className="w-[95vw] max-w-md backdrop-blur-xl bg-black/50 border border-gray-800 shadow-2xl text-white">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-white">{currentPodcast?.title}</DialogTitle>
            <DialogDescription className="text-gray-300">
              {currentPodcast &&
                new Date(currentPodcast.date).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            <div className="relative w-full h-48 bg-gray-900/60 rounded-lg flex items-center justify-center">
              <div className="w-24 h-24 rounded-full bg-white bg-opacity-20 backdrop-blur-md flex items-center justify-center">
                <motion.div
                  animate={{ scale: isPlaying ? [1, 1.1, 1] : 1 }}
                  transition={{ duration: 5, ease: "easeInOut", repeat: Number.POSITIVE_INFINITY }}
                  className="w-20 h-20 rounded-full bg-amber-100 flex items-center justify-center"
                >
                  <Image src="/logo.svg" alt="Company Logo" width={50} height={50} />
                </motion.div>
              </div>
            </div>

            {/* Transcript display for streaming */}
            {isStreaming && currentTranscript && (
              <div className="bg-gray-800/50 p-3 rounded-md mb-2">
                <div className="flex items-center gap-2 mb-1">
                  <Radio className="h-4 w-4 text-amber-200" />
                  <span className="text-sm font-medium text-amber-200">Host {currentHost}</span>
                </div>
                <p className="text-sm text-gray-200 italic">{currentTranscript}</p>
              </div>
            )}

            <div className="space-y-2">
              <div className="flex justify-between text-sm text-gray-300">
                <span>{formatTime(currentTime)}</span>
                <span>{isLive ? "LIVE" : formatTime(duration)}</span>
              </div>
              <Slider
                value={[isLive ? totalStreamedTime : currentTime]}
                max={isLive ? totalStreamedTime : duration || 100}
                step={0.1}
                className="cursor-pointer bg-gray-500/50"
                onValueChange={handleSeek}
                onValueCommit={handleSeekEnd}
              />
              {isLive && (
                <div className="flex justify-end">
                  <span className="text-xs text-amber-200 flex items-center">
                    <span className="w-2 h-2 bg-red-500 rounded-full mr-1 animate-pulse"></span>
                    LIVE
                  </span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-center space-x-4">
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full text-gray-200 hover:text-white hover:bg-gray-800/70"
                onClick={handleSkipBackward}
              >
                <SkipBack className="h-6 w-6" />
              </Button>
              <Button
                variant="default"
                size="icon"
                className="rounded-full h-12 w-12 bg-amber-100 hover:bg-amber-100/70 text-black"
                onClick={togglePlayPause}
              >
                {isBuffering ? (
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-black border-t-transparent" />
                ) : isPlaying ? (
                  <PauseCircle className="h-8 w-8" />
                ) : (
                  <PlayCircle className="h-8 w-8" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full text-gray-200 hover:text-white hover:bg-gray-800/70"
                onClick={handleSkipForward}
              >
                <SkipForward className="h-6 w-6" />
              </Button>
            </div>

            {/* Playback Speed Control */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Gauge className="h-4 w-4 text-gray-300" />
                <span className="text-sm text-gray-300">Speed</span>
              </div>
              <div className="flex gap-2">
                {[0.5, 1, 1.5, 2].map((speed) => (
                  <Button
                    key={speed}
                    variant={playbackSpeed === speed ? "default" : "outline"}
                    size="sm"
                    className={`px-2 py-1 text-xs ${playbackSpeed === speed ? "bg-amber-100 text-black" : "text-gray-300"}`}
                    onClick={() => setPlaybackSpeed(speed)}
                  >
                    {speed}x
                  </Button>
                ))}
              </div>
            </div>

            {/* Streaming indicator */}
            {isStreaming && (
              <div className="flex items-center gap-2 text-amber-200 text-sm">
                <Radio className="h-4 w-4 animate-pulse" />
                <span>Streaming audio in real-time</span>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
      <div id="audio-debug-container" className="hidden"></div>
    </div>
  )
}