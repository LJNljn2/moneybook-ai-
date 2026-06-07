import { describe, it, expect } from 'vitest'
import { ErnieAdapter } from '../../src/utils/adapters/ernie-adapter'
import type { ThinkingChunk, ProviderConfig } from '../../src/utils/adapters/types'
import type { AiPlatform, ModelConfig } from '../../src/types'

/**
 * 辅助函数：创建测试用的 ProviderConfig
 */
function createTestConfig(overrides: Partial<ProviderConfig> = {}): ProviderConfig {
  const platform: AiPlatform = {
    id: 'ernie',
    name: '百度文心',
    baseUrl: 'https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop',
    models: [
      { name: 'ernie-4.5-turbo', supportsThinking: false },
      { name: 'ernie-4.5-thinking', supportsThinking: true },
    ],
    isCustom: false,
  }

  return {
    id: 'ernie',
    baseUrl: platform.baseUrl,
    apiKey: 'test-api-key:test-secret-key',
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
 * 辅助函数：创建带 token 响应的 mock fetch（第一步返回 token，第二步返回 SSE）
 */
function createAuthThenChatFetch(tokenResponse: object, sseChunks: string[]): typeof fetch {
  let callCount = 0
  const encoder = new TextEncoder()

  return ((url: string) => {
    callCount++
    if (callCount === 1) {
      // Token 请求
      return Promise.resolve(
        new Response(JSON.stringify(tokenResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    }
    // Chat 请求
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of sseChunks) {
          controller.enqueue(encoder.encode(chunk))
        }
        controller.close()
      },
    })
    return Promise.resolve(
      new Response(stream, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      })
    )
  }) as unknown as typeof fetch
}

// ============================================================
// ErnieAdapter 单元测试
// ============================================================

