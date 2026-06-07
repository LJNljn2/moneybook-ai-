/**
 * 基础适配器类
 *
 * 所有适配器共享的通用逻辑，具体解析逻辑由子类覆盖。
 * 独立文件以避免工厂方法与具体适配器之间的循环依赖。
 */

import type { ChatMessage } from '../../types'
import type {
  ChatAdapter,
  StreamOptions,
  ThinkingChunk,
  ProviderConfig,
} from './types'

export abstract class BaseAdapter implements ChatAdapter {
  abstract readonly name: string
  abstract readonly supportsThinking: boolean

  protected config: ProviderConfig

  constructor(config: ProviderConfig) {
    this.config = config
  }

  streamChat(_messages: ChatMessage[], _options?: StreamOptions): AsyncIterableIterator<ThinkingChunk> {
    throw new Error(`Adapter "${this.name}" streamChat not implemented yet`)
  }
}
