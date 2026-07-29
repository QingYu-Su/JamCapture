import { AudioLines, Clock3, Disc3, LoaderCircle, LockKeyhole, Pause, Play, Volume2, VolumeX } from 'lucide-react'
import { type CSSProperties, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Waveform } from '../components/Waveform'
import { getSharedTrack, type SharedTrack } from '../services/shareClient'
import { formatDuration } from '../utils/format'

function SharedPlayer({ track, onDurationChange }: { track: SharedTrack; onDurationChange: (duration: number) => void }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(track.duration)
  const [volume, setVolume] = useState(0.72)
  const [playbackError, setPlaybackError] = useState('')
  const progress = duration ? Math.min(currentTime / duration, 1) : 0

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const updateTime = () => setCurrentTime(audio.currentTime)
    const updateDuration = () => {
      const nextDuration = Number.isFinite(audio.duration) ? audio.duration : track.duration
      setDuration(nextDuration)
      onDurationChange(nextDuration)
    }
    const markPlaying = () => setPlaying(true)
    const markPaused = () => setPlaying(false)
    audio.addEventListener('timeupdate', updateTime)
    audio.addEventListener('loadedmetadata', updateDuration)
    audio.addEventListener('play', markPlaying)
    audio.addEventListener('pause', markPaused)
    audio.addEventListener('ended', markPaused)
    return () => {
      audio.pause()
      audio.removeEventListener('timeupdate', updateTime)
      audio.removeEventListener('loadedmetadata', updateDuration)
      audio.removeEventListener('play', markPlaying)
      audio.removeEventListener('pause', markPaused)
      audio.removeEventListener('ended', markPaused)
    }
  }, [onDurationChange, track.audioUrl, track.duration])

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume
  }, [volume])

  async function togglePlayback() {
    const audio = audioRef.current
    if (!audio) return
    setPlaybackError('')
    if (!audio.paused) {
      audio.pause()
      return
    }
    try {
      await audio.play()
    } catch {
      setPlaybackError('当前浏览器无法播放这段音频')
    }
  }

  function seek(seconds: number) {
    const audio = audioRef.current
    if (!audio) return
    const next = Math.max(0, Math.min(seconds, duration))
    audio.currentTime = next
    setCurrentTime(next)
  }

  function changeVolume(next: number) {
    const value = Math.max(0, Math.min(next, 1))
    if (audioRef.current) audioRef.current.volume = value
    setVolume(value)
  }

  return (
    <div className="shared-player">
      <audio ref={audioRef} preload="metadata" src={track.audioUrl} onContextMenu={(event) => event.preventDefault()} />
      <div className="shared-player-visual">
        <div className="shared-disc"><Disc3 size={34} strokeWidth={1.25} /></div>
        <Waveform data={track.waveform} active={playing} progress={progress} onSeek={(value) => seek(value * duration)} className="shared-waveform" label="播放进度波形" />
      </div>
      <div className="shared-controls">
        <button className="shared-play-button" onClick={() => void togglePlayback()} aria-label={playing ? '暂停' : '播放'}>
          {playing ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" />}
        </button>
        <div className="shared-timeline">
          <div><span>{formatDuration(currentTime)}</span><span>{formatDuration(duration)}</span></div>
          <input
            type="range"
            min={0}
            max={Math.max(duration, 1)}
            step={0.01}
            value={Math.min(currentTime, duration)}
            onChange={(event) => seek(Number(event.currentTarget.value))}
            aria-label="播放进度"
            style={{ '--shared-progress': `${progress * 100}%` } as CSSProperties}
          />
        </div>
        <div className="shared-volume">
          <button className="shared-volume-button" onClick={() => changeVolume(volume === 0 ? 0.72 : 0)} aria-label={volume === 0 ? '取消静音' : '静音'}>
            {volume === 0 ? <VolumeX size={17} /> : <Volume2 size={17} />}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(event) => changeVolume(Number(event.currentTarget.value))}
            aria-label="音量"
            style={{ '--shared-volume-progress': `${volume * 100}%` } as CSSProperties}
          />
        </div>
      </div>
      {playbackError && <div className="shared-playback-error" role="alert">{playbackError}</div>}
    </div>
  )
}

export function SharePage() {
  const { token = '' } = useParams()
  const [track, setTrack] = useState<SharedTrack | null>(null)
  const [error, setError] = useState('')
  const [resolvedDuration, setResolvedDuration] = useState(0)

  useEffect(() => {
    void getSharedTrack(token).then((result) => {
      setTrack(result)
      setResolvedDuration(result.duration)
    }).catch((reason) => setError(reason instanceof Error ? reason.message : '分享内容加载失败'))
  }, [token])

  return (
    <main className="share-page">
      <header className="share-brand"><span><AudioLines size={21} /></span><strong>JamCapture</strong><i />只读作品</header>
      {!track && !error && <div className="share-page-state"><LoaderCircle className="spin" size={23} /><span>正在加载分享的作品</span></div>}
      {error && <div className="share-page-state share-page-error"><LockKeyhole size={24} /><strong>无法打开这条作品</strong><span>{error}</span></div>}
      {track && (
        <article className="shared-track-card">
          <div className="shared-card-topline"><span>JAMCAPTURE / SHARED AUDIO</span><span><LockKeyhole size={12} />只读访问</span></div>
          <div className="shared-title-block">
            <span>{track.subtitle ?? (track.kind === 'generated' ? 'AI 延伸作品' : '原始灵感录音')}</span>
            <h1>{track.title}</h1>
            <div className="shared-meta-line"><Clock3 size={13} /><span>{formatDuration(resolvedDuration)}</span><i /><span>{track.kind === 'generated' ? 'GENERATED WORK' : 'CAPTURED IDEA'}</span></div>
          </div>
          <div className="shared-tags">{track.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
          <SharedPlayer track={track} onDurationChange={setResolvedDuration} />
          {track.kind === 'inspiration' && track.description && <div className="shared-description"><span>AI 音频描述</span><p>{track.description}</p></div>}
        </article>
      )}
      <footer className="share-page-footer">Captured with JamCapture</footer>
    </main>
  )
}
