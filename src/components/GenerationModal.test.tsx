import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { InspirationTrack } from '../types'
import { GenerationModal } from './GenerationModal'

vi.mock('../context/LibraryContext', () => ({
  useLibrary: () => ({ generateDemo: vi.fn() }),
}))

vi.mock('../services/murekaLyricsClient', () => ({
  optimizeLyricsPrompt: vi.fn().mockResolvedValue('以雨夜独行为场景，描写孤独逐渐转向释然的情绪变化。'),
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => vi.fn() }
})

afterEach(cleanup)

const track: InspirationTrack = {
  id: 'prompt-track', kind: 'inspiration', title: '暮色缓缓沉落',
  audioSource: { type: 'asset', url: '/1.mp3' }, waveform: [20, 40],
  tags: { style: '摇滚', instrument: '电吉他', mood: '克制', bpm: '78' },
  recordedAt: '2026-07-29T00:00:00.000Z', duration: 12,
  aiAnalysis: {
    status: 'complete', analysisVersion: 2, description: '温暖朦胧的旋律在暮色中缓慢铺展开来',
    promptSuggestions: [
      { title: '暮色渐进', text: '保留克制旋律与温暖音色逐步加入鼓组和低频发展完整作品' },
      { title: '朦胧回响', text: '围绕忧郁情绪扩展空间和声在中段形成动态高潮后安静回落' },
      { title: '夜路律动', text: '延续原有节奏动机加入稳定贝斯与细腻鼓点构建夜行编曲' },
    ],
  },
}

describe('GenerationModal', () => {
  it('shows generation modes and enables lyric expansion only after lyrics are entered', async () => {
    render(<GenerationModal open tracks={[track]} onClose={vi.fn()} />)
    expect(screen.getByText('当前所选歌曲')).toBeInTheDocument()
    expect(screen.getByText('暮色缓缓沉落')).toBeInTheDocument()
    expect(screen.getByText('暮色渐进')).toBeInTheDocument()
    expect(screen.getByText('朦胧回响')).toBeInTheDocument()
    expect(screen.getByText('夜路律动')).toBeInTheDocument()
    expect(screen.queryByText('单乐器延伸')).not.toBeInTheDocument()
    expect(screen.queryByText('完整作品延伸')).not.toBeInTheDocument()
    expect(screen.queryByText('AI 推荐风格')).not.toBeInTheDocument()

    expect(screen.queryByText('生成方式')).not.toBeInTheDocument()
    expect(screen.queryByText('完整词曲生成')).not.toBeInTheDocument()
    const lyrics = screen.getByRole('textbox', { name: '歌词内容构思' })
    const prompt = screen.getByRole('textbox', { name: '创作风格与演绎要求' })
    const expand = screen.getByRole('button', { name: 'AI 优化歌词构思' })
    expect(lyrics).toHaveAttribute('maxlength', '180')
    expect(prompt).toHaveAttribute('maxlength', '180')
    expect(expand).toBeDisabled()
    fireEvent.change(lyrics, { target: { value: '雨夜里独自前行' } })
    expect(expand).toBeEnabled()
    fireEvent.click(expand)
    await waitFor(() => expect(lyrics).toHaveValue('以雨夜独行为场景，描写孤独逐渐转向释然的情绪变化。'))

    fireEvent.click(screen.getByText('朦胧回响'))
    expect(prompt).toHaveValue(track.aiAnalysis?.promptSuggestions?.[1].text)
  })

  it('only offers full song generation for humming inspirations', () => {
    const hummingTrack: InspirationTrack = {
      ...track,
      id: 'humming-track',
      title: '哼唱灵感1',
      recordingType: 'vocal',
      tags: { ...track.tags, instrument: '人声哼唱' },
    }

    render(<GenerationModal open tracks={[hummingTrack]} onClose={vi.fn()} />)

    expect(screen.queryByText('生成方式')).not.toBeInTheDocument()
    expect(screen.queryByText('完整词曲生成')).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '歌词内容构思' })).toBeInTheDocument()
    expect(screen.queryByText('AI Prompt 建议')).not.toBeInTheDocument()
  })
})
