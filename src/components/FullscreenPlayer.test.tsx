import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GeneratedTrack } from '../types'
import { FullscreenPlayer } from './FullscreenPlayer'

const playerState = vi.hoisted(() => ({
  playing: true,
  currentTime: 7,
  duration: 120,
  volume: 0.7,
  toggle: vi.fn(),
  seek: vi.fn(),
  setVolume: vi.fn(),
  current: null as GeneratedTrack | null,
}))

vi.mock('../context/PlayerContext', () => ({ usePlayer: () => playerState }))

afterEach(() => {
  cleanup()
  playerState.toggle.mockClear()
  playerState.seek.mockClear()
  playerState.currentTime = 7
})

describe('FullscreenPlayer', () => {
  it('highlights synchronized lyrics and seeks when a lyric line is selected', () => {
    const scrollTo = vi.fn()
    Element.prototype.scrollTo = scrollTo
    Element.prototype.getBoundingClientRect = vi.fn(function (this: Element) {
      if (this.classList.contains('lyrics-scroll')) {
        return { top: 100, bottom: 500, left: 0, right: 500, width: 500, height: 400, x: 0, y: 100, toJSON: vi.fn() }
      }
      return { top: this.textContent === '第二句歌词' ? 340 : 260, bottom: 380, left: 0, right: 500, width: 500, height: 40, x: 0, y: 340, toJSON: vi.fn() }
    })
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 400 })
    Object.defineProperty(HTMLElement.prototype, 'scrollTop', { configurable: true, get: () => 0 })
    window.matchMedia = vi.fn().mockReturnValue({ matches: false })
    playerState.current = {
      id: 'vocal-track', kind: 'generated', title: '雨夜回声',
      audioSource: { type: 'blob', blobId: 'vocal-audio' }, waveform: [20, 50], sourceTrackIds: ['source'],
      mode: 'full', generationKind: 'full-song', prompt: '流行摇滚', lyrics: '第一句歌词\n第二句歌词',
      timedLyrics: [
        { startTime: 1, endTime: 6, text: '第一句歌词' },
        { startTime: 6, endTime: 12, text: '第二句歌词' },
      ],
      style: '流行摇滚', status: 'complete', createdAt: '2026-07-30T00:00:00.000Z', duration: 120,
    }
    render(<FullscreenPlayer open onClose={vi.fn()} />)
    expect(screen.getByText('第二句歌词')).toHaveClass('active')
    expect(screen.getByText('第二句歌词')).toHaveAttribute('aria-current', 'true')
    expect(scrollTo).toHaveBeenCalledWith({ top: 60, behavior: 'smooth' })
    fireEvent.click(screen.getByText('第一句歌词'))
    expect(playerState.seek).toHaveBeenCalledWith(1)
  })

  it('does not force automatic centering while the user is manually scrolling lyrics', () => {
    const scrollTo = vi.fn()
    Element.prototype.scrollTo = scrollTo
    Element.prototype.getBoundingClientRect = vi.fn(() => (
      { top: 100, bottom: 500, left: 0, right: 500, width: 500, height: 40, x: 0, y: 100, toJSON: vi.fn() }
    ))
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 400 })
    Object.defineProperty(HTMLElement.prototype, 'scrollTop', { configurable: true, get: () => 0 })
    window.matchMedia = vi.fn().mockReturnValue({ matches: false })
    playerState.current = {
      id: 'manual-scroll-track', kind: 'generated', title: '滚动歌词',
      audioSource: { type: 'blob', blobId: 'manual-scroll-audio' }, waveform: [20], sourceTrackIds: ['source'],
      mode: 'full', generationKind: 'full-song', prompt: '流行', lyrics: '第一句\n第二句',
      timedLyrics: [{ startTime: 1, text: '第一句' }, { startTime: 6, text: '第二句' }],
      style: '流行', status: 'complete', createdAt: '2026-07-30T00:00:00.000Z', duration: 120,
    }
    playerState.currentTime = 2
    const view = render(<FullscreenPlayer open onClose={vi.fn()} />)
    scrollTo.mockClear()
    fireEvent.wheel(screen.getByText('第一句').parentElement as HTMLElement)
    playerState.currentTime = 7
    view.rerender(<FullscreenPlayer open onClose={vi.fn()} />)
    expect(screen.getByText('第二句')).toHaveClass('active')
    expect(scrollTo).not.toHaveBeenCalled()
  })

  it('shows the empty lyric state for instrumental works', () => {
    playerState.current = {
      id: 'instrumental-track', kind: 'generated', title: '纯音乐作品',
      audioSource: { type: 'blob', blobId: 'instrumental-audio' }, waveform: [30], sourceTrackIds: ['source'],
      mode: 'full', generationKind: 'instrumental', prompt: '氛围摇滚', lyrics: undefined,
      style: '摇滚', status: 'complete', createdAt: '2026-07-30T00:00:00.000Z', duration: 90,
    }
    render(<FullscreenPlayer open onClose={vi.fn()} />)
    expect(screen.getByText('暂无歌词')).toBeInTheDocument()
  })
})
