import { cn } from '../utils/format'

interface WaveformProps {
  data: number[]
  progress?: number
  active?: boolean
  className?: string
  onSeek?: (progress: number) => void
  label?: string
}

export function Waveform({ data, progress = 0, active = false, className, onSeek, label = '音频波形' }: WaveformProps) {
  const safeData = data.length ? data : [20, 34, 52, 28, 64, 42]
  return (
    <div
      className={cn('waveform', active && 'waveform-active', onSeek && 'waveform-interactive', className)}
      role={onSeek ? undefined : 'img'} aria-label={onSeek ? undefined : label}
    >
      {safeData.map((height, index) => {
        const filled = index / safeData.length <= progress
        return <span key={`${index}-${height}`} className={filled ? 'wave-bar-filled' : ''} style={{ height: `${height}%` }} />
      })}
      {onSeek && (
        <input
          className="waveform-range"
          type="range"
          min="0"
          max="1000"
          step="1"
          value={Math.round(progress * 1000)}
          aria-label={label}
          onChange={(event) => onSeek(Number(event.currentTarget.value) / 1000)}
        />
      )}
    </div>
  )
}
