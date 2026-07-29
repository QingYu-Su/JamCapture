import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { fallbackWaveform } from '../data/demoTracks'
import { repository } from '../services/repository'
import type { GeneratedTrack, GenerationRequest, InspirationTrack } from '../types'
import { analyzeAudioBlob } from '../utils/audio'

const WAVEFORM_VERSION = 2
const waveformAnalysisJobs = new Map<string, Promise<InspirationTrack | null>>()

function analyzeTrack(track: InspirationTrack) {
  const existing = waveformAnalysisJobs.get(track.id)
  if (existing) return existing

  const job = (async () => {
    const blob = track.audioSource.type === 'asset'
      ? await fetch(track.audioSource.url).then((response) => {
          if (!response.ok) throw new Error(`无法读取音频：${track.audioSource.type === 'asset' ? track.audioSource.url : track.id}`)
          return response.blob()
        })
      : await repository.getAudioBlob(track.audioSource.blobId)
    if (!blob) return null
    const analysis = await analyzeAudioBlob(blob)
    const analyzedTrack = {
      ...track,
      waveform: analysis.waveform,
      waveformVersion: WAVEFORM_VERSION,
      duration: analysis.duration,
    }
    await repository.saveInspiration(analyzedTrack)
    return analyzedTrack
  })().finally(() => waveformAnalysisJobs.delete(track.id))

  waveformAnalysisJobs.set(track.id, job)
  return job
}

interface LibraryContextValue {
  inspirations: InspirationTrack[]
  generated: GeneratedTrack[]
  loading: boolean
  saveInspiration: (track: InspirationTrack, blob?: Blob) => Promise<void>
  updateInspiration: (track: InspirationTrack) => Promise<void>
  deleteInspiration: (track: InspirationTrack) => Promise<void>
  generateDemo: (request: GenerationRequest) => Promise<GeneratedTrack>
  getBlob: (id: string) => Promise<Blob | undefined>
}

const LibraryContext = createContext<LibraryContextValue | null>(null)

export function LibraryProvider({ children }: { children: React.ReactNode }) {
  const [inspirations, setInspirations] = useState<InspirationTrack[]>([])
  const [generated, setGenerated] = useState<GeneratedTrack[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    async function load() {
      await repository.initialize()
      const [inspirationData, generatedData] = await Promise.all([
        repository.getInspirations(), repository.getGenerated(),
      ])
      if (active) {
        // Remove obsolete sample arrays immediately; each audio file is then decoded independently.
        setInspirations(inspirationData.map((track) => track.waveformVersion === WAVEFORM_VERSION ? track : { ...track, waveform: [] }))
        setGenerated(generatedData)
        setLoading(false)
      }

      for (const track of inspirationData.filter((item) => item.waveformVersion !== WAVEFORM_VERSION)) {
        try {
          const analyzedTrack = await analyzeTrack(track)
          if (active && analyzedTrack) {
            setInspirations((items) => items.map((item) => item.id === analyzedTrack.id ? analyzedTrack : item))
          }
        } catch {
          // A damaged or unsupported file remains playable; its item keeps a neutral loading waveform.
        }
      }
    }
    void load()
    return () => { active = false }
  }, [])

  const saveInspiration = useCallback(async (track: InspirationTrack, blob?: Blob) => {
    await repository.saveInspiration(track, blob)
    setInspirations((items) => [track, ...items.filter((item) => item.id !== track.id)])
  }, [])

  const updateInspiration = useCallback(async (track: InspirationTrack) => {
    await repository.saveInspiration(track)
    setInspirations((items) => items.map((item) => item.id === track.id ? track : item))
  }, [])

  const deleteInspiration = useCallback(async (track: InspirationTrack) => {
    await repository.deleteInspiration(track)
    setInspirations((items) => items.filter((item) => item.id !== track.id))
  }, [])

  const generateDemo = useCallback(async (request: GenerationRequest) => {
    // The delay deliberately models an async cloud job while keeping the adapter replaceable.
    await new Promise((resolve) => window.setTimeout(resolve, 2600))
    const source = inspirations.find((item) => item.id === request.sourceTrackIds[0])
    const track: GeneratedTrack = {
      id: crypto.randomUUID(),
      kind: 'generated',
      title: `${source?.title ?? 'Untitled'} — ${request.mode === 'full' ? 'Full Demo' : 'Instrument Study'}`,
      audioSource: { type: 'asset', url: request.mode === 'full' ? '/3.mp3' : '/2.mp3' },
      waveform: source?.waveform ?? fallbackWaveform,
      sourceTrackIds: request.sourceTrackIds,
      mode: request.mode,
      prompt: request.prompt,
      style: request.style || source?.tags.style || 'Alternative',
      status: 'complete',
      createdAt: new Date().toISOString(),
      duration: request.mode === 'full' ? 98 : 64,
    }
    await repository.saveGenerated(track)
    setGenerated((items) => [track, ...items])
    return track
  }, [inspirations])

  const value = useMemo(() => ({
    inspirations, generated, loading, saveInspiration, updateInspiration,
    deleteInspiration, generateDemo, getBlob: repository.getAudioBlob,
  }), [deleteInspiration, generateDemo, generated, inspirations, loading, saveInspiration, updateInspiration])

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>
}

export function useLibrary() {
  const context = useContext(LibraryContext)
  if (!context) throw new Error('useLibrary must be used within LibraryProvider')
  return context
}
