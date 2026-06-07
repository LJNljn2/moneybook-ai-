import { describe, it, expect } from 'vitest'
import { ClaudeAdapter } from '../../src/utils/adapters/claude-adapter'
import type { ThinkingChunk, ProviderConfig } from '../../src/utils/adapters/types'
import type { AiPlatform, ModelConfig } from '../../src/types'

/**
 * 辅助函数：创建测试用的 ProviderConfig
 */
function createTestConfig(overrides: Partial<ProviderConfig> = {}): ProviderConfig {
  const platform: AiPlatform = {
    id: 'claude',
    name: 'Anthropic',
    baseUrl: 'https://api.anthropic.com',
    models: [
      { name: 'claude-sonnet-4-20250514', supportsThinking: true },
      { name: 'claude-haiku-4-5-20251001', supportsThinking: false },
    ],
    isCustom: false,
  }

  return {
    id: 'claude',
    baseUrl: platform.baseUrl,
    apiKey: 'sk-ant-test-key',
    platform,
    model: platform.models[0],
    ...overrides,
  }
}

/**
 * 辅助函数：将 ThinkingChunk 异步迭代器聚合为数组
 */
async function collectChunks(iterator: AsyncIterableIterator<ThinkingChunk>): Promise<ThinkingChunk[]> {
  const chunks: ThinkingChunk[] = []
  for await (const chunk of iterator) {
    chunks.push(chunk)
  }
  return chunks
}

/**
 * 辅助函数：创建 mock fetch，返回 Anthropic 格式的 SSE chunks
 */
function createMockFetch(sseChunks: string[]): typeof fetch {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of sseChunks) {
        controller.enqueue(encoder.encode(chunk))
      }
      controller.close()
    },
  })

  return (() => {
    return Promise.resolve(
      new Response(stream, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      })
    )
  }) as unknown as typeof fetch
}

// ============================================================
// ClaudeAdapter 单元测试
// ============================================================

