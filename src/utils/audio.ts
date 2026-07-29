export async function resolveAudioUrl(source: { type: 'asset'; url: string } | { type: 'blob'; blobId: string }, getBlob: (id: string) => Promise<Blob | undefined>) {
  if (source.type === 'asset') return { url: source.url, revoke: false }
  const blob = await getBlob(source.blobId)
  if (!blob) throw new Error('录音文件不存在')
  return { url: URL.createObjectURL(blob), revoke: true }
}

export function waveformFromSamples(samples: Uint8Array, bars = 48) {
  const result: number[] = []
  const chunk = Math.max(1, Math.floor(samples.length / bars))
  for (let index = 0; index < bars; index += 1) {
    let sum = 0
    const start = index * chunk
    const end = Math.min(samples.length, start + chunk)
    for (let cursor = start; cursor < end; cursor += 1) sum += Math.abs(samples[cursor] - 128)
    result.push(Math.max(12, Math.min(100, Math.round((sum / Math.max(1, end - start)) * 2.2))))
  }
  return result
}

export async function analyzeAudioBlob(blob: Blob, bars = 64) {
  const context = new AudioContext()
  try {
    const buffer = await context.decodeAudioData(await blob.arrayBuffer())
    const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index))
    return { waveform: waveformFromChannelData(channels, bars), duration: buffer.duration }
  } finally {
    await context.close()
  }
}

export async function waveformFromAudioBlob(blob: Blob, bars = 64) {
  return (await analyzeAudioBlob(blob, bars)).waveform
}

export function waveformFromChannelData(channels: Float32Array[], bars = 48) {
  const sampleLength = channels[0]?.length ?? 0
  const samplesPerBar = Math.max(1, Math.floor(sampleLength / bars))
  const amplitudes = Array.from({ length: bars }, (_, barIndex) => {
      const start = barIndex * samplesPerBar
      const end = Math.min(sampleLength, start + samplesPerBar)
      let energy = 0
      let sampleCount = 0
      for (const channel of channels) {
        for (let index = start; index < end; index += 1) {
          energy += channel[index] ** 2
          sampleCount += 1
        }
      }
      return Math.sqrt(energy / Math.max(1, sampleCount))
  })
  const peak = Math.max(...amplitudes, 0.001)
  return amplitudes.map((amplitude) => Math.max(12, Math.round((amplitude / peak) * 100)))
}
