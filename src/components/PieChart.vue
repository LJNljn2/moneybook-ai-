<template>
  <view class="pie-chart-container">
    <view class="pie-chart-title">
      <text class="pie-chart-title-text">分类占比</text>
    </view>
    <view class="pie-chart-body" v-if="slices.length > 0">
      <svg viewBox="0 0 320 160" class="pie-svg">
        <path
          v-for="(slice, i) in slices"
          :key="i"
          :d="slice.path"
          :fill="slice.color"
          stroke="#fff"
          stroke-width="1"
          @tap="$emit('slice-click', slice.name)"
        />
        <text
          v-for="(label, i) in labels"
          :key="'l' + i"
          :x="label.x"
          :y="label.y"
          text-anchor="middle"
          dominant-baseline="central"
          class="pie-label"
        >{{ label.text }}</text>
      </svg>
      <view class="pie-legend">
        <view class="legend-item" v-for="(item, i) in items" :key="i">
          <view class="legend-color" :style="{ backgroundColor: item.color }"></view>
          <text class="legend-text">{{ item.icon }} {{ item.name }} {{ getPercent(item.value) }}%</text>
        </view>
      </view>
    </view>
    <view class="pie-empty" v-else>
      <text class="pie-empty-text">暂无数据</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface PieItem {
  name: string
  value: number
  color: string
  icon: string
}

const props = defineProps<{ items: PieItem[] }>()
const emit = defineEmits<{ (e: 'slice-click', name: string): void }>()

const total = computed(() => props.items.reduce((s, i) => s + i.value, 0))

function getPercent(v: number): number {
  if (total.value === 0) return 0
  return Math.round((v / total.value) * 100)
}

interface Slice {
  path: string
  color: string
  name: string
}

interface Label {
  x: number
  y: number
  text: string
}

const CX = 75
const CY = 80
const R = 55

const slices = computed<Slice[]>(() => {
  if (total.value === 0) return []
  const result: Slice[] = []
  let startAngle = -Math.PI / 2

  for (const item of props.items) {
    const fraction = item.value / total.value
    const sweep = fraction * 2 * Math.PI
    const endAngle = startAngle + sweep

    const x1 = CX + R * Math.cos(startAngle)
    const y1 = CY + R * Math.sin(startAngle)
    const x2 = CX + R * Math.cos(endAngle)
    const y2 = CY + R * Math.sin(endAngle)
    const largeArc = sweep > Math.PI ? 1 : 0

    let path: string
    if (fraction >= 0.999) {
      // Full circle: draw two semicircles
      const mx = CX + R * Math.cos(startAngle + Math.PI)
      const my = CY + R * Math.sin(startAngle + Math.PI)
      path = `M${CX},${CY} L${x1.toFixed(1)},${y1.toFixed(1)} A${R},${R} 0 1,1 ${mx.toFixed(1)},${my.toFixed(1)} A${R},${R} 0 1,1 ${x1.toFixed(1)},${y1.toFixed(1)} Z`
    } else {
      path = `M${CX},${CY} L${x1.toFixed(1)},${y1.toFixed(1)} A${R},${R} 0 ${largeArc},1 ${x2.toFixed(1)},${y2.toFixed(1)} Z`
    }

    result.push({ path, color: item.color, name: item.name })
    startAngle = endAngle
  }
  return result
})

const labels = computed<Label[]>(() => {
  if (total.value === 0) return []
  const result: Label[] = []
  let startAngle = -Math.PI / 2

  for (const item of props.items) {
    const fraction = item.value / total.value
    if (fraction >= 0.05) {
      const midAngle = startAngle + fraction * Math.PI
      const centroidX = CX + (R * 0.55) * Math.cos(midAngle)
      const centroidY = CY + (R * 0.55) * Math.sin(midAngle)
      const pct = Math.round(fraction * 100)
      const offsetY = midAngle > 0 ? 10 : -10
      result.push({
        x: Math.round(centroidX - 5),
        y: Math.round(centroidY + offsetY),
        text: `${pct}%`,
      })
    }
    startAngle += fraction * 2 * Math.PI
  }
  return result
})
</script>

<style scoped>
.pie-chart-container {
  background-color: #fff;
  border-radius: 16rpx;
  padding: 24rpx;
  margin-bottom: 16rpx;
}

.pie-chart-title {
  margin-bottom: 16rpx;
}

.pie-chart-title-text {
  font-size: 28rpx;
  font-weight: bold;
  color: #333;
}

.pie-chart-body {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
}

.pie-svg {
  width: 320rpx;
  height: 160rpx;
  flex-shrink: 0;
}

.pie-label {
  font-size: 10px;
  fill: #fff;
  font-weight: bold;
}

.pie-legend {
  flex: 1;
  margin-left: 20rpx;
}

.legend-item {
  display: flex;
  flex-direction: row;
  align-items: center;
  margin-bottom: 10rpx;
}

.legend-color {
  width: 16rpx;
  height: 16rpx;
  border-radius: 4rpx;
  margin-right: 8rpx;
  flex-shrink: 0;
}

.legend-text {
  font-size: 22rpx;
  color: #666;
}

.pie-empty {
  padding: 30rpx 0;
  align-items: center;
}

.pie-empty-text {
  font-size: 24rpx;
  color: #ccc;
}
</style>
