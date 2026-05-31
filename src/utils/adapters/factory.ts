/**
 * Chat Adapter 工厂方法
 *
 * 根据供应商 ID 创建对应的适配器实例。
 * 各适配器的具体实现在各自的模块文件中（deepseek-adapter.ts 等），
 * 此处的 Stub 类将在对应 story 中替换为真实实现。
 */

import type {
  ChatAdapter,
  ProviderConfig,
  AdapterConstructor,
} from './types'

import { BaseAdapter } from './base-adapter'
import { DeepSeekAdapter } from './deepseek-adapter'
import { ZhipuAdapter } from './zhipu-adapter'
import { QwenAdapter } from './qwen-adapter'
import { MoonshotAdapter } from './moonshot-adapter'
import { DoubaoAdapter } from './doubao-adapter'

export { BaseAdapter }

// --- Stub 适配器类（待后续 story 替换为真实实现） ---

class ErnieAdapter extends BaseAdapter {
  readonly name = 'ernie'
  readonly supportsThinking = true
}

class ClaudeAdapter extends BaseAdapter {
  readonly name = 'claude'
  readonly supportsThinking = true
}

class GeminiAdapter extends BaseAdapter {
  readonly name = 'gemini'
  readonly supportsThinking = true
}

class OpenAIAdapter extends BaseAdapter {
  readonly name = 'openai'
  readonly supportsThinking = false
}

class OpenRouterAdapter extends BaseAdapter {
  readonly name = 'openrouter'
  readonly supportsThinking = true
}

/**
 * 供应商 ID 到适配器构造函数的映射
 *
 * 支持的供应商：
 * - deepseek: DeepSeek（<think> 标签解析）
 * - zhipu: 智谱 GLM（reasoning_content 字段）
 * - tongyi: 通义千问 / DashScope（reasoning_content 字段）
 * - moonshot: 月之暗面 / Kimi（reasoning_content 字段）
 * - doubao: 字节豆包 / 火山引擎（thinking 字段）
 * - ernie: 百度文心（thinking 字段 + access_token 鉴权）
 * - claude: Anthropic（content_block.thinking）
 * - gemini: Google（thought:true + summary）
 * - openai: OpenAI（无 thinking）
 * - openrouter: OpenRouter（动态路由）
 */
const ADAPTER_MAP: Record<string, AdapterConstructor> = {
  deepseek: DeepSeekAdapter,
  zhipu: ZhipuAdapter,
  tongyi: QwenAdapter,
  moonshot: MoonshotAdapter,
  doubao: DoubaoAdapter,
  ernie: ErnieAdapter,
  claude: ClaudeAdapter,
  gemini: GeminiAdapter,
  openai: OpenAIAdapter,
  openrouter: OpenRouterAdapter,
}

/**
 * 创建适配器实例
 *
 * @param config - 供应商运行时配置（含 baseUrl、apiKey、平台信息、模型信息）
 * @returns ChatAdapter 实例
 * @throws Error 如果供应商 ID 不支持
 */
export function createAdapter(config: ProviderConfig): ChatAdapter {
  const AdapterClass = ADAPTER_MAP[config.id]
  if (!AdapterClass) {
    throw new Error(
      `Unsupported provider: "${config.id}". ` +
      `Supported providers: ${Object.keys(ADAPTER_MAP).join(', ')}`
    )
  }
  return new AdapterClass(config)
}

/**
 * 获取所有支持的供应商 ID 列表
 */
export function getSupportedProviders(): string[] {
  return Object.keys(ADAPTER_MAP)
}

/**
 * 检查供应商是否支持
 */
export function isProviderSupported(providerId: string): boolean {
  return providerId in ADAPTER_MAP
}
