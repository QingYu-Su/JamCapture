import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { resolveAudioUrl } from '../utils/audio'
import type { PlayableTrack } from '../types'
import { useLibrary } from './LibraryContext'

interface PlayerContextValue {
  current: PlayableTrack | null
  playing: boolean
  currentTime: number
  duration: number
  volume: number
  play: (track: PlayableTrack) => Promise<void>
  toggle: () => void
  seek: (seconds: number) => void
  setVolume: (volume: number) => void
  stopIfTrack: (id: string) => void
}

const PlayerContext = createContext<PlayerContextValue | null>(null)

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const { getBlob, generated, ensureGeneratedLyrics } = useLibrary()
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const objectUrlRef = useRef<string | null>(null)
  const [current, setCurrent] = useState<PlayableTrack | null>(null)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolumeState] = useState(0.72)

  useEffect(() => {
    const audio = new Audio()
    audio.preload = 'metadata'
    audio.volume = 0.72
    audioRef.current = audio
    const onTime = () => setCurrentTime(audio.currentTime)
    const onDuration = () => setDuration(Number.isFinite(audio.duration) ? audio.duration : 0)
    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('loadedmetadata', onDuration)
    audio.addEventListener('play', onPlay)
    audio.addEventListener('pause', onPause)
    audio.addEventListener('ended', onPause)
    return () => {
      audio.pause()
      audio.removeEventListener('timeupdate', onTime)
      audio.removeEventListener('loadedmetadata', onDuration)
      audio.removeEventListener('play', onPlay)
      audio.removeEventListener('pause', onPause)
      audio.removeEventListener('ended', onPause)
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    }
  }, []) // A single audio element prevents competing playback across routes.

  useEffect(() => {
    if (current?.kind !== 'generated') return
    const latest = generated.find((track) => track.id === current.id)
    if (latest && latest !== current) setCurrent(latest)
  }, [current, generated])

  useEffect(() => {
    if (current?.kind !== 'generated'
      || current.generationKind !== 'full-song'
      || current.timedLyrics?.length
      || current.lyricsRecognitionAttemptedAt) return
    void ensureGeneratedLyrics(current)
  }, [current, ensureGeneratedLyrics])

  const play = useCallback(async (track: PlayableTrack) => {
    const audio = audioRef.current
    if (!audio) return
    if (current?.id === track.id) {
      if (audio.paused) await audio.play()
      else audio.pause()
      return
    }
    audio.pause()
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
    }
    const resolved = await resolveAudioUrl(track.audioSource, getBlob)
    if (resolved.revoke) objectUrlRef.current = resolved.url
    audio.src = resolved.url
    setCurrent(track)
    setCurrentTime(0)
    setDuration(track.duration)
    await audio.play()
  }, [current?.id, getBlob])

  const toggle = useCallback(() => {
    const audio = audioRef.current
    if (!audio || !current) return
    if (audio.paused) void audio.play()
    else audio.pause()
  }, [current])

  const seek = useCallback((seconds: number) => {
    if (!audioRef.current) return
    audioRef.current.currentTime = seconds
    setCurrentTime(seconds)
  }, [])

  const setVolume = useCallback((next: number) => {
    const value = Math.max(0, Math.min(1, next))
    if (audioRef.current) audioRef.current.volume = value
    setVolumeState(value)
  }, [])

  const stopIfTrack = useCallback((id: string) => {
    if (current?.id !== id || !audioRef.current) return
    audioRef.current.pause()
    audioRef.current.removeAttribute('src')
    setCurrent(null)
    setCurrentTime(0)
  }, [current?.id])

  const value = useMemo(() => ({ current, playing, currentTime, duration, volume, play, toggle, seek, setVolume, stopIfTrack }),
    [current, currentTime, duration, play, playing, seek, setVolume, stopIfTrack, toggle, volume])

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>
}

export function usePlayer() {
  const context = useContext(PlayerContext)
  if (!context) throw new Error('usePlayer must be used within PlayerProvider')
  return context
}
