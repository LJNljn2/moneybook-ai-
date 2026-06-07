import { getItem, setItem } from '../utils/storage'
import type { AiPlatform, ModelConfig } from '../types'
import { migrateModels } from '../types'

const KEY = 'ai_platforms'

/** 内置平台预设 */
const BUILT_IN_PLATFORMS: AiPlatform[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    models: [
      { name: 'gpt-4o', supportsThinking: false },
      { name: 'gpt-4o-mini', supportsThinking: false },
      { name: 'gpt-4-turbo', supportsThinking: false },
      { name: 'gpt-3.5-turbo', supportsThinking: false },
    ],
    isCustom: false,
  },
  {
    id: 'tongyi',
    name: '通义千问',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: [
      { name: 'qwen-turbo', supportsThinking: false },
      { name: 'qwen-plus', supportsThinking: false },
      { name: 'qwen-max', supportsThinking: false },
      { name: 'qwen-long', supportsThinking: false },
      { name: 'qwq-32b', supportsThinking: true },
    ],
    isCustom: false,
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    models: [
      { name: 'deepseek-chat', supportsThinking: false },
      { name: 'deepseek-coder', supportsThinking: false },
      { name: 'deepseek-reasoner', supportsThinking: true },
    ],
    isCustom: false,
  },
  {
    id: 'zhipu',
    name: '智谱 GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    models: [
      { name: 'glm-4', supportsThinking: false },
      { name: 'glm-4-flash', supportsThinking: false },
      { name: 'glm-4-air', supportsThinking: false },
      { name: 'glm-4-reasoning', supportsThinking: true },
    ],
    isCustom: false,
  },
  {
    id: 'moonshot',
    name: 'Kimi（Moonshot）',
    baseUrl: 'https://api.moonshot.cn/v1',
    models: [
      { name: 'moonshot-v1-8k', supportsThinking: false },
      { name: 'moonshot-v1-32k', supportsThinking: false },
      { name: 'moonshot-v1-128k', supportsThinking: false },
    ],
    isCustom: false,
  },
]

function getAll(): AiPlatform[] {
  const raw = getItem<any[]>(KEY) ?? []
  // 数据迁移：将旧格式 models: string[] 转换为 ModelConfig[]
  return raw.map(p => ({
    ...p,
    models: Array.isArray(p.models) ? migrateModels(p.models) : [],
  }))
}

function saveAll(list: AiPlatform[]): void {
  setItem(KEY, list)
}

/** 获取所有平台（内置 + 自定义） */
function getAllPlatforms(): AiPlatform[] {
  const customs = getAll()
  return [...BUILT_IN_PLATFORMS, ...customs]
}

/** 获取所有内置平台 */
function getBuiltIn(): AiPlatform[] {
  return BUILT_IN_PLATFORMS
}

/** 根据 id 获取平台 */
function getById(id: string): AiPlatform | undefined {
  return getAllPlatforms().find(p => p.id === id)
}

/** 新增自定义平台 */
function add(platform: { name: string; baseUrl: string; models: Array<string | ModelConfig> }): AiPlatform {
  const customs = getAll()
  const newPlatform: AiPlatform = {
    name: platform.name,
    baseUrl: platform.baseUrl,
    models: migrateModels(platform.models),
    id: 'custom_' + Date.now(),
    isCustom: true,
  }
  customs.push(newPlatform)
  saveAll(customs)
  return newPlatform
}

/** 编辑自定义平台 */
function update(id: string, data: Partial<Pick<AiPlatform, 'name' | 'baseUrl'>> & { models?: Array<string | ModelConfig> }): boolean {
  const customs = getAll()
  const idx = customs.findIndex(p => p.id === id)
  if (idx < 0) return false
  const existing = customs[idx]
  const updated: AiPlatform = {
    ...existing,
    name: data.name ?? existing.name,
    baseUrl: data.baseUrl ?? existing.baseUrl,
    models: data.models ? migrateModels(data.models) : existing.models,
  }
  customs[idx] = updated
  saveAll(customs)
  return true
}

/** 删除自定义平台 */
function remove(id: string): boolean {
  const customs = getAll()
  const filtered = customs.filter(p => p.id !== id)
  if (filtered.length === customs.length) return false
  saveAll(filtered)
  return true
}

export const aiPlatformService = {
  getAllPlatforms,
  getBuiltIn,
  getById,
  add,
  update,
  remove,
}
