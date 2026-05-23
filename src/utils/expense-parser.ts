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
