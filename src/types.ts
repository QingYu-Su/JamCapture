export type TagKind = 'style' | 'instrument' | 'mood' | 'bpm'
export type RecordingType = 'instrument' | 'vocal'

export interface TrackTags {
  style: string
  instrument: string
  mood: string
  bpm: string
}

export type AudioSource =
  | { type: 'asset'; url: string }
  | { type: 'blob'; blobId: string }

export interface AIPromptSuggestion {
  title: string
  text: string
}

export interface TimedLyricLine {
  startTime: number
  endTime?: number
  text: string
}

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
  promptSuggestions?: AIPromptSuggestion[]
  analysisVersion?: number
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
  recordingType?: RecordingType
  hummingSequence?: number
}

export type GenerationMode = 'instrument' | 'full'
export type GenerationKind = 'instrumental' | 'full-song'
export type GenerationStatus = 'generating' | 'complete' | 'failed'

export interface GeneratedTrack {
  id: string
  kind: 'generated'
  title: string
  providerTaskId?: string
  audioFingerprint?: string
  audioSource: AudioSource
  waveform: number[]
  sourceTrackIds: string[]
  mode: GenerationMode
  generationKind?: GenerationKind
  prompt: string
  lyrics?: string
  timedLyrics?: TimedLyricLine[]
  style: string
  status: GenerationStatus
  createdAt: string
  duration: number
}

export type PlayableTrack = InspirationTrack | GeneratedTrack

export interface GenerationRequest {
  sourceTrackIds: string[]
  mode: GenerationMode
  generationKind: GenerationKind
  prompt: string
  lyrics: string
  style: string
}

export interface TrackFilters {
  query: string
  instrument: string
  style: string
  date: 'all' | 'week' | 'month' | 'older'
}
