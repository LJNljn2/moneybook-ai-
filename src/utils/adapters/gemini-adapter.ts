/**
 * Google Gemini 适配器
 *
 * 解析 Gemini API 返回的 SSE 流，提取 thought: true 的 parts 作为思考过程。
 * Gemini API 使用 Google 特有的 SSE 格式：
 * - 通过 candidates[0].content.parts[] 传输内容
 * - thought: true 标识思考过程内容
 * - 支持两种模式：完整思考内容和仅摘要模式
 *
 * 参考文档：https://ai.google.dev/api/generate-content
 */

import { SSEParser } from '../sse-parser'
import type { ChatMessage } from '../../types'
import { BaseAdapter } from './base-adapter'
import type { ThinkingChunk, StreamOptions } from './types'

/** 摘要模式前缀 */
const SUMMARY_PREFIX = '[思考摘要]'

export class GeminiAdapter extends BaseAdapter {
  readonly name = 'gemini'
  readonly supportsThinking = true

  streamChat(messages: ChatMessage[], options?: StreamOptions): AsyncIterableIterator<ThinkingChunk> {
    const config = this.config
    const url = buildUrl(config.baseUrl, config.model.name, config.apiKey)
    const body = JSON.stringify({
      contents: messages.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
      generationConfig: {},
      stream: true,
    })

    const controller = options?.signal ? null : new AbortController()
    const promise = fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body,
      signal: options?.signal ?? controller?.signal,
    })

    return createThinkingChunkIterator(promise)
  }
}

/**
 * 构建 Gemini API URL
 *
 * Gemini API URL 格式为:
 * {baseUrl}/models/{model}:streamGenerateContent?alt=sse&key={apiKey}
 */
function buildUrl(baseUrl: string, model: string, apiKey: string): string {
  const url = baseUrl.replace(/\/+$/, '')
  return `${url}/models/${model}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`
}

/**
 * Gemini SSE 响应中的 part 结构
 */
interface GeminiPart {
  text?: string
  thought?: boolean
}

/**
 * 创建 ThinkingChunk 异步迭代器
 *
 * Gemini SSE 流格式（OpenAI 兼容的 data-only SSE）：
 * - 每个事件的 data 包含 candidates[0].content.parts
 * - part.thought === true 表示思考过程
 * - 摘要模式下思考文本以 [思考摘要] 前缀开头
 */
async function* createThinkingChunkIterator(
  responsePromise: Promise<Response>
): AsyncIterableIterator<ThinkingChunk> {
  const response = await responsePromise
  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error')
    throw new Error(`Gemini API error: ${response.status} ${errorText}`)
  }

  const parser = new SSEParser(response)
  let hasThinking = false
  let hasAnswer = false
  let allSummaryMode = true // 假设摘要模式，直到看到非摘要内容

  for await (const event of parser) {
    if (event.data === '[DONE]') break

    let parts: GeminiPart[] | undefined
    try {
      const parsed = JSON.parse(event.data)
      parts = parsed.candidates?.[0]?.content?.parts
    } catch { continue }
    if (!parts || !Array.isArray(parts)) continue

    for (const part of parts) {
      if (!part.text) continue

      if (part.thought) {
        // 思考过程内容
        hasThinking = true

        // 检查是否为摘要模式（以 [思考摘要] 前缀开头）
        if (!part.text.startsWith(SUMMARY_PREFIX)) {
          allSummaryMode = false
        }

        yield { type: 'thinking', content: part.text, done: false }
      } else {
        // 最终回答内容
        hasAnswer = true
        allSummaryMode = false
        yield { type: 'answer', content: part.text, done: false }
      }
    }
  }

  // 流结束
  // 摘要模式：仅有思考摘要，没有真正的答案 → 追加提示
  if (hasThinking && allSummaryMode && !hasAnswer) {
    yield { type: 'answer', content: '（该模型仅返回思考摘要，完整思考过程未返回）', done: true }
    return
  }

  if (hasThinking && !hasAnswer) {
    yield { type: 'thinking', content: '', done: true }
    return
  }
  yield { type: 'answer', content: '', done: true }
}
