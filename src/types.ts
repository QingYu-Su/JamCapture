export type TagKind = 'style' | 'instrument' | 'mood' | 'bpm'

export interface TrackTags {
  style: string
  instrument: string
  mood: string
  bpm: string
}

export type AudioSource =
  | { type: 'asset'; url: string }
  | { type: 'blob'; blobId: string }

export interface AudioAIAnalysis {
  status: 'analyzing' | 'complete' | 'failed'
  title?: string
  instrument?: string[]
  toneColor?: string[]
  genres?: string[]
  key?: string
  emotion?: string[]
  bpm?: string
  description?: string
  error?: string
  analyzedAt?: string
}

export interface InspirationTrack {
  id: string
  kind: 'inspiration'
  title: string
  audioSource: AudioSource
  waveform: number[]
  waveformVersion?: number
  aiAnalysis?: AudioAIAnalysis
  tags: TrackTags
  recordedAt: string
  duration: number
}

export type GenerationMode = 'instrument' | 'full'
export type GenerationStatus = 'generating' | 'complete' | 'failed'

export interface GeneratedTrack {
  id: string
  kind: 'generated'
  title: string
  audioSource: AudioSource
  waveform: number[]
  sourceTrackIds: string[]
  mode: GenerationMode
  prompt: string
  style: string
  status: GenerationStatus
  createdAt: string
  duration: number
}

export type PlayableTrack = InspirationTrack | GeneratedTrack

export interface GenerationRequest {
  sourceTrackIds: string[]
  mode: GenerationMode
  prompt: string
  style: string
}

export interface TrackFilters {
  query: string
  instrument: string
  style: string
  date: 'all' | 'week' | 'month' | 'older'
}