describe('ClaudeAdapter', () => {
  describe('basic properties', () => {
    it('should have correct name and supportsThinking', () => {
      const config = createTestConfig()
      const adapter = new ClaudeAdapter(config)

      expect(adapter.name).toBe('claude')
      expect(adapter.supportsThinking).toBe(true)
    })

    it('should have streamChat method', () => {
      const config = createTestConfig()
      const adapter = new ClaudeAdapter(config)

      expect(typeof adapter.streamChat).toBe('function')
    })
  })

  describe('streamChat with thinking blocks', () => {
    it('should parse thinking delta as thinking chunks', async () => {
      const sseChunks = [
        'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_123","type":"message","role":"assistant","content":[],"model":"claude-sonnet-4-20250514"}}\n\n',
        'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"thinking","thinking":""}}\n\n',
        'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"Let me analyze this problem."}}\n\n',
        'event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n',
        'event: content_block_start\ndata: {"type":"content_block_start","index":1,"content_block":{"type":"text","text":""}}\n\n',
        'event: content_block_delta\ndata: {"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"Here is the answer."}}\n\n',
        'event: content_block_stop\ndata: {"type":"content_block_stop","index":1}\n\n',
        'event: message_stop\ndata: {"type":"message_stop"}\n\n',
      ]

      const originalFetch = globalThis.fetch
      globalThis.fetch = createMockFetch(sseChunks)

      try {
        const config = createTestConfig()
        const adapter = new ClaudeAdapter(config)
        const chunks = await collectChunks(adapter.streamChat([]))

        const thinking = chunks.filter(c => c.type === 'thinking' && !c.done)
        const answers = chunks.filter(c => c.type === 'answer' && !c.done)
        const done = chunks.find(c => c.done)

        expect(thinking).toHaveLength(1)
        expect(thinking[0].content).toBe('Let me analyze this problem.')
        expect(answers).toHaveLength(1)
        expect(answers[0].content).toBe('Here is the answer.')
        expect(done).toBeDefined()
      } finally {
        globalThis.fetch = originalFetch
      }
    })

    it('should handle answer-only response (no thinking)', async () => {
      const sseChunks = [
        'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_123","type":"message","role":"assistant","content":[]}}\n\n',
        'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
        'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Just a normal answer."}}\n\n',
        'event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n',
        'event: message_stop\ndata: {"type":"message_stop"}\n\n',
      ]

      const originalFetch = globalThis.fetch
      globalThis.fetch = createMockFetch(sseChunks)

      try {
        const config = createTestConfig()
        const adapter = new ClaudeAdapter(config)
        const chunks = await collectChunks(adapter.streamChat([]))

        const thinking = chunks.filter(c => c.type === 'thinking' && !c.done)
        const answers = chunks.filter(c => c.type === 'answer' && !c.done)
        const done = chunks.find(c => c.done)

        expect(thinking).toHaveLength(0)
        expect(answers).toHaveLength(1)
        expect(answers[0].content).toBe('Just a normal answer.')
        expect(done).toBeDefined()
      } finally {
        globalThis.fetch = originalFetch
      }
    })

    it('should handle thinking-only response (no answer text)', async () => {
      const sseChunks = [
        'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_123","type":"message","role":"assistant","content":[]}}\n\n',
        'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"thinking","thinking":""}}\n\n',
        'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"Deep reasoning here"}}\n\n',
        'event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n',
        'event: message_stop\ndata: {"type":"message_stop"}\n\n',
      ]

      const originalFetch = globalThis.fetch
      globalThis.fetch = createMockFetch(sseChunks)

      try {
        const config = createTestConfig()
        const adapter = new ClaudeAdapter(config)
        const chunks = await collectChunks(adapter.streamChat([]))

        const thinking = chunks.filter(c => c.type === 'thinking' && !c.done)
        const answers = chunks.filter(c => c.type === 'answer' && !c.done)
        const done = chunks.find(c => c.done)

        expect(thinking).toHaveLength(1)
        expect(thinking[0].content).toBe('Deep reasoning here')
        expect(answers).toHaveLength(0)
        expect(done).toBeDefined()
        expect(done?.type).toBe('thinking')
      } finally {
        globalThis.fetch = originalFetch
      }
    })

    it('should handle multiple thinking deltas in same block', async () => {
      const sseChunks = [
        'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_123","type":"message","role":"assistant","content":[]}}\n\n',
        'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"thinking","thinking":""}}\n\n',
        'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"Step 1: analyze"}}\n\n',
        'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":" Step 2: conclude"}}\n\n',
        'event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n',
        'event: content_block_start\ndata: {"type":"content_block_start","index":1,"content_block":{"type":"text","text":""}}\n\n',
        'event: content_block_delta\ndata: {"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"The answer"}}\n\n',
        'event: content_block_delta\ndata: {"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":" is 42."}}\n\n',
        'event: content_block_stop\ndata: {"type":"content_block_stop","index":1}\n\n',
        'event: message_stop\ndata: {"type":"message_stop"}\n\n',
      ]

      const originalFetch = globalThis.fetch
      globalThis.fetch = createMockFetch(sseChunks)

      try {
        const config = createTestConfig()
        const adapter = new ClaudeAdapter(config)
        const chunks = await collectChunks(adapter.streamChat([]))

        const thinking = chunks.filter(c => c.type === 'thinking' && !c.done)
        const answers = chunks.filter(c => c.type === 'answer' && !c.done)

        const thinkingText = thinking.map(c => c.content).join('')
        expect(thinkingText).toBe('Step 1: analyze Step 2: conclude')

        const answerText = answers.map(c => c.content).join('')
        expect(answerText).toBe('The answer is 42.')
      } finally {
        globalThis.fetch = originalFetch
      }
    })
  })

  describe('streamChat request format', () => {
    it('should send correct headers and body', async () => {
      const sseChunks = [
        'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_123","type":"message","role":"assistant","content":[]}}\n\n',
        'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
        'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"hi"}}\n\n',
        'event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n',
        'event: message_stop\ndata: {"type":"message_stop"}\n\n',
      ]

      let capturedHeaders: Record<string, string> = {}
      let capturedBody = ''
      const originalFetch = globalThis.fetch
      globalThis.fetch = ((url: string, init?: RequestInit) => {
        capturedHeaders = Object.fromEntries(
          Object.entries(init?.headers as Record<string, string> || {})
        )
        capturedBody = init?.body as string || ''
        return createMockFetch(sseChunks)(url)
      }) as unknown as typeof fetch

      try {
        const config = createTestConfig({ apiKey: 'sk-ant-my-key' })
        const adapter = new ClaudeAdapter(config)
        await collectChunks(adapter.streamChat([]))

        // Anthropic 使用 x-api-key 而非 Authorization
        expect(capturedHeaders['x-api-key']).toBe('sk-ant-my-key')
        expect(capturedHeaders['anthropic-version']).toBe('2023-06-01')
        expect(capturedHeaders['Content-Type']).toBe('application/json')
        expect(capturedHeaders['Authorization']).toBeUndefined()
      } finally {
        globalThis.fetch = originalFetch
      }
    })

    it('should include thinking parameter with budget_tokens', async () => {
      const sseChunks = [
        'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_123","type":"message","role":"assistant","content":[]}}\n\n',
        'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
        'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"hi"}}\n\n',
        'event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n',
        'event: message_stop\ndata: {"type":"message_stop"}\n\n',
      ]

      let capturedBody = ''
      const originalFetch = globalThis.fetch
      globalThis.fetch = ((url: string, init?: RequestInit) => {
        capturedBody = init?.body as string || ''
        return createMockFetch(sseChunks)(url)
      }) as unknown as typeof fetch

      try {
        const config = createTestConfig()
        const adapter = new ClaudeAdapter(config)
        await collectChunks(adapter.streamChat([]))

        const body = JSON.parse(capturedBody)
        expect(body.thinking).toEqual({ type: 'enabled', budget_tokens: 10000 })
        expect(body.stream).toBe(true)
      } finally {
        globalThis.fetch = originalFetch
      }
    })

    it('should send messages in Anthropic format', async () => {
      const sseChunks = [
        'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_123","type":"message","role":"assistant","content":[]}}\n\n',
        'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
        'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"hi"}}\n\n',
        'event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n',
        'event: message_stop\ndata: {"type":"message_stop"}\n\n',
      ]

      let capturedBody = ''
      const originalFetch = globalThis.fetch
      globalThis.fetch = ((url: string, init?: RequestInit) => {
        capturedBody = init?.body as string || ''
        return createMockFetch(sseChunks)(url)
      }) as unknown as typeof fetch

      try {
        const config = createTestConfig()
        const adapter = new ClaudeAdapter(config)
        const messages = [
          { role: 'user' as const, content: 'Hello' },
          { role: 'assistant' as const, content: 'Hi there!' },
          { role: 'user' as const, content: 'How are you?' },
        ]
        await collectChunks(adapter.streamChat(messages))

        const body = JSON.parse(capturedBody)
        expect(body.model).toBe('claude-sonnet-4-20250514')
        expect(body.max_tokens).toBe(4096)
        expect(body.messages).toEqual([
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there!' },
          { role: 'user', content: 'How are you?' },
        ])
      } finally {
        globalThis.fetch = originalFetch
      }
    })
  })

  describe('streamChat URL construction', () => {
    it('should append /v1/messages to baseUrl', async () => {
      const sseChunks = [
        'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_123","type":"message","role":"assistant","content":[]}}\n\n',
        'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
        'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"hi"}}\n\n',
        'event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n',
        'event: message_stop\ndata: {"type":"message_stop"}\n\n',
      ]

      let capturedUrl = ''
      const originalFetch = globalThis.fetch
      globalThis.fetch = ((url: string) => {
        capturedUrl = url as string
        return createMockFetch(sseChunks)(url)
      }) as unknown as typeof fetch

      try {
        const config = createTestConfig({ baseUrl: 'https://api.anthropic.com' })
        const adapter = new ClaudeAdapter(config)
        await collectChunks(adapter.streamChat([]))

        expect(capturedUrl).toBe('https://api.anthropic.com/v1/messages')
      } finally {
        globalThis.fetch = originalFetch
      }
    })

    it('should not duplicate /v1/messages if already in baseUrl', async () => {
      const sseChunks = [
        'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_123","type":"message","role":"assistant","content":[]}}\n\n',
        'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
        'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"hi"}}\n\n',
        'event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n',
        'event: message_stop\ndata: {"type":"message_stop"}\n\n',
      ]

      let capturedUrl = ''
      const originalFetch = globalThis.fetch
      globalThis.fetch = ((url: string) => {
        capturedUrl = url as string
        return createMockFetch(sseChunks)(url)
      }) as unknown as typeof fetch

      try {
        const config = createTestConfig({ baseUrl: 'https://api.anthropic.com/v1/messages' })
        const adapter = new ClaudeAdapter(config)
        await collectChunks(adapter.streamChat([]))

        expect(capturedUrl).toBe('https://api.anthropic.com/v1/messages')
      } finally {
        globalThis.fetch = originalFetch
      }
    })

    it('should strip trailing slashes from baseUrl', async () => {
      const sseChunks = [
        'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_123","type":"message","role":"assistant","content":[]}}\n\n',
        'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
        'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"hi"}}\n\n',
        'event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n',
        'event: message_stop\ndata: {"type":"message_stop"}\n\n',
      ]

      let capturedUrl = ''
      const originalFetch = globalThis.fetch
      globalThis.fetch = ((url: string) => {
        capturedUrl = url as string
        return createMockFetch(sseChunks)(url)
      }) as unknown as typeof fetch

      try {
        const config = createTestConfig({ baseUrl: 'https://api.anthropic.com///' })
        const adapter = new ClaudeAdapter(config)
        await collectChunks(adapter.streamChat([]))

        expect(capturedUrl).toBe('https://api.anthropic.com/v1/messages')
      } finally {
        globalThis.fetch = originalFetch
      }
    })
  })

  describe('streamChat error handling', () => {
    it('should throw on API error response', async () => {
      const originalFetch = globalThis.fetch
      globalThis.fetch = (() => {
        return Promise.resolve(new Response('Invalid API key', { status: 401 }))
      }) as unknown as typeof fetch

      try {
        const config = createTestConfig()
        const adapter = new ClaudeAdapter(config)

        await expect(collectChunks(adapter.streamChat([]))).rejects.toThrow('Claude API error: 401')
      } finally {
        globalThis.fetch = originalFetch
      }
    })

    it('should throw on 429 rate limit', async () => {
      const originalFetch = globalThis.fetch
      globalThis.fetch = (() => {
        return Promise.resolve(new Response('Rate limit exceeded', { status: 429 }))
      }) as unknown as typeof fetch

      try {
        const config = createTestConfig()
        const adapter = new ClaudeAdapter(config)

        await expect(collectChunks(adapter.streamChat([]))).rejects.toThrow('Claude API error: 429')
      } finally {
        globalThis.fetch = originalFetch
      }
    })
  })

  describe('streamChat with empty/no-op deltas', () => {
    it('should skip unparseable JSON lines', async () => {
      const sseChunks = [
        'event: content_block_delta\ndata: not-json\n\n',
        'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
        'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"valid"}}\n\n',
        'event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n',
        'event: message_stop\ndata: {"type":"message_stop"}\n\n',
      ]

      const originalFetch = globalThis.fetch
      globalThis.fetch = createMockFetch(sseChunks)

      try {
        const config = createTestConfig()
        const adapter = new ClaudeAdapter(config)
        const chunks = await collectChunks(adapter.streamChat([]))

        const nonDone = chunks.filter(c => !c.done)
        expect(nonDone).toHaveLength(1)
        expect(nonDone[0].content).toBe('valid')
      } finally {
        globalThis.fetch = originalFetch
      }
    })

    it('should handle ping events gracefully', async () => {
      const sseChunks = [
        'event: ping\ndata: {"type":"ping"}\n\n',
        'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
        'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"hello"}}\n\n',
        'event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n',
        'event: message_stop\ndata: {"type":"message_stop"}\n\n',
      ]

      const originalFetch = globalThis.fetch
      globalThis.fetch = createMockFetch(sseChunks)

      try {
        const config = createTestConfig()
        const adapter = new ClaudeAdapter(config)
        const chunks = await collectChunks(adapter.streamChat([]))

        const nonDone = chunks.filter(c => !c.done)
        expect(nonDone).toHaveLength(1)
        expect(nonDone[0].content).toBe('hello')
      } finally {
        globalThis.fetch = originalFetch
      }
    })

    it('should handle empty delta gracefully', async () => {
      const sseChunks = [
        'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
        'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":""}}\n\n',
        'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"real content"}}\n\n',
        'event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n',
        'event: message_stop\ndata: {"type":"message_stop"}\n\n',
      ]

      const originalFetch = globalThis.fetch
      globalThis.fetch = createMockFetch(sseChunks)

      try {
        const config = createTestConfig()
        const adapter = new ClaudeAdapter(config)
        const chunks = await collectChunks(adapter.streamChat([]))

        const nonDone = chunks.filter(c => !c.done)
        expect(nonDone).toHaveLength(1)
        expect(nonDone[0].content).toBe('real content')
      } finally {
        globalThis.fetch = originalFetch
      }
    })
  })
})
