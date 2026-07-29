import { afterEach, describe, expect, it, vi } from 'vitest'
import type { InspirationTrack } from '../types'
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

  it('surfaces server errors while creating a share', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: '分享服务不可用' }), { status: 503 })))
    await expect(createReadOnlyShare(track, vi.fn().mockResolvedValue(new Blob(['audio'])))).rejects.toThrow('分享服务不可用')
  })

  it('loads readonly shared-track data', async () => {
    const payload = { title: '暮色回声', duration: 12, waveform: [12], tags: track.tags, createdAt: '2026-07-29', audioUrl: '/api/shares/token123/audio' }
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(getSharedTrack('token123')).resolves.toEqual(payload)
    expect(fetchMock).toHaveBeenCalledWith('/api/shares/token123')
  })
})
