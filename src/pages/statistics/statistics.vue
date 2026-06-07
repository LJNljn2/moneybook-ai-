<template>
  <view class="statistics-page">
    <!-- Date range filter -->
    <view class="filter-bar">
      <view class="filter-tabs">
        <view
          v-for="tab in dateTabs"
          :key="tab.key"
          class="filter-tab"
          :class="{ 'filter-tab--active': activeDateTab === tab.key }"
          @tap="selectDateTab(tab.key)"
        >
          <text class="filter-tab-text">{{ tab.label }}</text>
        </view>
      </view>
    </view>

    <!-- Custom date range picker -->
    <view v-if="activeDateTab === 'custom'" class="custom-range-bar">
      <picker mode="date" :value="customStart" :end="customEnd || today" @change="onCustomStartChange">
        <view class="custom-range-item">
          <text class="custom-range-label">开始</text>
          <text class="custom-range-value">{{ customStart || '选择日期' }}</text>
        </view>
      </picker>
      <text class="custom-range-sep">—</text>
      <picker mode="date" :value="customEnd" :start="customStart" :end="today" @change="onCustomEndChange">
        <view class="custom-range-item">
          <text class="custom-range-label">结束</text>
          <text class="custom-range-value">{{ customEnd || '选择日期' }}</text>
        </view>
      </picker>
    </view>

    <!-- Category filter -->
    <scroll-view class="category-filter" scroll-x>
      <view class="category-chips">
        <view
          class="category-chip"
          :class="{ 'category-chip--active': selectedCategories.length === 0 }"
          @tap="clearCategoryFilter"
        >
          <text class="category-chip-text">全部</text>
        </view>
        <view
          v-for="cat in categories"
          :key="cat.id"
          class="category-chip"
          :class="{ 'category-chip--active': selectedCategories.includes(cat.name) }"
          @tap="toggleCategory(cat.name)"
        >
          <text class="category-chip-text">{{ cat.icon }} {{ cat.name }}</text>
        </view>
      </view>
    </scroll-view>

    <!-- Charts section -->
    <template v-if="filteredExpenses.length > 0">
      <!-- Summary card -->
      <view class="summary-card">
        <view class="summary-card-title">
          <text class="summary-card-label">{{ dateRangeLabel }}总支出</text>
        </view>
        <text class="summary-card-amount">¥{{ totalAmount.toFixed(2) }}</text>
      </view>

      <!-- Charts -->
      <view class="charts-area">
        <PieChart :items="categoryPieData" @slice-click="onPieSliceClick" />
        <BarChart :data="barData" :monthLabel="dateRangeLabel" :mode="barMode" />
      </view>
    </template>

    <!-- Summary bar -->
    <view class="summary-bar">
      <text class="summary-text">
        共 {{ filteredExpenses.length }} 笔，合计 ¥{{ totalAmount.toFixed(2) }}
      </text>
      <view class="export-btn" @tap="handleExport" v-if="filteredExpenses.length > 0">
        <text class="export-btn-text">导出 Excel</text>
      </view>
    </view>

    <!-- Expense list -->
    <scroll-view class="expense-list" scroll-y v-if="filteredExpenses.length > 0">
      <view class="expense-list-inner">
        <view
          v-for="expense in filteredExpenses"
          :key="expense.id"
          class="expense-item"
        >
          <view class="expense-item-icon">
            <text class="expense-item-emoji">{{ getCategoryIcon(expense.category) }}</text>
          </view>
          <view class="expense-item-body">
            <view class="expense-item-top">
              <text class="expense-item-category">{{ expense.category }}</text>
              <text class="expense-item-amount">¥{{ expense.amount.toFixed(2) }}</text>
            </view>
            <view class="expense-item-bottom">
              <text class="expense-item-note">{{ expense.note || '无备注' }}</text>
              <text class="expense-item-date">{{ expense.date }}</text>
            </view>
          </view>
          <view class="expense-item-actions">
            <view class="expense-action-btn" @tap="handleEdit(expense)">
              <text class="expense-action-text">编辑</text>
            </view>
            <view class="expense-action-btn expense-action-btn--delete" @tap="handleDelete(expense)">
              <text class="expense-action-text expense-action-text--delete">删除</text>
            </view>
          </view>
        </view>
      </view>
    </scroll-view>

    <!-- Empty state -->
    <view class="empty-state" v-else>
      <text class="empty-title">暂无记录</text>
      <text class="empty-hint">去对话页面记一笔吧</text>
    </view>

    <!-- Edit note modal -->
    <view class="modal-overlay" v-if="editModal.show" @tap="closeEditModal">
      <view class="modal-card" @tap.stop>
        <view class="modal-handle"></view>
        <view class="modal-header">
          <text class="modal-title">编辑备注</text>
          <view class="modal-close" @tap="closeEditModal">
            <text class="modal-close-text">&times;</text>
          </view>
        </view>
        <view class="modal-expense-info">
          <text class="modal-expense-emoji">{{ getCategoryIcon(editModal.expense?.category || '') }}</text>
          <text class="modal-expense-label">{{ editModal.expense?.category }} ¥{{ editModal.expense?.amount?.toFixed(2) }}</text>
        </view>
        <view class="modal-input-wrap">
          <input
            class="modal-input"
            v-model="editModal.note"
            placeholder="添加备注..."
            :focus="editModal.show"
            maxlength="200"
          />
        </view>
        <view class="modal-actions">
          <view class="modal-btn modal-btn--cancel" @tap="closeEditModal">
            <text class="modal-btn-text">取消</text>
          </view>
          <view class="modal-btn modal-btn--save" @tap="saveEditNote">
            <text class="modal-btn-text modal-btn-text--save">保存</text>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { expenseService } from '@/store/expenses'
