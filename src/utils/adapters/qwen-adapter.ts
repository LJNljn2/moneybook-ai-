/**
 * 通义千问 (DashScope) 适配器
 *
 * 解析通义千问 API 返回的 SSE 流，提取 reasoning_content 字段作为思考过程。
 * DashScope 使用 OpenAI 兼容格式，通过 reasoning_content 区分思考与回答。
 */

import { SSEParser } from '../sse-parser'
import type { ChatMessage } from '../../types'
import { BaseAdapter } from './base-adapter'
import type { ThinkingChunk, StreamOptions } from './types'

export class QwenAdapter extends BaseAdapter {
  readonly name = 'qwen'
  readonly supportsThinking = true

  streamChat(messages: ChatMessage[], options?: StreamOptions): AsyncIterableIterator<ThinkingChunk> {
    const config = this.config
    const url = buildUrl(config.baseUrl)
    const body = JSON.stringify({
      model: config.model.name,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      stream: true,
    })

    const controller = options?.signal ? null : new AbortController()
    const promise = fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body,
      signal: options?.signal ?? controller?.signal,
    })

    return createThinkingChunkIterator(promise)
  }
}

function buildUrl(baseUrl: string): string {
  const url = baseUrl.replace(/\/+$/, '')
  if (url.endsWith('/chat/completions')) return url
  return url + '/chat/completions'
}

async function* createThinkingChunkIterator(
  responsePromise: Promise<Response>
): AsyncIterableIterator<ThinkingChunk> {
  const response = await responsePromise
  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error')
    throw new Error(`Qwen API error: ${response.status} ${errorText}`)
  }

  const parser = new SSEParser(response)
  let hasThinking = false
  let hasAnswer = false

  for await (const event of parser) {
    if (event.data === '[DONE]') break

    let delta: { content?: string; reasoning_content?: string } | undefined
    try {
      const parsed = JSON.parse(event.data)
      delta = parsed.choices?.[0]?.delta
    } catch { continue }
    if (!delta) continue

    // reasoning_content 包含思考过程
    if (delta.reasoning_content) {
      hasThinking = true
      yield { type: 'thinking', content: delta.reasoning_content, done: false }
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
