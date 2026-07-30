import type { TimedLyricLine } from '../types'

interface RecognitionPayload {
  error?: unknown
  lyrics?: string
  timedLyrics?: TimedLyricLine[]
}

export async function recognizeLyricsFromAudio(audio: Blob) {
  const response = await fetch('/api/song/recognize-lyrics', {
    method: 'POST',
    headers: { 'Content-Type': audio.type || 'audio/mpeg' },
    body: audio,
  })
  const payload = await response.json().catch(() => ({})) as RecognitionPayload
  if (!response.ok) {
    const error = typeof payload.error === 'string' ? payload.error : '歌词识别失败（' + response.status + '）'
    throw new Error(error)
  }
  return {
    lyrics: payload.lyrics?.trim() ?? '',
    timedLyrics: Array.isArray(payload.timedLyrics) ? payload.timedLyrics : [],
  }
}
