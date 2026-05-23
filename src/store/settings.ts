import { getItem, setItem } from '../utils/storage'
import type { SettingItem } from '../types'

const KEY = 'settings'

function getAll(): SettingItem[] {
  return getItem<SettingItem[]>(KEY) ?? []
}

function saveAll(list: SettingItem[]): void {
  setItem(KEY, list)
}

function get(key: string): string | null {
  const item = getAll().find(s => s.key === key)
  return item?.value ?? null
}

function set(key: string, value: string): void {
  const list = getAll()
  const idx = list.findIndex(s => s.key === key)
  if (idx >= 0) {
    list[idx].value = value
  } else {
    list.push({ key, value })
  }
  saveAll(list)
}

function remove(key: string): boolean {
  const list = getAll()
  const filtered = list.filter(s => s.key !== key)
  if (filtered.length === list.length) return false
  saveAll(filtered)
  return true
}

export const settingService = {
  getAll,
  get,
  set,
  remove,
}
