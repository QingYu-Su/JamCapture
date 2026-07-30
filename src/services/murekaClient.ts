import type { AIPromptSuggestion, AudioAIAnalysis, RecordingType } from '../types'
import { convertAudioBlobToMp3 } from '../utils/audio'

const MAX_AUDIO_BYTES = 10 * 1024 * 1024
export const AI_ANALYSIS_VERSION = 2

export interface MusicSummary {
  title: string
  instrument: string[]
  toneColor: string[]
  genres: string[]
  key: string
  emotion: string[]
  bpm: string
  description: string
  promptSuggestions: AIPromptSuggestion[]
}

function isChineseText(value: string) {
  return /^[\u3400-\u9fff\s·]+$/u.test(value)
}

export function validateMusicSummary(result: MusicSummary) {
  const descriptionLength = [...result.description.trim()].length
  const titleLength = [...result.title].length
  const valid = titleLength >= 4 && titleLength <= 10
    && /^[\u3400-\u9fff]+$/u.test(result.title)
    && result.instrument.length === 1 && isChineseText(result.instrument[0])
    && result.toneColor.length >= 1 && result.toneColor.length <= 3 && result.toneColor.every(isChineseText)
    && result.genres.length === 1 && isChineseText(result.genres[0])
    && /^(无|[A-G](?:#|b)?m?)$/.test(result.key)
    && result.emotion.length >= 2 && result.emotion.length <= 4 && result.emotion.every(isChineseText)
    && (!result.bpm || /^\d+$/.test(result.bpm))
    && descriptionLength >= 15 && descriptionLength <= 40
    && /^[\u3400-\u9fff\s，。！？、；：…—]+$/u.test(result.description)
    && result.promptSuggestions.length === 3
    && result.promptSuggestions.every((suggestion) => suggestion.title.trim().length >= 2
      && suggestion.title.trim().length <= 12
      && /^[\u3400-\u9fff]+$/u.test(suggestion.title.trim())
      && suggestion.text.trim().length >= 12
      && suggestion.text.trim().length <= 100
      && /^[\u3400-\u9fff\s，。！？、；：…—]+$/u.test(suggestion.text.trim()))
  if (!valid) throw new Error('AI 返回内容不符合音乐标签格式，请点击重新分析')
  return result
}

export function validateHummingSummary(result: MusicSummary) {
  const valid = /^哼唱灵感\d*$/u.test(result.title)
    && result.instrument.length === 1 && result.instrument[0] === '人声哼唱'
    && result.emotion.length >= 2 && result.emotion.length <= 4 && result.emotion.every(isChineseText)
  if (!valid) throw new Error('AI 返回内容不符合哼唱标签格式，请点击重新分析')
  return result
}

function errorMessage(error: unknown, fallback: string) {
  if (typeof error === 'string') return error
  if (error && typeof error === 'object') {
    const value = error as { message?: unknown; detail?: unknown; code?: unknown }
    if (typeof value.message === 'string') return value.message
    if (typeof value.detail === 'string') return value.detail
    if (typeof value.code === 'string') return `${value.code}: ${fallback}`
  }
  return fallback
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('无法读取音频文件'))
    reader.onload = () => resolve(String(reader.result))
    reader.readAsDataURL(blob)
  })
}

export function normalizeMurekaAudioUrl(dataUrl: string) {
  const commaIndex = dataUrl.indexOf(',')
  if (commaIndex < 0) throw new Error('音频 Data URL 格式无效')
  const header = dataUrl.slice(0, commaIndex).toLowerCase()
  const encodedAudio = dataUrl.slice(commaIndex + 1)

  if (header.includes('audio/mpeg') || header.includes('audio/mp3')) {
    return `data:audio/mp3;base64,${encodedAudio}`
  }
  if (header.includes('audio/mp4') || header.includes('audio/m4a') || header.includes('audio/x-m4a')) {
    return `data:audio/m4a;base64,${encodedAudio}`
  }
  if (header.includes('audio/webm')) {
    throw new Error('当前录音为 WebM，Mureka 仅支持 MP3/M4A；请使用支持 M4A 录音的最新版浏览器')
  }
  throw new Error(`Mureka 不支持当前音频格式：${blobTypeFromDataUrl(header)}`)
}

function blobTypeFromDataUrl(header: string) {
  return header.match(/^data:([^;]+)/)?.[1] ?? 'unknown'
}

export async function describeAudio(blob: Blob, options: { forceRefresh?: boolean; recordingType?: RecordingType; existingHummingCount?: number } = {}): Promise<MusicSummary> {
  const compatibleBlob = /audio\/webm/i.test(blob.type) ? await convertAudioBlobToMp3(blob) : blob
  if (compatibleBlob.size > MAX_AUDIO_BYTES) throw new Error('转换后的音频超过 Mureka 允许的 10MB 上限')
  const dataUrl = normalizeMurekaAudioUrl(await blobToDataUrl(compatibleBlob))

  const response = await fetch('/api/song/describe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: dataUrl,
      forceRefresh: Boolean(options.forceRefresh),
      recordingType: options.recordingType,
      existingHummingCount: options.existingHummingCount,
    }),
  })
  const payload = await response.json().catch(() => ({})) as {
    error?: unknown
    result?: MusicSummary
    title?: string
    instrument?: string[]
    toneColor?: string[]
    genres?: string[]
    key?: string
    emotion?: string[]
    bpm?: string
    description?: string
    promptSuggestions?: AIPromptSuggestion[]
  }
  if (!response.ok) throw new Error(errorMessage(payload.error, `AI 音频分析失败（${response.status}）`))

  const result = payload.result ?? payload
  const summary = {
    title: result.title ?? '',
    instrument: result.instrument ?? [],
    toneColor: result.toneColor ?? [],
    genres: result.genres ?? [],
    key: result.key ?? '',
    emotion: result.emotion ?? [],
    bpm: result.bpm ?? '',
    description: result.description ?? '',
    promptSuggestions: result.promptSuggestions ?? [],
  }
  return options.recordingType === 'vocal' ? validateHummingSummary(summary) : validateMusicSummary(summary)
}

export function completedAnalysis(result: MusicSummary): AudioAIAnalysis {
  return { status: 'complete', ...result, analysisVersion: AI_ANALYSIS_VERSION, analyzedAt: new Date().toISOString() }
}
