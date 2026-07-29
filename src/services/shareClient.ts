import type { InspirationTrack } from '../types'

function encodeMetadata(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value))
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

async function trackAudioBlob(track: InspirationTrack, getBlob: (id: string) => Promise<Blob | undefined>) {
  if (track.audioSource.type === 'blob') {
    const blob = await getBlob(track.audioSource.blobId)
    if (!blob) throw new Error('找不到需要分享的音频文件')
    return blob
  }
  const response = await fetch(track.audioSource.url)
  if (!response.ok) throw new Error('无法读取需要分享的音频')
  return response.blob()
}

export async function createReadOnlyShare(track: InspirationTrack, getBlob: (id: string) => Promise<Blob | undefined>) {
  const audio = await trackAudioBlob(track, getBlob)
  const metadata = encodeMetadata({
    title: track.title,
    duration: track.duration,
    waveform: track.waveform,
    tags: track.tags,
    description: track.aiAnalysis?.status === 'complete' ? track.aiAnalysis.description : undefined,
  })
  const response = await fetch('/api/shares', {
    method: 'POST',
    headers: { 'Content-Type': audio.type || 'audio/mpeg', 'X-JamCapture-Metadata': metadata },
    body: audio,
  })
  const payload = await response.json().catch(() => ({})) as { path?: string; error?: string }
  if (!response.ok || !payload.path) throw new Error(payload.error || '生成分享链接失败')
  return new URL(payload.path, window.location.origin).toString()
}

export interface SharedTrack {
  title: string
  duration: number
  waveform: number[]
  tags: InspirationTrack['tags']
  description?: string
  createdAt: string
  audioUrl: string
}

export async function getSharedTrack(token: string) {
  const response = await fetch(`/api/shares/${encodeURIComponent(token)}`)
  const payload = await response.json().catch(() => ({})) as SharedTrack & { error?: string }
  if (!response.ok) throw new Error(payload.error || '无法读取分享内容')
  return payload
}
