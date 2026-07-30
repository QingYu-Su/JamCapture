interface LyricsGenerationPayload {
  lyrics?: string
  error?: string
}

export async function expandLyrics(lyricsPrompt: string) {
  const prompt = lyricsPrompt.trim()
  if (!prompt) throw new Error('请先输入需要扩写的歌词内容')
  const response = await fetch('/api/lyrics/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  })
  const payload = await response.json().catch(() => ({})) as LyricsGenerationPayload
  if (!response.ok) throw new Error(payload.error || `歌词扩写失败（${response.status}）`)
  const lyrics = payload.lyrics?.trim()
  if (!lyrics) throw new Error('歌词扩写成功，但没有返回可用歌词')
  return lyrics
}
