import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { InspirationTrack } from '../types'
import { TrackCard } from './TrackCard'

vi.mock('../context/PlayerContext', () => ({
  usePlayer: () => ({ current: null, playing: false, play: vi.fn() }),
}))

afterEach(cleanup)

const baseTrack: InspirationTrack = {
  id: 'track-ai-test', kind: 'inspiration', title: 'AI Test',
  audioSource: { type: 'asset', url: '/1.mp3' }, waveform: [20, 40, 60],
  tags: { style: 'Rock', instrument: 'Guitar', mood: 'Raw', bpm: '100 BPM' },
  recordedAt: '2026-07-29T00:00:00.000Z', duration: 12,
}

const actions = {
  selectionMode: false, selected: false, onSelect: vi.fn(), onEdit: vi.fn(),
  onExtend: vi.fn(), onRetryAnalysis: vi.fn(),
}

describe('TrackCard AI analysis states', () => {
  it('shows a loading panel while analysis is pending', () => {
    render(<TrackCard {...actions} track={{ ...baseTrack, aiAnalysis: { status: 'analyzing' } }} />)
    expect(screen.getByText('AI 正在理解这段音频')).toBeInTheDocument()
  })

  it('renders the returned description and tags', () => {
    render(<TrackCard {...actions} track={{ ...baseTrack, aiAnalysis: {
      status: 'complete', description: 'A dynamic guitar performance.', genres: ['Alternative Rock'],
      instrument: ['Electric Guitar'], tags: ['Energetic', 'Melodic'],
    } }} />)
    expect(screen.getByText('A dynamic guitar performance.')).toBeInTheDocument()
    expect(screen.getByText('Alternative Rock')).toBeInTheDocument()
    expect(screen.getByText('Energetic')).toBeInTheDocument()
    expect(screen.queryByText('Raw')).not.toBeInTheDocument()
    expect(screen.queryByText('100 BPM')).not.toBeInTheDocument()
  })
})
