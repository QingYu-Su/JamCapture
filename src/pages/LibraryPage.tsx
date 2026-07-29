import { useEffect, useMemo, useRef, useState } from 'react'
import { CheckSquare2, CircleDot, LoaderCircle, Mic, Sparkles, SquareDashedMousePointer, Upload, X } from 'lucide-react'
import { EditTrackModal } from '../components/EditTrackModal'
import { FilterBar } from '../components/FilterBar'
import { GenerationModal } from '../components/GenerationModal'
import { RecordingModal } from '../components/RecordingModal'
import { TrackCard } from '../components/TrackCard'
import { useLibrary } from '../context/LibraryContext'
import { usePlayer } from '../context/PlayerContext'
import type { InspirationTrack, TrackFilters } from '../types'
import { AUDIO_WAVEFORM_VERSION, analyzeAudioBlob } from '../utils/audio'
import { filterTracks } from '../utils/tracks'

const initialFilters: TrackFilters = { query: '', instrument: 'all', style: 'all', date: 'all' }

export function LibraryPage() {
  const { inspirations, loading, saveInspiration, updateInspiration, deleteInspiration, analyzeInspiration } = useLibrary()
  const { stopIfTrack } = usePlayer()
  const [filters, setFilters] = useState(initialFilters)
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [recordingOpen, setRecordingOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const uploadInputRef = useRef<HTMLInputElement>(null)
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

  async function uploadAudio(file: File) {
    setUploadError('')
    if (!file.type.startsWith('audio/') && !/\.(mp3|m4a|mp4|wav|webm|aac|ogg|flac)$/i.test(file.name)) {
      setUploadError('请选择有效的音频文件')
      return
    }
    if (file.size > 50 * 1024 * 1024) {
      setUploadError('音频文件不能超过 50MB')
      return
    }

    setUploading(true)
    try {
      // Decode once at import time so the new card immediately receives its own real waveform and duration.
      const analysis = await analyzeAudioBlob(file)
      const id = crypto.randomUUID()
      const filename = file.name.replace(/\.[^.]+$/, '').trim()
      const track: InspirationTrack = {
        id,
        kind: 'inspiration',
        title: filename || '上传的音乐灵感',
        audioSource: { type: 'blob', blobId: id },
        waveform: analysis.waveform,
        waveformVersion: AUDIO_WAVEFORM_VERSION,
        tags: { style: '', instrument: '', mood: '', bpm: '' },
        recordedAt: new Date().toISOString(),
        duration: analysis.duration,
      }
      await saveInspiration(track, file)
    } catch (error) {
      setUploadError(error instanceof Error ? `无法读取音频：${error.message}` : '无法读取该音频文件')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="page library-page">
      <header className="page-header library-header">
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
      <div className="capture-fabs">
        {uploadError && <div className="upload-error" role="alert">{uploadError}</div>}
        <input
          ref={uploadInputRef}
          className="visually-hidden"
          type="file"
          accept="audio/*,.mp3,.m4a,.mp4,.wav,.webm,.aac,.ogg,.flac"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0]
            event.currentTarget.value = ''
            if (file) void uploadAudio(file)
          }}
        />
        <button className="upload-fab" disabled={uploading} onClick={() => uploadInputRef.current?.click()} aria-label="上传音频">
          <span className="upload-ring">{uploading ? <LoaderCircle className="spin" size={21} /> : <Upload size={21} />}</span>
          <span>{uploading ? '正在读取' : '上传音频'}</span>
        </button>
        <button className="record-fab" onClick={() => setRecordingOpen(true)} aria-label="开始录制"><span className="fab-ring"><Mic size={25} /></span><span>开始录制</span></button>
      </div>
      {selectionMode && selectedIds.size > 0 && <div className="batch-bar"><div><strong>{selectedIds.size}</strong><span>段灵感已选择</span></div><button className="batch-cancel" onClick={leaveSelection}><X size={16} />取消</button><button className="batch-extend" onClick={startBatchGeneration}><Sparkles size={16} />灵感延伸</button></div>}
      <RecordingModal open={recordingOpen} onClose={() => setRecordingOpen(false)} onSave={saveInspiration} />
      <EditTrackModal track={editingTrack} onClose={() => setEditingTrack(null)} onSave={async (track) => { await updateInspiration(track); setEditingTrack(null) }} onDelete={async (track) => { stopIfTrack(track.id); await deleteInspiration(track); setEditingTrack(null) }} />
      <GenerationModal open={generationTracks.length > 0} tracks={generationTracks} onClose={() => { setGenerationTracks([]); leaveSelection() }} />
    </div>
  )
}
