import { useEffect, useMemo, useState } from 'react'
import { CheckSquare2, CircleDot, Mic, Sparkles, SquareDashedMousePointer, X } from 'lucide-react'
import { EditTrackModal } from '../components/EditTrackModal'
import { FilterBar } from '../components/FilterBar'
import { GenerationModal } from '../components/GenerationModal'
import { RecordingModal } from '../components/RecordingModal'
import { TrackCard } from '../components/TrackCard'
import { useLibrary } from '../context/LibraryContext'
import { usePlayer } from '../context/PlayerContext'
import type { InspirationTrack, TrackFilters } from '../types'
import { filterTracks } from '../utils/tracks'

const initialFilters: TrackFilters = { query: '', instrument: 'all', style: 'all', date: 'all' }

export function LibraryPage() {
  const { inspirations, loading, saveInspiration, updateInspiration, deleteInspiration, analyzeInspiration } = useLibrary()
  const { stopIfTrack } = usePlayer()
  const [filters, setFilters] = useState(initialFilters)
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [recordingOpen, setRecordingOpen] = useState(false)
  const [editingTrack, setEditingTrack] = useState<InspirationTrack | null>(null)
  const [generationTracks, setGenerationTracks] = useState<InspirationTrack[]>([])
  const visibleTracks = useMemo(() => filterTracks(inspirations, filters), [filters, inspirations])

  useEffect(() => {
    function focusSearch(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault(); document.querySelector<HTMLInputElement>('.search-field input')?.focus()
      }
    }
    window.addEventListener('keydown', focusSearch)
    return () => window.removeEventListener('keydown', focusSearch)
  }, [])

  function toggleSelect(id: string) {
    setSelectedIds((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next })
  }
  function leaveSelection() { setSelectionMode(false); setSelectedIds(new Set()) }
  function startBatchGeneration() { setGenerationTracks(inspirations.filter((track) => selectedIds.has(track.id))) }

  return (
    <div className="page">
      <header className="page-header">
        <div><span className="eyebrow">CREATIVE WORKSPACE / 01</span><h1>我的灵感库</h1><p>捕捉未经修饰的声音，在它消失之前。</p></div>
        <button className={selectionMode ? 'selection-toggle active' : 'selection-toggle'} onClick={() => selectionMode ? leaveSelection() : setSelectionMode(true)}>
          {selectionMode ? <CheckSquare2 size={17} /> : <SquareDashedMousePointer size={17} />}<span>{selectionMode ? '退出选择' : '多选模式'}</span>
        </button>
      </header>
      <FilterBar tracks={inspirations} filters={filters} onChange={setFilters} />
      <div className="section-heading"><div><h2>最近捕捉</h2><span>{visibleTracks.length} / {inspirations.length} CAPTURES</span></div><div className="live-indicator"><CircleDot size={13} />本地同步</div></div>
      <section className="track-list" aria-live="polite">
        {loading ? <div className="loading-state"><span /><span /><span /></div> : visibleTracks.length ? visibleTracks.map((track) => (
          <TrackCard key={track.id} track={track} selectionMode={selectionMode} selected={selectedIds.has(track.id)} onSelect={() => toggleSelect(track.id)} onEdit={() => setEditingTrack(track)} onExtend={() => setGenerationTracks([track])} onRetryAnalysis={() => void analyzeInspiration(track)} />
        )) : <div className="empty-state"><Mic size={30} /><h3>这里还没有匹配的灵感</h3><p>调整筛选条件，或录下此刻脑海中的声音。</p><button onClick={() => setFilters(initialFilters)}>清除筛选</button></div>}
      </section>
      <button className="record-fab" onClick={() => setRecordingOpen(true)} aria-label="开始录制"><span className="fab-ring"><Mic size={25} /></span><span>开始录制</span></button>
      {selectionMode && selectedIds.size > 0 && <div className="batch-bar"><div><strong>{selectedIds.size}</strong><span>段灵感已选择</span></div><button className="batch-cancel" onClick={leaveSelection}><X size={16} />取消</button><button className="batch-extend" onClick={startBatchGeneration}><Sparkles size={16} />灵感延伸</button></div>}
      <RecordingModal open={recordingOpen} onClose={() => setRecordingOpen(false)} onSave={saveInspiration} />
      <EditTrackModal track={editingTrack} onClose={() => setEditingTrack(null)} onSave={async (track) => { await updateInspiration(track); setEditingTrack(null) }} onDelete={async (track) => { stopIfTrack(track.id); await deleteInspiration(track); setEditingTrack(null) }} />
      <GenerationModal open={generationTracks.length > 0} tracks={generationTracks} onClose={() => { setGenerationTracks([]); leaveSelection() }} />
    </div>
  )
}
