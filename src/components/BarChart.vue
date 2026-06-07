<template>
  <view class="bar-chart-container">
    <view class="bar-chart-title">
      <text class="bar-chart-title-text">{{ props.mode === 'weekly' ? '每周支出' : '每日支出' }}</text>
    </view>
    <view class="bar-chart-body" v-if="bars.length > 0">
      <svg viewBox="0 0 320 135" class="bar-svg">
        <!-- Y axis labels -->
        <text x="0" y="12" class="axis-label">¥{{ formatAmount(maxValue) }}</text>
        <text x="0" y="58" class="axis-label">¥{{ formatAmount(maxValue / 2) }}</text>
        <text x="0" y="100" class="axis-label">¥0</text>
        <!-- Grid lines -->
        <line x1="36" y1="10" x2="320" y2="10" stroke="#f0f0f0" stroke-width="0.5" />
        <line x1="36" y1="55" x2="320" y2="55" stroke="#f0f0f0" stroke-width="0.5" />
        <line x1="36" y1="100" x2="320" y2="100" stroke="#f0f0f0" stroke-width="0.5" />
        <!-- Bars -->
        <rect
          v-for="(bar, i) in bars"
          :key="i"
          :x="bar.x"
          :y="bar.y"
          :width="bar.width"
          :height="bar.height"
          :fill="bar.color"
          rx="2"
        />
        <!-- X axis date labels -->
        <text
          v-for="(label, i) in xLabels"
          :key="'x' + i"
          :x="label.x"
          y="115"
          text-anchor="middle"
          class="axis-label"
        >{{ label.text }}</text>
      </svg>
      <view class="bar-chart-footer">
        <text class="bar-chart-hint">{{ monthLabel }} · {{ bars.length }} {{ props.mode === 'weekly' ? '周' : '天' }}有支出</text>
      </view>
    </view>
    <view class="bar-empty" v-else>
      <text class="bar-empty-text">暂无数据</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface DailyData {
  date: string
  amount: number
}

const props = defineProps<{
  data: DailyData[]
  monthLabel: string
  mode?: 'daily' | 'weekly'
}>()

const CHART_LEFT = 36
const CHART_RIGHT = 320
const CHART_TOP = 10
const CHART_BOTTOM = 100
const CHART_H = CHART_BOTTOM - CHART_TOP

interface Bar {
  x: number
  y: number
  width: number
  height: number
  color: string
}

const maxValue = computed(() => {
  if (props.data.length === 0) return 0
  const max = Math.max(...props.data.map(d => d.amount))
  return max > 0 ? max : 1
})

const bars = computed<Bar[]>(() => {
  const count = props.data.length
  if (count === 0) return []

  const chartWidth = CHART_RIGHT - CHART_LEFT
  const barWidth = count === 1 ? 20 : Math.max(2, Math.min(16, chartWidth / count * 0.7))

  return props.data.map((d, i) => {
    const x = count === 1
      ? CHART_LEFT + chartWidth / 2 - barWidth / 2
      : CHART_LEFT + (i * chartWidth) / (count - 1) - barWidth / 2
    const height = Math.max(2, (d.amount / maxValue.value) * CHART_H)
    return {
      x: Math.round(x),
      y: Math.round(CHART_BOTTOM - height),
      width: Math.round(barWidth),
      height: Math.round(height),
      color: '#2B7CFF',
    }
  })
})

function formatAmount(v: number): string {
  if (v >= 1000) return (v / 1000).toFixed(1) + 'k'
  return Math.round(v).toString()
}

interface XLabel {
  x: number
  text: string
}

const xLabels = computed<XLabel[]>(() => {
  const count = props.data.length
  if (count === 0) return []

  const chartWidth = CHART_RIGHT - CHART_LEFT
  // Show max ~8 labels to avoid overlap
  const step = Math.max(1, Math.ceil(count / 8))
  const labels: XLabel[] = []

  for (let i = 0; i < count; i += step) {
    const x = count === 1
      ? CHART_LEFT + chartWidth / 2
      : CHART_LEFT + (i * chartWidth) / (count - 1)
    const d = props.data[i]
    let text: string
    if (props.mode === 'weekly') {
      // Show MM/DD for week start
      const parts = d.date.split('-')
      text = `${parseInt(parts[1])}/${parseInt(parts[2])}`
    } else {
      // Show day number
      text = `${parseInt(d.date.split('-')[2])}日`
    }
    labels.push({ x: Math.round(x), text })
  }

  // Always show last label
  if (count > 1 && (count - 1) % step !== 0) {
    const d = props.data[count - 1]
    let text: string
    if (props.mode === 'weekly') {
      const parts = d.date.split('-')
      text = `${parseInt(parts[1])}/${parseInt(parts[2])}`
    } else {
      text = `${parseInt(d.date.split('-')[2])}日`
    }
    labels.push({ x: CHART_RIGHT, text })
  }

  return labels
})
</script>

<style scoped>
.bar-chart-container {
  background-color: #fff;
  border-radius: 16rpx;
  padding: 24rpx;
  margin-bottom: 16rpx;
}

.bar-chart-title {
  margin-bottom: 16rpx;
}

.bar-chart-title-text {
  font-size: 28rpx;
  font-weight: bold;
  color: #333;
}

.bar-chart-body {
  align-items: center;
}

.bar-svg {
  width: 100%;
  height: 135px;
}

.axis-label {
  font-size: 8px;
  fill: #999;
}

.bar-chart-footer {
  margin-top: 8rpx;
}

.bar-chart-hint {
  font-size: 22rpx;
  color: #bbb;
}

.bar-empty {
  padding: 30rpx 0;
  align-items: center;
}

.bar-empty-text {
  font-size: 24rpx;
  color: #ccc;
}
</style>
