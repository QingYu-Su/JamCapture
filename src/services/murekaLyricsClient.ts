interface LyricsOptimizationPayload {
  optimizedPrompt?: string
  error?: string
}

export async function optimizeLyricsPrompt(lyricsPrompt: string) {
  const prompt = lyricsPrompt.trim()
  if (!prompt) throw new Error('请先输入歌词内容构思')
  if ([...prompt].length > 180) throw new Error('歌词内容构思不能超过 180 个字')
  const response = await fetch('/api/lyrics/optimize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  })
  const payload = await response.json().catch(() => ({})) as LyricsOptimizationPayload
  if (!response.ok) throw new Error(payload.error || `歌词构思优化失败（${response.status}）`)
  const optimizedPrompt = payload.optimizedPrompt?.trim()
  if (!optimizedPrompt) throw new Error('歌词构思优化成功，但没有返回可用内容')
  return optimizedPrompt
}
