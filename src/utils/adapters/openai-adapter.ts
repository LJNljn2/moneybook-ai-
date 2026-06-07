/**
 * OpenAI 适配器
 *
 * 标准 SSE 解析，所有内容均为回答（OpenAI 不暴露 thinking tokens）。
 * o1/o3-mini 等推理模型的思考过程不可见，因此无 thinking 支持。
 */

import { SSEParser } from '../sse-parser'
import type { ChatMessage } from '../../types'
import { BaseAdapter } from './base-adapter'
import type { ThinkingChunk, StreamOptions } from './types'

export class OpenAIAdapter extends BaseAdapter {
  readonly name = 'openai'
  readonly supportsThinking = false

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

    return createAnswerChunkIterator(promise)
  }
}

function buildUrl(baseUrl: string): string {
  const url = baseUrl.replace(/\/+$/, '')
  if (url.endsWith('/chat/completions')) return url
  return url + '/chat/completions'
}

async function* createAnswerChunkIterator(
  responsePromise: Promise<Response>
): AsyncIterableIterator<ThinkingChunk> {
  const response = await responsePromise
  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error')
    throw new Error(`OpenAI API error: ${response.status} ${errorText}`)
  }

  const parser = new SSEParser(response)

  for await (const event of parser) {
    if (event.data === '[DONE]') break

    let delta: { content?: string } | undefined
    try {
      const parsed = JSON.parse(event.data)
      delta = parsed.choices?.[0]?.delta
    } catch { continue }
    if (!delta) continue

    // OpenAI 不暴露 thinking，所有 content 均为回答
    if (delta.content) {
      yield { type: 'answer', content: delta.content, done: false }
    }
  }

  yield { type: 'answer', content: '', done: true }
}
