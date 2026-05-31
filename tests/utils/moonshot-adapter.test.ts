import { describe, it, expect } from 'vitest'
import { MoonshotAdapter } from '../../src/utils/adapters/moonshot-adapter'
import type { ThinkingChunk, ProviderConfig } from '../../src/utils/adapters/types'
import type { AiPlatform, ModelConfig } from '../../src/types'

/**
 * 辅助函数：创建测试用的 ProviderConfig
 */
function createTestConfig(overrides: Partial<ProviderConfig> = {}): ProviderConfig {
  const platform: AiPlatform = {
    id: 'moonshot',
    name: '月之暗面',
    baseUrl: 'https://api.moonshot.cn/v1',
    models: [
      { name: 'moonshot-v1-8k', supportsThinking: false },
      { name: 'moonshot-v1-128k', supportsThinking: true },
    ],
    isCustom: false,
  }

  return {
    id: 'moonshot',
    baseUrl: platform.baseUrl,
    apiKey: 'sk-test-key',
    platform,
    model: platform.models[1],
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
// MoonshotAdapter 单元测试
// ============================================================

describe('MoonshotAdapter', () => {
  describe('basic properties', () => {
    it('should have correct name and supportsThinking', () => {
      const config = createTestConfig()
      const adapter = new MoonshotAdapter(config)

      expect(adapter.name).toBe('moonshot')
      expect(adapter.supportsThinking).toBe(true)
    })

    it('should have streamChat method', () => {
      const config = createTestConfig()
      const adapter = new MoonshotAdapter(config)

      expect(typeof adapter.streamChat).toBe('function')
    })
  })

  describe('streamChat with reasoning_content', () => {
    it('should parse reasoning_content as thinking chunks', async () => {
      const sseChunks = [
        'data: {"choices":[{"delta":{"reasoning_content":"Let me think about this."}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"Here is the answer."}}]}\n\n',
        'data: [DONE]\n\n',
      ]

      const originalFetch = globalThis.fetch
      globalThis.fetch = createMockFetch(sseChunks)

      try {
        const config = createTestConfig()
        const adapter = new MoonshotAdapter(config)
        const chunks = await collectChunks(adapter.streamChat([]))

        const thinking = chunks.filter(c => c.type === 'thinking' && !c.done)
        const answers = chunks.filter(c => c.type === 'answer' && !c.done)
        const done = chunks.find(c => c.done)

        expect(thinking).toHaveLength(1)
        expect(thinking[0].content).toBe('Let me think about this.')
        expect(answers).toHaveLength(1)
        expect(answers[0].content).toBe('Here is the answer.')
        expect(done).toBeDefined()
      } finally {
        globalThis.fetch = originalFetch
      }
    })

    it('should handle answer-only response (no thinking)', async () => {
      const sseChunks = [
        'data: {"choices":[{"delta":{"content":"Just a normal answer."}}]}\n\n',
        'data: [DONE]\n\n',
      ]

      const originalFetch = globalThis.fetch
      globalThis.fetch = createMockFetch(sseChunks)

      try {
        const config = createTestConfig()
        const adapter = new MoonshotAdapter(config)
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

    it('should handle thinking-only response (no answer)', async () => {
      const sseChunks = [
        'data: {"choices":[{"delta":{"reasoning_content":"Deep reasoning here"}}]}\n\n',
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
        'data: [DONE]\n\n',
      ]

      const originalFetch = globalThis.fetch
      globalThis.fetch = createMockFetch(sseChunks)

      try {
        const config = createTestConfig()
        const adapter = new MoonshotAdapter(config)
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

    it('should handle alternating reasoning_content and content in same stream', async () => {
      const sseChunks = [
        'data: {"choices":[{"delta":{"reasoning_content":"step 1: analyze"}}]}\n\n',
        'data: {"choices":[{"delta":{"reasoning_content":" step 2: conclude"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"Based on my analysis"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":", the answer is 42."}}]}\n\n',
        'data: [DONE]\n\n',
      ]

      const originalFetch = globalThis.fetch
      globalThis.fetch = createMockFetch(sseChunks)

      try {
        const config = createTestConfig()
        const adapter = new MoonshotAdapter(config)
        const chunks = await collectChunks(adapter.streamChat([]))

        const thinking = chunks.filter(c => c.type === 'thinking' && !c.done)
        const answers = chunks.filter(c => c.type === 'answer' && !c.done)

        const thinkingText = thinking.map(c => c.content).join('')
        expect(thinkingText).toBe('step 1: analyze step 2: conclude')

        const answerText = answers.map(c => c.content).join('')
        expect(answerText).toBe('Based on my analysis, the answer is 42.')
      } finally {
        globalThis.fetch = originalFetch
      }
    })

    it('should handle both reasoning_content and content in same delta', async () => {
      const sseChunks = [
        'data: {"choices":[{"delta":{"reasoning_content":"thinking...","content":"answer..."}}]}\n\n',
        'data: [DONE]\n\n',
      ]

      const originalFetch = globalThis.fetch
      globalThis.fetch = createMockFetch(sseChunks)

      try {
        const config = createTestConfig()
        const adapter = new MoonshotAdapter(config)
        const chunks = await collectChunks(adapter.streamChat([]))

        const thinking = chunks.filter(c => c.type === 'thinking' && !c.done)
        const answers = chunks.filter(c => c.type === 'answer' && !c.done)

        expect(thinking).toHaveLength(1)
        expect(thinking[0].content).toBe('thinking...')
        expect(answers).toHaveLength(1)
        expect(answers[0].content).toBe('answer...')
      } finally {
        globalThis.fetch = originalFetch
      }
    })
  })

  describe('streamChat error handling', () => {
    it('should throw on API error response', async () => {
      const originalFetch = globalThis.fetch
      globalThis.fetch = createErrorFetch(401, 'Invalid API key')

      try {
        const config = createTestConfig()
        const adapter = new MoonshotAdapter(config)
        const iterator = adapter.streamChat([])

        await expect(collectChunks(iterator)).rejects.toThrow('Moonshot API error: 401')
      } finally {
        globalThis.fetch = originalFetch
      }
    })

    it('should throw on 500 server error', async () => {
      const originalFetch = globalThis.fetch
      globalThis.fetch = createErrorFetch(500, 'Internal Server Error')

      try {
        const config = createTestConfig()
        const adapter = new MoonshotAdapter(config)
        const iterator = adapter.streamChat([])

        await expect(collectChunks(iterator)).rejects.toThrow('Moonshot API error: 500')
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
        const config = createTestConfig({ baseUrl: 'https://api.moonshot.cn/v1' })
        const adapter = new MoonshotAdapter(config)
        await collectChunks(adapter.streamChat([]))

        expect(capturedUrl).toBe('https://api.moonshot.cn/v1/chat/completions')
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
        const config = createTestConfig({ baseUrl: 'https://api.moonshot.cn/v1/chat/completions' })
        const adapter = new MoonshotAdapter(config)
        await collectChunks(adapter.streamChat([]))

        expect(capturedUrl).toBe('https://api.moonshot.cn/v1/chat/completions')
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
        const config = createTestConfig({ baseUrl: 'https://api.moonshot.cn/v1///' })
        const adapter = new MoonshotAdapter(config)
        await collectChunks(adapter.streamChat([]))

        expect(capturedUrl).toBe('https://api.moonshot.cn/v1/chat/completions')
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
        const adapter = new MoonshotAdapter(config)
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
        const adapter = new MoonshotAdapter(config)
        const messages = [
          { role: 'user' as const, content: 'Hello' },
          { role: 'assistant' as const, content: 'Hi there!' },
          { role: 'user' as const, content: 'How are you?' },
        ]
        await collectChunks(adapter.streamChat(messages))

        const body = JSON.parse(capturedBody)
        expect(body.model).toBe('moonshot-v1-128k')
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

  describe('streamChat with empty/no-op deltas', () => {
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
        const adapter = new MoonshotAdapter(config)
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
        const adapter = new MoonshotAdapter(config)
        const chunks = await collectChunks(adapter.streamChat([]))

        const nonDone = chunks.filter(c => !c.done)
        expect(nonDone).toHaveLength(1)
        expect(nonDone[0].content).toBe('valid')
      } finally {
        globalThis.fetch = originalFetch
      }
    })
  })

  describe('streamChat with empty reasoning_content', () => {
    it('should not emit thinking chunk for empty reasoning_content', async () => {
      const sseChunks = [
        'data: {"choices":[{"delta":{"reasoning_content":""}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"answer"}}]}\n\n',
        'data: [DONE]\n\n',
      ]

      const originalFetch = globalThis.fetch
      globalThis.fetch = createMockFetch(sseChunks)

      try {
        const config = createTestConfig()
        const adapter = new MoonshotAdapter(config)
        const chunks = await collectChunks(adapter.streamChat([]))

        const thinking = chunks.filter(c => c.type === 'thinking' && !c.done)
        const answers = chunks.filter(c => c.type === 'answer' && !c.done)

        // 空字符串是 falsy，不会触发 thinking chunk
        expect(thinking).toHaveLength(0)
        expect(answers).toHaveLength(1)
        expect(answers[0].content).toBe('answer')
      } finally {
        globalThis.fetch = originalFetch
      }
    })
  })
})
