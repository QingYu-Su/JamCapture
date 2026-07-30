import { beforeAll, describe, expect, it } from 'vitest'
import { isLegacySimulatedGeneration, repository } from './repository'
import type { GeneratedTrack, InspirationTrack } from '../types'

describe('repository', () => {
  beforeAll(async () => {
    await repository.initialize()
  })

  it('seeds demo inspirations only once', async () => {
    await repository.initialize()
    const tracks = await repository.getInspirations()
    expect(tracks.filter((track) => track.id.startsWith('demo-'))).toHaveLength(3)
  })

  it('persists and removes a recorded blob with its metadata', async () => {
    const track: InspirationTrack = {
      id: 'test-recording', kind: 'inspiration', title: 'Test recording',
      audioSource: { type: 'blob', blobId: 'test-recording' }, waveform: [20, 40],
      tags: { style: 'Raw', instrument: 'Guitar', mood: 'Focused', bpm: '90 BPM' },
      recordedAt: new Date().toISOString(), duration: 5,
    }
    await repository.saveInspiration(track, new Blob(['audio'], { type: 'audio/webm' }))
    // fake-indexeddb serializes jsdom Blob as a plain structured-clone value.
    expect(await repository.getAudioBlob('test-recording')).toBeDefined()
    expect((await repository.getInspirations()).some((item) => item.id === track.id)).toBe(true)
    await repository.deleteInspiration(track)
    expect(await repository.getAudioBlob('test-recording')).toBeUndefined()
  })

  it('persists a generated audio blob independently from its source song', async () => {
    const track: GeneratedTrack = {
      id: 'generated-storage-test', kind: 'generated', title: '延伸作品',
      audioSource: { type: 'blob', blobId: 'generated-storage-audio' }, waveform: [20, 50],
      sourceTrackIds: ['test-recording'], mode: 'full', prompt: '保持原始动机', style: '摇滚',
      status: 'complete', createdAt: new Date().toISOString(), duration: 120,
    }
    await repository.saveGenerated(track, new Blob(['generated-audio'], { type: 'audio/mpeg' }))
    expect((await repository.getGenerated()).some((item) => item.id === track.id)).toBe(true)
    expect(await repository.getAudioBlob('generated-storage-audio')).toBeDefined()
  })

  it('identifies the obsolete fixed simulation audio records', () => {
    const legacy: GeneratedTrack = {
      id: 'legacy', kind: 'generated', title: '旧模拟作品',
      audioSource: { type: 'asset', url: '/3.mp3' }, waveform: [20], sourceTrackIds: ['demo-1'],
      mode: 'full', prompt: '模拟', style: '摇滚', status: 'complete', createdAt: new Date().toISOString(), duration: 98,
    }
    expect(isLegacySimulatedGeneration(legacy)).toBe(true)
    expect(isLegacySimulatedGeneration({ ...legacy, audioSource: { type: 'blob', blobId: 'real-audio' } })).toBe(false)
  })
})
