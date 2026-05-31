/**
 * DeepSeek 适配器
 *
 * 解析 DeepSeek API 返回的 SSE 流，提取 <think>...</think> 标签中的思考过程。
 * 使用非递归逐字符状态机处理标签跨 chunk 的情况。
 */

import { SSEParser } from '../sse-parser'
import type { ChatMessage } from '../../types'
import { BaseAdapter } from './base-adapter'
import type { ThinkingChunk, StreamOptions } from './types'

const OPEN_TAG = '<think>'
const CLOSE_TAG = String.fromCodePoint(0x3c, 0x2f, 0x74, 0x68, 0x69, 0x6e, 0x6b, 0x3e) // '</think>'

export class DeepSeekAdapter extends BaseAdapter {
  readonly name = 'deepseek'
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

/**
 * 处理一段文本，返回产出的 chunks 和更新后的状态
 */
function processText(
  text: string,
  inThinking: boolean,
  hasThinking: boolean,
  hasAnswer: boolean,
  outType: 'thinking' | 'answer' | null,
  outBuf: string,
  tagBuffer: string,
): { chunks: ThinkingChunk[]; inThinking: boolean; hasThinking: boolean; hasAnswer: boolean; outType: 'thinking' | 'answer' | null; outBuf: string; tagBuffer: string } {
  const chunks: ThinkingChunk[] = []

  function flush() {
    if (outType !== null && outBuf.length > 0) {
      chunks.push({ type: outType, content: outBuf, done: false })
      outType = null
      outBuf = ''
    }
  }

  function pushContent(type: 'thinking' | 'answer', ch: string) {
    if (outType !== type) {
      flush()
      outType = type
    }
    outBuf += ch
    if (type === 'thinking') hasThinking = true
    else hasAnswer = true
  }

  // 将 tagBuffer 与当前文本拼接
  const fullText = tagBuffer + text
  tagBuffer = ''

  let i = 0
  while (i < fullText.length) {
    if (fullText[i] === '<') {
      const expectedTag = inThinking ? CLOSE_TAG : OPEN_TAG
      let tagPos = 0
      let j = i
      let matched = true

      while (j < fullText.length && tagPos < expectedTag.length) {
        if (fullText[j] === expectedTag[tagPos]) {
          tagPos++
          j++
        } else {
          matched = false
          break
        }
      }

      if (matched && tagPos === expectedTag.length) {
        // 标签完全匹配
        inThinking = !inThinking
        i = j
      } else if (j >= fullText.length && tagPos > 0) {
        // 标签部分匹配（文本不够长），缓冲剩余部分
        tagBuffer = fullText.slice(i)
        i = fullText.length
      } else {
        // 标签不匹配
        pushContent(inThinking ? 'thinking' : 'answer', '<')
        i++
      }
    } else {
      pushContent(inThinking ? 'thinking' : 'answer', fullText[i])
      i++
    }
  }

  flush()
  return { chunks, inThinking, hasThinking, hasAnswer, outType, outBuf, tagBuffer }
}

async function* createThinkingChunkIterator(
  responsePromise: Promise<Response>
): AsyncIterableIterator<ThinkingChunk> {
  const response = await responsePromise
  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error')
    throw new Error(`DeepSeek API error: ${response.status} ${errorText}`)
  }

  const parser = new SSEParser(response)
  let inThinking = false
  let hasThinking = false
  let hasAnswer = false
  let outType: 'thinking' | 'answer' | null = null
  let outBuf = ''
  let tagBuffer = ''

  for await (const event of parser) {
    if (event.data === '[DONE]') break
    let deltaContent: string | undefined
    try {
      const parsed = JSON.parse(event.data)
      deltaContent = parsed.choices?.[0]?.delta?.content
    } catch { continue }
    if (!deltaContent) continue

    const result = processText(deltaContent, inThinking, hasThinking, hasAnswer, outType, outBuf, tagBuffer)
    inThinking = result.inThinking
    hasThinking = result.hasThinking
    hasAnswer = result.hasAnswer
    outType = result.outType
    outBuf = result.outBuf
    tagBuffer = result.tagBuffer
    for (const chunk of result.chunks) {
      yield chunk
    }
  }

  // 流结束，处理残留 tagBuffer
  if (tagBuffer.length > 0) {
    const result = processText('', inThinking, hasThinking, hasAnswer, outType, outBuf, tagBuffer)
    hasThinking = result.hasThinking
    hasAnswer = result.hasAnswer
    outType = result.outType
    outBuf = result.outBuf
    for (const chunk of result.chunks) {
      yield chunk
    }
  }

  if (outType !== null && outBuf.length > 0) {
    yield { type: outType, content: outBuf, done: false }
  }

  if (hasThinking && !hasAnswer) {
    yield { type: 'thinking', content: '', done: true }
    return
  }
  yield { type: 'answer', content: '', done: true }
}

// --- parseThinkTags for non-streaming / testing ---

type ThinkState = 'answer' | 'thinking'

export interface ParseResult {
  type: 'thinking' | 'answer'
  content: string
  nextState: ThinkState
}

export function parseThinkTags(text: string, currentState: ThinkState): ParseResult[] {
  const results: ParseResult[] = []
  let remaining = text
  let state = currentState

  while (remaining.length > 0) {
    if (state === 'answer') {
      const idx = remaining.indexOf(OPEN_TAG)
      if (idx !== -1) {
        if (idx > 0) {
          results.push({ type: 'answer', content: remaining.slice(0, idx), nextState: 'answer' })
        }
        state = 'thinking'
        remaining = remaining.slice(idx + OPEN_TAG.length)
      } else {
        const partial = findPartialTag(remaining, OPEN_TAG)
        if (partial !== null) {
          if (partial > 0) {
            results.push({ type: 'answer', content: remaining.slice(0, partial), nextState: 'answer' })
          }
          remaining = remaining.slice(partial)
          break
        }
        results.push({ type: 'answer', content: remaining, nextState: 'answer' })
        remaining = ''
      }
    } else {
      const idx = remaining.indexOf(CLOSE_TAG)
      if (idx !== -1) {
        if (idx > 0) {
          results.push({ type: 'thinking', content: remaining.slice(0, idx), nextState: 'thinking' })
        }
        state = 'answer'
        remaining = remaining.slice(idx + CLOSE_TAG.length)
      } else {
        const partial = findPartialTag(remaining, CLOSE_TAG)
        if (partial !== null) {
          if (partial > 0) {
            results.push({ type: 'thinking', content: remaining.slice(0, partial), nextState: 'thinking' })
          }
          remaining = remaining.slice(partial)
          break
        }
        results.push({ type: 'thinking', content: remaining, nextState: 'thinking' })
        remaining = ''
      }
    }
  }

  return results
}

function findPartialTag(text: string, fullTag: string): number | null {
  for (let i = text.length - 1; i >= 0; i--) {
    if (text[i] === '<') {
      const afterBracket = text.slice(i + 1)
      if (afterBracket.length > 0 && fullTag.startsWith('<' + afterBracket)) {
        return i
      }
    }
  }
  return null
}
