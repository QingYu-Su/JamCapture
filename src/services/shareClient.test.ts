import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GeneratedTrack, InspirationTrack } from '../types'
import { createReadOnlyShare, getSharedTrack } from './shareClient'

const track: InspirationTrack = {
  id: 'share-track',
  kind: 'inspiration',
  title: '暮色回声',
  audioSource: { type: 'blob', blobId: 'audio-share-track' },
  waveform: [12, 36, 58],
  tags: { style: '摇滚', instrument: '电吉他', mood: '克制', bpm: '78 BPM' },
  recordedAt: '2026-07-29T00:00:00.000Z',
  duration: 12,
  aiAnalysis: {
    status: 'complete', title: '暮色回声', description: '温暖朦胧的旋律在暮色中缓慢铺展开来',
    genres: ['摇滚'], instrument: ['电吉他'], toneColor: ['温暖'], emotion: ['克制'], key: 'Am', bpm: '78',
  },
}

const generatedTrack: GeneratedTrack = {
  id: 'generated-share-track', kind: 'generated', title: '暮色延伸作品',
  audioSource: { type: 'asset', url: '/3.mp3' }, waveform: [18, 42, 66],
  sourceTrackIds: ['share-track'], mode: 'full', prompt: '保留温暖音色并加入鼓组与贝斯形成完整段落',
  style: '摇滚', status: 'complete', createdAt: '2026-07-30T00:00:00.000Z', duration: 86,
}

afterEach(() => vi.unstubAllGlobals())

describe('share client', () => {
  it('uploads audio and readonly metadata before returning an absolute link', async () => {
    const audio = new Blob(['audio'], { type: 'audio/mpeg' })
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ path: '/share/token123' }), { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('window', { location: { origin: 'https://jamcapture.test' } })

    await expect(createReadOnlyShare(track, vi.fn().mockResolvedValue(audio))).resolves.toBe('https://jamcapture.test/share/token123')
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/shares')
    expect(request.method).toBe('POST')
    expect(request.body).toBe(audio)
    expect((request.headers as Record<string, string>)['Content-Type']).toBe('audio/mpeg')
    expect((request.headers as Record<string, string>)['X-JamCapture-Metadata']).toBeTruthy()
  })

  it('shares generated works with their own type, tags, and prompt', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(new Blob(['generated-audio'], { type: 'audio/mpeg' })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ path: '/share/generated123' }), { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('window', { location: { origin: 'https://jamcapture.test' } })

    await createReadOnlyShare(generatedTrack, vi.fn())
    const request = fetchMock.mock.calls[1][1] as RequestInit
    const encoded = (request.headers as Record<string, string>)['X-JamCapture-Metadata']
    const metadata = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as Record<string, unknown>
    expect(metadata).toMatchObject({ kind: 'generated', subtitle: 'AI 延伸作品', tags: ['完整作品', '摇滚'], description: generatedTrack.prompt })
  })

  it('surfaces server errors while creating a share', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: '分享服务不可用' }), { status: 503 })))
    await expect(createReadOnlyShare(track, vi.fn().mockResolvedValue(new Blob(['audio'])))).rejects.toThrow('分享服务不可用')
  })

  it('loads readonly shared-track data', async () => {
    const payload = { kind: 'inspiration', title: '暮色回声', duration: 12, waveform: [12], tags: ['摇滚', '电吉他'], createdAt: '2026-07-29', audioUrl: '/api/shares/token123/audio' }
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(getSharedTrack('token123')).resolves.toEqual(payload)
    expect(fetchMock).toHaveBeenCalledWith('/api/shares/token123')
  })

  it('normalizes legacy shared-tag objects for existing links', async () => {
    const payload = { title: '旧分享', duration: 12, waveform: [12], tags: track.tags, createdAt: '2026-07-29', audioUrl: '/api/shares/legacy/audio' }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 })))
    await expect(getSharedTrack('legacy')).resolves.toMatchObject({ kind: 'inspiration', tags: ['摇滚', '电吉他', '克制', '78 BPM'] })
  })
})
