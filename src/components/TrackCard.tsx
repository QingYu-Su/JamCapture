import { Check, Edit3, Guitar, KeyboardMusic, Mic2, Pause, Play, Sparkles } from 'lucide-react'
import { usePlayer } from '../context/PlayerContext'
import type { InspirationTrack } from '../types'
import { cn, formatDate, formatDuration } from '../utils/format'
import { Waveform } from './Waveform'

interface TrackCardProps {
  track: InspirationTrack
  selectionMode: boolean
  selected: boolean
  onSelect: () => void
  onEdit: () => void
  onExtend: () => void
}

function InstrumentIcon({ instrument }: { instrument: string }) {
  if (instrument.toLowerCase().includes('guitar')) return <Guitar size={18} />
  if (instrument.toLowerCase().includes('vocal')) return <Mic2 size={18} />
  return <KeyboardMusic size={18} />
}

export function TrackCard({ track, selectionMode, selected, onSelect, onEdit, onExtend }: TrackCardProps) {
  const { current, playing, play } = usePlayer()
  const isPlaying = current?.id === track.id && playing
  return (
    <article className={cn('track-card', selected && 'track-card-selected')}>
      {selectionMode && (
        <button className={cn('select-box', selected && 'select-box-active')} onClick={onSelect} aria-label={selected ? `取消选择 ${track.title}` : `选择 ${track.title}`}>
          {selected && <Check size={14} strokeWidth={3} />}
        </button>
      )}
      <div className="track-main">
        <div className="track-heading">
          <div className="instrument-glyph"><InstrumentIcon instrument={track.tags.instrument} /></div>
          <div><h3>{track.title}</h3><span className="track-index">CAPTURE / {track.id.slice(-4).toUpperCase()}</span></div>
        </div>
        <Waveform data={track.waveform} active={isPlaying} className="track-wave" />
        <div className="tag-row">
          <span className="tag tag-style">{track.tags.style}</span>
          <span className="tag tag-instrument">{track.tags.instrument}</span>
          <span className="tag tag-mood">{track.tags.mood}</span>
          <span className="tag tag-bpm">{track.tags.bpm}</span>
        </div>
        <div className="track-meta"><span>{formatDate(track.recordedAt)}</span><i /><span>{formatDuration(track.duration)}</span></div>
      </div>
      <div className="track-actions">
        <button className={cn('round-action', isPlaying && 'round-action-active')} onClick={() => void play(track)} aria-label={isPlaying ? '暂停' : '播放'}>
          {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
        </button>
        <button className="text-action" onClick={onEdit}><Edit3 size={16} /><span>编辑</span></button>
        <button className="extend-action" onClick={onExtend}><Sparkles size={16} /><span>灵感延伸</span></button>
      </div>
    </article>
  )
}
