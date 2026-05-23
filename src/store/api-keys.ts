import { getItem, setItem } from '../utils/storage'

const KEY = 'api_keys'

/** 平台 ID → API Key 映射 */
type ApiKeyMap = Record<string, string>

function getAll(): ApiKeyMap {
  return getItem<ApiKeyMap>(KEY) ?? {}
}

function saveAll(map: ApiKeyMap): void {
  setItem(KEY, map)
}

/** 获取指定平台的 API Key */
function get(platformId: string): string | null {
  const map = getAll()
  return map[platformId] ?? null
}

/** 设置指定平台的 API Key */
function set(platformId: string, apiKey: string): void {
  const map = getAll()
  map[platformId] = apiKey
  saveAll(map)
}

/** 删除指定平台的 API Key */
function remove(platformId: string): void {
  const map = getAll()
  delete map[platformId]
  saveAll(map)
}

/** 清除所有 API Key */
function clearAll(): void {
  saveAll({})
}

/**
 * 获取用于显示的遮蔽后的 Key（仅显示末尾 4 位）
 * 如 "sk-...xxxx"
 */
function getMasked(platformId: string): string {
  const key = get(platformId)
  if (!key) return ''
  if (key.length <= 4) return '****'
  return '****' + key.slice(-4)
}

export const apiKeyService = {
  get,
  set,
  remove,
  clearAll,
  getMasked,
}
