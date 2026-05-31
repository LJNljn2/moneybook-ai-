/**
 * Chat Adapter 类型定义
 *
 * 定义 ThinkingChunk 和 ChatAdapter 接口，
 * 所有 AI 供应商适配器统一实现 ChatAdapter 接口，
 * 将不同格式的 thinking 输出归一化为 ThinkingChunk 流。
 */

import type { ChatMessage, AiPlatform, ModelConfig } from '../../types'

/** 思考过程分块 */
export interface ThinkingChunk {
  /** 类型：thinking = 思考过程，answer = 最终回答 */
  type: 'thinking' | 'answer'
  /** 内容文本 */
  content: string
  /** 是否为最后一个分块 */
  done: boolean
}

/** 流式调用选项 */
export interface StreamOptions {
  /** 消息列表 */
  messages: ChatMessage[]
  /** 系统提示词（可选） */
  systemPrompt?: string
  /** 信号量，用于中断请求 */
  signal?: AbortSignal
}

/**
 * Chat Adapter 接口
 *
 * 所有 AI 供应商适配器必须实现此接口。
 * 通过 streamChat 方法返回 ThinkingChunk 流，
 * 前端无需关心不同供应商的响应格式差异。
 */
export interface ChatAdapter {
  /** 适配器名称（如 'deepseek', 'zhipu'） */
  readonly name: string
  /** 是否支持思考过程输出 */
  readonly supportsThinking: boolean

  /**
   * 流式发送聊天消息
   *
   * @param messages - 消息列表
   * @param options - 流式调用选项
   * @returns 异步迭代器，产出 ThinkingChunk
   */
  streamChat(messages: ChatMessage[], options?: StreamOptions): AsyncIterableIterator<ThinkingChunk>
}

/** 供应商配置（运行时） */
export interface ProviderConfig {
  /** 供应商唯一 ID */
  id: string
  /** Base URL */
  baseUrl: string
  /** API Key */
  apiKey: string
  /** AI 平台信息 */
  platform: AiPlatform
  /** 选中的模型 */
  model: ModelConfig
}

/** 适配器构造函数签名 */
export type AdapterConstructor = new (config: ProviderConfig) => ChatAdapter
