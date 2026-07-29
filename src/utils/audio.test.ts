import { describe, expect, it } from 'vitest'
import { waveformFromChannelData } from './audio'

describe('recording waveform analysis', () => {
  it('summarizes the whole recording and normalizes its loudest segment', () => {
    const channel = new Float32Array([
      0.05, -0.05, 0.05, -0.05,
      0.25, -0.25, 0.25, -0.25,
      0.9, -0.9, 0.9, -0.9,
      0.4, -0.4, 0.4, -0.4,
    ])
    const waveform = waveformFromChannelData([channel], 4)
    expect(waveform).toHaveLength(4)
    expect(waveform[2]).toBe(100)
    expect(waveform[0]).toBeLessThan(waveform[1])
    expect(waveform[3]).toBeLessThan(waveform[2])
  })

  it('produces different signatures for different audio sample data', () => {
    const rising = waveformFromChannelData([new Float32Array([.1, .1, .2, .2, .4, .4, .8, .8])], 4)
    const falling = waveformFromChannelData([new Float32Array([.8, .8, .4, .4, .2, .2, .1, .1])], 4)
    expect(rising).not.toEqual(falling)
    expect(rising[0]).toBeLessThan(rising[3])
    expect(falling[0]).toBeGreaterThan(falling[3])
  })
})
