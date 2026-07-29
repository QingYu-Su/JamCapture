import type { AudioAIAnalysis } from '../types'
import { convertAudioBlobToMp3 } from '../utils/audio'

const MAX_AUDIO_BYTES = 10 * 1024 * 1024

export interface MusicSummary {
  title: string
  instrument: string[]
  toneColor: string[]
  genres: string[]
  key: string
  emotion: string[]
  bpm: string
  description: string
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

export async function describeAudio(blob: Blob): Promise<MusicSummary> {
  const compatibleBlob = /audio\/webm/i.test(blob.type) ? await convertAudioBlobToMp3(blob) : blob
  if (compatibleBlob.size > MAX_AUDIO_BYTES) throw new Error('转换后的音频超过 Mureka 允许的 10MB 上限')
  const dataUrl = normalizeMurekaAudioUrl(await blobToDataUrl(compatibleBlob))

  const response = await fetch('/api/song/describe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: dataUrl }),
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
  }
  if (!response.ok) throw new Error(errorMessage(payload.error, `AI 音频分析失败（${response.status}）`))

  const result = payload.result ?? payload
  return {
    title: result.title ?? '',
    instrument: result.instrument ?? [],
    toneColor: result.toneColor ?? [],
    genres: result.genres ?? [],
    key: result.key ?? '',
    emotion: result.emotion ?? [],
    bpm: result.bpm ?? '',
    description: result.description ?? '',
  }
}

export function completedAnalysis(result: MusicSummary): AudioAIAnalysis {
  return { status: 'complete', ...result, analyzedAt: new Date().toISOString() }
}
