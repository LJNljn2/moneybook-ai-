/**
 * Chat Adapters 入口
 *
 * 导出所有 adapter 相关的类型、接口和工厂方法。
 */

export type {
  ThinkingChunk,
  StreamOptions,
  ChatAdapter,
  ProviderConfig,
  AdapterConstructor,
} from './types'

export {
  createAdapter,
  getSupportedProviders,
  isProviderSupported,
} from './factory'
