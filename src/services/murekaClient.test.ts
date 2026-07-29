import { afterEach, describe, expect, it, vi } from 'vitest'
import { describeAudio, normalizeMurekaAudioUrl } from './murekaClient'

const convertAudioBlobToMp3 = vi.hoisted(() => vi.fn())
vi.mock('../utils/audio', () => ({ convertAudioBlobToMp3 }))

describe('Mureka describe client', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    convertAudioBlobToMp3.mockReset()
  })

  it('sends a base64 audio URL and accepts the wrapped response shape', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      result: {
        instrument: ['Electric Guitar'], genres: ['Rock'], tags: ['Energetic'], description: 'A guitar-led rock idea.',
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await describeAudio(new Blob(['audio'], { type: 'audio/mpeg' }))
    expect(result.genres).toEqual(['Rock'])
    const request = fetchMock.mock.calls[0][1] as RequestInit
    expect(JSON.parse(String(request.body)).url).toMatch(/^data:audio\/mp3;base64,/)
  })

  it('surfaces configuration errors returned by the local proxy', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ error: '请先在 config.yaml 中配置 api_key' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    )))
    await expect(describeAudio(new Blob(['audio'], { type: 'audio/mp3' }))).rejects.toThrow('config.yaml')
  })

  it('extracts readable messages from structured provider errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ error: { message: 'Too many concurrent requests' } }),
      { status: 429, headers: { 'Content-Type': 'application/json' } },
    )))
    await expect(describeAudio(new Blob(['audio'], { type: 'audio/mp3' }))).rejects.toThrow('Too many concurrent requests')
  })

  it('normalizes MediaRecorder MP4 codecs to the M4A data URL accepted by Mureka', () => {
    expect(normalizeMurekaAudioUrl('data:audio/mp4;codecs=mp4a.40.2;base64,AAAA')).toBe('data:audio/m4a;base64,AAAA')
  })

  it('rejects WebM with an actionable format message', () => {
    expect(() => normalizeMurekaAudioUrl('data:audio/webm;codecs=opus;base64,AAAA')).toThrow('Mureka 仅支持 MP3/M4A')
  })

  it('transcodes a WebM recording before submitting it to Mureka', async () => {
    convertAudioBlobToMp3.mockResolvedValue(new Blob(['mp3-audio'], { type: 'audio/mp3' }))
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      instrument: [], genres: [], tags: [], description: 'Converted recording',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    await describeAudio(new Blob(['webm-audio'], { type: 'audio/webm;codecs=opus' }))
    expect(convertAudioBlobToMp3).toHaveBeenCalledOnce()
    const request = fetchMock.mock.calls[0][1] as RequestInit
    expect(JSON.parse(String(request.body)).url).toMatch(/^data:audio\/mp3;base64,/)
  })
})
