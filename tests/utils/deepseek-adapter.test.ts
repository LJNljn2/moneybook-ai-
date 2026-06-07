import { describe, it, expect } from 'vitest'
import { parseThinkTags, DeepSeekAdapter } from '../../src/utils/adapters/deepseek-adapter'
import type { ThinkingChunk, ProviderConfig } from '../../src/utils/adapters/types'
import type { AiPlatform, ModelConfig } from '../../src/types'

/**
 * 辅助函数：创建测试用的 ProviderConfig
 */
function createTestConfig(overrides: Partial<ProviderConfig> = {}): ProviderConfig {
  const platform: AiPlatform = {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    models: [
      { name: 'deepseek-chat', supportsThinking: false },
      { name: 'deepseek-reasoner', supportsThinking: true },
    ],
    isCustom: false,
  }

  return {
    id: 'deepseek',
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
 * 模拟 DeepSeek API 的流式响应
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
// parseThinkTags 单元测试
// ============================================================

describe('parseThinkTags', () => {
  describe('basic tag parsing', () => {
    it('should parse answer content with no tags', () => {
      const results = parseThinkTags('Hello, how are you?', 'answer')
      expect(results).toEqual([
        { type: 'answer', content: 'Hello, how are you?', nextState: 'answer' },
      ])
    })

    it('should parse complete think tag pair', () => {
      const text = '<think>reasoning here</think>answer here'
      const results = parseThinkTags(text, 'answer')
      expect(results).toEqual([
        { type: 'thinking', content: 'reasoning here', nextState: 'thinking' },
        { type: 'answer', content: 'answer here', nextState: 'answer' },
      ])
    })

    it('should parse answer before think tag', () => {
      const text = 'prefix <think>thinking content</think>'
      const results = parseThinkTags(text, 'answer')
      expect(results).toEqual([
        { type: 'answer', content: 'prefix ', nextState: 'answer' },
        { type: 'thinking', content: 'thinking content', nextState: 'thinking' },
      ])
    })

    it('should parse content after closing tag', () => {
      const text = '</think>final answer'
      const results = parseThinkTags(text, 'thinking')
      expect(results).toEqual([
        { type: 'answer', content: 'final answer', nextState: 'answer' },
      ])
    })

    it('should parse thinking content only (no closing tag)', () => {
      const results = parseThinkTags('deep thinking here', 'thinking')
      expect(results).toEqual([
        { type: 'thinking', content: 'deep thinking here', nextState: 'thinking' },
      ])
    })

    it('should parse empty think tags', () => {
      const text = '<think></think>answer'
      const results = parseThinkTags(text, 'answer')
      expect(results).toEqual([
        { type: 'answer', content: 'answer', nextState: 'answer' },
      ])
    })
  })

  describe('split tag handling (tag buffer)', () => {
    it('should buffer incomplete opening tag at end', () => {
      const results = parseThinkTags('hello<th', 'answer')
      expect(results).toEqual([
        { type: 'answer', content: 'hello', nextState: 'answer' },
      ])
      // 剩余的 '<th' 会留在 buffer 中（由调用者处理）
    })

    it('should buffer incomplete opening tag at start', () => {
      const results = parseThinkTags('<thin', 'answer')
      expect(results).toEqual([])
      // 全部都是不完整的标签前缀
    })

    it('should buffer incomplete closing tag at end', () => {
      const results = parseThinkTags('thinking text</th', 'thinking')
      expect(results).toEqual([
        { type: 'thinking', content: 'thinking text', nextState: 'thinking' },
      ])
    })

    it('should buffer incomplete closing tag with partial match', () => {
      const results = parseThinkTags('text</think', 'thinking')
      expect(results).toEqual([
        { type: 'thinking', content: 'text', nextState: 'thinking' },
      ])
    })

    it('should handle full tag after partial prefix', () => {
      // 模拟：<th 作为上一个 chunk 的 buffer
      // 这个 chunk 传来 'ink>answer'，拼接后是 '<think>answer'
      const results = parseThinkTags('ink>answer', 'answer')
      // 注意：这里 '<th' 已经被拼接到前面了，所以我们测试的是拼接后的情况
      // 但 parseThinkTags 本身不负责拼接，它只处理当前文本
      expect(results).toEqual([
        { type: 'answer', content: 'ink>answer', nextState: 'answer' },
      ])
    })

    it('should handle complete tag when split parts are joined', () => {
      // 模拟拼接后的结果：'hello' + '<think>' + 'world</think>' + 'done'
      const text = 'hello<think>world</think>done'
      const results = parseThinkTags(text, 'answer')
      expect(results).toEqual([
        { type: 'answer', content: 'hello', nextState: 'answer' },
        { type: 'thinking', content: 'world', nextState: 'thinking' },
        { type: 'answer', content: 'done', nextState: 'answer' },
      ])
    })
  })

  describe('edge cases', () => {
    it('should handle empty string in answer state', () => {
      const results = parseThinkTags('', 'answer')
      expect(results).toEqual([])
    })

    it('should handle empty string in thinking state', () => {
      const results = parseThinkTags('', 'thinking')
      expect(results).toEqual([])
    })

    it('should handle text with angle brackets that are not tags', () => {
      const text = 'a < b and c > d'
      const results = parseThinkTags(text, 'answer')
      expect(results).toEqual([
        { type: 'answer', content: 'a < b and c > d', nextState: 'answer' },
      ])
    })

    it('should handle tag-like text that is not a complete tag', () => {
      const text = 'text with <think> inside'
      // 注意：这会匹配 <think> 因为它包含 '<think>'
      const results = parseThinkTags(text, 'answer')
      expect(results).toEqual([
        { type: 'answer', content: 'text with ', nextState: 'answer' },
        { type: 'thinking', content: ' inside', nextState: 'thinking' },
      ])
    })

    it('should handle multiple think blocks', () => {
      const text = '<think>first</think>mid<think>second</think>end'
      const results = parseThinkTags(text, 'answer')
      expect(results).toEqual([
        { type: 'thinking', content: 'first', nextState: 'thinking' },
        { type: 'answer', content: 'mid', nextState: 'answer' },
        { type: 'thinking', content: 'second', nextState: 'thinking' },
        { type: 'answer', content: 'end', nextState: 'answer' },
      ])
    })

    it('should handle newlines in thinking content', () => {
      const text = '<think>line1\nline2\nline3</think>answer'
      const results = parseThinkTags(text, 'answer')
      expect(results).toEqual([
        { type: 'thinking', content: 'line1\nline2\nline3', nextState: 'thinking' },
        { type: 'answer', content: 'answer', nextState: 'answer' },
      ])
    })
  })
})

// ============================================================
// DeepSeekAdapter 集成测试
// ============================================================

describe('DeepSeekAdapter', () => {
  describe('basic properties', () => {
    it('should have correct name and supportsThinking', () => {
      const config = createTestConfig()
      const adapter = new DeepSeekAdapter(config)

      expect(adapter.name).toBe('deepseek')
      expect(adapter.supportsThinking).toBe(true)
    })

    it('should have streamChat method', () => {
      const config = createTestConfig()
      const adapter = new DeepSeekAdapter(config)

      expect(typeof adapter.streamChat).toBe('function')
    })
  })

  describe('streamChat with thinking content', () => {
    it('should parse complete think tags in single chunk', async () => {
      const sseChunks = [
        'data: {"choices":[{"delta":{"content":"<think>I need to think about this.</think>Here is the answer."}}]}\n\n',
        'data: [DONE]\n\n',
      ]

      const originalFetch = globalThis.fetch
      globalThis.fetch = createMockFetch(sseChunks)

      try {
        const config = createTestConfig()
        const adapter = new DeepSeekAdapter(config)
        const chunks = await collectChunks(adapter.streamChat([]))

        const thinking = chunks.filter(c => c.type === 'thinking' && !c.done)
        const answers = chunks.filter(c => c.type === 'answer' && !c.done)
        const done = chunks.find(c => c.done)

        expect(thinking).toHaveLength(1)
        expect(thinking[0].content).toBe('I need to think about this.')
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
        const adapter = new DeepSeekAdapter(config)
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
        'data: {"choices":[{"delta":{"content":"<think>Deep reasoning here"}}]}\n\n',
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
        'data: [DONE]\n\n',
      ]

      const originalFetch = globalThis.fetch
      globalThis.fetch = createMockFetch(sseChunks)

      try {
        const config = createTestConfig()
        const adapter = new DeepSeekAdapter(config)
        const chunks = await collectChunks(adapter.streamChat([]))

        const thinking = chunks.filter(c => c.type === 'thinking' && !c.done)
        const answers = chunks.filter(c => c.type === 'answer' && !c.done)
        const done = chunks.find(c => c.done)

        expect(thinking).toHaveLength(1)
        expect(thinking[0].content).toBe('Deep reasoning here')
        expect(answers).toHaveLength(0)
        // 思考模式的 done chunk 应该是 thinking 类型
        expect(done).toBeDefined()
        expect(done?.type).toBe('thinking')
      } finally {
        globalThis.fetch = originalFetch
      }
    })
  })

  describe('streamChat with split tags across chunks', () => {
    it('should handle think tag split across chunks', async () => {
      // <think> 被拆分到两个 chunk
      const sseChunks = [
        'data: {"choices":[{"delta":{"content":"<think>reason"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"ing process"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"</think>answer"}}]}\n\n',
        'data: [DONE]\n\n',
      ]

      const originalFetch = globalThis.fetch
      globalThis.fetch = createMockFetch(sseChunks)

      try {
        const config = createTestConfig()
        const adapter = new DeepSeekAdapter(config)
        const chunks = await collectChunks(adapter.streamChat([]))

        const thinking = chunks.filter(c => c.type === 'thinking' && !c.done)
        const answers = chunks.filter(c => c.type === 'answer' && !c.done)

        const thinkingText = thinking.map(c => c.content).join('')
        expect(thinkingText).toBe('reasoning process')
        expect(answers).toHaveLength(1)
        expect(answers[0].content).toBe('answer')
      } finally {
        globalThis.fetch = originalFetch
      }
    })

    it('should handle opening tag itself split across chunks (<thin + nk>)', async () => {
      // <think> 标签被拆分：<thin 在一个 chunk，nk> 在下一个 chunk
      const sseChunks = [
        'data: {"choices":[{"delta":{"content":"<thin"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"k>think content</think>answer"}}]}\n\n',
        'data: [DONE]\n\n',
      ]

      const originalFetch = globalThis.fetch
      globalThis.fetch = createMockFetch(sseChunks)

      try {
        const config = createTestConfig()
        const adapter = new DeepSeekAdapter(config)
        const chunks = await collectChunks(adapter.streamChat([]))

        const thinking = chunks.filter(c => c.type === 'thinking' && !c.done)
        const answers = chunks.filter(c => c.type === 'answer' && !c.done)

        const thinkingText = thinking.map(c => c.content).join('')
        expect(thinkingText).toBe('think content')
        const answerText = answers.map(c => c.content).join('')
        expect(answerText).toBe('answer')
      } finally {
        globalThis.fetch = originalFetch
      }
    })

    it('should handle closing tag split across chunks', async () => {
      // </think> 被拆分到两个 chunk（现实边界：</think + >）
      const sseChunks = [
        'data: {"choices":[{"delta":{"content":"<think>thinking</think"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":">answer"}}]}\n\n',
        'data: [DONE]\n\n',
      ]

      const originalFetch = globalThis.fetch
      globalThis.fetch = createMockFetch(sseChunks)

      try {
        const config = createTestConfig()
        const adapter = new DeepSeekAdapter(config)
        const chunks = await collectChunks(adapter.streamChat([]))

        const thinking = chunks.filter(c => c.type === 'thinking' && !c.done)
        const answers = chunks.filter(c => c.type === 'answer' && !c.done)

        const thinkingText = thinking.map(c => c.content).join('')
        expect(thinkingText).toBe('thinking')
        const answerText = answers.map(c => c.content).join('')
        expect(answerText).toBe('answer')
      } finally {
        globalThis.fetch = originalFetch
      }
    })

    it('should handle tag split across 3 chunks', async () => {
      // <think> 拆分为 <thin + k + >
      const sseChunks = [
        'data: {"choices":[{"delta":{"content":"<thin"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"k>"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"think</think>ans"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"wer"}}]}\n\n',
        'data: [DONE]\n\n',
      ]

      const originalFetch = globalThis.fetch
      globalThis.fetch = createMockFetch(sseChunks)

      try {
        const config = createTestConfig()
        const adapter = new DeepSeekAdapter(config)
        const chunks = await collectChunks(adapter.streamChat([]))

        const thinking = chunks.filter(c => c.type === 'thinking' && !c.done)
        const answers = chunks.filter(c => c.type === 'answer' && !c.done)

        const thinkingText = thinking.map(c => c.content).join('')
        expect(thinkingText).toBe('think')
        const answerText = answers.map(c => c.content).join('')
        expect(answerText).toBe('answer')
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
        const adapter = new DeepSeekAdapter(config)
        const iterator = adapter.streamChat([])

        await expect(collectChunks(iterator)).rejects.toThrow('DeepSeek API error: 401')
      } finally {
        globalThis.fetch = originalFetch
      }
    })

    it('should throw on 500 server error', async () => {
      const originalFetch = globalThis.fetch
      globalThis.fetch = createErrorFetch(500, 'Internal Server Error')

      try {
        const config = createTestConfig()
        const adapter = new DeepSeekAdapter(config)
        const iterator = adapter.streamChat([])

        await expect(collectChunks(iterator)).rejects.toThrow('DeepSeek API error: 500')
      } finally {
        globalThis.fetch = originalFetch
      }
    })
  })

  describe('streamChat with multiple content deltas', () => {
    it('should accumulate thinking and answer content across many deltas', async () => {
      const sseChunks = [
        'data: {"choices":[{"delta":{"content":"<think>step 1: "}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"analyze"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":" the problem. "}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"step 2: conclude.</think>"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"The answer is 42."}}]}\n\n',
        'data: [DONE]\n\n',
      ]

      const originalFetch = globalThis.fetch
      globalThis.fetch = createMockFetch(sseChunks)

      try {
        const config = createTestConfig()
        const adapter = new DeepSeekAdapter(config)
        const chunks = await collectChunks(adapter.streamChat([]))

        const thinking = chunks.filter(c => c.type === 'thinking' && !c.done)
        const answers = chunks.filter(c => c.type === 'answer' && !c.done)

        const thinkingText = thinking.map(c => c.content).join('')
        expect(thinkingText).toBe('step 1: analyze the problem. step 2: conclude.')
        const answerText = answers.map(c => c.content).join('')
        expect(answerText).toBe('The answer is 42.')
      } finally {
        globalThis.fetch = originalFetch
      }
    })

    it('should handle content with answer before and after thinking', async () => {
      const sseChunks = [
        'data: {"choices":[{"delta":{"content":"Let me think. "}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"<think>reasoning</think>"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"So the answer is yes."}}]}\n\n',
        'data: [DONE]\n\n',
      ]

      const originalFetch = globalThis.fetch
      globalThis.fetch = createMockFetch(sseChunks)

      try {
        const config = createTestConfig()
        const adapter = new DeepSeekAdapter(config)
        const chunks = await collectChunks(adapter.streamChat([]))

        const thinking = chunks.filter(c => c.type === 'thinking' && !c.done)
        const answers = chunks.filter(c => c.type === 'answer' && !c.done)

        expect(thinking).toHaveLength(1)
        expect(thinking[0].content).toBe('reasoning')

        const answerText = answers.map(c => c.content).join('')
        expect(answerText).toBe('Let me think. So the answer is yes.')
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
        const config = createTestConfig({ baseUrl: 'https://api.deepseek.com/v1' })
        const adapter = new DeepSeekAdapter(config)
        await collectChunks(adapter.streamChat([]))

        expect(capturedUrl).toBe('https://api.deepseek.com/v1/chat/completions')
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
        const config = createTestConfig({ baseUrl: 'https://api.deepseek.com/v1/chat/completions' })
        const adapter = new DeepSeekAdapter(config)
        await collectChunks(adapter.streamChat([]))

        expect(capturedUrl).toBe('https://api.deepseek.com/v1/chat/completions')
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
        const config = createTestConfig({ baseUrl: 'https://api.deepseek.com/v1///' })
        const adapter = new DeepSeekAdapter(config)
        await collectChunks(adapter.streamChat([]))

        expect(capturedUrl).toBe('https://api.deepseek.com/v1/chat/completions')
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
        const adapter = new DeepSeekAdapter(config)
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
        const adapter = new DeepSeekAdapter(config)
        const messages = [
          { role: 'user' as const, content: 'Hello' },
          { role: 'assistant' as const, content: 'Hi there!' },
          { role: 'user' as const, content: 'How are you?' },
        ]
        await collectChunks(adapter.streamChat(messages))

        const body = JSON.parse(capturedBody)
        expect(body.model).toBe('deepseek-reasoner')
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
        const adapter = new DeepSeekAdapter(config)
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
        const adapter = new DeepSeekAdapter(config)
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
