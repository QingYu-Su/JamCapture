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

const GENERATION_SYSTEM_PROMPT = `你是专业编曲延展助手，基于用户提供的单乐器原始音频，生成2-3分钟的完整编曲作品。核心准则：原始灵感动机是作品的灵魂核心，所有编曲、配器、延展都服务于用户的创作内核，AI仅做补充与衬托，绝不颠覆、覆盖用户的原始创作。
规则执行优先级：原始素材保真规则 > 原始音频自带风格属性 > 用户自定义Prompt > 系统兜底机制，低层级规则不得突破高层级约束。
【保真规则·最高优先级】精准提取原始音频的核心旋律动机与标志性riff，全曲基于该动机通过重复、模进、倒影、节奏紧缩/扩展等专业作曲手法发展，全程可清晰识别原始灵感痕迹；严格沿用原调式调性，全程不转调、不更换调式，严格控制非功能性离调和弦；BPM与拍号完全恒定，重拍位置、切分律动与原片段保持同源；原始主乐器始终位于声场中心、响度突出，是绝对听觉核心，所有新增配器仅作为伴奏衬托；整体情绪基调与原片段高度统一，段落间可做情绪递进强化，不可出现风格与情绪的跳脱式反转。
【编曲规则】围绕主乐器搭配对应风格的低音声部、节奏织体、鼓组、色彩装饰声部，配器随段落分层递进，主歌精简配器突出原乐器，副歌加厚织体增强情绪张力，间奏做动机变奏实现情绪过渡，尾奏逐步收束回落；和声沿用原走向与色彩做同源功能组拓展，不颠覆原有的和声逻辑；风格优先匹配原乐器的天然属性，用户有明确要求可在保真框架内做精细化适配。
【时长结构】总时长严格控制在2-3分钟，默认标准时长2分30秒左右；采用二段式完整结构，包含前奏、主歌、副歌、间奏、副歌再现、尾奏；原始片段无缝接入作品开篇，衔接处零断层、无拼接痕迹，听感自然连贯。
【兜底机制】用户Prompt信息模糊、内容不足时，自动匹配适配曲风、3-4件核心基础配器、标准段落结构、原调终止式自然收束，保证作品的下限质量。
【混音要求与禁令】各声部频段分离清晰，无频段浑浊、声部打架问题，整体响度适配行业Demo标准，保留后续二次制作的空间；严禁篡改原始动机、转调变速、添加人声采样、配器喧宾夺主、时长超出范围、出现拼接断层与猎奇小众曲风。`

const GENERATION_LYRICS = 'instrumental'
const GENERATION_MODEL = 'mureka-8'

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
      const payload = JSON.parse(await readRequestBody(request)) as { url?: string; forceRefresh?: boolean }
      if (!payload.url?.startsWith('data:audio/')) {
        sendJson(response, 400, { error: '缺少有效的音频 Data URL' })
        return
      }

      const cacheKey = audioCacheKey(payload.url)
      if (payload.forceRefresh) await invalidateCachedAnalysis(root, cacheKey)
      const cached = (await loadAnalysisCache(root))[cacheKey]
      if (cached?.result.promptSuggestions?.length === 3) {
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
          const summary = await summarizeWithDeepSeek(murekaResult, keys.deepseek)
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

function generationMetadata(request: IncomingMessage) {
  const encoded = request.headers['x-jamcapture-generation']
  if (typeof encoded !== 'string') throw new Error('缺少歌曲生成参数')
  const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as Record<string, unknown>
  return {
    userPrompt: stringValue(parsed.userPrompt).slice(0, 500),
    sourceTitle: stringValue(parsed.sourceTitle).slice(0, 120),
    originalDuration: Number(parsed.originalDuration) || 0,
    preparedDuration: Number(parsed.preparedDuration) || 0,
    repeatCount: Math.max(1, Number(parsed.repeatCount) || 1),
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

export function buildMurekaGenerationRequest(referenceId: string, userPrompt: string) {
  const fallbackUserPrompt = '请在保真规则内自然延展为完整作品。'
  const combinedPrompt = `${GENERATION_SYSTEM_PROMPT}\n\n【用户自定义Prompt】\n${userPrompt.trim() || fallbackUserPrompt}`
  if (combinedPrompt.length > 2000) throw new Error('系统 Prompt 与用户 Prompt 拼接后超过 2000 字符限制')
  return {
    model: GENERATION_MODEL,
    n: 1,
    reference_id: referenceId,
    prompt: combinedPrompt,
    lyrics: GENERATION_LYRICS,
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
      const metadata = generationMetadata(request)
      const referenceAudio = await readRequestBuffer(request, MAX_REQUEST_BYTES)
      if (!referenceAudio.length) return sendJson(response, 400, { error: '缺少参考音频' })
      if (metadata.preparedDuration < 30) return sendJson(response, 400, { error: '上传给 Mureka 的临时参考音频必须不少于 30 秒' })

      const keys = await readApiKeys(root)
      if (!keys.generation) throw new Error('请先在 config.yaml 中配置 mureka_generation_api_key')
      const authorization = { Authorization: `Bearer ${keys.generation}` }

      const uploadForm = new FormData()
      uploadForm.append('purpose', 'reference')
      uploadForm.append('file', new Blob([new Uint8Array(referenceAudio)], { type: 'audio/mpeg' }), 'jamcapture-reference.mp3')
      const uploadResponse = await fetchWithTimeout(`${keys.generationBaseUrl}/v1/files/upload`, {
        method: 'POST',
        headers: authorization,
        body: uploadForm,
      })
      const upload = await providerJson(uploadResponse, 'Mureka 参考音频上传')
      const referenceId = identifierValue(upload.id)
      if (!referenceId) throw new Error('参考音频上传成功，但没有返回 reference ID')

      const generationRequest = buildMurekaGenerationRequest(referenceId, metadata.userPrompt)
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
    server.middlewares.use('/api/song/generate', createGenerationHandler(projectRoot))
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
