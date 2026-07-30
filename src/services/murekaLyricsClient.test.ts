import { afterEach, describe, expect, it, vi } from 'vitest'
import { optimizeLyricsPrompt } from './murekaLyricsClient'

afterEach(() => vi.unstubAllGlobals())

describe('DeepSeek lyrics idea client', () => {
  it('sends the current idea and returns an optimized prompt instead of complete lyrics', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      optimizedPrompt: '以雨夜独行为核心场景，使用第一人称描写孤独逐渐转向释然。',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(optimizeLyricsPrompt('一个人走在雨夜')).resolves.toContain('核心场景')
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/lyrics/optimize')
    expect(JSON.parse(String(request.body))).toEqual({ prompt: '一个人走在雨夜' })
  })

  it('does not optimize when the input is empty', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(optimizeLyricsPrompt('   ')).rejects.toThrow('请先输入')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects lyrics ideas longer than 180 characters', async () => {
    vi.stubGlobal('fetch', vi.fn())
    await expect(optimizeLyricsPrompt('字'.repeat(181))).rejects.toThrow('180')
  })
})