describe('ErnieAdapter', () => {
  describe('basic properties', () => {
    it('should have correct name and supportsThinking', () => {
      const config = createTestConfig()
      const adapter = new ErnieAdapter(config)

      expect(adapter.name).toBe('ernie')
      expect(adapter.supportsThinking).toBe(true)
    })

    it('should have streamChat method', () => {
      const config = createTestConfig()
      const adapter = new ErnieAdapter(config)

      expect(typeof adapter.streamChat).toBe('function')
    })
  })

  describe('apiKey parsing', () => {
    it('should throw on invalid apiKey format (no colon)', async () => {
      const config = createTestConfig({ apiKey: 'invalid-key-no-colon' })
      const adapter = new ErnieAdapter(config)

      // streamChat 返回异步迭代器，parseApiKey 错误在 Promise 内抛出
      await expect(collectChunks(adapter.streamChat([]))).rejects.toThrow(
        'Ernie adapter requires apiKey in format "API_KEY:SECRET_KEY"'
      )
    })

    it('should throw on empty apiKey', async () => {
      const config = createTestConfig({ apiKey: '' })
      const adapter = new ErnieAdapter(config)

      await expect(collectChunks(adapter.streamChat([]))).rejects.toThrow(
        'Ernie adapter requires apiKey in format "API_KEY:SECRET_KEY"'
      )
    })

    it('should handle apiKey with Bearer prefix', async () => {
      const sseChunks = [
        'data: {"choices":[{"delta":{"content":"hello"}}]}\n\n',
        'data: [DONE]\n\n',
      ]

      const originalFetch = globalThis.fetch
      globalThis.fetch = createAuthThenChatFetch(
        { access_token: 'bearer-resolved-token' },
        sseChunks
      )

      try {
        const config = createTestConfig({ apiKey: 'Bearer bearer-api-key:bearer-secret-key' })
        const adapter = new ErnieAdapter(config)
        const chunks = await collectChunks(adapter.streamChat([]))

        expect(chunks.filter(c => !c.done)).toHaveLength(1)
      } finally {
        globalThis.fetch = originalFetch
      }
    })
  })

  describe('streamChat with thinking field', () => {
    it('should parse thinking field as thinking chunks', async () => {
      const sseChunks = [
        'data: {"choices":[{"delta":{"thinking":"Let me analyze this."}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"Here is the answer."}}]}\n\n',
        'data: [DONE]\n\n',
      ]

      const originalFetch = globalThis.fetch
      globalThis.fetch = createAuthThenChatFetch(
        { access_token: 'thinking-test-token' },
        sseChunks
      )

      try {
        const config = createTestConfig({ apiKey: 'thinking-key:thinking-secret' })
        const adapter = new ErnieAdapter(config)
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
        'data: {"choices":[{"delta":{"content":"Just a normal answer."}}]}\n\n',
        'data: [DONE]\n\n',
      ]

      const originalFetch = globalThis.fetch
      globalThis.fetch = createAuthThenChatFetch(
        { access_token: 'answer-only-token' },
        sseChunks
      )

      try {
        const config = createTestConfig({ apiKey: 'answer-only-key:answer-only-secret' })
        const adapter = new ErnieAdapter(config)
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
        'data: {"choices":[{"delta":{"thinking":"Deep reasoning here"}}]}\n\n',
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
        'data: [DONE]\n\n',
      ]

      const originalFetch = globalThis.fetch
      globalThis.fetch = createAuthThenChatFetch(
        { access_token: 'thinking-only-token' },
        sseChunks
      )

      try {
        const config = createTestConfig({ apiKey: 'thinking-only-key:thinking-only-secret' })
        const adapter = new ErnieAdapter(config)
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

    it('should handle alternating thinking and content in same stream', async () => {
      const sseChunks = [
        'data: {"choices":[{"delta":{"thinking":"step 1: analyze"}}]}\n\n',
        'data: {"choices":[{"delta":{"thinking":" step 2: conclude"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"Based on my analysis"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":", the answer is 42."}}]}\n\n',
        'data: [DONE]\n\n',
      ]

      const originalFetch = globalThis.fetch
      globalThis.fetch = createAuthThenChatFetch(
        { access_token: 'alternating-token' },
        sseChunks
      )

      try {
        const config = createTestConfig({ apiKey: 'alternating-key:alternating-secret' })
        const adapter = new ErnieAdapter(config)
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

    it('should handle both thinking and content in same delta', async () => {
      const sseChunks = [
        'data: {"choices":[{"delta":{"thinking":"thinking...","content":"answer..."}}]}\n\n',
        'data: [DONE]\n\n',
      ]

      const originalFetch = globalThis.fetch
      globalThis.fetch = createAuthThenChatFetch(
        { access_token: 'both-fields-token' },
        sseChunks
      )

      try {
        const config = createTestConfig({ apiKey: 'both-fields-key:both-fields-secret' })
        const adapter = new ErnieAdapter(config)
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

  describe('authentication flow', () => {
    it('should request access_token before chat', async () => {
      const sseChunks = [
        'data: {"choices":[{"delta":{"content":"hello"}}]}\n\n',
        'data: [DONE]\n\n',
      ]

      const fetchUrls: string[] = []
      const originalFetch = globalThis.fetch
      globalThis.fetch = ((url: string) => {
        fetchUrls.push(url as string)
        if ((url as string).includes('oauth/2.0/token')) {
          return Promise.resolve(
            new Response(JSON.stringify({ access_token: 'resolved-token' }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            })
          )
        }
        return createMockFetch(sseChunks)(url)
      }) as unknown as typeof fetch

      try {
        const config = createTestConfig({ apiKey: 'my-api-key:my-secret-key' })
        const adapter = new ErnieAdapter(config)
        await collectChunks(adapter.streamChat([]))

        // 第一次调用是 token 请求
        expect(fetchUrls[0]).toContain('oauth/2.0/token')
        expect(fetchUrls[0]).toContain('client_id=my-api-key')
        expect(fetchUrls[0]).toContain('client_secret=my-secret-key')

        // 第二次调用是 chat 请求
        expect(fetchUrls[1]).toContain('access_token=resolved-token')
      } finally {
        globalThis.fetch = originalFetch
      }
    })

    it('should throw on auth error response', async () => {
      const originalFetch = globalThis.fetch
      globalThis.fetch = (() => {
        return Promise.resolve(new Response('Unauthorized', { status: 401 }))
      }) as unknown as typeof fetch

      try {
        const config = createTestConfig({ apiKey: 'bad-key:bad-secret' })
        const adapter = new ErnieAdapter(config)

        await expect(collectChunks(adapter.streamChat([]))).rejects.toThrow('Ernie auth error: 401')
      } finally {
        globalThis.fetch = originalFetch
      }
    })

    it('should throw on token response with error field', async () => {
      const originalFetch = globalThis.fetch
      globalThis.fetch = (() => {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              error: 'invalid_client',
              error_description: 'Invalid API key or secret',
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }
          )
        )
      }) as unknown as typeof fetch

      try {
        const config = createTestConfig({ apiKey: 'wrong-key:wrong-secret' })
        const adapter = new ErnieAdapter(config)

        await expect(collectChunks(adapter.streamChat([]))).rejects.toThrow(
          'Ernie auth error: invalid_client - Invalid API key or secret'
        )
      } finally {
        globalThis.fetch = originalFetch
      }
    })

    it('should throw when token response has no access_token', async () => {
      const originalFetch = globalThis.fetch
      globalThis.fetch = (() => {
        return Promise.resolve(
          new Response(JSON.stringify({}), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        )
      }) as unknown as typeof fetch

      try {
        const config = createTestConfig({ apiKey: 'empty-resp-key:empty-resp-secret' })
        const adapter = new ErnieAdapter(config)

        await expect(collectChunks(adapter.streamChat([]))).rejects.toThrow('Ernie auth error')
      } finally {
        globalThis.fetch = originalFetch
      }
    })
  })

  describe('streamChat error handling', () => {
    it('should throw on API error response', async () => {
      let callCount = 0
      const originalFetch = globalThis.fetch
      globalThis.fetch = ((url: string) => {
        callCount++
        if ((url as string).includes('oauth/2.0/token')) {
          return Promise.resolve(
            new Response(JSON.stringify({ access_token: 'err-test-token' }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            })
          )
        }
        // Chat request returns error
        return Promise.resolve(new Response('Invalid API key', { status: 401 }))
      }) as unknown as typeof fetch

      try {
        const config = createTestConfig({ apiKey: 'err-key:err-secret' })
        const adapter = new ErnieAdapter(config)

        await expect(collectChunks(adapter.streamChat([]))).rejects.toThrow('Ernie API error: 401')
      } finally {
        globalThis.fetch = originalFetch
      }
    })
  })

  describe('streamChat URL construction', () => {
    it('should append /chat/modelName and access_token to baseUrl', async () => {
      const sseChunks = [
        'data: {"choices":[{"delta":{"content":"hi"}}]}\n\n',
        'data: [DONE]\n\n',
      ]

      let capturedUrl = ''
      const originalFetch = globalThis.fetch
      globalThis.fetch = ((url: string) => {
        if ((url as string).includes('oauth/2.0/token')) {
          return Promise.resolve(
            new Response(JSON.stringify({ access_token: 'url-test-token' }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            })
          )
        }
        capturedUrl = url as string
        return createMockFetch(sseChunks)(url)
      }) as unknown as typeof fetch

      try {
        const config = createTestConfig({
          baseUrl: 'https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop',
          apiKey: 'url-test-key:url-test-secret',
        })
        const adapter = new ErnieAdapter(config)
        await collectChunks(adapter.streamChat([]))

        expect(capturedUrl).toBe(
          'https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop/chat/ernie-4.5-thinking?access_token=url-test-token'
        )
      } finally {
        globalThis.fetch = originalFetch
      }
    })

    it('should strip trailing slashes from baseUrl', async () => {
      const sseChunks = [
        'data: {"choices":[{"delta":{"content":"hi"}}]}\n\n',
        'data: [DONE]\n\n',
      ]

      let capturedUrl = ''
      const originalFetch = globalThis.fetch
      globalThis.fetch = ((url: string) => {
        if ((url as string).includes('oauth/2.0/token')) {
          return Promise.resolve(
            new Response(JSON.stringify({ access_token: 'slash-test-token' }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            })
          )
        }
        capturedUrl = url as string
        return createMockFetch(sseChunks)(url)
      }) as unknown as typeof fetch

      try {
        const config = createTestConfig({
          baseUrl: 'https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop///',
          apiKey: 'slash-test-key:slash-test-secret',
        })
        const adapter = new ErnieAdapter(config)
        await collectChunks(adapter.streamChat([]))

        expect(capturedUrl).toBe(
          'https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop/chat/ernie-4.5-thinking?access_token=slash-test-token'
        )
      } finally {
        globalThis.fetch = originalFetch
      }
    })
  })

  describe('streamChat request format', () => {
    it('should send messages in OpenAI format', async () => {
      const sseChunks = [
        'data: {"choices":[{"delta":{"content":"hi"}}]}\n\n',
        'data: [DONE]\n\n',
      ]

      let capturedBody = ''
      const originalFetch = globalThis.fetch
      globalThis.fetch = ((url: string, init?: RequestInit) => {
        if ((url as string).includes('oauth/2.0/token')) {
          return Promise.resolve(
            new Response(JSON.stringify({ access_token: 'format-test-token' }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            })
          )
        }
        capturedBody = init?.body as string || ''
        return createMockFetch(sseChunks)(url)
      }) as unknown as typeof fetch

      try {
        const config = createTestConfig({ apiKey: 'format-key:format-secret' })
        const adapter = new ErnieAdapter(config)
        const messages = [
          { role: 'user' as const, content: 'Hello' },
          { role: 'assistant' as const, content: 'Hi there!' },
          { role: 'user' as const, content: 'How are you?' },
        ]
        await collectChunks(adapter.streamChat(messages))

        const body = JSON.parse(capturedBody)
        expect(body.model).toBe('ernie-4.5-thinking')
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

    it('should not include Authorization header (uses query param)', async () => {
      const sseChunks = [
        'data: {"choices":[{"delta":{"content":"hi"}}]}\n\n',
        'data: [DONE]\n\n',
      ]

      let capturedHeaders: Record<string, string> = {}
      const originalFetch = globalThis.fetch
      globalThis.fetch = ((url: string, init?: RequestInit) => {
        if ((url as string).includes('oauth/2.0/token')) {
          return Promise.resolve(
            new Response(JSON.stringify({ access_token: 'header-test-token' }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            })
          )
        }
        capturedHeaders = Object.fromEntries(
          Object.entries(init?.headers as Record<string, string> || {})
        )
        return createMockFetch(sseChunks)(url)
      }) as unknown as typeof fetch

      try {
        const config = createTestConfig({ apiKey: 'header-key:header-secret' })
        const adapter = new ErnieAdapter(config)
        await collectChunks(adapter.streamChat([]))

        // Baidu API 通过 URL query param 鉴权，不使用 Authorization header
        expect(capturedHeaders['Authorization']).toBeUndefined()
        expect(capturedHeaders['Content-Type']).toBe('application/json')
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
      globalThis.fetch = createAuthThenChatFetch(
        { access_token: 'empty-delta-token' },
        sseChunks
      )

      try {
        const config = createTestConfig({ apiKey: 'empty-delta-key:empty-delta-secret' })
        const adapter = new ErnieAdapter(config)
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
      globalThis.fetch = createAuthThenChatFetch(
        { access_token: 'unparseable-token' },
        sseChunks
      )

      try {
        const config = createTestConfig({ apiKey: 'unparseable-key:unparseable-secret' })
        const adapter = new ErnieAdapter(config)
        const chunks = await collectChunks(adapter.streamChat([]))

        const nonDone = chunks.filter(c => !c.done)
        expect(nonDone).toHaveLength(1)
        expect(nonDone[0].content).toBe('valid')
      } finally {
        globalThis.fetch = originalFetch
      }
    })
  })

  describe('streamChat with empty thinking', () => {
    it('should not emit thinking chunk for empty thinking field', async () => {
      const sseChunks = [
        'data: {"choices":[{"delta":{"thinking":""}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"answer"}}]}\n\n',
        'data: [DONE]\n\n',
      ]

      const originalFetch = globalThis.fetch
      globalThis.fetch = createAuthThenChatFetch(
        { access_token: 'empty-thinking-token' },
        sseChunks
      )

      try {
        const config = createTestConfig({ apiKey: 'empty-thinking-key:empty-thinking-secret' })
        const adapter = new ErnieAdapter(config)
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
