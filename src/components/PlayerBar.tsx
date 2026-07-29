import * as Slider from '@radix-ui/react-slider'
import type { CSSProperties } from 'react'
import { Pause, Play, Volume1, Volume2, VolumeX, Waves } from 'lucide-react'
import { usePlayer } from '../context/PlayerContext'
import { formatDuration } from '../utils/format'

export function PlayerBar() {
  const { current, playing, currentTime, duration, volume, toggle, seek, setVolume } = usePlayer()
  const timelineDuration = duration || current?.duration || 0
  const timelineValue = Math.min(currentTime, timelineDuration)
  const timelineProgress = timelineDuration ? (timelineValue / timelineDuration) * 100 : 0
  const VolumeIcon = volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2

  return (
    <footer className="player-bar" aria-label="全局播放器">
      <div className="player-track">
        <div className="player-art"><Waves size={22} /></div>
        <div className="player-copy">
          <strong>{current?.title ?? '选择一段灵感开始播放'}</strong>
          <span>{current ? (current.kind === 'inspiration' ? current.tags.instrument : 'AI 延伸作品') : 'JamCapture Player'}</span>
        </div>
      </div>
      <button className="player-play" onClick={toggle} disabled={!current} aria-label={playing ? '暂停' : '播放'}>
        {playing ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
      </button>
      <div className="player-progress">
        <span>{formatDuration(currentTime)}</span>
        <input
          className="timeline-slider"
          type="range"
          value={timelineValue}
          min={0}
          max={Math.max(timelineDuration, 1)}
          step={0.01}
          disabled={!current || timelineDuration <= 0}
          onChange={(event) => seek(Number(event.currentTarget.value))}
          aria-label="播放进度"
          style={{ '--timeline-progress': `${timelineProgress}%` } as CSSProperties}
        />
        <span>{formatDuration(timelineDuration)}</span>
      </div>
      <div className="player-volume">
        <VolumeIcon size={18} />
        <Slider.Root className="slider-root" value={[volume]} max={1} step={0.01} onValueChange={([value]) => setVolume(value)} aria-label="音量">
          <Slider.Track className="slider-track"><Slider.Range className="slider-range" /></Slider.Track>
          <Slider.Thumb className="slider-thumb" />
        </Slider.Root>
      </div>
    </footer>
  )
}
