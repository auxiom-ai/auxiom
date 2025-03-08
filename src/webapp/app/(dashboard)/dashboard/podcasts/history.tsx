"use client"

import { useState, useMemo, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Slider } from "@/components/ui/slider"
import { PlayCircle, PauseCircle, BookOpen, SkipBack, SkipForward, CheckCircle, Gauge } from "lucide-react"
import Image from "next/image"
import { setListened } from "@/lib/actions"

export default function LearningProgress({
  podcasts,
}: {
  podcasts: Array<{
    id: number
    title: string
    episodeNumber: number
    date: string
    duration: string
    audioFileUrl: string
    listened: boolean
    articles: { title: string; description: string; url: string }[]
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
    audioFileUrl: string
    listened: boolean
    articles: { title: string; description: string; url: string }[]
  } | null>(null)
  const [listenedPodcasts, setListenedPodcasts] = useState<Record<number, boolean>>(() => {
    const initialState: Record<number, boolean> = {}
    podcasts.forEach((podcast) => {
      initialState[podcast.id] = podcast.listened // Use podcast.id for unique keys
    })
    return initialState
  })
  const audioRef = useRef<HTMLAudioElement>(null)

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
    id: number
    title: string
    episodeNumber: number
    date: string
    duration: string
    audioFileUrl: string
    listened: boolean
    articles: { title: string; description: string; url: string }[]
  }) => {
    setCurrentPodcast(podcast)
    setPlayerOpen(true)
    setIsPlaying(true)

    // Mark as listened after 5 seconds of playback
    setTimeout(() => {
      setListenedPodcasts((prev) => ({
        ...prev,
        [podcast.id]: true,
      }))
    }, 5000)

    // Mark as listened in the database
    const res = await setListened(podcast.id)
    if (res.error) {
      console.error("Failed to mark podcast as listened:", res.error)
    } else {
      console.log("Podcast marked as listened successfully")
    }
  }

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime)
    }
  }

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration)

      // Set the playback rate when audio loads
      audioRef.current.playbackRate = playbackSpeed
    }
  }

  const handleSeek = (value: number[]) => {
    const newTime = value[0]
    setCurrentTime(newTime)
    if (audioRef.current) {
      audioRef.current.currentTime = newTime
    }
  }

  const handleSpeedChange = (value: number[]) => {
    const newSpeed = value[0]
    setPlaybackSpeed(newSpeed)
    if (audioRef.current) {
      audioRef.current.playbackRate = newSpeed
    }
  }

  const setPlaybackSpeedPreset = (speed: number) => {
    setPlaybackSpeed(speed)
    if (audioRef.current) {
      audioRef.current.playbackRate = speed
    }
  }

  const togglePlayPause = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause()
      } else {
        audioRef.current.play()
      }
      setIsPlaying(!isPlaying)
    }
  }

  const handleSkipForward = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = Math.min(audioRef.current.currentTime + 10, audioRef.current.duration)
    }
  }

  const handleSkipBackward = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = Math.max(audioRef.current.currentTime - 10, 0)
    }
  }

  // Update playback rate when speed changes
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackSpeed
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
          {sortedPodcasts.map((podcast, index) => (
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
          ))}
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

            <div className="space-y-2">
              <div className="flex justify-between text-sm text-gray-300">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
              <Slider
                value={[currentTime]}
                max={duration || 100}
                step={0.1}
                onValueChange={handleSeek}
                className="cursor-pointer bg-gray-500/50"
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
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Gauge className="h-4 w-4 text-amber-200" />
                <span className="text-sm text-gray-200 font-medium">Playback Speed: {playbackSpeed.toFixed(1)}x</span>
              </div>
              <Slider
                value={[playbackSpeed]}
                min={0.5}
                max={2.5}
                step={0.1}
                onValueChange={handleSpeedChange}
                className="cursor-pointer"
              />
              <div className="grid grid-cols-4 gap-1 mt-2">
                <Button
                  variant="outline"
                  size="sm"
                  className={`text-xs px-1 sm:px-2 py-1 h-auto border-gray-700 text-gray-800 ${
                    playbackSpeed === 0.5 ? "bg-amber-100 hover:bg-amber-100/30" : "bg-gray-400 hover:bg-gray-400/70"
                  }`}
                  onClick={() => setPlaybackSpeedPreset(0.5)}
                >
                  0.5x
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className={`text-xs px-1 sm:px-2 py-1 h-auto border-gray-700 text-gray-800 ${
                    playbackSpeed === 1.0 ? "bg-amber-100 hover:bg-amber-100/30" : "bg-gray-400 hover:bg-gray-400/70"
                  }`}
                  onClick={() => setPlaybackSpeedPreset(1.0)}
                >
                  1.0x
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className={`text-xs px-1 sm:px-2 py-1 h-auto border-gray-700 text-gray-800 ${
                    playbackSpeed === 1.5 ? "bg-amber-100 hover:bg-amber-100/30" : "bg-gray-400 hover:bg-gray-400/70"
                  }`}
                  onClick={() => setPlaybackSpeedPreset(1.5)}
                >
                  1.5x
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className={`text-xs px-1 sm:px-2 py-1 h-auto border-gray-700 text-gray-800 ${
                    playbackSpeed === 2.0 ? "bg-amber-100 hover:bg-amber-100/30" : "bg-gray-400 hover:bg-gray-400/70"
                  }`}
                  onClick={() => setPlaybackSpeedPreset(2.0)}
                >
                  2.0x
                </Button>
              </div>
            </div>
          </div>

          <audio
            ref={audioRef}
            src={currentPodcast?.audioFileUrl}
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            onEnded={() => setIsPlaying(false)}
            autoPlay
            className="hidden"
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}

