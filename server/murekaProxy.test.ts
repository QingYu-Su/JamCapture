import { describe, expect, it } from 'vitest'
import { buildLyricsGenerationRequest, buildMurekaGenerationRequest, timestampedLyricsFromRecognition } from './murekaProxy'

describe('Mureka song generation request', () => {
  it('combines the fixed system prompt, modal prompt, fixed lyrics and uploaded song reference', () => {
    const request = buildMurekaGenerationRequest('reference-123', '加入温暖贝斯与克制鼓组')
    expect(request).toMatchObject({
      model: 'mureka-8',
      n: 1,
      reference_id: 'reference-123',
      lyrics: 'instrumental',
    })
    expect(request.prompt).toContain('你是专业编曲延展助手')
    expect(request.prompt).toContain('【用户自定义Prompt】\n加入温暖贝斯与克制鼓组')
  })

  it('uses the fixed fallback when the modal prompt is empty', () => {
    expect(buildMurekaGenerationRequest('reference-456', '  ').prompt).toContain('请在保真规则内自然延展为完整作品')
  })

  it('passes user lyrics for full song generation and falls back to instrumental when empty', () => {
    expect(buildMurekaGenerationRequest('reference-lyrics', '保持原始旋律', '[主歌]\n夜色缓缓落下').lyrics)
      .toBe('[主歌]\n夜色缓缓落下')
    expect(buildMurekaGenerationRequest('reference-instrumental', '保持原始旋律', '   ').lyrics)
      .toBe('instrumental')
  })
})

describe('Mureka lyrics generation request', () => {
  it('uses the entered lyrics as the expansion prompt', () => {
    expect(buildLyricsGenerationRequest('  一个人走在雨夜  ')).toEqual({ prompt: '一个人走在雨夜' })
  })

  it('rejects an empty lyrics prompt', () => {
    expect(() => buildLyricsGenerationRequest('   ')).toThrow('请先输入')
  })

  it('normalizes millisecond recognition segments into a sorted lyric timeline', () => {
    expect(timestampedLyricsFromRecognition({
      result: {
        segments: [
          { start_time: 6400, end_time: 9800, text: '第二句歌词' },
          { start_time: 1200, end_time: 6200, text: '第一句歌词' },
        ],
      },
    })).toEqual([
      { startTime: 1.2, endTime: 6.2, text: '第一句歌词' },
      { startTime: 6.4, endTime: 9.8, text: '第二句歌词' },
    ])
  })

  it('parses the documented Mureka lyrics_sections line timestamps', () => {
    expect(timestampedLyricsFromRecognition({
      lyrics_sections: [{
        section_type: 'verse',
        start: 1000,
        end: 12000,
        lines: [
          { start: 6400, end: 9800, text: '第二句歌词' },
          { start: 1200, end: 6200, text: '第一句歌词' },
        ],
      }],
    })).toEqual([
      { startTime: 1.2, endTime: 6.2, text: '第一句歌词' },
      { startTime: 6.4, endTime: 9.8, text: '第二句歌词' },
    ])
  })
})
