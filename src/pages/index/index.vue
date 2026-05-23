<template>
  <view class="content">
    <image class="logo" src="/static/logo.png" />
    <view class="text-area">
      <text class="title">MoneyChat</text>
    </view>
    <button class="nav-btn" @click="goToSettings">设置</button>
  </view>
</template>

<script setup lang="ts">
function goToSettings() {
  uni.navigateTo({ url: '/pages/settings/settings' })
}
</script>

<style>
.content {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.logo {
  height: 200rpx;
  width: 200rpx;
  margin-top: 200rpx;
  margin-left: auto;
  margin-right: auto;
  margin-bottom: 50rpx;
}

.text-area {
  display: flex;
  justify-content: center;
  margin-bottom: 40rpx;
}

.title {
  font-size: 36rpx;
  color: #333;
}

.nav-btn {
  background-color: #2b7cff;
  color: #fff;
  font-size: 30rpx;
  border-radius: 12rpx;
  padding: 0 60rpx;
  line-height: 88rpx;
}
</style>
