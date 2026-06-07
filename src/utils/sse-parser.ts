/**
 * SSE (Server-Sent Events) 解析器
 *
 * 将 ReadableStream 解析为 AsyncIterableIterator<SSEEvent>，
 * 兼容 OpenAI、DeepSeek、Anthropic 等不同 AI 供应商的 SSE 变体。
 *
 * 处理的边界情况：
 * - \r\n 和 \n 混用
 * - 多行 data 字段（data: line1\ndata: line2 → line1\nline2）
 * - 空行（心跳）
 * - 注释行（以 : 开头）
 * - data: [DONE] 终止信号
 * - chunk 被截断在 data: 中间
 * - Anthropic event 字段
 */

/** SSE 事件结构 */
export interface SSEEvent {
  /** 事件数据（JSON 字符串或 "[DONE]"） */
  data: string
  /** 事件类型（Anthropic 等使用） */
  event?: string
  /** 事件 ID */
  id?: string
}

/**
 * SSE 流式解析器
 *
 * @example
 * ```ts
 * const response = await fetch(url, options)
 * const parser = new SSEParser(response)
 * for await (const evt of parser) {
 *   if (evt.data === '[DONE]') break
 *   const json = JSON.parse(evt.data)
 * }
 * ```
 */
export class SSEParser {
  private _reader: ReadableStreamDefaultReader<Uint8Array>
  private _decoder = new TextDecoder()
  private _buffer = ''

  constructor(response: Response) {
    if (!response.body) {
      throw new Error('Response body is null — cannot parse SSE stream')
    }
    this._reader = response.body.getReader()
  }

  /** 从 ReadableStream<Uint8Array> 构造（用于非 fetch 场景） */
  static fromStream(stream: ReadableStream<Uint8Array>): SSEParser {
    const parser = Object.create(SSEParser.prototype) as SSEParser
    parser._reader = stream.getReader()
    parser._decoder = new TextDecoder()
    parser._buffer = ''
    return parser
  }

  async *[Symbol.asyncIterator](): AsyncIterableIterator<SSEEvent> {
    try {
      while (true) {
        const { done, value } = await this._reader.read()
        if (done) {
          // 流结束，处理 buffer 中可能残留的完整事件
          yield* this._flushBuffer()
          break
        }
        this._buffer += this._decoder.decode(value, { stream: true })
        yield* this._extractEvents()
      }
    } finally {
      this._reader.releaseLock()
    }
  }

  /**
   * 从 buffer 中提取完整的 SSE 事件
   * SSE 事件以空行（\n\n 或 \r\n\r\n）分隔
   */
  private *_extractEvents(): Generator<SSEEvent> {
    // 规范化换行符：统一用 \n
    // 先处理 \r\n → \n，再处理单独的 \r → \n
    const normalized = this._buffer.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

    // 按双换行符分割事件
    const parts = normalized.split('\n\n')

    // 最后一段可能不完整，保留在 buffer 中
    this._buffer = parts.pop() ?? ''

    for (const part of parts) {
      if (!part.trim()) continue
      const event = this._parseEvent(part)
      if (event) {
        yield event
      }
    }
  }

  /**
   * 流结束时，尝试解析 buffer 中的残留数据
   */
  private *_flushBuffer(): Generator<SSEEvent> {
    const trimmed = this._buffer.trim()
    if (!trimmed) return

    const normalized = trimmed.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    const event = this._parseEvent(normalized)
    if (event) {
      yield event
    }
  }

  /**
   * 解析单个 SSE 事件块
   * 字段可以跨多行（如 data: line1\ndata: line2）
   */
  private _parseEvent(block: string): SSEEvent | null {
    let data = ''
    let event = ''
    let id = ''

    const lines = block.split('\n')

    for (const line of lines) {
      // 空行跳过
      if (!line.trim()) continue

      // 注释行（以 : 开头）
      if (line.startsWith(':')) continue

      // 解析字段
      const colonIdx = line.indexOf(':')
      if (colonIdx === -1) {
        // 没有冒号的行，视为无效行（可能被截断）
        continue
      }

      const field = line.slice(0, colonIdx)
      // 冒号后的值，如果冒号后紧跟空格则跳过（SSE 规范）
      const rawValue = line.slice(colonIdx + 1)
      const value = rawValue.startsWith(' ') ? rawValue.slice(1) : rawValue

      switch (field) {
        case 'data':
          // 多行 data 字段用 \n 拼接
          data = data ? data + '\n' + value : value
          break
        case 'event':
          event = value
          break
        case 'id':
          id = value
          break
        // 忽略其他字段（retry 等）
      }
    }

    // 没有 data 字段的事件不产生输出（可能是纯注释块）
    if (!data) return null

    const result: SSEEvent = { data }
    if (event) result.event = event
    if (id) result.id = id
    return result
  }
}
