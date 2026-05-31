/**
 * Anthropic Claude 适配器
 *
 * 解析 Anthropic Messages API 返回的 SSE 流，提取 thinking content block 作为思考过程。
 * Anthropic 使用与 OpenAI 完全不同的事件流格式：
 * - 通过 event 字段区分事件类型（content_block_start / content_block_delta / content_block_stop）
 * - thinking 块通过 content_block.type === 'thinking' 标识
 * - 需要在请求体中显式启用 thinking: { type: 'enabled', budget_tokens: 10000 }
 *
 * 参考文档：https://docs.anthropic.com/en/api/messages-streaming
 */

import { SSEParser } from '../sse-parser'
import type { ChatMessage } from '../../types'
import { BaseAdapter } from './base-adapter'
import type { ThinkingChunk, StreamOptions } from './types'

/** Anthropic thinking 预算（硬编码 10000 tokens） */
const THINKING_BUDGET = 10000

export class ClaudeAdapter extends BaseAdapter {
  readonly name = 'claude'
  readonly supportsThinking = true

  streamChat(messages: ChatMessage[], options?: StreamOptions): AsyncIterableIterator<ThinkingChunk> {
    const config = this.config
    const url = buildUrl(config.baseUrl)
    const body = JSON.stringify({
      model: config.model.name,
      max_tokens: 4096,
      thinking: { type: 'enabled', budget_tokens: THINKING_BUDGET },
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      stream: true,
    })

    const controller = options?.signal ? null : new AbortController()
    const promise = fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body,
      signal: options?.signal ?? controller?.signal,
    })

    return createThinkingChunkIterator(promise)
  }
}

/**
 * 构建聊天请求 URL
 *
 * Anthropic API URL 格式为: {baseUrl}/v1/messages
 */
function buildUrl(baseUrl: string): string {
  const url = baseUrl.replace(/\/+$/, '')
  if (url.endsWith('/v1/messages')) return url
  return url + '/v1/messages'
}

/**
 * Anthropic SSE 事件类型
 *
 * Anthropic 使用 event 字段标识不同的事件类型，
 * 与 OpenAI 的纯 data-only 格式不同。
 */
interface AnthropicContentBlock {
  type: string
  text?: string
  thinking?: string
}

interface AnthropicDelta {
  type: string
  text?: string
  thinking?: string
}

/**
 * 创建 ThinkingChunk 异步迭代器
 *
 * Anthropic 事件流格式：
 * - event: content_block_start → 开始一个新内容块（含 type: 'thinking' 或 'text'）
 * - event: content_block_delta → 内容增量（delta.type 决定类型）
 * - event: content_block_stop → 内容块结束
 * - event: message_stop → 消息结束
 */
async function* createThinkingChunkIterator(
  responsePromise: Promise<Response>
): AsyncIterableIterator<ThinkingChunk> {
  const response = await responsePromise
  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error')
    throw new Error(`Claude API error: ${response.status} ${errorText}`)
  }

  const parser = new SSEParser(response)
  let hasThinking = false
  let hasAnswer = false

  for await (const event of parser) {
    // Anthropic 使用 event 字段区分事件类型
    const eventType = event.event

    // message_stop 表示流结束
    if (eventType === 'message_stop') {
      break
    }

    // 处理内容块开始事件
    if (eventType === 'content_block_start') {
      try {
        const parsed = JSON.parse(event.data) as { content_block?: AnthropicContentBlock }
        // thinking 块的开始
        if (parsed.content_block?.type === 'thinking') {
          hasThinking = true
        }
      } catch { /* 忽略解析错误 */ }
      continue
    }

    // 处理内容增量事件
    if (eventType === 'content_block_delta') {
      try {
        const parsed = JSON.parse(event.data) as { delta?: AnthropicDelta }
        const delta = parsed.delta
        if (!delta) continue

        // thinking delta → 思考过程
        if (delta.type === 'thinking_delta' && delta.thinking) {
          hasThinking = true
          yield { type: 'thinking', content: delta.thinking, done: false }
        }

        // text delta → 最终回答
        if (delta.type === 'text_delta' && delta.text) {
          hasAnswer = true
          yield { type: 'answer', content: delta.text, done: false }
        }
      } catch { /* 忽略解析错误 */ }
      continue
    }

    // 忽略其他事件类型（message_start, content_block_stop, ping, etc.）
  }

  // 流结束
  if (hasThinking && !hasAnswer) {
    yield { type: 'thinking', content: '', done: true }
    return
  }
  yield { type: 'answer', content: '', done: true }
}
