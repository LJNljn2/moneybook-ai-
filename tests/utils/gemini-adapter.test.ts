import { describe, it, expect } from 'vitest'
import { GeminiAdapter } from '../../src/utils/adapters/gemini-adapter'
import type { ThinkingChunk, ProviderConfig } from '../../src/utils/adapters/types'
import type { AiPlatform, ModelConfig } from '../../src/types'

/**
 * 辅助函数：创建测试用的 ProviderConfig
 */
function createTestConfig(overrides: Partial<ProviderConfig> = {}): ProviderConfig {
  const platform: AiPlatform = {
    id: 'gemini',
    name: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    models: [
      { name: 'gemini-2.5-pro', supportsThinking: true },
      { name: 'gemini-2.0-flash', supportsThinking: false },
    ],
    isCustom: false,
  }

  return {
    id: 'gemini',
    baseUrl: platform.baseUrl,
    apiKey: 'test-google-api-key',
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
 * 辅助函数：创建 mock fetch，返回 Gemini 格式的 SSE chunks
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
 * 辅助函数：生成 Gemini 格式的 SSE data 行
 */
function geminiSseData(obj: unknown): string {
  return `data: ${JSON.stringify(obj)}\n\n`
}

// ============================================================
// GeminiAdapter 单元测试
// ============================================================

describe('GeminiAdapter', () => {
  describe('basic properties', () => {
    it('should have correct name and supportsThinking', () => {
      const config = createTestConfig()
      const adapter = new GeminiAdapter(config)

      expect(adapter.name).toBe('gemini')
      expect(adapter.supportsThinking).toBe(true)
    })

    it('should have streamChat method', () => {
      const config = createTestConfig()
      const adapter = new GeminiAdapter(config)

      expect(typeof adapter.streamChat).toBe('function')
    })
  })

  describe('streamChat with thinking and answer', () => {
    it('should parse thought parts as thinking chunks', async () => {
      const sseChunks = [
        geminiSseData({
          candidates: [{
            content: {
              role: 'model',
              parts: [{ text: 'Let me analyze this.', thought: true }],
            },
          }],
        }),
        geminiSseData({
          candidates: [{
            content: {
              role: 'model',
              parts: [{ text: 'Here is the answer.' }],
            },
          }],
        }),
      ]

      const originalFetch = globalThis.fetch
      globalThis.fetch = createMockFetch(sseChunks)

      try {
        const config = createTestConfig()
        const adapter = new GeminiAdapter(config)
        const chunks = await collectChunks(adapter.streamChat([]))

        const thinking = chunks.filter(c => c.type === 'thinking' && !c.done)
        const answers = chunks.filter(c => c.type === 'answer' && !c.done)
        const done = chunks.find(c => c.done)

        expect(thinking).toHaveLength(1)
        expect(thinking[0].content).toBe('Let me analyze this.')
        expect(answers).toHaveLength(1)
        expect(answers[0].content).toBe('Here is the answer.')
        expect(done).toBeDefined()
      } finally {
        globalThis.fetch = originalFetch
      }
    })

    it('should handle answer-only response (no thinking)', async () => {
      const sseChunks = [
        geminiSseData({
          candidates: [{
            content: {
              role: 'model',
              parts: [{ text: 'Just a normal answer.' }],
            },
          }],
        }),
      ]

      const originalFetch = globalThis.fetch
      globalThis.fetch = createMockFetch(sseChunks)

      try {
        const config = createTestConfig()
        const adapter = new GeminiAdapter(config)
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
        geminiSseData({
          candidates: [{
            content: {
              role: 'model',
              parts: [{ text: 'Deep reasoning here', thought: true }],
            },
          }],
        }),
      ]

      const originalFetch = globalThis.fetch
      globalThis.fetch = createMockFetch(sseChunks)

      try {
        const config = createTestConfig()
        const adapter = new GeminiAdapter(config)
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

    it('should handle multiple thinking deltas', async () => {
      const sseChunks = [
        geminiSseData({
          candidates: [{
            content: {
              role: 'model',
              parts: [{ text: 'Step 1: analyze', thought: true }],
            },
          }],
        }),
        geminiSseData({
          candidates: [{
            content: {
              role: 'model',
              parts: [{ text: 'Step 2: conclude', thought: true }],
            },
          }],
        }),
        geminiSseData({
          candidates: [{
            content: {
              role: 'model',
              parts: [{ text: 'The answer is 42.' }],
            },
          }],
        }),
      ]

      const originalFetch = globalThis.fetch
      globalThis.fetch = createMockFetch(sseChunks)

      try {
        const config = createTestConfig()
        const adapter = new GeminiAdapter(config)
        const chunks = await collectChunks(adapter.streamChat([]))

        const thinking = chunks.filter(c => c.type === 'thinking' && !c.done)
        const answers = chunks.filter(c => c.type === 'answer' && !c.done)

        expect(thinking).toHaveLength(2)
        expect(thinking[0].content).toBe('Step 1: analyze')
        expect(thinking[1].content).toBe('Step 2: conclude')

        expect(answers).toHaveLength(1)
        expect(answers[0].content).toBe('The answer is 42.')
      } finally {
        globalThis.fetch = originalFetch
      }
    })
  })

  describe('streamChat with summary mode', () => {
    it('should emit hint when thinking is summary-only', async () => {
      const sseChunks = [
        geminiSseData({
          candidates: [{
            content: {
              role: 'model',
              parts: [{ text: '[思考摘要]用户询问天气情况', thought: true }],
            },
          }],
        }),
      ]

      const originalFetch = globalThis.fetch
      globalThis.fetch = createMockFetch(sseChunks)

      try {
        const config = createTestConfig()
        const adapter = new GeminiAdapter(config)
        const chunks = await collectChunks(adapter.streamChat([]))

        const thinking = chunks.filter(c => c.type === 'thinking' && !c.done)
        const answers = chunks.filter(c => c.type === 'answer')

        // 思考内容仍应输出（带前缀）
        expect(thinking).toHaveLength(1)
        expect(thinking[0].content).toBe('[思考摘要]用户询问天气情况')

        // 最后应有一个 answer chunk 带提示
        const hint = answers.find(c => c.done)
        expect(hint).toBeDefined()
        expect(hint?.content).toBe('（该模型仅返回思考摘要，完整思考过程未返回）')
      } finally {
        globalThis.fetch = originalFetch
      }
    })

    it('should NOT emit hint when full thinking is provided (non-summary thinking)', async () => {
      const sseChunks = [
        geminiSseData({
          candidates: [{
            content: {
              role: 'model',
              parts: [{ text: 'Full detailed thinking process here', thought: true }],
            },
          }],
        }),
        geminiSseData({
          candidates: [{
            content: {
              role: 'model',
              parts: [{ text: 'Here is the answer.' }],
            },
          }],
        }),
      ]

      const originalFetch = globalThis.fetch
      globalThis.fetch = createMockFetch(sseChunks)

      try {
        const config = createTestConfig()
        const adapter = new GeminiAdapter(config)
        const chunks = await collectChunks(adapter.streamChat([]))

        const answers = chunks.filter(c => c.type === 'answer')
        const done = answers.find(c => c.done)

        // 正常完成，不应有摘要提示
        expect(done).toBeDefined()
        expect(done?.content).not.toContain('思考摘要')
      } finally {
        globalThis.fetch = originalFetch
      }
    })

    it('should NOT emit hint when summary thinking is followed by answer', async () => {
      const sseChunks = [
        geminiSseData({
          candidates: [{
            content: {
              role: 'model',
              parts: [{ text: '[思考摘要]简短摘要', thought: true }],
            },
          }],
        }),
        geminiSseData({
          candidates: [{
            content: {
              role: 'model',
              parts: [{ text: 'Actual answer here.' }],
            },
          }],
        }),
      ]

      const originalFetch = globalThis.fetch
      globalThis.fetch = createMockFetch(sseChunks)

      try {
        const config = createTestConfig()
        const adapter = new GeminiAdapter(config)
        const chunks = await collectChunks(adapter.streamChat([]))

        const answers = chunks.filter(c => c.type === 'answer' && !c.done)
        const done = chunks.find(c => c.done)

        // 有实际答案，不应有摘要提示
        expect(answers).toHaveLength(1)
        expect(answers[0].content).toBe('Actual answer here.')
        expect(done?.content).not.toContain('思考摘要')
      } finally {
        globalThis.fetch = originalFetch
      }
    })
  })

  describe('streamChat request format', () => {
    it('should send correct URL with API key', async () => {
      const sseChunks = [geminiSseData({
        candidates: [{ content: { role: 'model', parts: [{ text: 'hi' }] } }],
      })]

      let capturedUrl = ''
      const originalFetch = globalThis.fetch
      globalThis.fetch = ((url: string) => {
        capturedUrl = url as string
        return createMockFetch(sseChunks)(url)
      }) as unknown as typeof fetch

      try {
        const config = createTestConfig({
          baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
          apiKey: 'my-google-key',
          model: { name: 'gemini-2.5-pro', supportsThinking: true },
        })
        const adapter = new GeminiAdapter(config)
        await collectChunks(adapter.streamChat([]))

        expect(capturedUrl).toContain('/models/gemini-2.5-pro:streamGenerateContent')
        expect(capturedUrl).toContain('alt=sse')
        expect(capturedUrl).toContain('key=my-google-key')
      } finally {
        globalThis.fetch = originalFetch
      }
    })

    it('should use API key as query parameter (not header)', async () => {
      const sseChunks = [geminiSseData({
        candidates: [{ content: { role: 'model', parts: [{ text: 'hi' }] } }],
      })]

      let capturedHeaders: Record<string, string> = {}
      const originalFetch = globalThis.fetch
      globalThis.fetch = ((_url: string, init?: RequestInit) => {
        capturedHeaders = Object.fromEntries(
          Object.entries(init?.headers as Record<string, string> || {})
        )
        return createMockFetch(sseChunks)(_url)
      }) as unknown as typeof fetch

      try {
        const config = createTestConfig()
        const adapter = new GeminiAdapter(config)
        await collectChunks(adapter.streamChat([]))

        // Gemini 使用 query parameter 鉴权，非 header
        expect(capturedHeaders['x-goog-api-key']).toBeUndefined()
        expect(capturedHeaders['Content-Type']).toBe('application/json')
      } finally {
        globalThis.fetch = originalFetch
      }
    })

    it('should send messages in Gemini format (contents with role mapping)', async () => {
      const sseChunks = [geminiSseData({
        candidates: [{ content: { role: 'model', parts: [{ text: 'hi' }] } }],
      })]

      let capturedBody = ''
      const originalFetch = globalThis.fetch
      globalThis.fetch = ((_url: string, init?: RequestInit) => {
        capturedBody = init?.body as string || ''
        return createMockFetch(sseChunks)(_url)
      }) as unknown as typeof fetch

      try {
        const config = createTestConfig()
        const adapter = new GeminiAdapter(config)
        const messages = [
          { role: 'user' as const, content: 'Hello' },
          { role: 'assistant' as const, content: 'Hi there!' },
          { role: 'user' as const, content: 'How are you?' },
        ]
        await collectChunks(adapter.streamChat(messages))

        const body = JSON.parse(capturedBody)
        expect(body.contents).toEqual([
          { role: 'user', parts: [{ text: 'Hello' }] },
          { role: 'model', parts: [{ text: 'Hi there!' }] },
          { role: 'user', parts: [{ text: 'How are you?' }] },
        ])
        expect(body.stream).toBe(true)
      } finally {
        globalThis.fetch = originalFetch
      }
    })
  })

  describe('streamChat URL construction', () => {
    it('should append streamGenerateContent path to baseUrl', async () => {
      const sseChunks = [geminiSseData({
        candidates: [{ content: { role: 'model', parts: [{ text: 'hi' }] } }],
      })]

      let capturedUrl = ''
      const originalFetch = globalThis.fetch
      globalThis.fetch = ((url: string) => {
        capturedUrl = url as string
        return createMockFetch(sseChunks)(url)
      }) as unknown as typeof fetch

      try {
        const config = createTestConfig({ baseUrl: 'https://generativelanguage.googleapis.com/v1beta' })
        const adapter = new GeminiAdapter(config)
        await collectChunks(adapter.streamChat([]))

        expect(capturedUrl).toContain('https://generativelanguage.googleapis.com/v1beta/models/')
        expect(capturedUrl).toContain(':streamGenerateContent')
      } finally {
        globalThis.fetch = originalFetch
      }
    })

    it('should strip trailing slashes from baseUrl', async () => {
      const sseChunks = [geminiSseData({
        candidates: [{ content: { role: 'model', parts: [{ text: 'hi' }] } }],
      })]

      let capturedUrl = ''
      const originalFetch = globalThis.fetch
      globalThis.fetch = ((url: string) => {
        capturedUrl = url as string
        return createMockFetch(sseChunks)(url)
      }) as unknown as typeof fetch

      try {
        const config = createTestConfig({ baseUrl: 'https://generativelanguage.googleapis.com/v1beta///' })
        const adapter = new GeminiAdapter(config)
        await collectChunks(adapter.streamChat([]))

        // Should not have double slashes from trailing slashes
        expect(capturedUrl).not.toMatch(/\/\/models/)
      } finally {
        globalThis.fetch = originalFetch
      }
    })

    it('should encode special characters in API key', async () => {
      const sseChunks = [geminiSseData({
        candidates: [{ content: { role: 'model', parts: [{ text: 'hi' }] } }],
      })]

      let capturedUrl = ''
      const originalFetch = globalThis.fetch
      globalThis.fetch = ((url: string) => {
        capturedUrl = url as string
        return createMockFetch(sseChunks)(url)
      }) as unknown as typeof fetch

      try {
        const config = createTestConfig({ apiKey: 'key with spaces&special=chars' })
        const adapter = new GeminiAdapter(config)
        await collectChunks(adapter.streamChat([]))

        expect(capturedUrl).toContain('key=key%20with%20spaces%26special%3Dchars')
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
        const adapter = new GeminiAdapter(config)

        await expect(collectChunks(adapter.streamChat([]))).rejects.toThrow('Gemini API error: 401')
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
        const adapter = new GeminiAdapter(config)

        await expect(collectChunks(adapter.streamChat([]))).rejects.toThrow('Gemini API error: 429')
      } finally {
        globalThis.fetch = originalFetch
      }
    })
  })

  describe('streamChat with empty/no-op deltas', () => {
    it('should skip unparseable JSON lines', async () => {
      const sseChunks = [
        'data: not-json\n\n',
        geminiSseData({
          candidates: [{ content: { role: 'model', parts: [{ text: 'valid' }] } }],
        }),
      ]

      const originalFetch = globalThis.fetch
      globalThis.fetch = createMockFetch(sseChunks)

      try {
        const config = createTestConfig()
        const adapter = new GeminiAdapter(config)
        const chunks = await collectChunks(adapter.streamChat([]))

        const nonDone = chunks.filter(c => !c.done)
        expect(nonDone).toHaveLength(1)
        expect(nonDone[0].content).toBe('valid')
      } finally {
        globalThis.fetch = originalFetch
      }
    })

    it('should skip parts with empty text', async () => {
      const sseChunks = [
        geminiSseData({
          candidates: [{ content: { role: 'model', parts: [{ text: '', thought: true }] } }],
        }),
        geminiSseData({
          candidates: [{ content: { role: 'model', parts: [{ text: 'real content' }] } }],
        }),
      ]

      const originalFetch = globalThis.fetch
      globalThis.fetch = createMockFetch(sseChunks)

      try {
        const config = createTestConfig()
        const adapter = new GeminiAdapter(config)
        const chunks = await collectChunks(adapter.streamChat([]))

        const nonDone = chunks.filter(c => !c.done)
        expect(nonDone).toHaveLength(1)
        expect(nonDone[0].content).toBe('real content')
      } finally {
        globalThis.fetch = originalFetch
      }
    })

    it('should handle empty candidates gracefully', async () => {
      const sseChunks = [
        geminiSseData({ candidates: [] }),
        geminiSseData({
          candidates: [{ content: { role: 'model', parts: [{ text: 'valid' }] } }],
        }),
      ]

      const originalFetch = globalThis.fetch
      globalThis.fetch = createMockFetch(sseChunks)

      try {
        const config = createTestConfig()
        const adapter = new GeminiAdapter(config)
        const chunks = await collectChunks(adapter.streamChat([]))

        const nonDone = chunks.filter(c => !c.done)
        expect(nonDone).toHaveLength(1)
        expect(nonDone[0].content).toBe('valid')
      } finally {
        globalThis.fetch = originalFetch
      }
    })
  })
})
