import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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
  onEdit: vi.fn(), onExtend: vi.fn(), onRetryAnalysis: vi.fn(), onShare: vi.fn(),
}

describe('TrackCard AI analysis states', () => {
  it('shows a loading panel while analysis is pending', () => {
    render(<TrackCard {...actions} track={{ ...baseTrack, aiAnalysis: { status: 'analyzing' } }} />)
    expect(screen.getByText('AI 正在理解这段音频')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '更多操作 AI Test' }))
    expect(screen.getByRole('menuitem', { name: '分析中' })).toBeDisabled()
    expect(screen.queryByText('Rock')).not.toBeInTheDocument()
    expect(screen.queryByText('Raw')).not.toBeInTheDocument()
  })

  it('allows every completed item to request analysis again', () => {
    const onRetryAnalysis = vi.fn()
    render(<TrackCard {...actions} onRetryAnalysis={onRetryAnalysis} track={baseTrack} />)
    fireEvent.click(screen.getByRole('button', { name: '更多操作 AI Test' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'AI分析' }))
    expect(onRetryAnalysis).toHaveBeenCalledOnce()
  })

  it('keeps edit and share actions inside the more menu', () => {
    const onEdit = vi.fn()
    const onShare = vi.fn()
    render(<TrackCard {...actions} onEdit={onEdit} onShare={onShare} track={baseTrack} />)
    expect(screen.queryByRole('menuitem', { name: '编辑灵感' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '更多操作 AI Test' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '编辑灵感' }))
    expect(onEdit).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: '更多操作 AI Test' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '分享' }))
    expect(onShare).toHaveBeenCalledOnce()
  })

  it('keeps tags and description hidden after an analysis error', () => {
    render(<TrackCard {...actions} track={{ ...baseTrack, aiAnalysis: { status: 'failed', error: '请求失败' } }} />)
    expect(screen.getByText('请求失败')).toBeInTheDocument()
    expect(screen.queryByText('Rock')).not.toBeInTheDocument()
    expect(screen.queryByText('Raw')).not.toBeInTheDocument()
    expect(screen.queryByText('AI AUDIO INSIGHT')).not.toBeInTheDocument()
  })

  it('renders the returned description and tags', () => {
    render(<TrackCard {...actions} track={{ ...baseTrack, aiAnalysis: {
      status: 'complete', title: '暮色缓缓沉落', description: '温暖朦胧的旋律在暮色中缓慢铺展开来', genres: ['摇滚'],
      instrument: ['电吉他'], toneColor: ['温暖', '朦胧'], emotion: ['克制', '忧郁'], key: 'Am', bpm: '78',
    } }} />)
    expect(screen.getByText('温暖朦胧的旋律在暮色中缓慢铺展开来')).toBeInTheDocument()
    expect(screen.getByText('摇滚')).toBeInTheDocument()
    expect(screen.getByText('温暖')).toBeInTheDocument()
    expect(screen.getByText('克制')).toBeInTheDocument()
    expect(screen.getByText('Am')).toBeInTheDocument()
    expect(screen.getByText('78 BPM')).toBeInTheDocument()
    expect(screen.queryByText('Raw')).not.toBeInTheDocument()
    expect(screen.queryByText('100 BPM')).not.toBeInTheDocument()
  })
})
