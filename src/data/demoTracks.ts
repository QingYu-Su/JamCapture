import type { InspirationTrack } from '../types'

export const demoTracks: InspirationTrack[] = [
  {
    id: 'demo-midnight-riff',
    kind: 'inspiration',
    title: 'Midnight Drive Riff',
    audioSource: { type: 'asset', url: '/1.mp3' },
    waveform: [],
    tags: { style: 'Indie Rock', instrument: 'Electric Guitar', mood: 'Restless', bpm: '118 BPM' },
    recordedAt: '2026-07-28T22:34:00.000Z',
    duration: 13,
  },
  {
    id: 'demo-sunday-chords',
    kind: 'inspiration',
    title: 'Sunday Window Chords',
    audioSource: { type: 'asset', url: '/2.mp3' },
    waveform: [],
    tags: { style: 'Neo Soul', instrument: 'Acoustic Guitar', mood: 'Warm', bpm: '86 BPM' },
    recordedAt: '2026-07-26T08:12:00.000Z',
    duration: 11,
  },
  {
    id: 'demo-dusty-tape',
    kind: 'inspiration',
    title: 'Dusty Tape Theme',
    audioSource: { type: 'asset', url: '/3.mp3' },
    waveform: [],
    tags: { style: 'Lo-fi', instrument: 'Bass', mood: 'Nostalgic', bpm: '94 BPM' },
    recordedAt: '2026-07-23T15:46:00.000Z',
    duration: 12,
  },
]

export const fallbackWaveform = Array.from({ length: 48 }, () => 18)
