import { Disc3, LoaderCircle, Pause, Pencil, Play, Share2, Sparkles, Trash2, WandSparkles, X } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLibrary } from '../context/LibraryContext'
import { usePlayer } from '../context/PlayerContext'
import type { GeneratedTrack } from '../types'
import { formatDate, formatDuration } from '../utils/format'
import { Waveform } from '../components/Waveform'
import { ShareTrackModal } from '../components/ShareTrackModal'
import { EditGeneratedModal } from '../components/EditGeneratedModal'

function DeleteGeneratedAction({ track, onDelete }: { track: GeneratedTrack; onDelete: () => Promise<void> }) {
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  if (confirming) return (
    <div className="generated-delete-confirm" role="group" aria-label={`确认删除 ${track.title}`}>
      <span>确定删除？</span>
      <button type="button" aria-label="取消删除" disabled={deleting} onClick={() => setConfirming(false)}><X size={14} /></button>
      <button type="button" className="confirm" aria-label={`确认删除 ${track.title}`} disabled={deleting} onClick={async () => {
        setDeleting(true)
        try { await onDelete() } finally { setDeleting(false) }
      }}>{deleting ? <LoaderCircle className="spin" size={14} /> : <Trash2 size={14} />}</button>
    </div>
  )
  return <button type="button" className="generated-delete" onClick={() => setConfirming(true)} aria-label={`删除 ${track.title}`}><Trash2 size={16} /><span>删除</span></button>
}

function GeneratedCard({ track, sourceNames, onShare, onEdit, onDelete }: { track: GeneratedTrack; sourceNames: string[]; onShare: () => void; onEdit: () => void; onDelete: () => Promise<void> }) {
  const { current, playing, play } = usePlayer()
  const active = current?.id === track.id && playing
  if (track.status !== 'complete') {
    const failed = track.status === 'failed'
    return (
      <article className={`generated-card generated-card-pending${failed ? ' generated-card-failed' : ''}`} aria-live="polite">
        <div className="generated-number">AI / {track.id.slice(0, 4).toUpperCase()}</div>
        <div className="generated-top">
          <div className="generated-icon">{failed ? <Sparkles size={22} /> : <LoaderCircle className="spin" size={22} />}</div>
          <div><h3>{track.title}</h3><p>基于 {sourceNames.join('、') || `${track.sourceTrackIds.length} 段灵感`}</p></div>
          <span className={`complete-badge ${failed ? 'failed-badge' : 'generating-badge'}`}><i />{failed ? 'FAILED' : 'GENERATING'}</span>
        </div>
        {failed
          ? <p className="generated-task-error">{track.generationError || '生成失败，请返回灵感库重新尝试'}</p>
          : <div className="generated-task-progress" aria-label="作品生成中"><span /></div>}
        <p className="generated-prompt">“{track.description ?? track.prompt}”</p>
        {failed && <div className="generated-pending-actions"><DeleteGeneratedAction track={track} onDelete={onDelete} /></div>}
      </article>
    )
  }
  const description = track.description ?? track.prompt
  const tags = track.tags ?? [track.generationKind === 'full-song' ? '完整词曲' : '纯音乐', track.style].filter(Boolean)
  return (
    <article className="generated-card">
      <div className="generated-number">AI / {track.id.slice(0, 4).toUpperCase()}</div>
      <div className="generated-top">
        <div className="generated-icon"><Disc3 size={22} /></div>
        <div><h3>{track.title}</h3><p>基于 {sourceNames.join('、') || `${track.sourceTrackIds.length} 段灵感`}</p></div>
        <span className="complete-badge"><i />READY</span>
      </div>
      <Waveform data={track.waveform} active={active} progress={active ? 0.46 : 0} className="generated-wave" />
      {description && <p className="generated-prompt">“{description}”</p>}
      <div className="generated-footer">
        <div className="generated-tags">{tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
        <div className="generated-meta">{formatDate(track.createdAt)} · {formatDuration(track.duration)}</div>
        <div className="generated-actions">
          <button className="generated-play" onClick={() => void play(track)}>{active ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}<span>{active ? '暂停' : '播放作品'}</span></button>
          <button className="generated-share" onClick={onShare} aria-label={`分享 ${track.title}`}><Share2 size={16} /><span>分享</span></button>
          <button className="generated-edit" onClick={onEdit} aria-label={`编辑 ${track.title}`}><Pencil size={16} /><span>编辑</span></button>
        </div>
      </div>
    </article>
  )
}

export function ExtensionsPage() {
  const { generated, inspirations, loading, getBlob, deleteGenerated, updateGenerated } = useLibrary()
  const { stopIfTrack } = usePlayer()
  const [sharingTrack, setSharingTrack] = useState<GeneratedTrack | null>(null)
  const [editingTrack, setEditingTrack] = useState<GeneratedTrack | null>(null)
  return (
    <div className="page extensions-page">
      <header className="page-header extension-header">
        <div><span className="eyebrow">CREATIVE WORKSPACE / 02</span><h1>灵感延伸</h1><p>让一个片段，长成一首完整的作品。</p></div>
        <div className="ai-status"><span><WandSparkles size={16} />AI ENGINE</span><strong>MUREKA CONNECTED</strong></div>
      </header>
      <div className="section-heading"><div><h2>生成作品</h2><span>{generated.length} DEMOS</span></div></div>
      <section className="generated-list">
        {loading ? <div className="loading-state"><span /><span /></div> : generated.length ? generated.map((track) => <GeneratedCard key={track.id} track={track} sourceNames={track.sourceTrackIds.map((id) => inspirations.find((item) => item.id === id)?.title).filter(Boolean) as string[]} onShare={() => setSharingTrack(track)} onEdit={() => setEditingTrack(track)} onDelete={async () => { stopIfTrack(track.id); if (sharingTrack?.id === track.id) setSharingTrack(null); await deleteGenerated(track) }} />) : <div className="empty-state extension-empty"><Sparkles size={30} /><h3>还没有延伸作品</h3><p>从灵感库选择一段或多段录音，创建第一首 Demo。</p><Link to="/library">返回灵感库</Link></div>}
      </section>
      <EditGeneratedModal track={editingTrack} onClose={() => setEditingTrack(null)} onSave={async (track) => { await updateGenerated(track); setEditingTrack(null) }} onDelete={async (track) => { stopIfTrack(track.id); if (sharingTrack?.id === track.id) setSharingTrack(null); await deleteGenerated(track); setEditingTrack(null) }} />
      <ShareTrackModal track={sharingTrack} getBlob={getBlob} onClose={() => setSharingTrack(null)} />
    </div>
  )
}
