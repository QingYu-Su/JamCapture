export const AUDIO_WAVEFORM_VERSION = 2

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

function floatSamplesToInt16(samples: Float32Array) {
  const pcm = new Int16Array(samples.length)
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index]))
    pcm[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff
  }
  return pcm
}

export async function encodePcmToMp3(channels: Float32Array[], sampleRate: number, kbps = 192) {
  const { Mp3Encoder } = await import('@breezystack/lamejs')
  const channelCount = Math.min(2, Math.max(1, channels.length))
  const left = floatSamplesToInt16(channels[0] ?? new Float32Array())
  const right = channelCount === 2 ? floatSamplesToInt16(channels[1]) : undefined
  const encoder = new Mp3Encoder(channelCount, sampleRate, kbps)
  const chunks: ArrayBuffer[] = []
  const blockSize = 1152

  for (let offset = 0, block = 0; offset < left.length; offset += blockSize, block += 1) {
    const encoded = encoder.encodeBuffer(left.subarray(offset, offset + blockSize), right?.subarray(offset, offset + blockSize))
    if (encoded.length) chunks.push(encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength) as ArrayBuffer)
    // Long takes remain responsive while the pure-JS encoder processes each PCM block.
    if (block > 0 && block % 32 === 0) await new Promise((resolve) => window.setTimeout(resolve, 0))
  }
  const flushed = encoder.flush()
  if (flushed.length) chunks.push(flushed.buffer.slice(flushed.byteOffset, flushed.byteOffset + flushed.byteLength) as ArrayBuffer)
  return new Blob(chunks, { type: 'audio/mp3' })
}

export async function convertAudioBlobToMp3(blob: Blob) {
  const context = new AudioContext()
  try {
    const buffer = await context.decodeAudioData(await blob.arrayBuffer())
    const channels = Array.from({ length: Math.min(2, buffer.numberOfChannels) }, (_, index) => buffer.getChannelData(index).slice())
    return encodePcmToMp3(channels, buffer.sampleRate)
  } finally {
    await context.close()
  }
}

export function repeatChannelsToMinimumDuration(
  channels: Float32Array[],
  sampleRate: number,
  minimumDurationSeconds = 30,
) {
  const sourceLength = channels[0]?.length ?? 0
  if (!sourceLength || sampleRate <= 0) throw new Error('参考音频没有可用的声音数据')
  const sourceDuration = sourceLength / sampleRate
  const repeatCount = sourceDuration < minimumDurationSeconds
    ? Math.ceil(minimumDurationSeconds / sourceDuration)
    : 1
  const targetLength = sourceLength * repeatCount
  const repeatedChannels = channels.map((source) => {
    const output = new Float32Array(targetLength)
    for (let offset = 0; offset < targetLength; offset += sourceLength) output.set(source, offset)
    return output
  })
  return {
    channels: repeatedChannels,
    originalDuration: sourceDuration,
    preparedDuration: targetLength / sampleRate,
    repeatCount,
  }
}

export async function prepareReferenceAudioBlob(blob: Blob, minimumDurationSeconds = 30) {
  const context = new AudioContext()
  try {
    const buffer = await context.decodeAudioData(await blob.arrayBuffer())
    const sourceChannels = Array.from(
      { length: Math.min(2, buffer.numberOfChannels) },
      (_, index) => buffer.getChannelData(index).slice(),
    )
    const prepared = repeatChannelsToMinimumDuration(sourceChannels, buffer.sampleRate, minimumDurationSeconds)
    // The source Blob remains untouched. Only this temporary MP3 upload is looped when shorter than 30 seconds.
    const audio = await encodePcmToMp3(prepared.channels, buffer.sampleRate)
    return {
      audio,
      originalDuration: prepared.originalDuration,
      preparedDuration: prepared.preparedDuration,
      repeatCount: prepared.repeatCount,
    }
  } finally {
    await context.close()
  }
}
