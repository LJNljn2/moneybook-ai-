<template>
  <view class="statistics-page">
    <view class="placeholder">
      <text class="placeholder-text">统计数据</text>
      <text class="placeholder-hint">功能开发中，敬请期待</text>
    </view>
  </view>
</template>

<script setup lang="ts">
</script>

<style>
.statistics-page {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background-color: #f8f8f8;
}

.placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.placeholder-text {
  font-size: 40rpx;
  color: #333;
  margin-bottom: 16rpx;
}

.placeholder-hint {
  font-size: 28rpx;
  color: #999;
}
</style>
