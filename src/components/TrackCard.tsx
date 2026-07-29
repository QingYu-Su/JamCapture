import { AlertCircle, Edit3, LoaderCircle, Pause, Play, RefreshCw, Share2, Sparkles } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { usePlayer } from '../context/PlayerContext'
import type { InspirationTrack } from '../types'
import { cn, formatDate, formatDuration } from '../utils/format'
import { Waveform } from './Waveform'

interface TrackCardProps {
  track: InspirationTrack
  onEdit: () => void
  onExtend: () => void
  onRetryAnalysis: () => void
  onShare: () => void
}

export function TrackCard({ track, onEdit, onExtend, onRetryAnalysis, onShare }: TrackCardProps) {
  const { current, playing, play } = usePlayer()
  const menuRef = useRef<HTMLDivElement>(null)
  const [menuOpen, setMenuOpen] = useState(false)
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
  const hasAIContent = Boolean(aiTags?.length && track.aiAnalysis?.description?.trim())
  const showOriginalTags = !track.aiAnalysis

  useEffect(() => {
    if (!menuOpen) return
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsidePress)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePress)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [menuOpen])

  function runMenuAction(action: () => void) {
    setMenuOpen(false)
    action()
  }

  return (
    <article className={cn('track-card', menuOpen && 'track-menu-open')}>
      <div className="track-main">
        <div className="track-heading">
          <button className={cn('round-action', 'title-play', isPlaying && 'round-action-active')} onClick={() => void play(track)} aria-label={isPlaying ? `暂停 ${track.title}` : `播放 ${track.title}`}>
            {isPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
          </button>
          <div><h3>{track.title}</h3><span className="track-index">CAPTURE / {track.id.slice(-4).toUpperCase()}</span></div>
        </div>
        <Waveform data={track.waveform} active={isPlaying} className="track-wave" />
        {(hasAIContent || showOriginalTags) && <div className="tag-row">
          {hasAIContent ? aiTags?.map((tag, index) => (
            <span key={`${tag.className}-${tag.label}-${index}`} className={`tag ${tag.className}`}>{tag.label}</span>
          )) : <>
            <span className="tag tag-style">{track.tags.style}</span>
            <span className="tag tag-instrument">{track.tags.instrument}</span>
            <span className="tag tag-mood">{track.tags.mood}</span>
            <span className="tag tag-bpm">{track.tags.bpm}</span>
          </>}
        </div>}
        {track.aiAnalysis?.status === 'analyzing' && (
          <div className="ai-analysis-loading">
            <LoaderCircle className="spin" size={15} />
            <div><strong>AI 正在理解这段音频</strong><span>识别乐器、曲风、声音标签与整体描述...</span></div>
            <i />
          </div>
        )}
        {track.aiAnalysis?.status === 'complete' && hasAIContent && <p className="ai-description">{track.aiAnalysis.description}</p>}
        {track.aiAnalysis?.status === 'failed' && (
          <div className="ai-analysis-failed"><AlertCircle size={14} /><span>{track.aiAnalysis.error}</span></div>
        )}
        <div className="track-meta"><span>{formatDate(track.recordedAt)}</span><i /><span>{formatDuration(track.duration)}</span></div>
      </div>
      <div className="track-actions">
        <button className="extend-action" onClick={onExtend}><Sparkles size={16} /><span>灵感延伸</span></button>
        <div className="track-menu-wrap" ref={menuRef}>
          <button className="more-action" onClick={() => setMenuOpen((open) => !open)} aria-label={`更多操作 ${track.title}`} aria-haspopup="menu" aria-expanded={menuOpen}><span aria-hidden="true">•••</span></button>
          {menuOpen && (
            <div className="track-menu" role="menu">
              <button role="menuitem" disabled={isAnalyzing} onClick={() => runMenuAction(onRetryAnalysis)}>{isAnalyzing ? <LoaderCircle className="spin" size={15} /> : <RefreshCw size={15} />}<span>{isAnalyzing ? '分析中' : 'AI分析'}</span></button>
              <button role="menuitem" onClick={() => runMenuAction(onEdit)}><Edit3 size={15} /><span>编辑灵感</span></button>
              <button role="menuitem" onClick={() => runMenuAction(onShare)}><Share2 size={15} /><span>分享</span></button>
            </div>
          )}
        </div>
      </div>
    </article>
  )
}
