interface GenerationPayload {
  taskId: string
  title?: string
  audioBase64: string
  audioMimeType?: string
  audioFingerprint?: string
  duration?: number
}

interface ReferencePreparationMetadata {
  originalDuration: number
  preparedDuration: number
  repeatCount: number
}

function encodeHeader(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value))
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

function base64Audio(value: string, mimeType: string) {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return new Blob([bytes], { type: mimeType || 'audio/mpeg' })
}

export async function generateSongFromReference(
  referenceAudio: Blob,
  userPrompt: string,
  sourceTitle: string,
  preparation: ReferencePreparationMetadata,
) {
  console.info('[JamCapture] Browser generation request prepared', {
    endpoint: '/api/song/generate',
    sourceTitle,
    userPrompt,
    referenceAudio: {
      type: referenceAudio.type || 'audio/mpeg',
      size: referenceAudio.size,
      ...preparation,
    },
  })
  // Browser DevTools pauses here before the selected song is sent to the local Mureka proxy.
  // eslint-disable-next-line no-debugger
  debugger
  const response = await fetch('/api/song/generate', {
    method: 'POST',
    headers: {
      'Content-Type': referenceAudio.type || 'audio/mpeg',
      'X-JamCapture-Generation': encodeHeader({ userPrompt, sourceTitle, ...preparation }),
    },
    body: referenceAudio,
  })
  const payload = await response.json().catch(() => ({})) as Partial<GenerationPayload> & { error?: string }
  if (!response.ok) throw new Error(payload.error || `歌曲生成失败（${response.status}）`)
  if (!payload.taskId || !payload.audioBase64) throw new Error('Mureka 生成完成，但没有返回可播放音频')
  return {
    taskId: payload.taskId,
    title: payload.title,
    duration: payload.duration,
    audioFingerprint: payload.audioFingerprint,
    audio: base64Audio(payload.audioBase64, payload.audioMimeType || 'audio/mpeg'),
  }
}
