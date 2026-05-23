/**
 * AI API 直连服务
 * 支持 OpenAI Chat Completions 兼容格式 + SSE 流式响应
 */

import type { ChatMessage, ActivePlatformConfig } from '../types'
import { DEFAULT_SYSTEM_PROMPT } from '../types'
import { aiPlatformService } from '../store/ai-platforms'
import { apiKeyService } from '../store/api-keys'
import { settingService } from '../store/settings'
import { categoryService } from '../store/categories'
import { SettingKeys } from '../types'
import { redactApiKey } from './redact'

/** 流式回调 */
export interface StreamCallbacks {
  /** 每收到一段增量文本时调用 */
  onChunk: (text: string) => void
  /** 流式结束时调用，返回完整回复 */
  onComplete: (fullText: string) => void
  /** 出错时调用 */
  onError: (error: Error) => void
}

/**
 * 获取当前有效的平台配置和 API Key
 */
function getActiveConfig(): { baseUrl: string; apiKey: string; model: string } | null {
  const configStr = settingService.get(SettingKeys.PLATFORM_CONFIG)
  if (!configStr) return null

  let config: ActivePlatformConfig
  try {
    config = JSON.parse(configStr)
  } catch {
    return null
  }

  const platform = aiPlatformService.getById(config.platformId)
  if (!platform) return null

  const apiKey = apiKeyService.get(config.platformId)
  if (!apiKey) return null

  return {
    baseUrl: platform.baseUrl,
    apiKey,
    model: config.model || platform.models[0],
  }
}

/**
 * 获取系统提示词（用户自定义或默认），动态注入当前分类列表
 */
function getSystemPrompt(): string {
  const base = settingService.get(SettingKeys.SYSTEM_PROMPT) ?? DEFAULT_SYSTEM_PROMPT
  const allCategories = categoryService.getAll()
  const categoryNames = allCategories.map(c => c.name).join('、')
  // 替换硬编码的分类列表为动态列表
  return base.replace(
    /支持的分类：[^\n]*/,
    `支持的分类：${categoryNames}`
  )
}

/**
 * 构建请求 URL（OpenAI 兼容 /chat/completions）
 */
function buildUrl(baseUrl: string): string {
  const url = baseUrl.replace(/\/+$/, '')
  // 如果 baseUrl 已经包含 /chat/completions，直接用
  if (url.endsWith('/chat/completions')) return url
  // 标准 OpenAI 兼容路径
  return url + '/chat/completions'
}

/**
 * 流式调用 AI API（SSE）
 * 使用 fetch + ReadableStream 实现流式读取
 * 仅在 H5 环境下可用
 */
export function chatCompletionStream(
  userMessages: ChatMessage[],
  callbacks: StreamCallbacks
): () => void {
  const config = getActiveConfig()
  if (!config) {
    callbacks.onError(new Error('未配置 AI 平台或 API Key'))
    return () => {}
  }

  const { baseUrl, apiKey, model } = config
  const systemPrompt = getSystemPrompt()

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...userMessages,
  ]

  const url = buildUrl(baseUrl)
  const body = JSON.stringify({
    model,
    messages,
    stream: true,
  })

  console.log('[AI API] Request:', redactApiKey(url), { model, messageCount: messages.length })

  const controller = new AbortContext()

  fetchSSE(url, apiKey, body, callbacks, controller)

  // 返回取消函数
  return () => controller.abort()
}

class AbortContext {
  private _controller: AbortController | null = null

  setController(c: AbortController) {
    this._controller = c
  }

  abort() {
    this._controller?.abort()
  }
}

async function fetchSSE(
  url: string,
  apiKey: string,
  body: string,
  callbacks: StreamCallbacks,
  abortCtx: AbortContext
) {
  const controller = new AbortController()
  abortCtx.setController(controller)

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body,
      signal: controller.signal,
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error')
      throw new Error(`API 请求失败: ${response.status} ${redactApiKey(errorText)}`)
    }

    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error('无法读取响应流')
    }

    const decoder = new TextDecoder()
    let fullText = ''
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      // 保留最后一行（可能不完整）
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('data: ')) continue

        const data = trimmed.slice(6)
        if (data === '[DONE]') continue

        try {
          const parsed = JSON.parse(data)
          const content = parsed.choices?.[0]?.delta?.content
          if (content) {
            fullText += content
            callbacks.onChunk(content)
          }
        } catch {
          // 忽略无法解析的行
          console.log('[AI API] Skip unparseable SSE line:', redactApiKey(trimmed))
        }
      }
    }

    // 处理 buffer 中可能残留的数据
    if (buffer.trim().startsWith('data: ')) {
      const data = buffer.trim().slice(6)
      if (data !== '[DONE]') {
        try {
          const parsed = JSON.parse(data)
          const content = parsed.choices?.[0]?.delta?.content
          if (content) {
            fullText += content
            callbacks.onChunk(content)
          }
        } catch {
          // ignore
        }
      }
    }

    callbacks.onComplete(fullText)
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      console.log('[AI API] Request aborted')
      return
    }
    callbacks.onError(err instanceof Error ? err : new Error(String(err)))
  }
}

/**
 * 非流式调用 AI API
 * 用于不支持流式响应的平台（如小程序）
 */
export async function chatCompletion(userMessages: ChatMessage[]): Promise<string> {
  const config = getActiveConfig()
  if (!config) {
    throw new Error('未配置 AI 平台或 API Key')
  }

  const { baseUrl, apiKey, model } = config
  const systemPrompt = getSystemPrompt()

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...userMessages,
  ]

  const url = buildUrl(baseUrl)

  console.log('[AI API] Non-stream request:', redactApiKey(url), { model, messageCount: messages.length })

  return new Promise((resolve, reject) => {
    uni.request({
      url,
      method: 'POST',
      header: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      data: {
        model,
        messages,
        stream: false,
      },
      success(res) {
        if (res.statusCode !== 200) {
          reject(new Error(`API 请求失败: ${res.statusCode}`))
          return
        }
        const data = res.data as Record<string, unknown>
        const choices = data.choices as Array<Record<string, unknown>> | undefined
        const content = (choices?.[0]?.message as Record<string, unknown>)?.content
        if (typeof content === 'string') {
          resolve(content)
        } else {
          reject(new Error('API 响应格式异常'))
        }
      },
      fail(err) {
        reject(new Error(err.errMsg || '网络请求失败'))
      },
    })
  })
}

/**
 * 检查当前是否已配置好 AI 平台
 */
export function isConfigured(): boolean {
  return getActiveConfig() !== null
}
