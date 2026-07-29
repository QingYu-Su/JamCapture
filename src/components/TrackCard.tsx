import { AlertCircle, Check, Edit3, Guitar, KeyboardMusic, LoaderCircle, Mic2, Pause, Play, RefreshCw, Sparkles } from 'lucide-react'
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
  onRetryAnalysis: () => void
}

function InstrumentIcon({ instrument }: { instrument: string }) {
  if (instrument.toLowerCase().includes('guitar')) return <Guitar size={18} />
  if (instrument.toLowerCase().includes('vocal')) return <Mic2 size={18} />
  return <KeyboardMusic size={18} />
}

export function TrackCard({ track, selectionMode, selected, onSelect, onEdit, onExtend, onRetryAnalysis }: TrackCardProps) {
  const { current, playing, play } = usePlayer()
  const isPlaying = current?.id === track.id && playing
  const isAnalyzing = track.aiAnalysis?.status === 'analyzing'
  const aiTags = track.aiAnalysis?.status === 'complete'
    ? [
        ...(track.aiAnalysis.genres ?? []).slice(0, 1).map((label) => ({ label, className: 'tag-style' })),
        ...(track.aiAnalysis.instrument ?? []).slice(0, 1).map((label) => ({ label, className: 'tag-instrument' })),
        ...(track.aiAnalysis.toneColor ?? []).slice(0, 3).map((label) => ({ label, className: 'tag-tone' })),
        ...(track.aiAnalysis.emotion ?? []).slice(0, 4).map((label) => ({ label, className: 'tag-mood' })),
        ...(track.aiAnalysis.key && track.aiAnalysis.key !== '无' ? [{ label: track.aiAnalysis.key, className: 'tag-key' }] : []),
        ...(track.aiAnalysis.bpm ? [{ label: `${track.aiAnalysis.bpm} BPM`, className: 'tag-bpm' }] : []),
      ]
    : null
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
          {aiTags?.length ? aiTags.map((tag, index) => (
            <span key={`${tag.className}-${tag.label}-${index}`} className={`tag ${tag.className}`}>{tag.label}</span>
          )) : <>
            <span className="tag tag-style">{track.tags.style}</span>
            <span className="tag tag-instrument">{track.tags.instrument}</span>
            <span className="tag tag-mood">{track.tags.mood}</span>
            <span className="tag tag-bpm">{track.tags.bpm}</span>
          </>}
        </div>
        {track.aiAnalysis?.status === 'analyzing' && (
          <div className="ai-analysis-loading">
            <LoaderCircle className="spin" size={15} />
            <div><strong>AI 正在理解这段音频</strong><span>识别乐器、曲风、声音标签与整体描述...</span></div>
            <i />
          </div>
        )}
        {track.aiAnalysis?.status === 'complete' && (
          <div className="ai-insight">
            <div className="ai-insight-title"><Sparkles size={13} /><span>AI AUDIO INSIGHT</span></div>
            <p>{track.aiAnalysis.description || '分析已完成，暂未返回描述。'}</p>
          </div>
        )}
        {track.aiAnalysis?.status === 'failed' && (
          <div className="ai-analysis-failed">
            <AlertCircle size={14} />
            <span>{track.aiAnalysis.error}</span>
            <button onClick={onRetryAnalysis}><RefreshCw size={13} />重试分析</button>
          </div>
        )}
        <div className="track-meta"><span>{formatDate(track.recordedAt)}</span><i /><span>{formatDuration(track.duration)}</span></div>
      </div>
      <div className="track-actions">
        <button className={cn('round-action', isPlaying && 'round-action-active')} onClick={() => void play(track)} aria-label={isPlaying ? '暂停' : '播放'}>
          {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
        </button>
        <button
          className="text-action"
          onClick={onRetryAnalysis}
          disabled={isAnalyzing}
          aria-label={isAnalyzing ? `${track.title} 正在分析` : `重新分析 ${track.title}`}
        >
          {isAnalyzing ? <LoaderCircle className="spin" size={16} /> : <RefreshCw size={16} />}
          <span>{isAnalyzing ? '分析中' : '重新分析'}</span>
        </button>
        <button className="text-action" onClick={onEdit}><Edit3 size={16} /><span>编辑</span></button>
        <button className="extend-action" onClick={onExtend}><Sparkles size={16} /><span>灵感延伸</span></button>
      </div>
    </article>
  )
}
