import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GeneratedTrack } from '../types'
import { ExtensionsPage } from './ExtensionsPage'

const generatedTrack: GeneratedTrack = {
  id: 'generated-card-test', kind: 'generated', title: '暮色延伸作品',
  audioSource: { type: 'asset', url: '/3.mp3' }, waveform: [20, 45, 68],
  sourceTrackIds: ['source-track'], mode: 'full', prompt: '保留原始情绪并扩展完整段落',
  style: '摇滚', status: 'complete', createdAt: '2026-07-30T00:00:00.000Z', duration: 82,
}

const pendingTrack: GeneratedTrack = {
  ...generatedTrack,
  id: 'pending-card-test',
  title: '雨夜片段 · 延伸作品',
  status: 'generating',
  duration: 0,
}

const extensionMocks = vi.hoisted(() => ({ deleteGenerated: vi.fn(), updateGenerated: vi.fn(), stopIfTrack: vi.fn() }))

vi.mock('../context/LibraryContext', () => ({
  useLibrary: () => ({ generated: [pendingTrack, generatedTrack], inspirations: [], loading: false, getBlob: vi.fn(), deleteGenerated: extensionMocks.deleteGenerated, updateGenerated: extensionMocks.updateGenerated }),
}))

vi.mock('../context/PlayerContext', () => ({
  usePlayer: () => ({ current: null, playing: false, play: vi.fn(), stopIfTrack: extensionMocks.stopIfTrack }),
}))

vi.mock('../components/ShareTrackModal', () => ({
  ShareTrackModal: ({ track }: { track: GeneratedTrack | null }) => track ? <div>正在分享 {track.title}</div> : null,
}))

afterEach(cleanup)

describe('ExtensionsPage sharing', () => {
  it('shows a non-playable loading item while a background generation is running', () => {
    render(<ExtensionsPage />)
    expect(screen.getByText('雨夜片段 · 延伸作品')).toBeInTheDocument()
    expect(screen.getByText('GENERATING')).toBeInTheDocument()
    expect(screen.getByLabelText('作品生成中')).toBeInTheDocument()
  })

  it('places a share action beside the generated-work playback action', () => {
    render(<ExtensionsPage />)
    const playButton = screen.getByRole('button', { name: '播放作品' })
    const shareButton = screen.getByRole('button', { name: '分享 暮色延伸作品' })
    expect(playButton.parentElement).toBe(shareButton.parentElement)
    fireEvent.click(shareButton)
    expect(screen.getByText('正在分享 暮色延伸作品')).toBeInTheDocument()
  })

  it('opens an editor that saves title, description and tags', async () => {
    extensionMocks.updateGenerated.mockResolvedValue(undefined)
    render(<ExtensionsPage />)
    fireEvent.click(screen.getByRole('button', { name: '编辑 暮色延伸作品' }))
    fireEvent.change(screen.getByRole('textbox', { name: '作品标题' }), { target: { value: '新的作品标题' } })
    fireEvent.change(screen.getByRole('textbox', { name: '作品描述' }), { target: { value: '新的作品描述' } })
    fireEvent.change(screen.getByRole('textbox', { name: '作品标签' }), { target: { value: '流行，夜晚, 温暖' } })
    fireEvent.click(screen.getByRole('button', { name: '保存修改' }))
    await waitFor(() => expect(extensionMocks.updateGenerated).toHaveBeenCalledWith(expect.objectContaining({
      id: generatedTrack.id,
      title: '新的作品标题',
      description: '新的作品描述',
      tags: ['流行', '夜晚', '温暖'],
    })))
  })

  it('deletes one generated item only after confirmation inside the editor', async () => {
    extensionMocks.deleteGenerated.mockResolvedValue(undefined)
    render(<ExtensionsPage />)
    fireEvent.click(screen.getByRole('button', { name: '编辑 暮色延伸作品' }))
    fireEvent.click(screen.getByRole('button', { name: '删除作品' }))
    expect(extensionMocks.deleteGenerated).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '删除' }))
    await waitFor(() => expect(extensionMocks.deleteGenerated).toHaveBeenCalledWith(generatedTrack))
    expect(extensionMocks.stopIfTrack).toHaveBeenCalledWith(generatedTrack.id)
    expect(screen.queryByRole('button', { name: '删除 雨夜片段 · 延伸作品' })).not.toBeInTheDocument()
  })
})
