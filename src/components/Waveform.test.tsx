import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Waveform } from './Waveform'

describe('Waveform', () => {
  it('exposes accessible playback progress and keyboard seeking', () => {
    const onSeek = vi.fn()
    render(<Waveform data={[20, 40, 60]} progress={0.5} onSeek={onSeek} label="测试进度" />)
    const slider = screen.getByRole('slider', { name: '测试进度' })
    expect(slider).toHaveValue('500')
    fireEvent.keyDown(slider, { key: 'ArrowRight' })
    fireEvent.change(slider, { target: { value: '520' } })
    expect(onSeek).toHaveBeenCalledWith(0.52)
  })

  it('uses a native range value for reliable mouse and touch dragging', () => {
    const onSeek = vi.fn()
    render(<Waveform data={[20, 40, 60]} progress={0} onSeek={onSeek} label="拖动进度" />)
    const slider = screen.getByRole('slider', { name: '拖动进度' })
    fireEvent.change(slider, { target: { value: '750' } })
    expect(onSeek).toHaveBeenCalledWith(0.75)
  })
})
