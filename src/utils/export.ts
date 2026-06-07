import * as XLSX from 'xlsx'
import type { Expense } from '@/types'

interface ExportRow {
  日期: string
  分类: string
  金额: number
  备注: string
}

export function exportToExcel(expenses: Expense[], filename: string): void {
  const rows: ExportRow[] = expenses.map(e => ({
    日期: e.date,
    分类: e.category,
    金额: e.amount,
    备注: e.note || '',
  }))

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(rows)

  // Set column widths
  ws['!cols'] = [
    { wch: 12 }, // 日期
    { wch: 10 }, // 分类
    { wch: 12 }, // 金额
    { wch: 30 }, // 备注
  ]

  XLSX.utils.book_append_sheet(wb, ws, '记账明细')
  XLSX.writeFile(wb, `${filename}.xlsx`)
}