import { categoryService } from '@/store/categories'
import type { Expense, Category } from '@/types'
import PieChart from '@/components/PieChart.vue'
import BarChart from '@/components/BarChart.vue'
import { exportToExcel } from '@/utils/export'
import { formatLocalDate } from '@/utils/date-format'

type DateTab = 'today' | 'week' | 'month' | 'all' | 'custom'

interface DateTabItem {
  key: DateTab
  label: string
}

const dateTabs: DateTabItem[] = [
  { key: 'today', label: '今天' },
  { key: 'week', label: '本周' },
  { key: 'month', label: '本月' },
  { key: 'all', label: '全部' },
  { key: 'custom', label: '日期筛选' },
]

const activeDateTab = ref<DateTab>('month')
const selectedCategories = ref<string[]>([])
const categories = ref<Category[]>([])
const allExpenses = ref<Expense[]>([])

// Month navigation state: 'YYYY-MM' format
const selectedMonth = ref(formatYearMonth(new Date()))

// Custom date range
const customStart = ref('')
const customEnd = ref('')
const today = formatLocalDate(new Date())

function onCustomStartChange(e: any) {
  customStart.value = e.detail.value
}

function onCustomEndChange(e: any) {
  customEnd.value = e.detail.value
}

function formatYearMonth(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function formatMonthLabel(ym: string): string {
  const [y, m] = ym.split('-')
  return `${y}年${parseInt(m)}月`
}

const monthLabel = computed(() => formatMonthLabel(selectedMonth.value))

const dateRangeLabel = computed(() => {
  const range = getDateRange(activeDateTab.value)
  if (activeDateTab.value === 'custom' && customStart.value && customEnd.value) {
    return `${customStart.value} 至 ${customEnd.value}`
  }
  if (activeDateTab.value === 'month') return monthLabel.value
  if (activeDateTab.value === 'today') return '今日'
  if (activeDateTab.value === 'week') return '本周'
  if (activeDateTab.value === 'all') return '全部'
  return ''
})

function loadData() {
  categories.value = categoryService.getAll()
  allExpenses.value = expenseService.getAll()
}

onShow(() => {
  loadData()
})

function getDateRange(tab: DateTab): { start: string; end: string } {
  const now = new Date()
  const t = formatLocalDate(now)

  switch (tab) {
    case 'today':
      return { start: t, end: t }
    case 'week': {
      const dayOfWeek = now.getDay() || 7
      const monday = new Date(now)
      monday.setDate(now.getDate() - dayOfWeek + 1)
      return { start: formatLocalDate(monday), end: t }
    }
    case 'month': {
      const [y, m] = selectedMonth.value.split('-').map(Number)
      const firstDay = new Date(y, m - 1, 1)
      const lastDay = new Date(y, m, 0)
      return {
        start: formatLocalDate(firstDay),
        end: formatLocalDate(lastDay),
      }
    }
    case 'all':
      return { start: '0000-01-01', end: '9999-12-31' }
    case 'custom':
      if (customStart.value && customEnd.value) {
        return { start: customStart.value, end: customEnd.value }
      }
      return { start: t, end: t }
  }
}

function selectDateTab(tab: DateTab) {
  activeDateTab.value = tab
}

function toggleCategory(name: string) {
  const idx = selectedCategories.value.indexOf(name)
  if (idx >= 0) {
    selectedCategories.value.splice(idx, 1)
  } else {
    selectedCategories.value.push(name)
  }
}

function clearCategoryFilter() {
  selectedCategories.value = []
}

function onPieSliceClick(name: string) {
  // Set category filter to just this category
  selectedCategories.value = [name]
}

const filteredExpenses = computed(() => {
  const { start, end } = getDateRange(activeDateTab.value)
  return expenseService.getByDateRangeAndCategory(
    start,
    end,
    selectedCategories.value.length > 0 ? selectedCategories.value : undefined
  )
})

const totalAmount = computed(() => {
  return filteredExpenses.value.reduce((sum, e) => sum + e.amount, 0)
})

// Charts use same data as the list
const categoryPieData = computed(() => {
  const catMap = new Map<string, number>()
  for (const e of filteredExpenses.value) {
    catMap.set(e.category, (catMap.get(e.category) ?? 0) + e.amount)
  }
  return Array.from(catMap.entries())
    .map(([name, amount]) => {
      const cat = categories.value.find(c => c.name === name)
      return {
        name,
        value: amount,
        color: cat?.color || '#999',
        icon: cat?.icon || '📌',
      }
    })
    .sort((a, b) => b.value - a.value)
})

// Bar chart mode: daily for <= 31 days, weekly for longer
const barMode = computed((): 'daily' | 'weekly' => {
  const { start, end } = getDateRange(activeDateTab.value)
  const days = Math.ceil((new Date(end).getTime() - new Date(start).getTime()) / 86400000)
  return days <= 31 ? 'daily' : 'weekly'
})

const barData = computed(() => {
  if (barMode.value === 'weekly') {
    const weekMap = new Map<string, number>()
    for (const e of filteredExpenses.value) {
      const weekKey = getWeekKey(e.date)
      weekMap.set(weekKey, (weekMap.get(weekKey) ?? 0) + e.amount)
    }
    return Array.from(weekMap.entries())
      .map(([date, amount]) => ({ date, amount }))
      .sort((a, b) => a.date.localeCompare(b.date))
  }
  const dayMap = new Map<string, number>()
  for (const e of filteredExpenses.value) {
    dayMap.set(e.date, (dayMap.get(e.date) ?? 0) + e.amount)
  }
  return Array.from(dayMap.entries())
    .map(([date, amount]) => ({ date, amount }))
    .sort((a, b) => a.date.localeCompare(b.date))
})

function getWeekKey(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  const dayOfWeek = d.getDay() || 7 // Monday = 1
  const monday = new Date(d)
  monday.setDate(d.getDate() - dayOfWeek + 1)
  return formatLocalDate(monday)
}

function handleExport() {
  if (filteredExpenses.value.length === 0) {
    uni.showToast({ title: '暂无数据可导出', icon: 'none' })
    return
  }
  const now = new Date()
  const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
  const filename = `MoneyBookAI_${ts}`
  exportToExcel(filteredExpenses.value, filename)
  uni.showModal({
    title: '导出成功',
    content: `文件已保存为：\n${filename}.xlsx\n\n保存位置：设备「下载」文件夹`,
    showCancel: false,
    confirmText: '好的',
  })
}

function getCategoryIcon(categoryName: string): string {
  const cat = categories.value.find(c => c.name === categoryName)
  return cat?.icon || '📌'
}

const editModal = ref<{ show: boolean; expense: Expense | null; note: string }>({
  show: false,
  expense: null,
  note: '',
})

function handleEdit(expense: Expense) {
  editModal.value = {
    show: true,
    expense,
    note: expense.note || '',
  }
}

function closeEditModal() {
  editModal.value.show = false
}

function saveEditNote() {
  if (editModal.value.expense) {
    expenseService.update(editModal.value.expense.id, { note: editModal.value.note })
    loadData()
  }
  closeEditModal()
}

function handleDelete(expense: Expense) {
  uni.showModal({
    title: '确认删除',
    content: `确定删除「${expense.category} ¥${expense.amount}」吗？`,
    confirmColor: '#ff4d4f',
    success(res) {
      if (res.confirm) {
        expenseService.remove(expense.id)
        loadData()
      }
    },
  })
}
</script>

<style scoped>
.statistics-page {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background-color: #f8f8f8;
}

.filter-bar {
  background-color: #fff;
  padding: 20rpx 24rpx;
  border-bottom: 1rpx solid #eee;
}

.filter-tabs {
  display: flex;
  gap: 16rpx;
}

.filter-tab {
  flex: 1;
  height: 64rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 12rpx;
  background-color: #f5f5f5;
}

.filter-tab--active {
  background-color: #2b7cff;
}

.filter-tab-text {
  font-size: 26rpx;
  color: #666;
}

.filter-tab--active .filter-tab-text {
  color: #fff;
  font-weight: bold;
}

.category-filter {
  background-color: #fff;
  padding: 16rpx 24rpx;
  border-bottom: 1rpx solid #eee;
  white-space: nowrap;
}

.category-chips {
  display: inline-flex;
  gap: 12rpx;
}

.category-chip {
  display: inline-flex;
  align-items: center;
  height: 56rpx;
  padding: 0 20rpx;
  border-radius: 28rpx;
  background-color: #f5f5f5;
  border: 1rpx solid transparent;
}

.category-chip--active {
  background-color: #e8f0fe;
  border-color: #2b7cff;
}

.category-chip-text {
  font-size: 24rpx;
  color: #666;
}

.category-chip--active .category-chip-text {
  color: #2b7cff;
}

/* Custom date range inputs */
.custom-range-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16rpx;
  margin: 12rpx 24rpx 0;
  padding: 16rpx 24rpx;
  background-color: #fff;
  border-radius: 12rpx;
}

