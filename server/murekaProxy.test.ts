import { describe, expect, it } from 'vitest'
import { buildLyricsGenerationRequest, buildMurekaGenerationRequest } from './murekaProxy'

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
})
