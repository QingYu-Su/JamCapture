import { beforeAll, describe, expect, it } from 'vitest'
import { repository } from './repository'
import type { InspirationTrack } from '../types'

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
})