.custom-range-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8rpx 20rpx;
  background-color: #f5f5f5;
  border-radius: 8rpx;
}

.custom-range-label {
  font-size: 20rpx;
  color: #999;
}

.custom-range-value {
  font-size: 24rpx;
  color: #333;
  margin-top: 4rpx;
}

.custom-range-sep {
  font-size: 24rpx;
  color: #ccc;
}

/* Summary card */
.summary-card {
  background-color: #fff;
  margin: 16rpx 24rpx 0;
  border-radius: 16rpx;
  padding: 32rpx;
  align-items: center;
}

.summary-card-title {
  margin-bottom: 8rpx;
}

.summary-card-label {
  font-size: 26rpx;
  color: #999;
}

.summary-card-amount {
  font-size: 52rpx;
  font-weight: bold;
  color: #2b7cff;
}

/* Charts area */
.charts-area {
  padding: 0 24rpx;
}

.charts-empty {
  padding: 40rpx 0;
  align-items: center;
}

.charts-empty-text {
  font-size: 24rpx;
  color: #ccc;
}

/* Summary bar */
.summary-bar {
  padding: 16rpx 24rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.summary-text {
  font-size: 26rpx;
  color: #999;
}

.export-btn {
  padding: 8rpx 20rpx;
  background-color: #2b7cff;
  border-radius: 8rpx;
  flex-shrink: 0;
}

.export-btn-text {
  font-size: 24rpx;
  color: #fff;
}

.expense-list {
  flex: 1;
  overflow: hidden;
}

.expense-list-inner {
  padding: 0 24rpx 24rpx;
}

.expense-item {
  display: flex;
  align-items: center;
  background-color: #fff;
  border-radius: 16rpx;
  padding: 24rpx;
  margin-bottom: 16rpx;
}

.expense-item-icon {
  width: 72rpx;
  height: 72rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #f5f5f5;
  border-radius: 16rpx;
  flex-shrink: 0;
  margin-right: 20rpx;
}

.expense-item-emoji {
  font-size: 36rpx;
}

.expense-item-body {
  flex: 1;
  min-width: 0;
}

.expense-item-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8rpx;
}

