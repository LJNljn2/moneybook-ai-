/**
 * 百度文心 (Ernie / Wenxin) 适配器
 *
 * 解析百度文心 API 返回的 SSE 流，提取 thinking 字段作为思考过程。
 * 百度 API 使用 access_token 鉴权机制，需要通过 API Key 和 Secret Key 交换获取。
 *
 * 鉴权流程：
 * 1. apiKey 格式为 "API_KEY:SECRET_KEY"
 * 2. 调用 Baidu OAuth 接口获取 access_token
 * 3. access_token 作为 query parameter 传入聊天请求
 * 4. Token 缓存 25 天（Baidu token 有效期 30 天）
 */

import { SSEParser } from '../sse-parser'
import type { ChatMessage } from '../../types'
import { BaseAdapter } from './base-adapter'
import type { ThinkingChunk, StreamOptions } from './types'

/** Token 缓存：按 API_KEY 缓存，避免重复请求 */
interface TokenCache {
  accessToken: string
  /** 过期时间戳（毫秒） */
  expiresAt: number
}

const tokenCache = new Map<string, TokenCache>()

/**
 * 缓存有效期：25 天（Baidu token 有效期 30 天，预留 5 天 buffer）
 */
const CACHE_DURATION_MS = 25 * 24 * 60 * 60 * 1000

/**
 * Baidu OAuth Token Endpoint（固定地址，不随 baseUrl 变化）
 */
const BAIDU_TOKEN_ENDPOINT = 'https://aip.baidubce.com/oauth/2.0/token'

export class ErnieAdapter extends BaseAdapter {
  readonly name = 'ernie'
  readonly supportsThinking = true

  streamChat(messages: ChatMessage[], options?: StreamOptions): AsyncIterableIterator<ThinkingChunk> {
    const config = this.config

    const promise = (async () => {
      const accessToken = await this.getAccessToken()
      const url = buildChatUrl(config.baseUrl, config.model.name, accessToken)
      const body = JSON.stringify({
        model: config.model.name,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        stream: true,
      })

      const controller = options?.signal ? null : new AbortController()
      return fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body,
        signal: options?.signal ?? controller?.signal,
      })
    })()

    return createThinkingChunkIterator(promise)
  }

  /**
   * 获取 access_token（带缓存）
   *
   * Baidu 的 access_token 有效期为 30 天，
   * 此处缓存 25 天，过期后自动刷新。
   */
  private async getAccessToken(): Promise<string> {
    const { apiKey, secretKey } = parseApiKey(this.config.apiKey)

    // 检查缓存
    const cached = tokenCache.get(apiKey)
    if (cached && cached.expiresAt > Date.now()) {
      return cached.accessToken
    }

    // 请求新 token
    const tokenUrl = `${BAIDU_TOKEN_ENDPOINT}?grant_type=client_credentials&client_id=${apiKey}&client_secret=${secretKey}`

    const response = await fetch(tokenUrl, { method: 'POST' })
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error')
      throw new Error(`Ernie auth error: ${response.status} ${errorText}`)
    }

    const data = await response.json() as { access_token?: string; error?: string; error_description?: string }

    if (data.error || !data.access_token) {
      throw new Error(
        `Ernie auth error: ${data.error ?? 'unknown_error'} - ${data.error_description ?? 'Failed to obtain access token'}`
      )
    }

    // 缓存 token
    tokenCache.set(apiKey, {
      accessToken: data.access_token,
      expiresAt: Date.now() + CACHE_DURATION_MS,
    })

    return data.access_token
  }
}

/**
 * 解析 apiKey 格式 "API_KEY:SECRET_KEY"
 */
function parseApiKey(apiKey: string): { apiKey: string; secretKey: string } {
  const cleaned = apiKey.replace(/^Bearer\s+/i, '')
  const colonIdx = cleaned.indexOf(':')
  if (colonIdx === -1) {
    throw new Error(
      'Ernie adapter requires apiKey in format "API_KEY:SECRET_KEY" (colon-separated)'
    )
  }
  return {
    apiKey: cleaned.slice(0, colonIdx),
    secretKey: cleaned.slice(colonIdx + 1),
  }
}

/**
 * 构建聊天请求 URL
 *
 * Baidu 文心 API 的 URL 格式为: {baseUrl}/chat/{modelName}?access_token=xxx
 */
function buildChatUrl(baseUrl: string, modelName: string, accessToken: string): string {
  const url = baseUrl.replace(/\/+$/, '')
  // 检查是否已经包含完整路径（如 /chat/completions）
  if (url.includes('/chat/')) {
    // 已有路径，替换或追加 access_token
    const separator = url.includes('?') ? '&' : '?'
    return `${url}${separator}access_token=${accessToken}`
  }
  return `${url}/chat/${modelName}?access_token=${accessToken}`
}

/**
 * 创建 ThinkingChunk 异步迭代器
 *
 * 与 Doubao 适配器格式相同：使用 thinking 字段（非 reasoning_content）
 */
async function* createThinkingChunkIterator(
  responsePromise: Promise<Response>
): AsyncIterableIterator<ThinkingChunk> {
  const response = await responsePromise
  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error')
    throw new Error(`Ernie API error: ${response.status} ${errorText}`)
  }

  const parser = new SSEParser(response)
  let hasThinking = false
  let hasAnswer = false

  for await (const event of parser) {
    if (event.data === '[DONE]') break

    let delta: { content?: string; thinking?: string } | undefined
    try {
      const parsed = JSON.parse(event.data)
      delta = parsed.choices?.[0]?.delta
    } catch { continue }
    if (!delta) continue

    // thinking 包含思考过程
    if (delta.thinking) {
      hasThinking = true
      yield { type: 'thinking', content: delta.thinking, done: false }
    }

    // content 包含最终回答
    if (delta.content) {
      hasAnswer = true
      yield { type: 'answer', content: delta.content, done: false }
    }
  }

  // 流结束
  if (hasThinking && !hasAnswer) {
    yield { type: 'thinking', content: '', done: true }
    return
  }
  yield { type: 'answer', content: '', done: true }
}
