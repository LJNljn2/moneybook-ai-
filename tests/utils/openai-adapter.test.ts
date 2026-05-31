import { describe, it, expect } from 'vitest'
import { OpenAIAdapter } from '../../src/utils/adapters/openai-adapter'
import type { ThinkingChunk, ProviderConfig } from '../../src/utils/adapters/types'
import type { AiPlatform, ModelConfig } from '../../src/types'

/**
 * 辅助函数：创建测试用的 ProviderConfig
 */
function createTestConfig(overrides: Partial<ProviderConfig> = {}): ProviderConfig {
  const platform: AiPlatform = {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    models: [
      { name: 'gpt-4o', supportsThinking: false },
      { name: 'gpt-4o-mini', supportsThinking: false },
    ],
    isCustom: false,
  }

  return {
    id: 'openai',
    baseUrl: platform.baseUrl,
    apiKey: 'sk-test-key',
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
 * 辅助函数：创建 mock fetch，返回指定 SSE chunks
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

/**
 * 辅助函数：创建失败的 mock fetch
 */
function createErrorFetch(status: number, body: string): typeof fetch {
  return (() => {
    return Promise.resolve(new Response(body, { status }))
  }) as unknown as typeof fetch
}

// ============================================================
// OpenAIAdapter 单元测试
// ============================================================

describe('OpenAIAdapter', () => {
  describe('basic properties', () => {
    it('should have correct name and supportsThinking=false', () => {
      const config = createTestConfig()
      const adapter = new OpenAIAdapter(config)

      expect(adapter.name).toBe('openai')
      expect(adapter.supportsThinking).toBe(false)
    })

    it('should have streamChat method', () => {
      const config = createTestConfig()
      const adapter = new OpenAIAdapter(config)

      expect(typeof adapter.streamChat).toBe('function')
    })
  })

  describe('streamChat answer-only', () => {
    it('should parse all content as answer chunks', async () => {
      const sseChunks = [
        'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":" world"}}]}\n\n',
        'data: [DONE]\n\n',
      ]

      const originalFetch = globalThis.fetch
      globalThis.fetch = createMockFetch(sseChunks)

      try {
        const config = createTestConfig()
        const adapter = new OpenAIAdapter(config)
        const chunks = await collectChunks(adapter.streamChat([]))

        const thinking = chunks.filter(c => c.type === 'thinking' && !c.done)
        const answers = chunks.filter(c => c.type === 'answer' && !c.done)
        const done = chunks.find(c => c.done)

        expect(thinking).toHaveLength(0)
        expect(answers).toHaveLength(2)
        expect(answers[0].content).toBe('Hello')
        expect(answers[1].content).toBe(' world')
        expect(done).toBeDefined()
        expect(done?.type).toBe('answer')
      } finally {
        globalThis.fetch = originalFetch
      }
    })

    it('should handle multi-chunk response', async () => {
      const sseChunks = [
        'data: {"choices":[{"delta":{"content":"The"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":" answer"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":" is"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":" 42."}}]}\n\n',
        'data: [DONE]\n\n',
      ]

      const originalFetch = globalThis.fetch
      globalThis.fetch = createMockFetch(sseChunks)

      try {
        const config = createTestConfig()
        const adapter = new OpenAIAdapter(config)
        const chunks = await collectChunks(adapter.streamChat([]))

        const answers = chunks.filter(c => c.type === 'answer' && !c.done)
        expect(answers).toHaveLength(4)

        const fullAnswer = answers.map(c => c.content).join('')
        expect(fullAnswer).toBe('The answer is 42.')
      } finally {
        globalThis.fetch = originalFetch
      }
    })

    it('should handle empty response (no content deltas)', async () => {
      const sseChunks = [
        'data: {"choices":[{"delta":{}}]}\n\n',
        'data: {"choices":[{"delta":{}}]}\n\n',
        'data: [DONE]\n\n',
      ]

      const originalFetch = globalThis.fetch
      globalThis.fetch = createMockFetch(sseChunks)

      try {
        const config = createTestConfig()
        const adapter = new OpenAIAdapter(config)
        const chunks = await collectChunks(adapter.streamChat([]))

        const nonDone = chunks.filter(c => !c.done)
        expect(nonDone).toHaveLength(0)

        const done = chunks.find(c => c.done)
        expect(done).toBeDefined()
        expect(done?.type).toBe('answer')
      } finally {
        globalThis.fetch = originalFetch
      }
    })
  })

  describe('streamChat error handling', () => {
    it('should throw on 401 unauthorized', async () => {
      const originalFetch = globalThis.fetch
      globalThis.fetch = createErrorFetch(401, 'Invalid API key')

      try {
        const config = createTestConfig()
        const adapter = new OpenAIAdapter(config)
        const iterator = adapter.streamChat([])

        await expect(collectChunks(iterator)).rejects.toThrow('OpenAI API error: 401')
      } finally {
        globalThis.fetch = originalFetch
      }
    })

    it('should throw on 429 rate limit', async () => {
      const originalFetch = globalThis.fetch
      globalThis.fetch = createErrorFetch(429, 'Rate limit exceeded')

      try {
        const config = createTestConfig()
        const adapter = new OpenAIAdapter(config)
        const iterator = adapter.streamChat([])

        await expect(collectChunks(iterator)).rejects.toThrow('OpenAI API error: 429')
      } finally {
        globalThis.fetch = originalFetch
      }
    })

    it('should throw on 500 server error', async () => {
      const originalFetch = globalThis.fetch
      globalThis.fetch = createErrorFetch(500, 'Internal Server Error')

      try {
        const config = createTestConfig()
        const adapter = new OpenAIAdapter(config)
        const iterator = adapter.streamChat([])

        await expect(collectChunks(iterator)).rejects.toThrow('OpenAI API error: 500')
      } finally {
        globalThis.fetch = originalFetch
      }
    })
  })

  describe('streamChat URL construction', () => {
    it('should append /chat/completions if not present', async () => {
      const sseChunks = ['data: {"choices":[{"delta":{"content":"hi"}}]}\n\n', 'data: [DONE]\n\n']

      let capturedUrl = ''
      const originalFetch = globalThis.fetch
      globalThis.fetch = ((url: string) => {
        capturedUrl = url
        return createMockFetch(sseChunks)(url)
      }) as unknown as typeof fetch

      try {
        const config = createTestConfig({ baseUrl: 'https://api.openai.com/v1' })
        const adapter = new OpenAIAdapter(config)
        await collectChunks(adapter.streamChat([]))

        expect(capturedUrl).toBe('https://api.openai.com/v1/chat/completions')
      } finally {
        globalThis.fetch = originalFetch
      }
    })

    it('should not duplicate /chat/completions if already present', async () => {
      const sseChunks = ['data: {"choices":[{"delta":{"content":"hi"}}]}\n\n', 'data: [DONE]\n\n']

      let capturedUrl = ''
      const originalFetch = globalThis.fetch
      globalThis.fetch = ((url: string) => {
        capturedUrl = url
        return createMockFetch(sseChunks)(url)
      }) as unknown as typeof fetch

      try {
        const config = createTestConfig({ baseUrl: 'https://api.openai.com/v1/chat/completions' })
        const adapter = new OpenAIAdapter(config)
        await collectChunks(adapter.streamChat([]))

        expect(capturedUrl).toBe('https://api.openai.com/v1/chat/completions')
      } finally {
        globalThis.fetch = originalFetch
      }
    })

    it('should strip trailing slashes from baseUrl', async () => {
      const sseChunks = ['data: {"choices":[{"delta":{"content":"hi"}}]}\n\n', 'data: [DONE]\n\n']

      let capturedUrl = ''
      const originalFetch = globalThis.fetch
      globalThis.fetch = ((url: string) => {
        capturedUrl = url
        return createMockFetch(sseChunks)(url)
      }) as unknown as typeof fetch

      try {
        const config = createTestConfig({ baseUrl: 'https://api.openai.com/v1///' })
        const adapter = new OpenAIAdapter(config)
        await collectChunks(adapter.streamChat([]))

        expect(capturedUrl).toBe('https://api.openai.com/v1/chat/completions')
      } finally {
        globalThis.fetch = originalFetch
      }
    })
  })

  describe('streamChat request format', () => {
    it('should send correct authorization header', async () => {
      const sseChunks = ['data: {"choices":[{"delta":{"content":"hi"}}]}\n\n', 'data: [DONE]\n\n']

      let capturedHeaders: Record<string, string> = {}
      const originalFetch = globalThis.fetch
      globalThis.fetch = ((url: string, init?: RequestInit) => {
        capturedHeaders = Object.fromEntries(
          Object.entries(init?.headers as Record<string, string> || {})
        )
        return createMockFetch(sseChunks)(url)
      }) as unknown as typeof fetch

      try {
        const config = createTestConfig({ apiKey: 'sk-my-secret-key' })
        const adapter = new OpenAIAdapter(config)
        await collectChunks(adapter.streamChat([]))

        expect(capturedHeaders['Authorization']).toBe('Bearer sk-my-secret-key')
        expect(capturedHeaders['Content-Type']).toBe('application/json')
      } finally {
        globalThis.fetch = originalFetch
      }
    })

    it('should send messages in OpenAI format', async () => {
      const sseChunks = ['data: {"choices":[{"delta":{"content":"hi"}}]}\n\n', 'data: [DONE]\n\n']

      let capturedBody = ''
      const originalFetch = globalThis.fetch
      globalThis.fetch = ((url: string, init?: RequestInit) => {
        capturedBody = init?.body as string || ''
        return createMockFetch(sseChunks)(url)
      }) as unknown as typeof fetch

      try {
        const config = createTestConfig()
        const adapter = new OpenAIAdapter(config)
        const messages = [
          { role: 'user' as const, content: 'Hello' },
          { role: 'assistant' as const, content: 'Hi there!' },
          { role: 'user' as const, content: 'How are you?' },
        ]
        await collectChunks(adapter.streamChat(messages))

        const body = JSON.parse(capturedBody)
        expect(body.model).toBe('gpt-4o')
        expect(body.stream).toBe(true)
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

  describe('streamChat with edge cases', () => {
    it('should skip empty delta content', async () => {
      const sseChunks = [
        'data: {"choices":[{"delta":{}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"real content"}}]}\n\n',
        'data: {"choices":[{"delta":{}}]}\n\n',
        'data: [DONE]\n\n',
      ]

      const originalFetch = globalThis.fetch
      globalThis.fetch = createMockFetch(sseChunks)

      try {
        const config = createTestConfig()
        const adapter = new OpenAIAdapter(config)
        const chunks = await collectChunks(adapter.streamChat([]))

        const nonDone = chunks.filter(c => !c.done)
        expect(nonDone).toHaveLength(1)
        expect(nonDone[0].content).toBe('real content')
      } finally {
        globalThis.fetch = originalFetch
      }
    })

    it('should skip unparseable JSON lines', async () => {
      const sseChunks = [
        'data: not-json\n\n',
        'data: {"choices":[{"delta":{"content":"valid"}}]}\n\n',
        'data: [DONE]\n\n',
      ]

      const originalFetch = globalThis.fetch
      globalThis.fetch = createMockFetch(sseChunks)

      try {
        const config = createTestConfig()
        const adapter = new OpenAIAdapter(config)
        const chunks = await collectChunks(adapter.streamChat([]))

        const nonDone = chunks.filter(c => !c.done)
        expect(nonDone).toHaveLength(1)
        expect(nonDone[0].content).toBe('valid')
      } finally {
        globalThis.fetch = originalFetch
      }
    })

    it('should emit done chunk with type answer', async () => {
      const sseChunks = [
        'data: {"choices":[{"delta":{"content":"response"}}]}\n\n',
        'data: [DONE]\n\n',
      ]

      const originalFetch = globalThis.fetch
      globalThis.fetch = createMockFetch(sseChunks)

      try {
        const config = createTestConfig()
        const adapter = new OpenAIAdapter(config)
        const chunks = await collectChunks(adapter.streamChat([]))

        const done = chunks.find(c => c.done)
        expect(done).toBeDefined()
        expect(done?.type).toBe('answer')
        expect(done?.content).toBe('')
        expect(done?.done).toBe(true)
      } finally {
        globalThis.fetch = originalFetch
      }
    })
  })
})
