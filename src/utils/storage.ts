/**
 * 跨平台本地存储适配层
 * 底层使用 uni.getStorageSync / uni.setStorageSync
 * H5 环境下回退到 localStorage
 */

export function getItem<T = unknown>(key: string): T | null {
  try {
    const val = uni.getStorageSync(key)
    // uni.getStorageSync 在 key 不存在时返回空字符串
    if (val == null || val === '') return null
    // uni-h5 内部会自动解析 JSON 并解包 {type, data} 格式
    // 返回值可能是对象（已解析）或字符串（未解析的原始值）
    if (typeof val === 'string') {
      try {
        const parsed = JSON.parse(val)
        return parsed ?? null
      } catch {
        return val as unknown as T
      }
    }
    return val as T
  } catch {
    return null
  }
}

export function setItem<T = unknown>(key: string, value: T): void {
  uni.setStorageSync(key, value)
}

export function removeItem(key: string): void {
  uni.removeStorageSync(key)
}
