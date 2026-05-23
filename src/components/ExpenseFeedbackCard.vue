<template>
  <view class="expense-card" :class="{ 'expense-card--deleted': isDeleted }">
    <view class="expense-card-header">
      <view class="expense-card-icon">{{ categoryIcon }}</view>
      <view class="expense-card-info">
        <view class="expense-card-top">
          <text class="expense-card-category">{{ expense.category }}</text>
          <text class="expense-card-amount">¥{{ expense.amount.toFixed(2) }}</text>
        </view>
        <text class="expense-card-note" v-if="expense.note">{{ expense.note }}</text>
        <text class="expense-card-date">{{ expense.date }}</text>
      </view>
    </view>
    <view class="expense-card-status">
      <text class="expense-card-status-text" v-if="!isDeleted">已记录</text>
      <text class="expense-card-status-text expense-card-status-text--deleted" v-else>已删除</text>
    </view>
    <view class="expense-card-actions" v-if="!isDeleted">
      <view class="expense-card-btn expense-card-btn--edit" @tap="$emit('edit', expense)">
        <text class="expense-card-btn-text">编辑</text>
      </view>
      <view class="expense-card-btn expense-card-btn--delete" @tap="$emit('delete', expense)">
        <text class="expense-card-btn-text">删除</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { Expense } from '@/types'
import { categoryService } from '@/store/categories'

const props = defineProps<{
  expense: Expense
  isDeleted?: boolean
}>()

defineEmits<{
  edit: [expense: Expense]
  delete: [expense: Expense]
}>()

const categoryIcon = computed(() => {
  const categories = categoryService.getAll()
  const cat = categories.find(c => c.name === props.expense.category)
  return cat?.icon || '📌'
})
</script>

<style scoped>
.expense-card {
  background-color: #fff;
  border-radius: 16rpx;
  padding: 24rpx;
  border: 1rpx solid #e8e8e8;
  min-width: 400rpx;
}

.expense-card--deleted {
  opacity: 0.5;
}

.expense-card-header {
  display: flex;
  align-items: center;
  margin-bottom: 16rpx;
}

.expense-card-icon {
  font-size: 48rpx;
  margin-right: 20rpx;
  width: 72rpx;
  height: 72rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #f5f5f5;
  border-radius: 16rpx;
  flex-shrink: 0;
}

.expense-card-info {
  flex: 1;
  min-width: 0;
}

.expense-card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8rpx;
}

.expense-card-category {
  font-size: 26rpx;
  color: #666;
}

.expense-card-amount {
  font-size: 36rpx;
  font-weight: bold;
  color: #2b7cff;
}

.expense-card-note {
  font-size: 28rpx;
  color: #333;
  margin-bottom: 4rpx;
}

.expense-card-date {
  font-size: 22rpx;
  color: #999;
}

.expense-card-status {
  display: flex;
  align-items: center;
  margin-bottom: 16rpx;
}

.expense-card-status-text {
  font-size: 22rpx;
  color: #52c41a;
  padding: 4rpx 12rpx;
  background-color: #f6ffed;
  border-radius: 6rpx;
}

.expense-card-status-text--deleted {
  color: #ff4d4f;
  background-color: #fff2f0;
}

.expense-card-actions {
  display: flex;
  gap: 16rpx;
}

.expense-card-btn {
  flex: 1;
  height: 60rpx;
  border-radius: 8rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.expense-card-btn--edit {
  background-color: #f0f5ff;
  border: 1rpx solid #d6e4ff;
}

.expense-card-btn--delete {
  background-color: #fff2f0;
  border: 1rpx solid #ffccc7;
}

.expense-card-btn-text {
  font-size: 24rpx;
}

.expense-card-btn--edit .expense-card-btn-text {
  color: #2b7cff;
}

.expense-card-btn--delete .expense-card-btn-text {
  color: #ff4d4f;
}
</style>
