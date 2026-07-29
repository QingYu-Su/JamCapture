import { afterEach, describe, expect, it, vi } from 'vitest'
import { describeAudio, normalizeMurekaAudioUrl } from './murekaClient'

const convertAudioBlobToMp3 = vi.hoisted(() => vi.fn())
vi.mock('../utils/audio', () => ({ convertAudioBlobToMp3 }))

const promptSuggestions = [
  { title: '暮色渐进', text: '保留克制旋律与温暖音色逐步加入鼓组和低频发展完整作品' },
  { title: '朦胧回响', text: '围绕忧郁情绪扩展空间和声在中段形成动态高潮后安静回落' },
  { title: '夜路律动', text: '延续原有节奏动机加入稳定贝斯与细腻鼓点构建夜行编曲' },
]

describe('Mureka describe client', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    convertAudioBlobToMp3.mockReset()
  })

  it('sends a base64 audio URL and accepts the wrapped response shape', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      result: {
        title: '暮色缓缓沉落', instrument: ['电吉他'], toneColor: ['温暖'], genres: ['摇滚'], key: 'Am',
        emotion: ['克制', '忧郁'], bpm: '78', description: '温暖朦胧的旋律在暮色中缓慢铺展开来', promptSuggestions,
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await describeAudio(new Blob(['audio'], { type: 'audio/mpeg' }))
    expect(result.genres).toEqual(['摇滚'])
    expect(result.promptSuggestions).toEqual(promptSuggestions)
    const request = fetchMock.mock.calls[0][1] as RequestInit
    const requestBody = JSON.parse(String(request.body)) as { url: string; forceRefresh: boolean }
    expect(requestBody.url).toMatch(/^data:audio\/mp3;base64,/)
    expect(requestBody.forceRefresh).toBe(false)
  })

  it('marks a manual AI analysis request to invalidate the server cache', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      title: '暮色缓缓沉落', instrument: ['电吉他'], toneColor: ['温暖'], genres: ['摇滚'], key: 'Am',
      emotion: ['克制', '忧郁'], bpm: '78', description: '温暖朦胧的旋律在暮色中缓慢铺展开来', promptSuggestions,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    await describeAudio(new Blob(['audio'], { type: 'audio/mpeg' }), { forceRefresh: true })
    const request = fetchMock.mock.calls[0][1] as RequestInit
    expect(JSON.parse(String(request.body)).forceRefresh).toBe(true)
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
      title: '雨夜微光浮动', instrument: ['电吉他'], toneColor: ['朦胧'], genres: ['轻音乐'], key: '无',
      emotion: ['安静', '克制'], bpm: '', description: '朦胧旋律在安静雨夜里缓慢流动并逐渐散开', promptSuggestions,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    await describeAudio(new Blob(['webm-audio'], { type: 'audio/webm;codecs=opus' }))
    expect(convertAudioBlobToMp3).toHaveBeenCalledOnce()
    const request = fetchMock.mock.calls[0][1] as RequestInit
    expect(JSON.parse(String(request.body)).url).toMatch(/^data:audio\/mp3;base64,/)
  })

  it('rejects malformed summaries so incomplete tags are never displayed', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      title: 'Bad 123', instrument: [], toneColor: [], genres: ['Rock'], key: 'unknown', emotion: [], bpm: 'fast', description: 'short',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })))
    await expect(describeAudio(new Blob(['audio'], { type: 'audio/mp3' }))).rejects.toThrow('不符合音乐标签格式')
  })
})
