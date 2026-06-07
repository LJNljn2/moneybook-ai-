/**
 * 从 AI 回复文本中提取记账 JSON 数据
 * AI 回复格式：自然语言 + 末尾的 ```json\n{"expenses": [...]}\n```
 */

import { formatLocalDate } from './date-format'

export interface ParsedExpense {
  amount: number
  category: string
  note: string
  date: string // YYYY-MM-DD
}

const JSON_BLOCK_RE = /```json\s*\n([\s\S]*?)```/g

/**
 * 从 AI 回复文本中提取所有 JSON 代码块中的 expenses 数组
 */
export function extractExpenses(text: string): ParsedExpense[] {
  const results: ParsedExpense[] = []

  let match: RegExpExecArray | null
  while ((match = JSON_BLOCK_RE.exec(text)) !== null) {
    try {
      const json = JSON.parse(match[1].trim())
      if (Array.isArray(json.expenses)) {
        for (const item of json.expenses) {
          const expense = normalizeExpense(item)
          if (expense) {
            results.push(expense)
          }
        }
      }
    } catch {
      // 忽略无法解析的 JSON 块
    }
  }

  return results
}

/**
 * 构建最近 N 天的消费摘要，用于注入 AI 请求上下文
 * 返回一段自然语言描述，包含总金额和分类分布
 */
export function buildRecentExpenseSummary(expenses: import('../types').Expense[], days = 7): string {
  const now = new Date()
  const start = new Date(now)
  start.setDate(start.getDate() - days + 1)
  const startStr = formatLocalDate(start)
  const endStr = formatLocalDate(now)

  const recent = expenses.filter(e => e.date >= startStr && e.date <= endStr)
  if (recent.length === 0) {
    return `用户最近 ${days} 天（${startStr} ~ ${endStr}）没有消费记录。`
  }

  const total = recent.reduce((sum, e) => sum + e.amount, 0)
  const byCategory: Record<string, number> = {}
  for (const e of recent) {
    byCategory[e.category] = (byCategory[e.category] || 0) + e.amount
  }

  const sorted = Object.entries(byCategory).sort((a, b) => b[1] - a[1])
  const breakdown = sorted.map(([cat, amt]) => `${cat} ¥${amt}`).join('、')

  return `用户最近 ${days} 天（${startStr} ~ ${endStr}）消费共 ¥${total}，明细：${breakdown}。`
}

/**
 * 构建历史数据概览（7 天之前的月份汇总），用于 AI 知道有哪些数据可以搜索
 */
export function buildHistoricalOverview(expenses: import('../types').Expense[]): string {
  const now = new Date()
  const cutoff = new Date(now)
  cutoff.setDate(cutoff.getDate() - 6) // 7天内
  const cutoffStr = formatLocalDate(cutoff)

  const older = expenses.filter(e => e.date < cutoffStr)
  if (older.length === 0) {
    return '7天之前没有历史消费记录。'
  }

  // 按月汇总
  const byMonth: Record<string, { total: number; count: number }> = {}
  for (const e of older) {
    const ym = e.date.slice(0, 7) // YYYY-MM
    if (!byMonth[ym]) byMonth[ym] = { total: 0, count: 0 }
    byMonth[ym].total += e.amount
    byMonth[ym].count++
  }

  const months = Object.entries(byMonth)
    .sort((a, b) => b[0].localeCompare(a[0])) // 最新在前
    .slice(0, 6) // 最多显示 6 个月

  const lines = months.map(([ym, { total, count }]) => {
    const [y, m] = ym.split('-')
    return `${y}年${parseInt(m)}月：${count}笔，共¥${total}`
  })

  const firstDate = older.reduce((min, e) => e.date < min ? e.date : min, older[0].date)
  return `最早记录 ${firstDate}，共 ${older.length} 笔历史消费。${lines.join('；')}。用户询问具体日期时可搜索详细数据。`
}

/**
 * 构建消费数据梗概 — 仅发送总量和分类分布，不发送详细数据
 */
export function buildExpenseOverview(expenses: import('../types').Expense[]): string {
  if (expenses.length === 0) {
    return '暂无消费记录。'
  }

  const total = expenses.reduce((sum, e) => sum + e.amount, 0)

  // 按月统计最近3个月
  const now = new Date()
  const months: string[] = []
  for (let i = 0; i < 3; i++) {
    const y = now.getMonth() - i < 0 ? now.getFullYear() - 1 : now.getFullYear()
    const m = now.getMonth() - i < 0 ? now.getMonth() - i + 12 : now.getMonth() - i
    months.push(`${y}-${String(m + 1).padStart(2, '0')}`)
  }

  const byMonth: Record<string, number> = {}
  for (const e of expenses) {
    const ym = e.date.slice(0, 7)
    byMonth[ym] = (byMonth[ym] || 0) + e.amount
  }

  const monthParts = months
    .filter(m => byMonth[m])
    .map(m => {
      const [y, mm] = m.split('-')
      return `${y}年${parseInt(mm)}月¥${byMonth[m]}`
    })

  // 分类 TOP 5
  const byCategory: Record<string, number> = {}
  for (const e of expenses) {
    byCategory[e.category] = (byCategory[e.category] || 0) + e.amount
  }
  const top5 = Object.entries(byCategory)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([cat, amt]) => `${cat}¥${amt}`)
    .join('、')

  const firstDate = expenses.reduce((min, e) => e.date < min ? e.date : min, expenses[0].date)
  return `共${expenses.length}笔，总计¥${total}。近3月：${monthParts.join('、') || '无数据'}。主要分类：${top5}。最早记录${firstDate}。用户询问具体日期可搜索详细数据。`
}

/**
 * 标准化单条记账数据，返回 null 表示无效
 */
function normalizeExpense(item: Record<string, unknown>): ParsedExpense | null {
  const amount = Number(item.amount)
  if (!amount || amount <= 0) return null

  const category = String(item.category || '').trim()
  if (!category) return null

  const note = String(item.note || '').trim()

  let date = String(item.date || '').trim()
  // 如果没有日期或格式不对，使用今天
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    date = formatLocalDate(new Date())
  }

  return { amount, category, note, date }
}
