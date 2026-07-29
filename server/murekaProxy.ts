import { readFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import type { Plugin } from 'vite'

const MAX_REQUEST_BYTES = 15 * 1024 * 1024
const PROVIDER_TIMEOUT_MS = 120_000

interface MurekaDescription {
  instrument?: string[]
  genres?: string[]
  tags?: string[]
  description?: string
  [key: string]: unknown
}

interface DeepSeekSummary {
  title?: unknown
  instrument?: unknown
  tone_color?: unknown
  genres?: unknown
  key?: unknown
  emotion?: unknown
  bpm?: unknown
  description?: unknown
}

const SUMMARY_PROMPT = `梳理英文文本音乐信息，归类以下内容。只输出一个 JSON 对象，不要 Markdown、解释或额外文本。
除 key（调式）和 bpm 外，所有文本只输出中文。可直接使用的内容不要改写，只做归类；description 可为满足字数而优化。空值用空字符串或空数组。

JSON 字段与规则：
1. instrument：字符串，仅 1 个乐器。
2. tone_color：字符串数组，1-3 个音色质感词。
3. genres：字符串，仅 1 种曲风；无法判断时填“轻音乐”。
4. key：字符串，格式仅限 C、F#、Am 等，不要汉字；无法判断时填“无”。
5. emotion：字符串数组，2-4 个情绪词，不可混入音色。
6. bpm：字符串，只能是纯数字；无法判断时为空字符串。
7. description：15-40 个汉字，描述这段音频。
8. title：4-10 个汉字，纯中文，不得包含英文、数字、标点、括号或其他符号。

标题创作规则：
- 不罗列 BPM、调式或乐器名，不机械拼接标签。
- 依托情绪、音色和使用场景写有画面感、心境与氛围感的短句，弱化乐理词汇。
- 选词优先级：情绪 > 场景或整体描述 > 音色。调式和 BPM 仅辅助理解，标题中绝不能出现乐理或数字术语。
- 尽量避免“吉他、琴弦、弦、琴”等高频乐器字眼；不用“开心、悲伤”等直白表达，改用意象化表达。
- 避免同质化、口水化和网络用语，保持文艺、安静、适合音乐灵感。
- 整体描述为空时，仅依靠情绪与音色创作；调式为空时完全忽略。

严格输出示例：
{"title":"暮色缓缓沉落","instrument":"电吉他","tone_color":["温暖","朦胧"],"genres":"摇滚","key":"Am","emotion":["克制","忧郁"],"bpm":"78","description":"温暖朦胧的旋律在暮色中缓慢铺展开来"}`

function unquote(value: string) {
  return value.trim().replace(/^['"]|['"]$/g, '')
}

async function readApiKeys(root: string) {
  const yaml = await readFile(path.join(root, 'config.yaml'), 'utf8')
  const read = (name: string) => unquote(yaml.match(new RegExp(`^\\s*${name}\\s*:\\s*(.*?)\\s*$`, 'm'))?.[1] ?? '')
  return {
    mureka: read('mureka_api_key') || read('api_key'),
    deepseek: read('deepseek_api_key'),
  }
}

async function readRequestBody(request: IncomingMessage) {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > MAX_REQUEST_BYTES) throw new Error('请求音频超过允许大小')
    chunks.push(buffer)
  }
  return Buffer.concat(chunks).toString('utf8')
}

function sendJson(response: ServerResponse, status: number, payload: unknown) {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.end(JSON.stringify(payload))
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function stringList(value: unknown, limit: number) {
  const values = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[,，、]/) : []
  return values.map(stringValue).filter(Boolean).slice(0, limit)
}

function parseDeepSeekContent(content: string): DeepSeekSummary {
  const cleaned = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  return JSON.parse(cleaned) as DeepSeekSummary
}

function normalizeSummary(raw: DeepSeekSummary) {
  return {
    title: stringValue(raw.title),
    instrument: stringList(raw.instrument, 1),
    toneColor: stringList(raw.tone_color, 3),
    genres: stringList(raw.genres, 1).length ? stringList(raw.genres, 1) : ['轻音乐'],
    key: stringValue(raw.key) || '无',
    emotion: stringList(raw.emotion, 4),
    bpm: stringValue(raw.bpm),
    description: stringValue(raw.description),
  }
}

function isChineseText(value: string) {
  return /^[\u3400-\u9fff\s·]+$/.test(value)
}

function validateSummary(summary: ReturnType<typeof normalizeSummary>) {
  const titleLength = summary.title.length
  const descriptionLength = summary.description.trim().length
  const valid = titleLength >= 4 && titleLength <= 10
    && /^[\u3400-\u9fff]+$/.test(summary.title)
    && summary.instrument.length === 1 && isChineseText(summary.instrument[0])
    && summary.toneColor.length >= 1 && summary.toneColor.length <= 3 && summary.toneColor.every(isChineseText)
    && summary.genres.length === 1 && isChineseText(summary.genres[0])
    && /^(无|[A-G](?:#|b)?m?)$/.test(summary.key)
    && summary.emotion.length >= 2 && summary.emotion.length <= 4 && summary.emotion.every(isChineseText)
    && (!summary.bpm || /^\d+$/.test(summary.bpm))
    && descriptionLength >= 15 && descriptionLength <= 40
    && /^[\u3400-\u9fff\s，。！？、；：…—]+$/.test(summary.description)
  if (!valid) throw new Error('DeepSeek 返回内容不符合音乐标签格式')
  return summary
}

async function fetchWithTimeout(url: string, init: RequestInit) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

async function describeWithMureka(audioUrl: string, apiKey: string) {
  const upstream = await fetchWithTimeout('https://api.mureka.cn/v1/song/describe', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ url: audioUrl }),
  })
  const body = await upstream.text()
  if (!upstream.ok) throw new Error(`Mureka 请求失败（${upstream.status}）：${body.slice(0, 300)}`)
  const payload = JSON.parse(body) as MurekaDescription & { result?: MurekaDescription }
  return payload.result ?? payload
}

