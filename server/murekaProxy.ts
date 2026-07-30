import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import type { Plugin } from 'vite'

const MAX_REQUEST_BYTES = 15 * 1024 * 1024
const MAX_SHARE_AUDIO_BYTES = 55 * 1024 * 1024
const MAX_GENERATED_AUDIO_BYTES = 30 * 1024 * 1024
const PROVIDER_TIMEOUT_MS = 120_000
const GENERATION_POLL_INTERVAL_MS = 5_000
const GENERATION_WAIT_TIMEOUT_MS = 15 * 60 * 1_000
const analysisCacheLoads = new Map<string, Promise<Record<string, CachedAnalysis>>>()
const analysisCacheWrites = new Map<string, Promise<void>>()
const analysisJobs = new Map<string, Promise<ReturnType<typeof normalizeSummary>>>()

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
  prompt_suggestions?: unknown
}

interface CachedAnalysis {
  result: ReturnType<typeof normalizeSummary>
  cachedAt: string
}

interface SharedTrackMetadata {
  kind: 'inspiration' | 'generated'
  title: string
  subtitle?: string
  duration: number
  waveform: number[]
  tags: string[]
  description?: string
  audioMimeType: string
  createdAt: string
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
9. prompt_suggestions：恰好 3 项的数组，每项包含 title 和 text。三条建议必须针对当前音频的情绪、音色、节奏与描述分别提出不同的完整作品延伸方向，不得使用通用套话。title 为 2-12 个中文字符，text 为 12-100 个中文字符，可直接作为音乐生成 Prompt。

标题创作规则：
- 不罗列 BPM、调式或乐器名，不机械拼接标签。
- 依托情绪、音色和使用场景写有画面感、心境与氛围感的短句，弱化乐理词汇。
- 选词优先级：情绪 > 场景或整体描述 > 音色。调式和 BPM 仅辅助理解，标题中绝不能出现乐理或数字术语。
- 尽量避免“吉他、琴弦、弦、琴”等高频乐器字眼；不用“开心、悲伤”等直白表达，改用意象化表达。
- 避免同质化、口水化和网络用语，保持文艺、安静、适合音乐灵感。
- 整体描述为空时，仅依靠情绪与音色创作；调式为空时完全忽略。

严格输出示例：
{"title":"暮色缓缓沉落","instrument":"电吉他","tone_color":["温暖","朦胧"],"genres":"摇滚","key":"Am","emotion":["克制","忧郁"],"bpm":"78","description":"温暖朦胧的旋律在暮色中缓慢铺展开来","prompt_suggestions":[{"title":"暮色渐进","text":"保留克制旋律与温暖音色，逐步加入鼓组和低频，发展为层次完整的暮色摇滚作品"},{"title":"朦胧回响","text":"围绕忧郁情绪扩展空间感和声，在中段形成动态高潮，最后回落至安静余韵"},{"title":"夜路律动","text":"延续原有节奏动机，加入稳定贝斯与细腻鼓点，构建适合夜间行驶的完整编曲"}]}`

export const HUMMING_SUMMARY_PROMPT = `任务：接收后端给到的原始文本信息，规整出固定三类内容：乐器标签、情绪标签、标准化标题，全程依托后端给出内容，禁止自行脑补音频信息、不准额外创造内容。
1.乐器标签规则
只要本条素材属性为哼唱，乐器统一固定为：人声哼唱。无视后端附带的其他乐器相关文字，不修改、不替换成吉他、钢琴、键盘等其他乐器名。若非哼唱素材则正常沿用后端乐器信息。
2.情绪标签规整规则
筛选后端所有文字里的情绪类词汇，最终保留2-4个有效情绪词，中文顿号分隔。剔除曲风、乐器、速度、乐理、场景类无关词语。
有效词不足2个，兜底固定为：松弛、随性；词汇多于4个，优先保留辨识度最高的核心情绪，删减次要词汇，严格控制数量区间。禁止出现专业音乐术语、风格词。
3.标题规整规则
标题格式强制为：哼唱灵感+阿拉伯数字编号。后端会同步传入当前用户已有哼唱存量总数，最终编号=存量数字+1，例：已有5条，则标题为哼唱灵感6。
AI不计算数字，仅拼接文字；后端未给到存量数字，只输出“哼唱灵感”，编号交由后端补全。严禁给标题添加情绪、风景、曲风、符号、英文等额外修饰。

输出必须严格按照分行格式，无多余注释、闲聊、拓展文字：
instrument：整理结果
emotion：筛选后的情绪词
title：最终标题

硬性禁止：私自新增情绪词、篡改哼唱乐器名称、标题加额外文字、情绪数量超出2-4区间、混入无关专业词汇。`

const GENERATION_SYSTEM_PROMPT = `你是专业编曲延展助手，基于用户提供的单乐器原始音频，生成2-3分钟的完整编曲作品。核心准则：原始灵感动机是作品的灵魂核心，所有编曲、配器、延展都服务于用户的创作内核，AI仅做补充与衬托，绝不颠覆、覆盖用户的原始创作。
规则执行优先级：原始素材保真规则 > 原始音频自带风格属性 > 用户自定义Prompt > 系统兜底机制，低层级规则不得突破高层级约束。
【保真规则·最高优先级】精准提取原始音频的核心旋律动机与标志性riff，全曲基于该动机通过重复、模进、倒影、节奏紧缩/扩展等专业作曲手法发展，全程可清晰识别原始灵感痕迹；严格沿用原调式调性，全程不转调、不更换调式，严格控制非功能性离调和弦；BPM与拍号完全恒定，重拍位置、切分律动与原片段保持同源；原始主乐器始终位于声场中心、响度突出，是绝对听觉核心，所有新增配器仅作为伴奏衬托；整体情绪基调与原片段高度统一，段落间可做情绪递进强化，不可出现风格与情绪的跳脱式反转。
【编曲规则】围绕主乐器搭配对应风格的低音声部、节奏织体、鼓组、色彩装饰声部，配器随段落分层递进，主歌精简配器突出原乐器，副歌加厚织体增强情绪张力，间奏做动机变奏实现情绪过渡，尾奏逐步收束回落；和声沿用原走向与色彩做同源功能组拓展，不颠覆原有的和声逻辑；风格优先匹配原乐器的天然属性，用户有明确要求可在保真框架内做精细化适配。
【时长结构】总时长严格控制在2-3分钟，默认标准时长2分30秒左右；采用二段式完整结构，包含前奏、主歌、副歌、间奏、副歌再现、尾奏；原始片段无缝接入作品开篇，衔接处零断层、无拼接痕迹，听感自然连贯。
【兜底机制】用户Prompt信息模糊、内容不足时，自动匹配适配曲风、3-4件核心基础配器、标准段落结构、原调终止式自然收束，保证作品的下限质量。
【混音要求与禁令】各声部频段分离清晰，无频段浑浊、声部打架问题，整体响度适配行业Demo标准，保留后续二次制作的空间；严禁篡改原始动机、转调变速、添加人声采样、配器喧宾夺主、时长超出范围、出现拼接断层与猎奇小众曲风。`

const GENERATION_LYRICS = 'instrumental'
const GENERATION_MODEL = 'mureka-8'
const LYRICS_IDEA_OPTIMIZATION_PROMPT = `你是专业歌词创作构思编辑。请把用户输入的简短歌词想法优化成一段清晰、具体、可直接用于后续歌曲生成的中文歌词构思提示。
要求：
1. 保留用户原本的主题、人物视角和核心情绪，不改变创作意图。
2. 可补充场景、叙事推进、意象方向、情绪转折、主歌与副歌的表达重点。
3. 只输出优化后的歌词构思提示，不写完整歌词，不创作可直接演唱的逐行歌词，不使用 Markdown、标题或解释。
4. 控制在 60-180 个汉字；语言自然，避免空泛套话和堆砌形容词。`

function unquote(value: string) {
  return value.trim().replace(/^['"]|['"]$/g, '')
}

async function readApiKeys(root: string) {
  const yaml = await readFile(path.join(root, 'config.yaml'), 'utf8')
  const read = (name: string) => unquote(yaml.match(new RegExp(`^\\s*${name}\\s*:\\s*(.*?)\\s*$`, 'm'))?.[1] ?? '')
  return {
    mureka: read('mureka_api_key') || read('api_key'),
    deepseek: read('deepseek_api_key'),
    generation: read('mureka_generation_api_key') || read('mureka_api_key') || read('api_key'),
    generationBaseUrl: (read('mureka_generation_base_url') || 'https://api.mureka.cn').replace(/\/$/, ''),
  }
}

async function readRequestBuffer(request: IncomingMessage, maximumBytes = MAX_REQUEST_BYTES) {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > maximumBytes) throw new Error('请求内容超过允许大小')
    chunks.push(buffer)
  }
  return Buffer.concat(chunks)
}

async function readRequestBody(request: IncomingMessage) {
  return (await readRequestBuffer(request)).toString('utf8')
}

function sendJson(response: ServerResponse, status: number, payload: unknown) {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.end(JSON.stringify(payload))
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function identifierValue(value: unknown) {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : ''
}

function stringList(value: unknown, limit: number) {
  const values = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[,，、]/) : []
  return values.map(stringValue).filter(Boolean).slice(0, limit)
}

function promptSuggestionList(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.slice(0, 3).map((item) => {
    const suggestion = item && typeof item === 'object' ? item as { title?: unknown; text?: unknown } : {}
    return { title: stringValue(suggestion.title), text: stringValue(suggestion.text) }
  }).filter((item) => item.title && item.text)
}

function parseDeepSeekContent(content: string): DeepSeekSummary {
  const cleaned = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  return JSON.parse(cleaned) as DeepSeekSummary
}

function parseHummingContent(content: string, existingHummingCount?: number) {
  const field = (name: string) => content.match(new RegExp(`^${name}[：:]\\s*(.+)$`, 'mi'))?.[1]?.trim() ?? ''
  let emotion = field('emotion')
    .split(/[,，、/|;；\n]+/)
    .map((value) => value.trim().replace(/^[\s"'“”‘’()[\]（）【】*-]+|[\s"'“”‘’()[\]（）【】*-]+$/g, ''))
    .filter((value, index, values) => isChineseText(value) && values.indexOf(value) === index)
    .slice(0, 4)
  if (emotion.length < 2) emotion = ['松弛', '随性']
  return {
    title: Number.isInteger(existingHummingCount) && existingHummingCount! >= 0 ? `哼唱灵感${existingHummingCount! + 1}` : '哼唱灵感',
    instrument: ['人声哼唱'],
    toneColor: [],
    genres: [],
    key: '',
    emotion,
    bpm: '',
    description: '',
    promptSuggestions: [],
  }
}

function validateHummingSummary(summary: ReturnType<typeof parseHummingContent>) {
  const valid = /^哼唱灵感\d*$/.test(summary.title)
    && summary.instrument.length === 1 && summary.instrument[0] === '人声哼唱'
    && summary.emotion.length >= 2 && summary.emotion.length <= 4 && summary.emotion.every(isChineseText)
  if (!valid) throw new Error('DeepSeek 返回内容不符合哼唱标签格式')
  return summary
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
    promptSuggestions: promptSuggestionList(raw.prompt_suggestions),
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
    && summary.promptSuggestions.length === 3
    && summary.promptSuggestions.every((suggestion) => suggestion.title.length >= 2
      && suggestion.title.length <= 12
      && /^[\u3400-\u9fff]+$/.test(suggestion.title)
      && suggestion.text.length >= 12
      && suggestion.text.length <= 100
      && /^[\u3400-\u9fff\s，。！？、；：…—]+$/.test(suggestion.text))
  if (!valid) throw new Error('DeepSeek 返回内容不符合音乐标签格式')
  return summary
}

function cacheFilePath(root: string) {
  return path.join(root, '.cache', 'audio-analysis.json')
}

function audioCacheKey(audioUrl: string) {
  return createHash('sha256').update(audioUrl).digest('hex')
}

function loadAnalysisCache(root: string) {
  let load = analysisCacheLoads.get(root)
  if (!load) {
    load = readFile(cacheFilePath(root), 'utf8')
      .then((content) => JSON.parse(content) as Record<string, CachedAnalysis>)
      .catch(() => ({}))
    analysisCacheLoads.set(root, load)
  }
  return load
}

async function cacheAnalysis(root: string, key: string, result: ReturnType<typeof normalizeSummary>) {
  const previousWrite = analysisCacheWrites.get(root) ?? Promise.resolve()
  const nextWrite = previousWrite.then(async () => {
    const cache = await loadAnalysisCache(root)
    cache[key] = { result, cachedAt: new Date().toISOString() }
    const file = cacheFilePath(root)
    const temporaryFile = `${file}.tmp`
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(temporaryFile, `${JSON.stringify(cache, null, 2)}\n`, 'utf8')
    await rename(temporaryFile, file)
  })
  analysisCacheWrites.set(root, nextWrite)
  try {
    await nextWrite
  } finally {
    if (analysisCacheWrites.get(root) === nextWrite) analysisCacheWrites.delete(root)
  }
}

async function invalidateCachedAnalysis(root: string, key: string) {
  const previousWrite = analysisCacheWrites.get(root) ?? Promise.resolve()
  const nextWrite = previousWrite.then(async () => {
    const cache = await loadAnalysisCache(root)
    if (!(key in cache)) return
    delete cache[key]
    const file = cacheFilePath(root)
    const temporaryFile = `${file}.tmp`
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(temporaryFile, `${JSON.stringify(cache, null, 2)}\n`, 'utf8')
    await rename(temporaryFile, file)
  })
  analysisCacheWrites.set(root, nextWrite)
  try {
    await nextWrite
  } finally {
    if (analysisCacheWrites.get(root) === nextWrite) analysisCacheWrites.delete(root)
  }
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

export function buildDeepSeekSummaryRequest(mureka: MurekaDescription, recordingType?: 'instrument' | 'vocal', existingHummingCount?: number) {
  const isHumming = recordingType === 'vocal'
  const nextTitleNumber = Number.isInteger(existingHummingCount) && existingHummingCount! >= 0 ? existingHummingCount! + 1 : undefined
  return {
    model: 'deepseek-chat',
    temperature: 0.2,
    ...(isHumming ? {} : { response_format: { type: 'json_object' } }),
    messages: isHumming ? [
      { role: 'system', content: HUMMING_SUMMARY_PROMPT },
      { role: 'user', content: `素材属性：哼唱\n当前用户已有哼唱存量总数：${existingHummingCount ?? '未提供'}\n后端计算后的标题编号：${nextTitleNumber ?? '未提供'}\n原始文本信息：\n${JSON.stringify(mureka)}` },
    ] : [
      { role: 'system', content: SUMMARY_PROMPT },
      { role: 'user', content: `请整理以下 Mureka 音乐识别结果：\n${JSON.stringify(mureka)}` },
    ],
  }
}

async function summarizeWithDeepSeek(mureka: MurekaDescription, apiKey: string, recordingType?: 'instrument' | 'vocal', existingHummingCount?: number) {
  const upstream = await fetchWithTimeout('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(buildDeepSeekSummaryRequest(mureka, recordingType, existingHummingCount)),
  })
  const payload = await upstream.json().catch(() => ({})) as {
    error?: { message?: string }
    choices?: Array<{ message?: { content?: string } }>
  }
  if (!upstream.ok) throw new Error(payload.error?.message || `DeepSeek 请求失败（${upstream.status}）`)
  const content = payload.choices?.[0]?.message?.content
  if (!content) throw new Error('DeepSeek 未返回可用的整理结果')
  return recordingType === 'vocal'
    ? validateHummingSummary(parseHummingContent(content, existingHummingCount))
    : validateSummary(normalizeSummary(parseDeepSeekContent(content)))
}

function createHandler(root: string) {
  return async (request: IncomingMessage, response: ServerResponse) => {
    if (request.method !== 'POST') {
      sendJson(response, 405, { error: 'Method not allowed' })
      return
    }

    try {
      const payload = JSON.parse(await readRequestBody(request)) as { url?: string; forceRefresh?: boolean; recordingType?: 'instrument' | 'vocal'; existingHummingCount?: number }
      if (!payload.url?.startsWith('data:audio/')) {
        sendJson(response, 400, { error: '缺少有效的音频 Data URL' })
        return
      }

      const hummingCount = payload.recordingType === 'vocal' && Number.isInteger(payload.existingHummingCount) && payload.existingHummingCount! >= 0
        ? payload.existingHummingCount
        : undefined
      const cacheKey = audioCacheKey(`${payload.recordingType ?? 'instrument'}:${hummingCount ?? ''}:${payload.url}`)
      if (payload.forceRefresh) await invalidateCachedAnalysis(root, cacheKey)
      const cached = (await loadAnalysisCache(root))[cacheKey]
      if (cached && (payload.recordingType === 'vocal' || cached.result.promptSuggestions?.length === 3)) {
        sendJson(response, 200, { result: cached.result, cached: true })
        return
      }

      const jobKey = `${root}:${cacheKey}`
      let job = analysisJobs.get(jobKey)
      if (!job) {
        job = (async () => {
          const keys = await readApiKeys(root)
          if (!keys.mureka) throw new Error('请先在 config.yaml 中配置 api_key')
          if (!keys.deepseek) throw new Error('请先在 config.yaml 中配置 deepseek_api_key')
          const murekaResult = await describeWithMureka(payload.url!, keys.mureka)
          const summary = await summarizeWithDeepSeek(murekaResult, keys.deepseek, payload.recordingType, hummingCount)
          // Only validated results enter the shared local cache, so malformed provider responses are never replayed.
          await cacheAnalysis(root, cacheKey, summary)
          return summary
        })().finally(() => analysisJobs.delete(jobKey))
        analysisJobs.set(jobKey, job)
      }
      const summary = await job
      sendJson(response, 200, { result: summary, cached: false })
    } catch (error) {
      sendJson(response, 500, { error: error instanceof Error ? error.message : '音频分析请求失败' })
    }
  }
}

async function providerJson(response: Response, label: string) {
  const text = await response.text()
  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(text) as Record<string, unknown>
  } catch {
    throw new Error(`${label} 返回了非 JSON 数据（HTTP ${response.status}）`)
  }
  if (!response.ok) {
    const detail = payload.error ?? payload.message ?? text.slice(0, 300)
    throw new Error(`${label} 请求失败（${response.status}）：${typeof detail === 'string' ? detail : JSON.stringify(detail)}`)
  }
  return payload
}

export function buildLyricsPromptOptimizationRequest(lyricsPrompt: string) {
  const prompt = lyricsPrompt.trim()
  if (!prompt) throw new Error('请先输入歌词内容构思')
  if (Array.from(prompt).length > 180) throw new Error('歌词内容构思不能超过 180 个字')
  return {
    model: 'deepseek-chat',
    temperature: 0.4,
    messages: [
      { role: 'system', content: LYRICS_IDEA_OPTIMIZATION_PROMPT },
      { role: 'user', content: prompt },
    ],
  }
}

function createLyricsPromptOptimizationHandler(root: string) {
  return async (request: IncomingMessage, response: ServerResponse) => {
    if (request.method !== 'POST') return sendJson(response, 405, { error: 'Method not allowed' })
    try {
      const payload = JSON.parse(await readRequestBody(request)) as { prompt?: unknown }
      const requestBody = buildLyricsPromptOptimizationRequest(stringValue(payload.prompt))
      const keys = await readApiKeys(root)
      if (!keys.deepseek) throw new Error('请先在 config.yaml 中配置 deepseek_api_key')
      const upstream = await fetchWithTimeout('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${keys.deepseek}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(requestBody),
      })
      const generated = await providerJson(upstream, 'DeepSeek 歌词构思优化')
      const choices = Array.isArray(generated.choices) ? generated.choices : []
      const choice = choices[0] && typeof choices[0] === 'object' ? choices[0] as Record<string, unknown> : {}
      const message = choice.message && typeof choice.message === 'object' ? choice.message as Record<string, unknown> : {}
      const optimizedPrompt = Array.from(stringValue(message.content)
        .replace(/^```(?:text)?\s*/i, '')
        .replace(/\s*```$/, '')
        .trim()).slice(0, 180).join('')
      if (!optimizedPrompt) throw new Error('DeepSeek 没有返回可用的歌词构思')
      return sendJson(response, 200, { optimizedPrompt })
    } catch (error) {
      return sendJson(response, 500, { error: error instanceof Error ? error.message : '歌词构思优化失败' })
    }
  }
}

async function generationForm(request: IncomingMessage) {
  const contentType = String(request.headers['content-type'] || '')
  if (!contentType.startsWith('multipart/form-data;')) throw new Error('歌曲生成请求必须使用 multipart/form-data')
  const body = await readRequestBuffer(request, MAX_REQUEST_BYTES)
  const form = await new Response(new Uint8Array(body), { headers: { 'Content-Type': contentType } }).formData()
  const referenceAudio = form.get('referenceAudio')
  const rawMetadata = form.get('metadata')
  if (!(referenceAudio instanceof Blob) || typeof rawMetadata !== 'string') throw new Error('缺少参考歌曲或生成参数')
  const parsed = JSON.parse(rawMetadata) as Record<string, unknown>
  const userPrompt = stringValue(parsed.userPrompt)
  if (Array.from(userPrompt).length > 180) throw new Error('创作风格与演绎要求不能超过 180 个字')
  const lyrics = stringValue(parsed.lyrics) || GENERATION_LYRICS
  if (Array.from(lyrics).length > 180) throw new Error('歌词内容构思不能超过 180 个字')
  return {
    referenceAudio: Buffer.from(await referenceAudio.arrayBuffer()),
    referenceMimeType: referenceAudio.type || 'audio/mpeg',
    metadata: {
      userPrompt,
      lyrics,
      generationKind: parsed.generationKind === 'full-song' ? 'full-song' as const : 'instrumental' as const,
      sourceTitle: stringValue(parsed.sourceTitle).slice(0, 120),
      originalDuration: Number(parsed.originalDuration) || 0,
      preparedDuration: Number(parsed.preparedDuration) || 0,
      repeatCount: Math.max(1, Number(parsed.repeatCount) || 1),
    },
  }
}

function generationResultAudio(result: Record<string, unknown>) {
  const choices = Array.isArray(result.choices) ? result.choices : []
  const choice = choices[0] && typeof choices[0] === 'object' ? choices[0] as Record<string, unknown> : {}
  const audio = choice.audio && typeof choice.audio === 'object' ? choice.audio as Record<string, unknown> : {}
  const url = [choice.url, choice.audio_url, audio.url, result.url, result.audio_url]
    .find((value) => typeof value === 'string' && value)
  const title = [choice.title, result.title].find((value) => typeof value === 'string' && value)
  const durationValue = [choice.duration, audio.duration, result.duration]
    .find((value) => typeof value === 'number' || typeof value === 'string')
  return {
    url: typeof url === 'string' ? url : '',
    title: typeof title === 'string' ? title : '',
    duration: durationValue === undefined ? undefined : Number(durationValue),
  }
}

function clockTimeSeconds(value: string) {
  const match = value.trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2}(?:\.\d+)?)$/)
    ?? value.trim().match(/^(\d{1,2}):(\d{1,2}(?:\.\d+)?)$/)
  if (!match) return undefined
  if (match.length === 4) return Number(match[1] || 0) * 3600 + Number(match[2]) * 60 + Number(match[3])
  return Number(match[1]) * 60 + Number(match[2])
}

export function timestampedLyricsFromRecognition(payload: Record<string, unknown>) {
  const roots = [payload, payload.result, payload.data]
    .filter((value): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value)))
  const arrayKeys = ['segments', 'lines', 'lyrics', 'sentences', 'utterances']
  const stringKeys = ['lyrics', 'text', 'lrc']

  for (const root of roots) {
    // Mureka /v1/song/recognize returns millisecond timestamps under
    // lyrics_sections[].lines[]. Handle that documented shape explicitly
    // before falling back to the looser provider-compatible parsers below.
    const sections = root.lyrics_sections
    if (Array.isArray(sections)) {
      const sectionLines = sections.flatMap((section) => {
        if (!section || typeof section !== 'object' || Array.isArray(section)) return []
        const lines = (section as Record<string, unknown>).lines
        if (!Array.isArray(lines)) return []
        return lines.flatMap((value) => {
          if (!value || typeof value !== 'object' || Array.isArray(value)) return []
          const line = value as Record<string, unknown>
          const text = stringValue(line.text).trim()
          const start = Number(line.start)
          const end = Number(line.end)
          if (!text || !Number.isFinite(start) || start < 0) return []
          return [{
            text,
            startTime: start / 1000,
            endTime: Number.isFinite(end) && end >= start ? end / 1000 : undefined,
          }]
        })
      }).sort((a, b) => a.startTime - b.startTime)
      if (sectionLines.length) {
        return sectionLines.map((line, index) => ({
          ...line,
          endTime: line.endTime ?? sectionLines[index + 1]?.startTime,
        }))
      }
    }

    for (const key of stringKeys) {
      const raw = root[key]
      if (typeof raw !== 'string' || !raw.includes('[')) continue
      const lines = raw.split(/\r?\n/).flatMap((line) => {
        const match = line.match(/^\[(\d{1,2}):(\d{1,2}(?:\.\d+)?)\]\s*(.+)$/)
        if (!match) return []
        return [{ startTime: Number(match[1]) * 60 + Number(match[2]), text: match[3].trim() }]
      }).filter((line) => line.text)
      if (lines.length) return lines.map((line, index) => ({ ...line, endTime: lines[index + 1]?.startTime }))
    }

    for (const key of arrayKeys) {
      const values = root[key]
      if (!Array.isArray(values)) continue
      const parsed = values.flatMap((value) => {
        if (!value || typeof value !== 'object') return []
        const line = value as Record<string, unknown>
        const text = ['text', 'lyrics', 'line', 'content', 'word'].map((name) => stringValue(line[name])).find(Boolean)
        if (!text) return []
        const startEntry = ['start_ms', 'start_time_ms', 'start', 'start_time', 'begin', 'offset']
          .map((name) => ({ name, value: line[name] })).find((entry) => typeof entry.value === 'number' || typeof entry.value === 'string')
        const endEntry = ['end_ms', 'end_time_ms', 'end', 'end_time', 'finish']
          .map((name) => ({ name, value: line[name] })).find((entry) => typeof entry.value === 'number' || typeof entry.value === 'string')
        if (!startEntry) return []
        const startClock = typeof startEntry.value === 'string' ? clockTimeSeconds(startEntry.value) : undefined
        const endClock = typeof endEntry?.value === 'string' ? clockTimeSeconds(endEntry.value) : undefined
        const start = startClock ?? Number(startEntry.value)
        const end = endClock ?? (endEntry ? Number(endEntry.value) : undefined)
        if (!Number.isFinite(start)) return []
        return [{
          text,
          start,
          end: Number.isFinite(end) ? end : undefined,
          startMilliseconds: startClock === undefined && /ms|offset/.test(startEntry.name),
          endMilliseconds: endClock === undefined && Boolean(endEntry && /ms|offset/.test(endEntry.name)),
          startWasClock: startClock !== undefined,
          endWasClock: endClock !== undefined,
        }]
      })
      if (!parsed.length) continue
      const genericMaximum = Math.max(...parsed.filter((line) => !line.startMilliseconds && !line.startWasClock).map((line) => line.start), 0)
      const genericValuesAreMilliseconds = genericMaximum > 600
      const normalized = parsed.map((line) => ({
        text: line.text,
        startTime: line.start / (line.startMilliseconds || (!line.startWasClock && genericValuesAreMilliseconds) ? 1000 : 1),
        endTime: line.end === undefined ? undefined : line.end / (line.endMilliseconds || (!line.endWasClock && genericValuesAreMilliseconds) ? 1000 : 1),
      })).filter((line) => line.startTime >= 0).sort((a, b) => a.startTime - b.startTime)
      return normalized.map((line, index) => ({
        ...line,
        endTime: line.endTime ?? normalized[index + 1]?.startTime,
      }))
    }
  }
  return []
}

async function recognizeGeneratedLyrics(
  generatedAudioUrl: string,
  generationBaseUrl: string,
  authorization: Record<string, string>,
) {
  const recognitionUploadForm = new FormData()
  recognitionUploadForm.append('purpose', 'audio')
  recognitionUploadForm.append('url', generatedAudioUrl)
  const uploadResponse = await fetchWithTimeout(`${generationBaseUrl}/v1/files/upload`, {
    method: 'POST',
    headers: authorization,
    body: recognitionUploadForm,
  })
  const upload = await providerJson(uploadResponse, 'Mureka 生成歌曲识别上传')
  const uploadAudioId = identifierValue(upload.id)
  if (!uploadAudioId) throw new Error('生成歌曲重新上传成功，但没有返回 audio ID')
  const recognitionResponse = await fetchWithTimeout(`${generationBaseUrl}/v1/song/recognize`, {
    method: 'POST',
    headers: { ...authorization, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ upload_audio_id: uploadAudioId }),
  })
  const recognition = await providerJson(recognitionResponse, 'Mureka 时间戳歌词识别')
  return timestampedLyricsFromRecognition(recognition)
}

function createLyricsRecognitionHandler(root: string) {
  return async (request: IncomingMessage, response: ServerResponse) => {
    if (request.method !== 'POST') return sendJson(response, 405, { error: 'Method not allowed' })
    try {
      const audio = await readRequestBuffer(request, MAX_GENERATED_AUDIO_BYTES)
      if (!audio.length) return sendJson(response, 400, { error: '缺少需要识别的歌曲音频' })
      const keys = await readApiKeys(root)
      if (!keys.generation) throw new Error('请先在 config.yaml 中配置 mureka_generation_api_key')
      const authorization = { Authorization: 'Bearer ' + keys.generation }
      const uploadForm = new FormData()
      uploadForm.append('purpose', 'audio')
      uploadForm.append(
        'file',
        new Blob([new Uint8Array(audio)], { type: String(request.headers['content-type'] || 'audio/mpeg').split(';')[0] }),
        'jamcapture-generated-audio.mp3',
      )
      const uploadResponse = await fetchWithTimeout(keys.generationBaseUrl + '/v1/files/upload', {
        method: 'POST',
        headers: authorization,
        body: uploadForm,
      })
      const upload = await providerJson(uploadResponse, 'Mureka 本地歌曲识别上传')
      const uploadAudioId = identifierValue(upload.id)
      if (!uploadAudioId) throw new Error('歌曲上传成功，但没有返回 audio ID')
      const recognitionResponse = await fetchWithTimeout(keys.generationBaseUrl + '/v1/song/recognize', {
        method: 'POST',
        headers: { ...authorization, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ upload_audio_id: uploadAudioId }),
      })
      const recognition = await providerJson(recognitionResponse, 'Mureka 时间戳歌词识别')
      const timedLyrics = timestampedLyricsFromRecognition(recognition)
      return sendJson(response, 200, {
        timedLyrics,
        lyrics: timedLyrics.map((line) => line.text).join('\n'),
      })
    } catch (error) {
      return sendJson(response, 500, { error: error instanceof Error ? error.message : '歌词识别失败' })
    }
  }
}

export function buildMurekaGenerationRequest(referenceId: string, userPrompt: string, lyrics = GENERATION_LYRICS) {
  const fallbackUserPrompt = '请在保真规则内自然延展为完整作品。'
  if (Array.from(userPrompt.trim()).length > 180) throw new Error('创作风格与演绎要求不能超过 180 个字')
  const combinedPrompt = `${GENERATION_SYSTEM_PROMPT}\n\n【用户自定义Prompt】\n${userPrompt.trim() || fallbackUserPrompt}`
  if (combinedPrompt.length > 2000) throw new Error('系统 Prompt 与用户 Prompt 拼接后超过 2000 字符限制')
  const normalizedLyrics = lyrics.trim() || GENERATION_LYRICS
  if (Array.from(normalizedLyrics).length > 180) throw new Error('歌词内容构思不能超过 180 个字')
  return {
    model: GENERATION_MODEL,
    n: 1,
    reference_id: referenceId,
    prompt: combinedPrompt,
    lyrics: normalizedLyrics,
  }
}

async function downloadGeneratedAudio(url: string, authorization: Record<string, string>) {
  let response = await fetchWithTimeout(url, {})
  if (!response.ok && (response.status === 401 || response.status === 403)) {
    response = await fetchWithTimeout(url, { headers: authorization })
  }
  if (!response.ok) throw new Error(`生成音频下载失败（${response.status}）`)
  const declaredSize = Number(response.headers.get('content-length') || 0)
  if (declaredSize > MAX_GENERATED_AUDIO_BYTES) throw new Error('生成音频超过本地保存大小限制')
  const buffer = Buffer.from(await response.arrayBuffer())
  if (buffer.length > MAX_GENERATED_AUDIO_BYTES) throw new Error('生成音频超过本地保存大小限制')
  return {
    audioBase64: buffer.toString('base64'),
    audioMimeType: response.headers.get('content-type')?.split(';')[0] || 'audio/mpeg',
    audioFingerprint: createHash('sha256').update(buffer).digest('hex'),
    audioByteLength: buffer.length,
  }
}

function createGenerationHandler(root: string) {
  return async (request: IncomingMessage, response: ServerResponse) => {
    if (request.method !== 'POST') return sendJson(response, 405, { error: 'Method not allowed' })
    try {
      const generation = await generationForm(request)
      const { metadata, referenceAudio } = generation
      if (!referenceAudio.length) return sendJson(response, 400, { error: '缺少参考音频' })
      if (metadata.preparedDuration < 30) return sendJson(response, 400, { error: '上传给 Mureka 的临时参考音频必须不少于 30 秒' })

      const keys = await readApiKeys(root)
      if (!keys.generation) throw new Error('请先在 config.yaml 中配置 mureka_generation_api_key')
      const authorization = { Authorization: `Bearer ${keys.generation}` }

      const uploadForm = new FormData()
      uploadForm.append('purpose', 'reference')
      uploadForm.append('file', new Blob([new Uint8Array(referenceAudio)], { type: generation.referenceMimeType }), 'jamcapture-reference.mp3')
      const uploadResponse = await fetchWithTimeout(`${keys.generationBaseUrl}/v1/files/upload`, {
        method: 'POST',
        headers: authorization,
        body: uploadForm,
      })
      const upload = await providerJson(uploadResponse, 'Mureka 参考音频上传')
      const referenceId = identifierValue(upload.id)
      if (!referenceId) throw new Error('参考音频上传成功，但没有返回 reference ID')

      const generationRequest = buildMurekaGenerationRequest(referenceId, metadata.userPrompt, metadata.lyrics)
      const generationEndpoint = `${keys.generationBaseUrl}/v1/song/easy-generate`
      console.info('[JamCapture] Mureka generation request prepared', {
        endpoint: generationEndpoint,
        sourceTitle: metadata.sourceTitle,
        referencePreparation: {
          originalDuration: metadata.originalDuration,
          preparedDuration: metadata.preparedDuration,
          repeatCount: metadata.repeatCount,
        },
        request: generationRequest,
      })
      // Attach a debugger to the Vite Node process to pause immediately before the billable AI request.
      // eslint-disable-next-line no-debugger
      debugger
      const createResponse = await fetchWithTimeout(generationEndpoint, {
        method: 'POST',
        headers: { ...authorization, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(generationRequest),
      })
      const createdTask = await providerJson(createResponse, 'Mureka 歌曲生成')
      const taskId = identifierValue(createdTask.id)
      if (!taskId) throw new Error('歌曲生成请求成功，但没有返回 task ID')

      const deadline = Date.now() + GENERATION_WAIT_TIMEOUT_MS
      const terminalStatuses = new Set(['succeeded', 'failed', 'timeouted', 'cancelled'])
      let result = createdTask
      while (Date.now() < deadline) {
        const status = stringValue(result.status).toLowerCase()
        if (terminalStatuses.has(status)) break
        await new Promise((resolve) => setTimeout(resolve, GENERATION_POLL_INTERVAL_MS))
        const queryResponse = await fetchWithTimeout(`${keys.generationBaseUrl}/v1/song/query/${encodeURIComponent(taskId)}`, {
          headers: { ...authorization, Accept: 'application/json' },
        })
        result = await providerJson(queryResponse, 'Mureka 任务查询')
      }

      const status = stringValue(result.status).toLowerCase()
      if (status !== 'succeeded') {
        if (!terminalStatuses.has(status)) throw new Error('歌曲生成任务等待超时，请稍后重试')
        const detail = result.error ?? result.message ?? status
        throw new Error(`歌曲生成未成功：${typeof detail === 'string' ? detail : JSON.stringify(detail)}`)
      }

      const generated = generationResultAudio(result)
      if (!generated.url) throw new Error('歌曲生成成功，但响应中没有音频 URL')
      let timedLyrics: ReturnType<typeof timestampedLyricsFromRecognition> = []
      if (metadata.generationKind === 'full-song' || metadata.lyrics.toLowerCase() !== GENERATION_LYRICS) {
        try {
          timedLyrics = await recognizeGeneratedLyrics(generated.url, keys.generationBaseUrl, authorization)
        } catch (recognitionError) {
          // The generated song remains valid even when the optional lyric alignment service fails.
          console.warn('[JamCapture] Timestamped lyrics recognition failed', recognitionError)
        }
      }
      const audio = await downloadGeneratedAudio(generated.url, authorization)
      console.info('[JamCapture] Mureka generation audio resolved', {
        taskId,
        audioFingerprint: audio.audioFingerprint,
        audioByteLength: audio.audioByteLength,
        duration: generated.duration,
      })
      return sendJson(response, 200, {
        taskId,
        title: generated.title || `${metadata.sourceTitle || '灵感'} · 延伸作品`,
        duration: Number.isFinite(generated.duration) ? generated.duration : undefined,
        audioBase64: audio.audioBase64,
        audioMimeType: audio.audioMimeType,
        audioFingerprint: audio.audioFingerprint,
        timedLyrics,
        lyrics: metadata.lyrics.toLowerCase() !== GENERATION_LYRICS
          ? metadata.lyrics
          : timedLyrics.map((line) => line.text).join('\n') || undefined,
      })
    } catch (error) {
      return sendJson(response, 500, { error: error instanceof Error ? error.message : '歌曲生成请求失败' })
    }
  }
}

function shareDirectory(root: string) {
  return path.join(root, '.cache', 'shares')
}

function shareToken(request: IncomingMessage) {
  const parts = (request.url ?? '').split('?')[0].split('/').filter(Boolean)
  const token = parts[0] ?? ''
  if (!/^[a-f0-9]{32}$/.test(token)) throw new Error('分享链接无效')
  return { token, audio: parts[1] === 'audio' }
}

function createShareHandler(root: string) {
  return async (request: IncomingMessage, response: ServerResponse) => {
    try {
      if (request.method === 'POST') {
        const encodedMetadata = request.headers['x-jamcapture-metadata']
        if (typeof encodedMetadata !== 'string') return sendJson(response, 400, { error: '缺少分享元数据' })
        const raw = JSON.parse(Buffer.from(encodedMetadata, 'base64url').toString('utf8')) as Omit<SharedTrackMetadata, 'audioMimeType' | 'createdAt'>
        if (!raw.title?.trim() || !Number.isFinite(raw.duration) || !Array.isArray(raw.waveform)) {
          return sendJson(response, 400, { error: '分享元数据格式无效' })
        }
        const audio = await readRequestBuffer(request, MAX_SHARE_AUDIO_BYTES)
        if (!audio.length) return sendJson(response, 400, { error: '缺少分享音频' })
        const token = randomUUID().replace(/-/g, '')
        const directory = shareDirectory(root)
        const metadata: SharedTrackMetadata = {
          ...raw,
          kind: raw.kind === 'generated' ? 'generated' : 'inspiration',
          title: raw.title.trim().slice(0, 120),
          tags: Array.isArray(raw.tags) ? raw.tags.filter((tag) => typeof tag === 'string' && tag.trim()).slice(0, 8) : [],
          audioMimeType: String(request.headers['content-type'] || 'audio/mpeg').split(';')[0],
          createdAt: new Date().toISOString(),
        }
        await mkdir(directory, { recursive: true })
        await Promise.all([
          writeFile(path.join(directory, `${token}.audio`), audio),
          writeFile(path.join(directory, `${token}.json`), JSON.stringify(metadata), 'utf8'),
        ])
        return sendJson(response, 201, { token, path: `/share/${token}` })
      }

      if (request.method !== 'GET' && request.method !== 'HEAD') return sendJson(response, 405, { error: 'Method not allowed' })
      const target = shareToken(request)
      const directory = shareDirectory(root)
      const metadata = JSON.parse(await readFile(path.join(directory, `${target.token}.json`), 'utf8')) as SharedTrackMetadata
      if (!target.audio) return sendJson(response, 200, { ...metadata, audioUrl: `/api/shares/${target.token}/audio` })

      const audio = await readFile(path.join(directory, `${target.token}.audio`))
      const range = request.headers.range?.match(/^bytes=(\d*)-(\d*)$/)
      const start = range?.[1] ? Math.min(Number(range[1]), audio.length - 1) : 0
      const end = range?.[2] ? Math.min(Number(range[2]), audio.length - 1) : audio.length - 1
      const body = audio.subarray(start, end + 1)
      response.statusCode = range ? 206 : 200
      response.setHeader('Content-Type', metadata.audioMimeType)
      response.setHeader('Accept-Ranges', 'bytes')
      response.setHeader('Content-Length', body.length)
      response.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
      if (range) response.setHeader('Content-Range', `bytes ${start}-${end}/${audio.length}`)
      if (request.method === 'HEAD') return response.end()
      return response.end(body)
    } catch (error) {
      const message = error instanceof Error ? error.message : '分享请求失败'
      sendJson(response, message.includes('ENOENT') ? 404 : 500, { error: message.includes('ENOENT') ? '分享内容不存在或已失效' : message })
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
    server.middlewares.use('/api/lyrics/optimize', createLyricsPromptOptimizationHandler(projectRoot))
    server.middlewares.use('/api/song/generate', createGenerationHandler(projectRoot))
    server.middlewares.use('/api/song/recognize-lyrics', createLyricsRecognitionHandler(projectRoot))
    server.middlewares.use('/api/shares', createShareHandler(projectRoot))
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
