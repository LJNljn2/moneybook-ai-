/**
 * 从 AI 回复文本中提取记账 JSON 数据
 * AI 回复格式：自然语言 + 末尾的 ```json\n{"expenses": [...]}\n```
 */

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
  const startStr = start.toISOString().slice(0, 10)
  const endStr = now.toISOString().slice(0, 10)

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
    date = new Date().toISOString().slice(0, 10)
  }

  return { amount, category, note, date }
}
