import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { repository } from '../services/repository'
import type { GeneratedTrack, GenerationRequest, InspirationTrack } from '../types'
import { AUDIO_WAVEFORM_VERSION, analyzeAudioBlob, prepareReferenceAudioBlob } from '../utils/audio'
import { AI_ANALYSIS_VERSION, completedAnalysis, describeAudio } from '../services/murekaClient'
import { generateSongFromReference } from '../services/murekaGenerationClient'
import { recognizeLyricsFromAudio } from '../services/murekaRecognitionClient'

const waveformAnalysisJobs = new Map<string, Promise<InspirationTrack | null>>()
const aiAnalysisJobs = new Map<string, Promise<InspirationTrack>>()
const generatedLyricsJobs = new Map<string, Promise<GeneratedTrack>>()
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
  deleteGenerated: (track: GeneratedTrack) => Promise<void>
  generateDemo: (request: GenerationRequest) => Promise<GeneratedTrack>
  ensureGeneratedLyrics: (track: GeneratedTrack) => Promise<GeneratedTrack>
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
            && (track.recordingType === 'vocal' || track.aiAnalysis.promptSuggestions?.length === 3)
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
    let storedTrack = track
    if (track.recordingType === 'vocal' && !track.hummingSequence) {
      const existingHummingCount = (await repository.getInspirations()).filter((item) => item.recordingType === 'vocal').length
      const hummingSequence = existingHummingCount + 1
      storedTrack = { ...track, title: `哼唱灵感${hummingSequence}`, hummingSequence }
    }
    const analyzingTrack: InspirationTrack = { ...storedTrack, aiAnalysis: { status: 'analyzing' } }
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

  const deleteGenerated = useCallback(async (track: GeneratedTrack) => {
    await repository.deleteGenerated(track)
    setGenerated((items) => items.filter((item) => item.id !== track.id))
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
        const storedTracks = await repository.getInspirations()
        const existingHummingCount = track.recordingType === 'vocal'
          ? track.hummingSequence
            ? track.hummingSequence - 1
            : storedTracks.filter((item) => item.id !== track.id && item.recordingType === 'vocal').length
          : undefined
        const result = await enqueueAIRequest(() => describeAudio(blob, {
          ...options,
          recordingType: track.recordingType,
          existingHummingCount,
        }))
        const latestTrack = await repository.getInspiration(track.id) ?? track
        const completedTrack: InspirationTrack = {
          ...latestTrack,
          title: result.title || latestTrack.title,
          tags: {
            ...latestTrack.tags,
            style: result.genres[0] ?? latestTrack.tags.style,
            instrument: result.instrument[0] ?? latestTrack.tags.instrument,
            mood: (track.recordingType === 'vocal' ? result.emotion.join('、') : result.emotion.join(' / ')) || latestTrack.tags.mood,
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
          || track.aiAnalysis.error?.includes('不符合哼唱标签格式')
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
    const trackId = crypto.randomUUID()
    const blobId = `generated-audio-${trackId}`
    const createdAt = new Date().toISOString()
    const pendingTrack: GeneratedTrack = {
      id: trackId,
      kind: 'generated',
      title: `${source.title} · 延伸作品`,
      audioSource: source.audioSource,
      waveform: source.waveform,
      sourceTrackIds: request.sourceTrackIds,
      mode: 'full',
      generationKind: request.generationKind,
      prompt: request.prompt,
      lyrics: request.lyrics || undefined,
      style: request.style || source.tags.style || 'Alternative',
      status: 'generating',
      createdAt,
      duration: 0,
    }
    // Add the job immediately. The modal may close or unmount while this async work continues.
    setGenerated((items) => [pendingTrack, ...items.filter((item) => item.id !== trackId)])

    try {
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
        generationKind: request.generationKind,
      })
      const audioAnalysis = await analyzeAudioBlob(result.audio)
      // The local ID owns the IndexedDB record; provider task IDs are retained only for diagnostics.
      const track: GeneratedTrack = {
        ...pendingTrack,
        title: result.title?.trim() || pendingTrack.title,
        providerTaskId: result.taskId,
        audioFingerprint: result.audioFingerprint,
        audioSource: { type: 'blob', blobId },
        waveform: audioAnalysis.waveform,
        lyrics: result.lyrics || request.lyrics || undefined,
        timedLyrics: result.timedLyrics,
        lyricsRecognitionAttemptedAt: result.timedLyrics.length ? new Date().toISOString() : undefined,
        status: 'complete',
        duration: audioAnalysis.duration || result.duration || 0,
      }
      await repository.saveGenerated(track, result.audio)
      setGenerated((items) => items.map((item) => item.id === trackId ? track : item))
      return track
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : '歌曲生成失败，请稍后重试'
      setGenerated((items) => items.map((item) => item.id === trackId
        ? { ...item, status: 'failed', generationError: message }
        : item))
      throw reason
    }
  }, [inspirations])

  const ensureGeneratedLyrics = useCallback(async (track: GeneratedTrack) => {
    if (track.generationKind !== 'full-song' || track.timedLyrics?.length || track.lyricsRecognitionAttemptedAt) return track
    const existing = generatedLyricsJobs.get(track.id)
    if (existing) return existing
    const job = (async () => {
      const blob = track.audioSource.type === 'blob' ? await repository.getAudioBlob(track.audioSource.blobId) : undefined
      if (!blob) return track
      const recognized = await recognizeLyricsFromAudio(blob)
      const updated: GeneratedTrack = {
        ...track,
        lyrics: track.lyrics || recognized.lyrics || undefined,
        timedLyrics: recognized.timedLyrics,
        lyricsRecognitionAttemptedAt: new Date().toISOString(),
      }
      await repository.saveGenerated(updated)
      setGenerated((items) => items.map((item) => item.id === updated.id ? updated : item))
      return updated
    })().catch((error) => {
      console.warn('[JamCapture] Existing generated lyrics recognition failed', error)
      return track
    }).finally(() => generatedLyricsJobs.delete(track.id))
    generatedLyricsJobs.set(track.id, job)
    return job
  }, [])

  const value = useMemo(() => ({
    inspirations, generated, loading, saveInspiration, updateInspiration,
    deleteInspiration, deleteGenerated, generateDemo, ensureGeneratedLyrics, analyzeInspiration, getBlob: repository.getAudioBlob,
  }), [analyzeInspiration, deleteGenerated, deleteInspiration, ensureGeneratedLyrics, generateDemo, generated, inspirations, loading, saveInspiration, updateInspiration])

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>
}

export function useLibrary() {
  const context = useContext(LibraryContext)
  if (!context) throw new Error('useLibrary must be used within LibraryProvider')
  return context
}
