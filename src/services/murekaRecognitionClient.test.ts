import { afterEach, describe, expect, it, vi } from 'vitest'
import { recognizeLyricsFromAudio } from './murekaRecognitionClient'

afterEach(() => vi.unstubAllGlobals())

describe('Mureka generated lyrics recognition client', () => {
  it('uploads the locally cached song and returns synchronized lyrics', async () => {
    const timedLyrics = [{ startTime: 1.2, endTime: 4.8, text: '第一句歌词' }]
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      lyrics: '第一句歌词',
      timedLyrics,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)
    const audio = new Blob(['generated-song'], { type: 'audio/mpeg' })

    await expect(recognizeLyricsFromAudio(audio)).resolves.toEqual({ lyrics: '第一句歌词', timedLyrics })
    expect(fetchMock).toHaveBeenCalledWith('/api/song/recognize-lyrics', {
      method: 'POST',
      headers: { 'Content-Type': 'audio/mpeg' },
      body: audio,
    })
  })
})