async function summarizeWithDeepSeek(mureka: MurekaDescription, apiKey: string) {
  const upstream = await fetchWithTimeout('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SUMMARY_PROMPT },
        { role: 'user', content: `请整理以下 Mureka 音乐识别结果：\n${JSON.stringify(mureka)}` },
      ],
    }),
  })
  const payload = await upstream.json().catch(() => ({})) as {
    error?: { message?: string }
    choices?: Array<{ message?: { content?: string } }>
  }
  if (!upstream.ok) throw new Error(payload.error?.message || `DeepSeek 请求失败（${upstream.status}）`)
  const content = payload.choices?.[0]?.message?.content
  if (!content) throw new Error('DeepSeek 未返回可用的整理结果')
  return validateSummary(normalizeSummary(parseDeepSeekContent(content)))
}

function createHandler(root: string) {
  return async (request: IncomingMessage, response: ServerResponse) => {
    if (request.method !== 'POST') {
      sendJson(response, 405, { error: 'Method not allowed' })
      return
    }

    try {
      const keys = await readApiKeys(root)
      if (!keys.mureka) {
        sendJson(response, 503, { error: '请先在 config.yaml 中配置 api_key' })
        return
      }
      if (!keys.deepseek) {
        sendJson(response, 503, { error: '请先在 config.yaml 中配置 deepseek_api_key' })
        return
      }

      const payload = JSON.parse(await readRequestBody(request)) as { url?: string }
      if (!payload.url?.startsWith('data:audio/')) {
        sendJson(response, 400, { error: '缺少有效的音频 Data URL' })
        return
      }

      const murekaResult = await describeWithMureka(payload.url, keys.mureka)
      const summary = await summarizeWithDeepSeek(murekaResult, keys.deepseek)
      sendJson(response, 200, { result: summary })
    } catch (error) {
      sendJson(response, 500, { error: error instanceof Error ? error.message : '音频分析请求失败' })
    }
  }
}

export function murekaProxy(): Plugin {
  let projectRoot = process.cwd()
  const registerMiddleware = (server: { middlewares: { use: (...args: unknown[]) => void } }) => {
    server.middlewares.use((request: IncomingMessage, response: ServerResponse, next: () => void) => {
      if (request.url?.split('?')[0] === '/config.yaml') {
        response.statusCode = 404
        response.end('Not found')
        return
      }
      next()
    })
    server.middlewares.use('/api/song/describe', createHandler(projectRoot))
  }
  return {
    name: 'jamcapture-mureka-deepseek-proxy',
    configResolved(config) {
      projectRoot = config.root
    },
    configureServer(server) {
      registerMiddleware(server)
    },
    configurePreviewServer(server) {
      registerMiddleware(server)
    },
  }
}
