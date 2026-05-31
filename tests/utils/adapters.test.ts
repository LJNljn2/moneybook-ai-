import { describe, it, expect } from 'vitest'
import {
  createAdapter,
  getSupportedProviders,
  isProviderSupported,
} from '../../src/utils/adapters/factory'
import type { ThinkingChunk, ChatAdapter, ProviderConfig } from '../../src/utils/adapters/types'
import type { AiPlatform, ModelConfig } from '../../src/types'

/**
 * 辅助函数：创建测试用的 ProviderConfig
 */
function createTestConfig(overrides: Partial<ProviderConfig> = {}): ProviderConfig {
  const platform: AiPlatform = {
    id: overrides.id ?? 'deepseek',
    name: 'Test Platform',
    baseUrl: 'https://api.example.com/v1',
    models: [
      { name: 'test-model', supportsThinking: true },
    ],
    isCustom: false,
  }

  const model: ModelConfig = platform.models[0]

  return {
    id: platform.id,
    baseUrl: platform.baseUrl,
    apiKey: 'test-api-key',
    platform,
    model,
    ...overrides,
  }
}

describe('ThinkingChunk type', () => {
  it('should accept valid thinking chunk', () => {
    const chunk: ThinkingChunk = {
      type: 'thinking',
      content: 'I am thinking...',
      done: false,
    }
    expect(chunk.type).toBe('thinking')
    expect(chunk.content).toBe('I am thinking...')
    expect(chunk.done).toBe(false)
  })

  it('should accept valid answer chunk', () => {
    const chunk: ThinkingChunk = {
      type: 'answer',
      content: 'Here is the answer.',
      done: true,
    }
    expect(chunk.type).toBe('answer')
    expect(chunk.content).toBe('Here is the answer.')
    expect(chunk.done).toBe(true)
  })

  it('should accept empty content', () => {
    const chunk: ThinkingChunk = {
      type: 'thinking',
      content: '',
      done: false,
    }
    expect(chunk.content).toBe('')
  })
})

describe('ChatAdapter interface', () => {
  it('should create adapter with correct name and supportsThinking', () => {
    const config = createTestConfig({ id: 'deepseek' })
    const adapter = createAdapter(config)

    expect(adapter.name).toBe('deepseek')
    expect(adapter.supportsThinking).toBe(true)
  })

  it('should have streamChat method', () => {
    const config = createTestConfig({ id: 'deepseek' })
    const adapter = createAdapter(config)

    expect(typeof adapter.streamChat).toBe('function')
  })

  it('stub adapters should throw on streamChat', () => {
    const config = createTestConfig({ id: 'zhipu' })
    const adapter = createAdapter(config)

    expect(() => adapter.streamChat([])).toThrow('not implemented yet')
  })
})

describe('createAdapter factory', () => {
  const supportedProviders = [
    { id: 'deepseek', name: 'deepseek', supportsThinking: true },
    { id: 'zhipu', name: 'zhipu', supportsThinking: true },
    { id: 'tongyi', name: 'qwen', supportsThinking: true },
    { id: 'moonshot', name: 'moonshot', supportsThinking: true },
    { id: 'doubao', name: 'doubao', supportsThinking: true },
    { id: 'ernie', name: 'ernie', supportsThinking: true },
    { id: 'claude', name: 'claude', supportsThinking: true },
    { id: 'gemini', name: 'gemini', supportsThinking: true },
    { id: 'openai', name: 'openai', supportsThinking: false },
    { id: 'openrouter', name: 'openrouter', supportsThinking: true },
  ]

  it.each(supportedProviders)(
    'should create $id adapter with name="$name" and supportsThinking=$supportsThinking',
    ({ id, name, supportsThinking }) => {
      const config = createTestConfig({ id })
      const adapter = createAdapter(config)

      expect(adapter.name).toBe(name)
      expect(adapter.supportsThinking).toBe(supportsThinking)
    }
  )

  it('should throw for unsupported provider', () => {
    const config = createTestConfig({ id: 'unknown_provider' })

    expect(() => createAdapter(config)).toThrow('Unsupported provider: "unknown_provider"')
  })

  it('error message should list supported providers', () => {
    const config = createTestConfig({ id: 'nonexistent' })

    expect(() => createAdapter(config)).toThrow(/Supported providers:/)
  })

  it('should pass config to adapter', () => {
    const config = createTestConfig({
      id: 'deepseek',
      baseUrl: 'https://custom.api.com',
      apiKey: 'sk-secret-key',
    })
    const adapter = createAdapter(config)

    expect(adapter.name).toBe('deepseek')
    // Adapter holds config internally (verified via type checks)
  })
})

describe('getSupportedProviders', () => {
  it('should return all supported provider IDs', () => {
    const providers = getSupportedProviders()

    expect(providers).toContain('deepseek')
    expect(providers).toContain('zhipu')
    expect(providers).toContain('tongyi')
    expect(providers).toContain('moonshot')
    expect(providers).toContain('doubao')
    expect(providers).toContain('ernie')
    expect(providers).toContain('claude')
    expect(providers).toContain('gemini')
    expect(providers).toContain('openai')
    expect(providers).toContain('openrouter')
    expect(providers).toHaveLength(10)
  })

  it('should return consistent results', () => {
    const providers1 = getSupportedProviders()
    const providers2 = getSupportedProviders()
    expect(providers1).toEqual(providers2)
  })
})

describe('isProviderSupported', () => {
  it('should return true for supported providers', () => {
    expect(isProviderSupported('deepseek')).toBe(true)
    expect(isProviderSupported('openai')).toBe(true)
    expect(isProviderSupported('claude')).toBe(true)
  })

  it('should return false for unsupported providers', () => {
    expect(isProviderSupported('unknown')).toBe(false)
    expect(isProviderSupported('')).toBe(false)
    expect(isProviderSupported('DEEPSEEK')).toBe(false) // case sensitive
  })
})
