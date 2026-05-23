import { getItem, setItem } from '../utils/storage'
import type { AiPlatform } from '../types'

const KEY = 'ai_platforms'

/** 内置平台预设 */
const BUILT_IN_PLATFORMS: AiPlatform[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
    isCustom: false,
  },
  {
    id: 'tongyi',
    name: '通义千问',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: ['qwen-turbo', 'qwen-plus', 'qwen-max', 'qwen-long'],
    isCustom: false,
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    models: ['deepseek-chat', 'deepseek-coder'],
    isCustom: false,
  },
  {
    id: 'zhipu',
    name: '智谱 GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    models: ['glm-4', 'glm-4-flash', 'glm-4-air'],
    isCustom: false,
  },
  {
    id: 'moonshot',
    name: 'Kimi（Moonshot）',
    baseUrl: 'https://api.moonshot.cn/v1',
    models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
    isCustom: false,
  },
]

function getAll(): AiPlatform[] {
  return getItem<AiPlatform[]>(KEY) ?? []
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
function add(platform: Omit<AiPlatform, 'id' | 'isCustom'>): AiPlatform {
  const customs = getAll()
  const newPlatform: AiPlatform = {
    ...platform,
    id: 'custom_' + Date.now(),
    isCustom: true,
  }
  customs.push(newPlatform)
  saveAll(customs)
  return newPlatform
}

/** 编辑自定义平台 */
function update(id: string, data: Partial<Pick<AiPlatform, 'name' | 'baseUrl' | 'models'>>): boolean {
  const customs = getAll()
  const idx = customs.findIndex(p => p.id === id)
  if (idx < 0) return false
  customs[idx] = { ...customs[idx], ...data }
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
