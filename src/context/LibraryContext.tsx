import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { repository } from '../services/repository'
import type { GeneratedTrack, GenerationRequest, InspirationTrack } from '../types'
import { AUDIO_WAVEFORM_VERSION, analyzeAudioBlob, prepareReferenceAudioBlob } from '../utils/audio'
import { AI_ANALYSIS_VERSION, completedAnalysis, describeAudio } from '../services/murekaClient'
import { generateSongFromReference } from '../services/murekaGenerationClient'

const waveformAnalysisJobs = new Map<string, Promise<InspirationTrack | null>>()
const aiAnalysisJobs = new Map<string, Promise<InspirationTrack>>()
let aiRequestQueue: Promise<unknown> = Promise.resolve()

function enqueueAIRequest<T>(request: () => Promise<T>) {
  const result = aiRequestQueue.then(request, request)
  aiRequestQueue = result.then(() => undefined, () => undefined)
  return result
}

async function getTrackBlob(track: InspirationTrack) {
  if (track.audioSource.type === 'blob') return repository.getAudioBlob(track.audioSource.blobId)
  const response = await fetch(track.audioSource.url)
  if (!response.ok) throw new Error(`无法读取音频：${track.audioSource.url}`)
  return response.blob()
}

function analyzeTrack(track: InspirationTrack) {
  const existing = waveformAnalysisJobs.get(track.id)
  if (existing) return existing

  const job = (async () => {
    const blob = await getTrackBlob(track)
    if (!blob) return null
    const analysis = await analyzeAudioBlob(blob)
    const latestTrack = await repository.getInspiration(track.id) ?? track
    const analyzedTrack = {
      ...latestTrack,
      waveform: analysis.waveform,
      waveformVersion: AUDIO_WAVEFORM_VERSION,
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
  analyzeInspiration: (track: InspirationTrack, options?: { forceRefresh?: boolean }) => Promise<void>
  getBlob: (id: string) => Promise<Blob | undefined>
}

const LibraryContext = createContext<LibraryContextValue | null>(null)

export function LibraryProvider({ children }: { children: React.ReactNode }) {
  const [inspirations, setInspirations] = useState<InspirationTrack[]>([])
  const [generated, setGenerated] = useState<GeneratedTrack[]>([])
  const [loading, setLoading] = useState(true)
  const automaticallyStarted = useRef(new Set<string>())
  const automaticAnalysisQueue = useRef<Promise<void>>(Promise.resolve())

  useEffect(() => {
    let active = true
    async function load() {
      await repository.initialize()
      const [inspirationData, generatedData] = await Promise.all([
        repository.getInspirations(), repository.getGenerated(),
      ])
      if (active) {
        // Remove obsolete sample arrays immediately; each audio file is then decoded independently.
        setInspirations(inspirationData.map((track) => {
          const analysisIsCurrent = track.aiAnalysis?.status === 'complete'
            && track.aiAnalysis.analysisVersion === AI_ANALYSIS_VERSION
            && track.aiAnalysis.promptSuggestions?.length === 3
          return {
            ...track,
            waveform: track.waveformVersion === AUDIO_WAVEFORM_VERSION ? track.waveform : [],
            aiAnalysis: analysisIsCurrent || track.aiAnalysis?.status !== 'complete'
              ? track.aiAnalysis ?? { status: 'analyzing' }
              : { status: 'analyzing' },
          }
        }))
        setGenerated(generatedData)
        setLoading(false)
      }

      for (const track of inspirationData.filter((item) => item.waveformVersion !== AUDIO_WAVEFORM_VERSION)) {
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
    const analyzingTrack: InspirationTrack = { ...track, aiAnalysis: { status: 'analyzing' } }
    await repository.saveInspiration(analyzingTrack, blob)
    setInspirations((items) => [analyzingTrack, ...items.filter((item) => item.id !== track.id)])
  }, [])

  const updateInspiration = useCallback(async (track: InspirationTrack) => {
    await repository.saveInspiration(track)
    setInspirations((items) => items.map((item) => item.id === track.id ? track : item))
  }, [])

  const deleteInspiration = useCallback(async (track: InspirationTrack) => {
    await repository.deleteInspiration(track)
    setInspirations((items) => items.filter((item) => item.id !== track.id))
  }, [])

  const analyzeInspiration = useCallback(async (track: InspirationTrack, options: { forceRefresh?: boolean } = {}) => {
    const analyzingTrack: InspirationTrack = { ...track, aiAnalysis: { status: 'analyzing' } }
    setInspirations((items) => items.map((item) => item.id === track.id ? analyzingTrack : item))
    await repository.saveInspiration(analyzingTrack)

    let job = aiAnalysisJobs.get(track.id)
    if (!job) {
      job = (async () => {
        const blob = await getTrackBlob(track)
        if (!blob) throw new Error('找不到需要分析的音频文件')
        // Mureka requests are serialized to avoid rate-limit failures when several legacy items resume together.
        const result = await enqueueAIRequest(() => describeAudio(blob, options))
        const latestTrack = await repository.getInspiration(track.id) ?? track
        const completedTrack: InspirationTrack = {
          ...latestTrack,
          title: result.title || latestTrack.title,
          tags: {
            ...latestTrack.tags,
            style: result.genres[0] ?? latestTrack.tags.style,
            instrument: result.instrument[0] ?? latestTrack.tags.instrument,
            mood: result.emotion.join(' / ') || latestTrack.tags.mood,
            bpm: result.bpm || latestTrack.tags.bpm,
          },
          aiAnalysis: completedAnalysis(result),
        }
        await repository.saveInspiration(completedTrack)
        return completedTrack
      })().finally(() => aiAnalysisJobs.delete(track.id))
      aiAnalysisJobs.set(track.id, job)
    }

    try {
      const completedTrack = await job
      setInspirations((items) => items.map((item) => item.id === track.id ? completedTrack : item))
    } catch (error) {
      const latestTrack = await repository.getInspiration(track.id) ?? track
      const failedTrack: InspirationTrack = {
        ...latestTrack,
        aiAnalysis: { status: 'failed', error: error instanceof Error ? error.message : 'AI 音频理解失败' },
      }
      await repository.saveInspiration(failedTrack)
      setInspirations((items) => items.map((item) => item.id === track.id ? failedTrack : item))
    }
  }, [])

  useEffect(() => {
    for (const track of inspirations) {
      const shouldStart = track.aiAnalysis?.status === 'analyzing'
        || (track.aiAnalysis?.status === 'failed' && (
          track.aiAnalysis.error?.includes('config.yaml')
          || track.aiAnalysis.error?.includes('deepseek_api_key')
          || track.aiAnalysis.error?.includes('当前录音为 WebM')
          || track.aiAnalysis.error?.includes('Mureka 仅支持 MP3/M4A')
        ))
      if (!shouldStart || automaticallyStarted.current.has(track.id)) continue
      automaticallyStarted.current.add(track.id)
      // Initial and newly imported tracks enter one promise chain, so only one complete analysis runs at a time.
      automaticAnalysisQueue.current = automaticAnalysisQueue.current.then(
        () => analyzeInspiration(track),
        () => analyzeInspiration(track),
      )
    }
  }, [analyzeInspiration, inspirations])

  const generateDemo = useCallback(async (request: GenerationRequest) => {
    const source = inspirations.find((item) => item.id === request.sourceTrackIds[0])
    if (!source) throw new Error('找不到需要延伸的灵感歌曲')
    const sourceBlob = await getTrackBlob(source)
    if (!sourceBlob) throw new Error('找不到需要延伸的音频文件')

    const prepared = await prepareReferenceAudioBlob(sourceBlob)
    const result = await generateSongFromReference(prepared.audio, {
      userPrompt: request.prompt,
      lyrics: request.lyrics,
      sourceTitle: source.title,
      originalDuration: prepared.originalDuration,
      preparedDuration: prepared.preparedDuration,
      repeatCount: prepared.repeatCount,
    })
    const audioAnalysis = await analyzeAudioBlob(result.audio)
    // The local ID owns the IndexedDB record; provider task IDs are retained only for diagnostics.
    const trackId = crypto.randomUUID()
    const blobId = `generated-audio-${trackId}`
    const track: GeneratedTrack = {
      id: trackId,
      kind: 'generated',
      title: result.title?.trim() || `${source.title} · 延伸作品`,
      providerTaskId: result.taskId,
      audioFingerprint: result.audioFingerprint,
      audioSource: { type: 'blob', blobId },
      waveform: audioAnalysis.waveform,
      sourceTrackIds: request.sourceTrackIds,
      mode: 'full',
      generationKind: request.generationKind,
      prompt: request.prompt,
      lyrics: request.lyrics || undefined,
      timedLyrics: result.timedLyrics,
      style: request.style || source.tags.style || 'Alternative',
      status: 'complete',
      createdAt: new Date().toISOString(),
      duration: audioAnalysis.duration || result.duration || 0,
    }
    await repository.saveGenerated(track, result.audio)
    setGenerated((items) => [track, ...items])
    return track
  }, [inspirations])

  const value = useMemo(() => ({
    inspirations, generated, loading, saveInspiration, updateInspiration,
    deleteInspiration, generateDemo, analyzeInspiration, getBlob: repository.getAudioBlob,
  }), [analyzeInspiration, deleteInspiration, generateDemo, generated, inspirations, loading, saveInspiration, updateInspiration])

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>
}

export function useLibrary() {
  const context = useContext(LibraryContext)
  if (!context) throw new Error('useLibrary must be used within LibraryProvider')
  return context
}
