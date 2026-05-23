/**
 * 跨平台本地存储适配层
 * 底层使用 uni.getStorageSync / uni.setStorageSync
 * H5 环境下回退到 localStorage
 */

export function getItem<T = unknown>(key: string): T | null {
  try {
    const val = uni.getStorageSync(key)
    return val ?? null
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
