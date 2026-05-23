import { getItem, setItem } from '../utils/storage'
import type { Expense } from '../types'

const KEY = 'expenses'

function getAll(): Expense[] {
  return getItem<Expense[]>(KEY) ?? []
}

function saveAll(list: Expense[]): void {
  setItem(KEY, list)
}

function getById(id: string): Expense | undefined {
  return getAll().find(e => e.id === id)
}

function add(expense: Omit<Expense, 'id' | 'created_at'>): Expense {
  const list = getAll()
  const newItem: Expense = {
    ...expense,
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
  }
  list.push(newItem)
  saveAll(list)
  return newItem
}

function update(id: string, partial: Partial<Omit<Expense, 'id' | 'created_at'>>): Expense | null {
  const list = getAll()
  const idx = list.findIndex(e => e.id === id)
  if (idx === -1) return null
  list[idx] = { ...list[idx], ...partial }
  saveAll(list)
  return list[idx]
}

function remove(id: string): boolean {
  const list = getAll()
  const filtered = list.filter(e => e.id !== id)
  if (filtered.length === list.length) return false
  saveAll(filtered)
  return true
}

function getByDateRange(startDate: string, endDate: string): Expense[] {
  return getAll().filter(e => e.date >= startDate && e.date <= endDate)
}

function getByCategory(category: string): Expense[] {
  return getAll().filter(e => e.category === category)
}

function getByDateRangeAndCategory(
  startDate: string,
  endDate: string,
  categories?: string[]
): Expense[] {
  let result = getByDateRange(startDate, endDate)
  if (categories && categories.length > 0) {
    result = result.filter(e => categories.includes(e.category))
  }
  return result.sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at))
}

export const expenseService = {
  getAll,
  getById,
  add,
  update,
  remove,
  getByDateRange,
  getByCategory,
  getByDateRangeAndCategory,
}
