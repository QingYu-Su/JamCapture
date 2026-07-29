import { describe, expect, it } from 'vitest'
import { encodePcmToMp3, waveformFromChannelData } from './audio'

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

  it('encodes decoded PCM samples into an MP3 blob', async () => {
    const sampleRate = 44_100
    const samples = new Float32Array(Math.floor(sampleRate * 0.12))
    for (let index = 0; index < samples.length; index += 1) samples[index] = Math.sin((2 * Math.PI * 440 * index) / sampleRate) * 0.35
    const mp3 = await encodePcmToMp3([samples], sampleRate, 128)
    expect(mp3.type).toBe('audio/mp3')
    expect(mp3.size).toBeGreaterThan(100)
  })
})