.expense-item-category {
  font-size: 28rpx;
  color: #333;
  font-weight: bold;
}

.expense-item-amount {
  font-size: 32rpx;
  color: #2b7cff;
  font-weight: bold;
}

.expense-item-bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.expense-item-note {
  font-size: 24rpx;
  color: #999;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-right: 16rpx;
}

.expense-item-date {
  font-size: 22rpx;
  color: #bbb;
  flex-shrink: 0;
}

.expense-item-actions {
  display: flex;
  gap: 8rpx;
  margin-left: 12rpx;
  flex-shrink: 0;
}

.expense-action-btn {
  width: 64rpx;
  height: 48rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8rpx;
  background-color: #f0f5ff;
}

.expense-action-btn--delete {
  background-color: #fff2f0;
}

.expense-action-text {
  font-size: 22rpx;
  color: #2b7cff;
}

.expense-action-text--delete {
  color: #ff4d4f;
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding-top: 200rpx;
}

.empty-title {
  font-size: 36rpx;
  color: #999;
  margin-bottom: 16rpx;
}

.empty-hint {
  font-size: 26rpx;
  color: #ccc;
}

/* Edit note modal */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  z-index: 999;
}

.modal-card {
  width: 100%;
  background-color: #fff;
  border-radius: 32rpx 32rpx 0 0;
  padding: 16rpx 40rpx 48rpx;
  padding-bottom: calc(48rpx + env(safe-area-inset-bottom));
}

