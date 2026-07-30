import { describe, expect, it } from 'vitest'
import { buildDeepSeekSummaryRequest, buildLyricsPromptOptimizationRequest, buildMurekaGenerationRequest, HUMMING_SUMMARY_PROMPT } from './murekaProxy'

describe('DeepSeek audio summary request', () => {
  const murekaResult = { instrument: ['钢琴'], tags: ['relaxed'], description: 'a relaxed humming melody' }

  it('keeps the original JSON prompt for instrument recordings', () => {
    const request = buildDeepSeekSummaryRequest(murekaResult, 'instrument')
    expect(request).toHaveProperty('response_format', { type: 'json_object' })
    expect(request.messages[0].content).toContain('只输出一个 JSON 对象')
    expect(request.messages[0].content).not.toBe(HUMMING_SUMMARY_PROMPT)
  })

  it('uses the dedicated humming prompt and backend-computed title number', () => {
    const request = buildDeepSeekSummaryRequest(murekaResult, 'vocal', 5)
    expect(request).not.toHaveProperty('response_format')
    expect(request.messages[0].content).toBe(HUMMING_SUMMARY_PROMPT)
    expect(request.messages[1].content).toContain('素材属性：哼唱')
    expect(request.messages[1].content).toContain('当前用户已有哼唱存量总数：5')
    expect(request.messages[1].content).toContain('后端计算后的标题编号：6')
  })
})

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

describe('DeepSeek lyrics idea optimization request', () => {
  it('uses the entered idea without requesting complete lyrics', () => {
    const request = buildLyricsPromptOptimizationRequest('  一个人走在雨夜  ')
    expect(request.model).toBe('deepseek-chat')
    expect(request.messages[0].content).toContain('不写完整歌词')
    expect(request.messages[1].content).toBe('一个人走在雨夜')
  })

  it('rejects an empty lyrics idea', () => {
    expect(() => buildLyricsPromptOptimizationRequest('   ')).toThrow('请先输入')
  })

  it('rejects lyrics ideas longer than 180 characters', () => {
    expect(() => buildLyricsPromptOptimizationRequest('字'.repeat(181))).toThrow('180')
  })
})
