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
    script: { text: string }[] // Include the script column here
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
    script: { text: string }[] // Include the script column here
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

  const connectToWebSocket = (podcastId: number, script: string) => {
    const wsUrl = `ws://localhost:${window.location.port}`; // Or 'ws://localhost:3000'
    websocketRef.current = new WebSocket(wsUrl);

    websocketRef.current.binaryType = "arraybuffer";

    websocketRef.current.onopen = () => {
      console.log("WebSocket connection established");
      websocketRef.current?.send(
        JSON.stringify({
          type: "script",
          podcastId,
          script,
        })
      );
    };

    websocketRef.current.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        console.log(`Received audio data: ${event.data.byteLength} bytes`);

        if (!sourceBufferRef.current) {
          console.warn("No SourceBuffer available, queuing chunk");
          audioQueueRef.current.push(event.data);
          return;
        }

        if (sourceBufferRef.current.updating) {
          audioQueueRef.current.push(event.data);
        } else {
          try {
            sourceBufferRef.current.appendBuffer(event.data);
            console.log(`Appended chunk of size: ${event.data.byteLength}`);
          } catch (error) {
            console.error("Error appending buffer:", error);
            audioQueueRef.current.push(event.data);
          }
        }
      } else {
        try {
          const message = JSON.parse(event.data as string);
          switch (message.type) {
            case "transcript":
              console.log(
                `Received transcript: ${message.content.text} (Host ${message.content.host})`
              );
              setCurrentTranscript(message.content.text);
              setCurrentHost(message.content.host);
              break;
            case "complete":
              console.log("Podcast streaming completed");
              setIsStreaming(false);
              break;
            case "error":
              console.error("Error:", message.content);
              setIsStreaming(false);
              setIsPlaying(false);
              break;
            default:
              console.log("Received WebSocket message:", message);
          }
        } catch (error) {
          console.error("Error parsing WebSocket message:", error);
        }
      }
    };

    websocketRef.current.onerror = (error) => {
      console.error("WebSocket error:", error);
      setIsStreaming(false);
      setIsPlaying(false);
    };

    websocketRef.current.onclose = () => {
      console.log("WebSocket connection closed");
      setIsStreaming(false);
      setIsPlaying(false);
      websocketRef.current = null; // Ensure no further messages are sent
    };
  };

  const handlePlayPodcast = async (podcast: {
    id: number;
    title: string;
    episodeNumber: number;
    date: string;
    duration: string;
    listened: boolean;
    articles: { title: string; description: string; url: string }[];
    script: { text: string }[];
  }) => {
    console.log("Starting podcast playback:", podcast.title);
    setCurrentPodcast(podcast);
    setPlayerOpen(true);

    // Clean up existing MediaSource and related references for a new podcast
    if (mediaSourceRef.current) {
      URL.revokeObjectURL(audioPlayerRef.current?.src || "");
      mediaSourceRef.current = null;
      sourceBufferRef.current = null;
      audioQueueRef.current = [];
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
    });

    // Connect to WebSocket
    console.log("Connecting to WebSocket");
    connectToWebSocket(podcast.id, JSON.stringify(podcast.script));
  };

  const togglePlayPause = () => {
    if (audioPlayerRef.current) {
      if (isPlaying) {
        audioPlayerRef.current.pause()
      } else {
        audioPlayerRef.current.play().catch((err) => {
          console.error("Error starting playback:", err)
        })
      }
      setIsPlaying(!isPlaying)
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
      if (isPlaying && audioPlayerRef.current && audioPlayerRef.current.src) {
        console.log("Attempting to play on canplay event");
        audioPlayerRef.current.play().catch((err) => {
          console.error("Error starting playback on canplay:", err);
          // Consider handling specific errors like autoplay prevention
          if (err.name === "NotAllowedError") {
            console.log("Autoplay prevented by browser.");
            // You might want to show a message to the user to interact with the player
          }
        });
      }
    };

    const handlePlaying = () => console.log("Audio is playing");
    const handlePause = () => console.log("Audio is paused");
    const handleWaiting = () => console.log("Audio waiting for more data");
    const handleStalled = () => console.log("Audio playback has stalled");
    const handleError = (e: Event & { target: HTMLAudioElement }) => console.error("Audio error:", e.target.error);

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
      // WebSocket connection is handled in handlePlayPodcast
    } else {
      // Clean up if player is closed or no podcast is selected
      if (websocketRef.current) {
        websocketRef.current.close()
        websocketRef.current = null
      }
      if (mediaSourceRef.current && mediaSourceRef.current.readyState === "open") {
        mediaSourceRef.current.endOfStream()
        URL.revokeObjectURL(audioPlayerRef.current?.src || "")
        mediaSourceRef.current = null
        sourceBufferRef.current = null
        audioQueueRef.current = []
        if (audioPlayerRef.current) {
          audioPlayerRef.current.src = ""
          audioPlayerRef.current.load()
        }
      }
      setIsStreaming(false)
      setIsPlaying(false)
    }
  }, [playerOpen, currentPodcast?.script])

  useEffect(() => {
    const updateTime = () => {
      if (audioPlayerRef.current) {
        setCurrentTime(audioPlayerRef.current.currentTime)
        setDuration(audioPlayerRef.current.duration)
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
  }, [playbackSpeed])

  useEffect(() => {
    if (audioPlayerRef.current) {
      audioPlayerRef.current.playbackRate = playbackSpeed
    }
  }, [playbackSpeed])

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
                <span>{formatTime(duration)}</span>
              </div>
              <Slider
                value={[currentTime]}
                max={duration || 100}
                step={0.1}
                className="cursor-pointer bg-gray-500/50"
                onValueChange={(value) => {
                  if (audioPlayerRef.current && !isNaN(value[0])) {
                    audioPlayerRef.current.currentTime = value[0]
                    setCurrentTime(value[0])
                  }
                }}
              />
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
                {isPlaying ? <PauseCircle className="h-8 w-8" /> : <PlayCircle className="h-8 w-8" />}
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
