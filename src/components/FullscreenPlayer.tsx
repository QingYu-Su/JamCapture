import * as Slider from '@radix-ui/react-slider'
import { ChevronDown, Pause, Play, Volume1, Volume2, VolumeX } from 'lucide-react'
import type { CSSProperties } from 'react'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { usePlayer } from '../context/PlayerContext'
import { formatDuration } from '../utils/format'

interface FullscreenPlayerProps {
  open: boolean
  onClose: () => void
}

export function FullscreenPlayer({ open, onClose }: FullscreenPlayerProps) {
  const { current, playing, currentTime, duration, volume, toggle, seek, setVolume } = usePlayer()
  const lyricRefs = useRef<Array<HTMLButtonElement | null>>([])
  const lyricsScrollRef = useRef<HTMLDivElement | null>(null)
  const manualLyricScrollRef = useRef(false)
  const resumeLyricSyncTimerRef = useRef<number | null>(null)
  const timelineDuration = duration || current?.duration || 0
  const timelineValue = Math.min(currentTime, timelineDuration)
  const timelineProgress = timelineDuration ? (timelineValue / timelineDuration) * 100 : 0
  const timedLyrics = useMemo(() => current?.kind === 'generated' ? current.timedLyrics ?? [] : [], [current])
  const rawLyrics = current?.kind === 'generated' && current.lyrics?.trim().toLowerCase() !== 'instrumental'
    ? current.lyrics?.trim() ?? ''
    : ''
  const plainLyrics = useMemo(() => rawLyrics.split(/\r?\n/).map((line) => line.trim()).filter(Boolean), [rawLyrics])
  const activeLyricIndex = useMemo(() => {
    let active = -1
    for (let index = 0; index < timedLyrics.length; index += 1) {
      if (timedLyrics[index].startTime <= currentTime) active = index
      else break
    }
    return active
  }, [currentTime, timedLyrics])
  const VolumeIcon = volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2

  const centerActiveLyric = useCallback((behavior: ScrollBehavior = 'smooth') => {
    if (!open || activeLyricIndex < 0) return
    const container = lyricsScrollRef.current
    const activeLine = lyricRefs.current[activeLyricIndex]
    if (!container || !activeLine) return
    const containerRect = container.getBoundingClientRect()
    const lineRect = activeLine.getBoundingClientRect()
    const targetTop = container.scrollTop
      + lineRect.top
      - containerRect.top
      - container.clientHeight / 2
      + lineRect.height / 2
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    container.scrollTo({
      top: Math.max(0, targetTop),
      behavior: reducedMotion ? 'auto' : behavior,
    })
  }, [activeLyricIndex, open])

  const pauseAutomaticLyricScroll = useCallback(() => {
    manualLyricScrollRef.current = true
    if (resumeLyricSyncTimerRef.current !== null) window.clearTimeout(resumeLyricSyncTimerRef.current)
    resumeLyricSyncTimerRef.current = window.setTimeout(() => {
      manualLyricScrollRef.current = false
      resumeLyricSyncTimerRef.current = null
      centerActiveLyric()
    }, 4_000)
  }, [centerActiveLyric])

  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [onClose, open])

  useEffect(() => {
    if (!manualLyricScrollRef.current) centerActiveLyric()
  }, [centerActiveLyric])

  useEffect(() => () => {
    if (resumeLyricSyncTimerRef.current !== null) window.clearTimeout(resumeLyricSyncTimerRef.current)
  }, [])

  if (!open || !current) return null

  return (
    <section className="fullscreen-player" aria-label="全屏播放页">
      <header className="fullscreen-player-header">
        <button type="button" className="fullscreen-player-close" onClick={onClose} aria-label="收起播放页"><ChevronDown size={22} /></button>
        <div><span>NOW PLAYING</span><strong>{current.title}</strong></div>
        <i>{current.kind === 'generated' ? 'AI EXTENSION' : 'CAPTURE'}</i>
      </header>

      <div className="fullscreen-player-stage">
        <div className="vinyl-stage">
          <button type="button" className={`vinyl-record${playing ? ' is-playing' : ''}`} onClick={toggle} aria-label={playing ? '暂停' : '播放'}>
            <span className="vinyl-label"><i /><b>JAM<br />CAPTURE</b></span>
          </button>
          <div className="vinyl-copy"><strong>{current.title}</strong><span>{current.kind === 'generated' ? 'AI 延伸作品' : current.tags.instrument}</span></div>
        </div>

        <div className="lyrics-stage">
          <div className="lyrics-heading"><span>LYRICS</span><small>{timedLyrics.length ? 'SYNCED' : 'TEXT'}</small></div>
          <div
            ref={lyricsScrollRef}
            className="lyrics-scroll"
            aria-live="polite"
            onWheel={pauseAutomaticLyricScroll}
            onTouchStart={pauseAutomaticLyricScroll}
            onPointerDown={pauseAutomaticLyricScroll}
          >
            {timedLyrics.length ? timedLyrics.map((line, index) => (
              <button
                type="button"
                key={`${line.startTime}-${index}`}
                ref={(element) => { lyricRefs.current[index] = element }}
                className={index === activeLyricIndex ? 'active' : index < activeLyricIndex ? 'passed' : ''}
                aria-current={index === activeLyricIndex ? 'true' : undefined}
                onClick={() => seek(line.startTime)}
              >{line.text}</button>
            )) : plainLyrics.length ? plainLyrics.map((line, index) => <p key={`${line}-${index}`}>{line}</p>) : <div className="lyrics-empty">暂无歌词</div>}
          </div>
        </div>
      </div>

      <footer className="fullscreen-player-controls">
        <button type="button" className="fullscreen-main-play" onClick={toggle} aria-label={playing ? '暂停' : '播放'}>
          {playing ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" />}
        </button>
        <div className="fullscreen-timeline">
          <span>{formatDuration(currentTime)}</span>
          <input
            className="timeline-slider"
            type="range"
            value={timelineValue}
            min={0}
            max={Math.max(timelineDuration, 1)}
            step={0.01}
            onChange={(event) => seek(Number(event.currentTarget.value))}
            aria-label="全屏播放进度"
            style={{ '--timeline-progress': `${timelineProgress}%` } as CSSProperties}
          />
          <span>{formatDuration(timelineDuration)}</span>
        </div>
        <div className="fullscreen-volume" aria-label="音量">
          <VolumeIcon size={18} />
          <Slider.Root className="slider-root" value={[volume]} max={1} step={0.01} onValueChange={([value]) => setVolume(value)}>
            <Slider.Track className="slider-track"><Slider.Range className="slider-range" /></Slider.Track>
            <Slider.Thumb className="slider-thumb" />
          </Slider.Root>
        </div>
      </footer>
    </section>
  )
}
