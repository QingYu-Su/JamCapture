import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GeneratedTrack } from '../types'
import { ExtensionsPage } from './ExtensionsPage'

const generatedTrack: GeneratedTrack = {
  id: 'generated-card-test', kind: 'generated', title: '暮色延伸作品',
  audioSource: { type: 'asset', url: '/3.mp3' }, waveform: [20, 45, 68],
  sourceTrackIds: ['source-track'], mode: 'full', prompt: '保留原始情绪并扩展完整段落',
  style: '摇滚', status: 'complete', createdAt: '2026-07-30T00:00:00.000Z', duration: 82,
}

vi.mock('../context/LibraryContext', () => ({
  useLibrary: () => ({ generated: [generatedTrack], inspirations: [], loading: false, getBlob: vi.fn() }),
}))

vi.mock('../context/PlayerContext', () => ({
  usePlayer: () => ({ current: null, playing: false, play: vi.fn() }),
}))

vi.mock('../components/ShareTrackModal', () => ({
  ShareTrackModal: ({ track }: { track: GeneratedTrack | null }) => track ? <div>正在分享 {track.title}</div> : null,
}))

afterEach(cleanup)

describe('ExtensionsPage sharing', () => {
  it('places a share action beside the generated-work playback action', () => {
    render(<ExtensionsPage />)
    const playButton = screen.getByRole('button', { name: '播放作品' })
    const shareButton = screen.getByRole('button', { name: '分享 暮色延伸作品' })
    expect(playButton.parentElement).toBe(shareButton.parentElement)
    fireEvent.click(shareButton)
    expect(screen.getByText('正在分享 暮色延伸作品')).toBeInTheDocument()
  })
})
