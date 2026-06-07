import { describe, it, expect } from 'vitest'
import { SSEParser } from '../../src/utils/sse-parser'
import type { SSEEvent } from '../../src/utils/sse-parser'

/**
 * 辅助函数：将字符串数组创建为 ReadableStream<Uint8Array>
 * 模拟网络 chunk 到达的场景
 */
function createStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk))
      }
      controller.close()
    },
  })
}

/**
 * 辅助函数：创建一个模拟 Response 对象
 */
function createMockResponse(chunks: string[]): Response {
  const stream = createStream(chunks)
  return {
    body: stream,
  } as unknown as Response
}

/**
 * 辅助函数：将 SSEEvent[] 聚合为数组
 */
async function collectEvents(response: Response): Promise<SSEEvent[]> {
  const parser = new SSEParser(response)
  const events: SSEEvent[] = []
  for await (const evt of parser) {
    events.push(evt)
  }
  return events
}

describe('SSEParser', () => {
  describe('basic parsing', () => {
    it('should parse a simple data event', async () => {
      const response = createMockResponse(['data: hello world\n\n'])
      const events = await collectEvents(response)
      expect(events).toHaveLength(1)
      expect(events[0].data).toBe('hello world')
    })

    it('should parse multiple events in one chunk', async () => {
      const response = createMockResponse([
        'data: event1\n\ndata: event2\n\n',
      ])
      const events = await collectEvents(response)
      expect(events).toHaveLength(2)
      expect(events[0].data).toBe('event1')
      expect(events[1].data).toBe('event2')
    })

    it('should parse [DONE] termination signal', async () => {
      const response = createMockResponse([
        'data: {"delta":"hi"}\n\ndata: [DONE]\n\n',
      ])
      const events = await collectEvents(response)
      expect(events).toHaveLength(2)
      expect(events[1].data).toBe('[DONE]')
    })

    it('should parse event across multiple chunks', async () => {
      const response = createMockResponse([
        'data: first',
        ' chunk\n\ndata: second',
        ' chunk\n\n',
      ])
      const events = await collectEvents(response)
      expect(events).toHaveLength(2)
      expect(events[0].data).toBe('first chunk')
      expect(events[1].data).toBe('second chunk')
    })

    it('should handle empty response body', async () => {
      const response = createMockResponse([])
      const events = await collectEvents(response)
      expect(events).toHaveLength(0)
    })
  })

  describe('line ending handling', () => {
    it('should handle \\r\\n line endings', async () => {
      const response = createMockResponse(['data: hello\r\n\r\n'])
      const events = await collectEvents(response)
      expect(events).toHaveLength(1)
      expect(events[0].data).toBe('hello')
    })

    it('should handle mixed \\r\\n and \\n line endings', async () => {
      const response = createMockResponse([
        'data: event1\r\n\r\ndata: event2\n\n',
      ])
      const events = await collectEvents(response)
      expect(events).toHaveLength(2)
      expect(events[0].data).toBe('event1')
      expect(events[1].data).toBe('event2')
    })

    it('should handle lone \\r as line separator', async () => {
      const response = createMockResponse(['data: hello\r\r'])
      const events = await collectEvents(response)
      expect(events).toHaveLength(1)
      expect(events[0].data).toBe('hello')
    })
  })

  describe('multi-line data fields', () => {
    it('should concatenate multiple data lines with \\n', async () => {
      const response = createMockResponse([
        'data: line1\ndata: line2\ndata: line3\n\n',
      ])
      const events = await collectEvents(response)
      expect(events).toHaveLength(1)
      expect(events[0].data).toBe('line1\nline2\nline3')
    })

    it('should handle multi-line data across chunks', async () => {
      const response = createMockResponse([
        'data: line1\n',
        'data: line2\n\n',
      ])
      const events = await collectEvents(response)
      expect(events).toHaveLength(1)
      expect(events[0].data).toBe('line1\nline2')
    })
  })

  describe('empty lines and heartbeats', () => {
    it('should skip empty lines (heartbeats)', async () => {
      const response = createMockResponse([
        '\n\ndata: event1\n\n\n\ndata: event2\n\n',
      ])
      const events = await collectEvents(response)
      expect(events).toHaveLength(2)
      expect(events[0].data).toBe('event1')
      expect(events[1].data).toBe('event2')
    })

    it('should skip comment lines (starting with :)', async () => {
      const response = createMockResponse([
        ': this is a comment\ndata: real data\n\n: another comment\ndata: more data\n\n',
      ])
      const events = await collectEvents(response)
      expect(events).toHaveLength(2)
      expect(events[0].data).toBe('real data')
      expect(events[1].data).toBe('more data')
    })

    it('should handle comment-only blocks (no event emitted)', async () => {
      const response = createMockResponse([
        ': keepalive comment\n\n',
      ])
      const events = await collectEvents(response)
      expect(events).toHaveLength(0)
    })
  })

  describe('truncated chunks', () => {
    it('should handle chunk split mid-data: line', async () => {
      // "data: hello" 被拆成 "da" 和 "ta: hello"
      const response = createMockResponse([
        'da',
        'ta: hello\n\n',
      ])
      const events = await collectEvents(response)
      expect(events).toHaveLength(1)
      expect(events[0].data).toBe('hello')
    })

    it('should handle chunk split mid-event boundary', async () => {
      // 事件边界被拆分："\n\n" 被拆成 "\n" 和 "\n"
      const response = createMockResponse([
        'data: first\n',
        '\ndata: second\n\n',
      ])
      const events = await collectEvents(response)
      expect(events).toHaveLength(2)
      expect(events[0].data).toBe('first')
      expect(events[1].data).toBe('second')
    })

    it('should handle chunk split mid-json body', async () => {
      const json = '{"delta":{"content":"hello world"}}'
      // 拆分 JSON 内容
      const mid = Math.floor(json.length / 2)
      const response = createMockResponse([
        `data: ${json.slice(0, mid)}`,
        `${json.slice(mid)}\n\n`,
      ])
      const events = await collectEvents(response)
      expect(events).toHaveLength(1)
      expect(events[0].data).toBe(json)
    })

    it('should handle very last chunk with no trailing newline', async () => {
      const response = createMockResponse([
        'data: final event',
      ])
      const events = await collectEvents(response)
      expect(events).toHaveLength(1)
      expect(events[0].data).toBe('final event')
    })
  })

  describe('event and id fields', () => {
    it('should parse event field (Anthropic format)', async () => {
      const response = createMockResponse([
        'event: content_block_start\ndata: {"type":"text"}\n\n',
      ])
      const events = await collectEvents(response)
      expect(events).toHaveLength(1)
      expect(events[0].event).toBe('content_block_start')
      expect(events[0].data).toBe('{"type":"text"}')
    })

    it('should parse id field', async () => {
      const response = createMockResponse([
        'id: msg-123\ndata: hello\n\n',
      ])
      const events = await collectEvents(response)
      expect(events).toHaveLength(1)
      expect(events[0].id).toBe('msg-123')
      expect(events[0].data).toBe('hello')
    })

    it('should parse all fields together', async () => {
      const response = createMockResponse([
        'event: message\nid: abc-123\ndata: {"content":"hi"}\n\n',
      ])
      const events = await collectEvents(response)
      expect(events).toHaveLength(1)
      expect(events[0].event).toBe('message')
      expect(events[0].id).toBe('abc-123')
      expect(events[0].data).toBe('{"content":"hi"}')
    })
  })

  describe('field value with leading space', () => {
    it('should strip single leading space from field value (SSE spec)', async () => {
      const response = createMockResponse(['data:  value with leading space\n\n'])
      const events = await collectEvents(response)
      // SSE 规范：冒号后的第一个空格被跳过
      expect(events[0].data).toBe(' value with leading space')
    })

    it('should handle value without leading space', async () => {
      const response = createMockResponse(['data:value without space\n\n'])
      const events = await collectEvents(response)
      expect(events[0].data).toBe('value without space')
    })
  })

  describe('OpenAI compatible stream', () => {
    it('should parse OpenAI-style streaming chunks', async () => {
      const chunks = [
        'data: {"id":"chatcmpl-123","choices":[{"delta":{"content":"Hello"}}]}\n\n',
        'data: {"id":"chatcmpl-123","choices":[{"delta":{"content":" world"}}]}\n\n',
        'data: {"id":"chatcmpl-123","choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
        'data: [DONE]\n\n',
      ]
      const response = createMockResponse(chunks)
      const events = await collectEvents(response)
      expect(events).toHaveLength(4)
      expect(events[3].data).toBe('[DONE]')

      const parsed = events.slice(0, 3).map(e => JSON.parse(e.data))
      expect(parsed[0].choices[0].delta.content).toBe('Hello')
      expect(parsed[1].choices[0].delta.content).toBe(' world')
      expect(parsed[2].choices[0].finish_reason).toBe('stop')
    })
  })

  describe('Anthropic event stream format', () => {
    it('should parse Anthropic-style event blocks', async () => {
      const chunks = [
        'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_123"}}\n\n',
        'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"thinking"}}\n\n',
        'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","text":"thinking..."}}\n\n',
        'event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n',
        'event: message_stop\ndata: {"type":"message_stop"}\n\n',
      ]
      const response = createMockResponse(chunks)
      const events = await collectEvents(response)
      expect(events).toHaveLength(5)
      expect(events.map(e => e.event)).toEqual([
        'message_start',
        'content_block_start',
        'content_block_delta',
        'content_block_stop',
        'message_stop',
      ])
    })
  })

  describe('edge cases', () => {
    it('should skip lines without colon (no field name)', async () => {
      const response = createMockResponse([
        'invalid line without colon\ndata: valid\n\n',
      ])
      const events = await collectEvents(response)
      expect(events).toHaveLength(1)
      expect(events[0].data).toBe('valid')
    })

    it('should handle data field with empty value', async () => {
      const response = createMockResponse(['data:\n\n'])
      const events = await collectEvents(response)
      expect(events).toHaveLength(0) // 空 data 不产生事件
    })

    it('should handle unknown fields gracefully', async () => {
      const response = createMockResponse([
        'retry: 5000\ndata: hello\n\n',
      ])
      const events = await collectEvents(response)
      expect(events).toHaveLength(1)
      expect(events[0].data).toBe('hello')
    })

    it('should handle realistic streaming with many small chunks', async () => {
      // 模拟真实的流式响应：每个字符一个 chunk
      const text = 'data: {"content":"hello"}\n\n'
      const charChunks = text.split('')
      const response = createMockResponse(charChunks)
      const events = await collectEvents(response)
      expect(events).toHaveLength(1)
      expect(events[0].data).toBe('{"content":"hello"}')
    })
  })

  describe('fromStream static method', () => {
    it('should create parser from ReadableStream directly', async () => {
      const stream = createStream(['data: hello\n\n'])
      const parser = SSEParser.fromStream(stream)
      const events: SSEEvent[] = []
      for await (const evt of parser) {
        events.push(evt)
      }
      expect(events).toHaveLength(1)
      expect(events[0].data).toBe('hello')
    })
  })

  describe('null body error', () => {
    it('should throw if response body is null', () => {
      const response = { body: null } as unknown as Response
      expect(() => new SSEParser(response)).toThrow('Response body is null')
    })
  })
})
