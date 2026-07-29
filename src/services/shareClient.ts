import type { PlayableTrack } from '../types'

function encodeMetadata(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value))
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

async function trackAudioBlob(track: PlayableTrack, getBlob: (id: string) => Promise<Blob | undefined>) {
  if (track.audioSource.type === 'blob') {
    const blob = await getBlob(track.audioSource.blobId)
    if (!blob) throw new Error('找不到需要分享的音频文件')
    return blob
  }
  const response = await fetch(track.audioSource.url)
  if (!response.ok) throw new Error('无法读取需要分享的音频')
  return response.blob()
}

export async function createReadOnlyShare(track: PlayableTrack, getBlob: (id: string) => Promise<Blob | undefined>) {
  const audio = await trackAudioBlob(track, getBlob)
  const inspiration = track.kind === 'inspiration'
  const metadata = encodeMetadata({
    kind: track.kind,
    title: track.title,
    duration: track.duration,
    waveform: track.waveform,
    subtitle: inspiration ? '原始灵感录音' : 'AI 延伸作品',
    tags: inspiration
      ? [track.tags.style, track.tags.instrument, track.tags.mood, track.tags.bpm].filter(Boolean)
      : [track.mode === 'full' ? '完整作品' : '单乐器延伸', track.style].filter(Boolean),
    description: inspiration
      ? (track.aiAnalysis?.status === 'complete' ? track.aiAnalysis.description : undefined)
      : track.prompt,
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
  kind: 'inspiration' | 'generated'
  title: string
  subtitle?: string
  duration: number
  waveform: number[]
  tags: string[]
  description?: string
  createdAt: string
  audioUrl: string
}

export async function getSharedTrack(token: string) {
  const response = await fetch(`/api/shares/${encodeURIComponent(token)}`)
  const payload = await response.json().catch(() => ({})) as SharedTrack & { error?: string; tags?: string[] | Record<string, string> }
  if (!response.ok) throw new Error(payload.error || '无法读取分享内容')
  return {
    ...payload,
    kind: payload.kind === 'generated' ? 'generated' : 'inspiration',
    tags: Array.isArray(payload.tags) ? payload.tags.filter(Boolean) : Object.values(payload.tags ?? {}).filter(Boolean),
  } as SharedTrack
}
