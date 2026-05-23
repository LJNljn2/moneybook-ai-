import { getItem, setItem } from '../utils/storage'
import type { Category } from '../types'

const KEY = 'categories'

const DEFAULT_CATEGORIES: Omit<Category, 'id'>[] = [
  { name: '餐饮', icon: '🍜', color: '#FF6B6B', is_custom: false },
  { name: '交通', icon: '🚗', color: '#4ECDC4', is_custom: false },
  { name: '购物', icon: '🛒', color: '#FFD93D', is_custom: false },
  { name: '住房', icon: '🏠', color: '#6BCB77', is_custom: false },
  { name: '娱乐', icon: '🎮', color: '#9B5DE5', is_custom: false },
  { name: '医疗', icon: '💊', color: '#F4845F', is_custom: false },
  { name: '教育', icon: '📚', color: '#00BBF9', is_custom: false },
  { name: '其他', icon: '📌', color: '#ADB5BD', is_custom: false },
]

function getAll(): Category[] {
  return getItem<Category[]>(KEY) ?? []
}

function saveAll(list: Category[]): void {
  setItem(KEY, list)
}

function initDefaults(): void {
  const existing = getAll()
  if (existing.length > 0) return
  const defaults: Category[] = DEFAULT_CATEGORIES.map((c, i) => ({
    ...c,
    id: `default_${i}`,
  }))
  saveAll(defaults)
}

function getById(id: string): Category | undefined {
  return getAll().find(c => c.id === id)
}

function add(category: Omit<Category, 'id'>): Category {
  const list = getAll()
  const newItem: Category = {
    ...category,
    id: crypto.randomUUID(),
    is_custom: true,
  }
  list.push(newItem)
  saveAll(list)
  return newItem
}

function update(id: string, partial: Partial<Omit<Category, 'id'>>): Category | null {
  const list = getAll()
  const idx = list.findIndex(c => c.id === id)
  if (idx === -1) return null
  list[idx] = { ...list[idx], ...partial }
  saveAll(list)
  return list[idx]
}

function remove(id: string): boolean {
  const list = getAll()
  const target = list.find(c => c.id === id)
  if (!target) return false
  if (!target.is_custom) return false // 默认分类不可删除
  saveAll(list.filter(c => c.id !== id))
  return true
}

export const categoryService = {
  getAll,
  getById,
  add,
  update,
  remove,
  initDefaults,
  DEFAULT_CATEGORIES,
}
