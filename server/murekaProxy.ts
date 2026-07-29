import { readFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import type { Plugin } from 'vite'

const MAX_REQUEST_BYTES = 15 * 1024 * 1024
const MUREKA_TIMEOUT_MS = 120_000

async function readApiKey(root: string) {
  const yaml = await readFile(path.join(root, 'config.yaml'), 'utf8')
  const match = yaml.match(/^\s*api_key\s*:\s*(.*?)\s*$/m)
  return match?.[1]?.trim().replace(/^['"]|['"]$/g, '') ?? ''
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

function createHandler(root: string) {
  return async (request: IncomingMessage, response: ServerResponse) => {
    if (request.method !== 'POST') {
      sendJson(response, 405, { error: 'Method not allowed' })
      return
    }

    try {
      const apiKey = await readApiKey(root)
      if (!apiKey) {
        sendJson(response, 503, { error: '请先在 config.yaml 中配置 api_key' })
        return
      }

      const payload = JSON.parse(await readRequestBody(request)) as { url?: string }
      if (!payload.url?.startsWith('data:audio/')) {
        sendJson(response, 400, { error: '缺少有效的音频 Data URL' })
        return
      }

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), MUREKA_TIMEOUT_MS)
      let upstream: Response
      try {
        upstream = await fetch('https://api.mureka.cn/v1/song/describe', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({ url: payload.url }),
          signal: controller.signal,
        })
      } finally {
        clearTimeout(timeout)
      }
      const responseBody = await upstream.text()
      response.statusCode = upstream.status
      response.setHeader('Content-Type', upstream.headers.get('content-type') ?? 'application/json; charset=utf-8')
      response.end(responseBody)
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
    name: 'jamcapture-mureka-proxy',
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
