interface GenerationPayload {
  taskId: string
  title?: string
  audioBase64: string
  audioMimeType?: string
  audioFingerprint?: string
  timedLyrics?: Array<{ startTime: number; endTime?: number; text: string }>
  duration?: number
}

interface GenerationInput {
  userPrompt: string
  lyrics: string
  sourceTitle: string
  originalDuration: number
  preparedDuration: number
  repeatCount: number
}

function base64Audio(value: string, mimeType: string) {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return new Blob([bytes], { type: mimeType || 'audio/mpeg' })
}

export async function generateSongFromReference(
  referenceAudio: Blob,
  input: GenerationInput,
) {
  const lyrics = input.lyrics.trim() || 'instrumental'
  console.info('[JamCapture] Browser generation request prepared', {
    endpoint: '/api/song/generate',
    sourceTitle: input.sourceTitle,
    userPrompt: input.userPrompt,
    lyrics: lyrics === 'instrumental' ? 'instrumental' : `[${lyrics.length} characters]`,
    referenceAudio: {
      type: referenceAudio.type || 'audio/mpeg',
      size: referenceAudio.size,
      originalDuration: input.originalDuration,
      preparedDuration: input.preparedDuration,
      repeatCount: input.repeatCount,
    },
  })
  // Browser DevTools pauses here before the selected song is sent to the local Mureka proxy.
  // eslint-disable-next-line no-debugger
  debugger
  const form = new FormData()
  form.append('referenceAudio', referenceAudio, 'jamcapture-reference.mp3')
  form.append('metadata', JSON.stringify({ ...input, lyrics }))
  const response = await fetch('/api/song/generate', {
    method: 'POST',
    body: form,
  })
  const payload = await response.json().catch(() => ({})) as Partial<GenerationPayload> & { error?: string }
  if (!response.ok) throw new Error(payload.error || `歌曲生成失败（${response.status}）`)
  if (!payload.taskId || !payload.audioBase64) throw new Error('Mureka 生成完成，但没有返回可播放音频')
  return {
    taskId: payload.taskId,
    title: payload.title,
    duration: payload.duration,
    audioFingerprint: payload.audioFingerprint,
    timedLyrics: payload.timedLyrics ?? [],
    audio: base64Audio(payload.audioBase64, payload.audioMimeType || 'audio/mpeg'),
  }
}
