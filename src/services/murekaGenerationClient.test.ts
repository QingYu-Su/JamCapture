import { afterEach, describe, expect, it, vi } from 'vitest'
import { generateSongFromReference } from './murekaGenerationClient'

afterEach(() => vi.unstubAllGlobals())

describe('Mureka generation client', () => {
  it('sends the prepared selected song and modal prompt metadata', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      taskId: 'task-123', title: '延伸作品', audioBase64: btoa('generated-mp3'),
      audioMimeType: 'audio/mpeg', audioFingerprint: 'sha256-generated', duration: 150,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    const reference = new Blob(['temporary-reference'], { type: 'audio/mp3' })
    const result = await generateSongFromReference(reference, {
      userPrompt: '加入克制鼓组',
      lyrics: '[主歌]\n夜色缓缓落下',
      sourceTitle: '暮色回声',
      originalDuration: 10,
      preparedDuration: 30,
      repeatCount: 3,
    })
    expect(result.taskId).toBe('task-123')
    expect(result.audioFingerprint).toBe('sha256-generated')
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/song/generate')
    const form = request.body as FormData
    expect((form.get('referenceAudio') as Blob).size).toBe(reference.size)
    expect(JSON.parse(String(form.get('metadata')))).toEqual({
      userPrompt: '加入克制鼓组', lyrics: '[主歌]\n夜色缓缓落下', sourceTitle: '暮色回声',
      originalDuration: 10, preparedDuration: 30, repeatCount: 3,
    })
  })

  it('surfaces provider generation errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'Invalid reference audio' }), { status: 400 })))
    await expect(generateSongFromReference(new Blob(['audio']), {
      userPrompt: '测试', lyrics: '', sourceTitle: '测试歌曲',
      originalDuration: 30, preparedDuration: 30, repeatCount: 1,
    })).rejects.toThrow('Invalid reference audio')
  })
})
