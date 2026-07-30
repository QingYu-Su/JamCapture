import { afterEach, describe, expect, it, vi } from 'vitest'
import { expandLyrics } from './murekaLyricsClient'

afterEach(() => vi.unstubAllGlobals())

describe('Mureka lyrics client', () => {
  it('sends the current lyrics as a prompt and returns the expanded lyrics', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      lyrics: '[主歌]\n夜色缓缓落下\n[副歌]\n回声越过城市',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(expandLyrics('一个人走在雨夜')).resolves.toContain('[副歌]')
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/lyrics/generate')
    expect(JSON.parse(String(request.body))).toEqual({ prompt: '一个人走在雨夜' })
  })

  it('does not request lyrics when the input is empty', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(expandLyrics('   ')).rejects.toThrow('请先输入')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
