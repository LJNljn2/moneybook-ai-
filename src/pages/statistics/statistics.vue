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
          <!-- Month tab with inline navigation -->
          <template v-if="tab.key === 'month' && activeDateTab === 'month'">
            <view class="month-switcher-inline" @tap.stop>
              <view class="month-arrow" @tap="prevMonth">
                <text class="month-arrow-text">&lt;</text>
              </view>
              <text class="filter-tab-text">{{ monthLabel }}</text>
              <view
                class="month-arrow"
                :class="{ 'month-arrow--disabled': isCurrentMonth }"
                @tap="nextMonth"
              >
                <text class="month-arrow-text">&gt;</text>
              </view>
            </view>
          </template>
          <template v-else>
            <text class="filter-tab-text">{{ tab.label }}</text>
          </template>
        </view>
      </view>
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

    <!-- Summary card + charts (month tab only) -->
    <template v-if="activeDateTab === 'month'">
      <view class="summary-card">
        <view class="summary-card-title">
          <text class="summary-card-label">{{ monthLabel }}总支出</text>
        </view>
        <text class="summary-card-amount">¥{{ monthTotal.toFixed(2) }}</text>
      </view>

      <view class="charts-area" v-if="monthTotal > 0">
        <PieChart :items="categoryPieData" />
        <BarChart :data="dailyBarData" :monthLabel="monthLabel" />
      </view>
    </template>

    <!-- Summary bar -->
    <view class="summary-bar">
      <text class="summary-text">
        共 {{ filteredExpenses.length }} 笔，合计 ¥{{ totalAmount.toFixed(2) }}
      </text>
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

type DateTab = 'today' | 'week' | 'month' | 'all'

interface DateTabItem {
  key: DateTab
  label: string
}

const dateTabs: DateTabItem[] = [
  { key: 'today', label: '今天' },
  { key: 'week', label: '本周' },
  { key: 'month', label: '本月' },
  { key: 'all', label: '全部' },
]

const activeDateTab = ref<DateTab>('month')
const selectedCategories = ref<string[]>([])
const categories = ref<Category[]>([])
const allExpenses = ref<Expense[]>([])

// Month navigation state: 'YYYY-MM' format
const selectedMonth = ref(formatYearMonth(new Date()))

function formatYearMonth(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function formatMonthLabel(ym: string): string {
  const [y, m] = ym.split('-')
  return `${y}年${parseInt(m)}月`
}

const monthLabel = computed(() => formatMonthLabel(selectedMonth.value))

const isCurrentMonth = computed(() => {
  return selectedMonth.value === formatYearMonth(new Date())
})

function prevMonth() {
  const [y, m] = selectedMonth.value.split('-').map(Number)
  const d = new Date(y, m - 2, 1) // m-2 because m is 1-indexed and we want previous month
  selectedMonth.value = formatYearMonth(d)
}

function nextMonth() {
  if (isCurrentMonth.value) return
  const [y, m] = selectedMonth.value.split('-').map(Number)
  const d = new Date(y, m, 1) // m is 1-indexed, so m gives next month
  selectedMonth.value = formatYearMonth(d)
}

function loadData() {
  categories.value = categoryService.getAll()
  allExpenses.value = expenseService.getAll()
}

onShow(() => {
  loadData()
})

function getDateRange(tab: DateTab): { start: string; end: string } {
  const now = new Date()
  const today = now.toISOString().slice(0, 10)

  switch (tab) {
    case 'today':
      return { start: today, end: today }
    case 'week': {
      const dayOfWeek = now.getDay() || 7 // Monday = 1
      const monday = new Date(now)
      monday.setDate(now.getDate() - dayOfWeek + 1)
      return { start: monday.toISOString().slice(0, 10), end: today }
    }
    case 'month': {
      const [y, m] = selectedMonth.value.split('-').map(Number)
      const firstDay = new Date(y, m - 1, 1)
      const lastDay = new Date(y, m, 0) // day 0 of next month = last day of current
      return {
        start: firstDay.toISOString().slice(0, 10),
        end: lastDay.toISOString().slice(0, 10),
      }
    }
    case 'all':
      return { start: '0000-01-01', end: '9999-12-31' }
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

// Month-specific data for charts
const monthExpenses = computed(() => {
  const { start, end } = getDateRange('month')
  return expenseService.getByDateRangeAndCategory(start, end)
})

const monthTotal = computed(() => {
  return monthExpenses.value.reduce((sum, e) => sum + e.amount, 0)
})

const categoryPieData = computed(() => {
  const catMap = new Map<string, number>()
  for (const e of monthExpenses.value) {
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

const dailyBarData = computed(() => {
  const dayMap = new Map<string, number>()
  for (const e of monthExpenses.value) {
    dayMap.set(e.date, (dayMap.get(e.date) ?? 0) + e.amount)
  }
  return Array.from(dayMap.entries())
    .map(([date, amount]) => ({ date, amount }))
    .sort((a, b) => a.date.localeCompare(b.date))
})

function getCategoryIcon(categoryName: string): string {
  const cat = categories.value.find(c => c.name === categoryName)
  return cat?.icon || '📌'
}

function handleEdit(expense: Expense) {
  uni.showModal({
    title: '编辑备注',
    content: expense.note || '(无备注)',
    editable: true,
    placeholderText: '输入新的备注...',
    success(res) {
      if (res.confirm && res.content !== undefined) {
        expenseService.update(expense.id, { note: res.content })
        loadData()
      }
    },
  })
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

.month-switcher-inline {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12rpx;
}

.month-arrow {
  width: 40rpx;
  height: 40rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.month-arrow--disabled {
  opacity: 0.3;
}

.month-arrow-text {
  font-size: 28rpx;
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

/* Summary bar */
.summary-bar {
  padding: 16rpx 24rpx;
}

.summary-text {
  font-size: 26rpx;
  color: #999;
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
</style>