.modal-handle {
  width: 64rpx;
  height: 8rpx;
  background-color: #e0e0e0;
  border-radius: 4rpx;
  margin: 0 auto 28rpx;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 32rpx;
}

.modal-title {
  font-size: 34rpx;
  font-weight: 600;
  color: #1a1a1a;
}

.modal-close {
  width: 56rpx;
  height: 56rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #f5f5f5;
  border-radius: 50%;
}

.modal-close-text {
  font-size: 32rpx;
  color: #999;
  line-height: 1;
}

.modal-expense-info {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-bottom: 28rpx;
  padding: 20rpx 24rpx;
  background-color: #fafafa;
  border-radius: 16rpx;
}

.modal-expense-emoji {
  font-size: 36rpx;
}

.modal-expense-label {
  font-size: 26rpx;
  color: #666;
}

.modal-input-wrap {
  margin-bottom: 32rpx;
}

.modal-input {
  width: 100%;
  height: 96rpx;
  background-color: #f5f5f5;
  border-radius: 20rpx;
  padding: 0 28rpx;
  font-size: 28rpx;
  color: #333;
  border: 2rpx solid transparent;
}

.modal-actions {
  display: flex;
  gap: 16rpx;
}

.modal-btn {
  flex: 1;
  height: 88rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 44rpx;
}

.modal-btn--cancel {
  background-color: #f5f5f5;
}

.modal-btn--save {
  background-color: #1a1a1a;
}

.modal-btn-text {
  font-size: 28rpx;
  font-weight: 500;
  color: #666;
}

.modal-btn-text--save {
  color: #fff;
}
</style>
