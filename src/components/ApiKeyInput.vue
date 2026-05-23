<script setup lang="ts">
import { ref, computed } from 'vue'

const props = withDefaults(
  defineProps<{
    modelValue: string
    placeholder?: string
    disabled?: boolean
  }>(),
  {
    placeholder: '请输入 API Key',
    disabled: false,
  }
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const showKey = ref(false)

const inputType = computed(() => (showKey.value ? 'text' : 'password'))

const displayValue = computed({
  get: () => props.modelValue,
  set: (val: string) => emit('update:modelValue', val),
})

function toggleVisibility() {
  showKey.value = !showKey.value
}
</script>

<template>
  <view class="api-key-input">
    <input
      class="api-key-field"
      :type="inputType"
      v-model="displayValue"
      :placeholder="placeholder"
      :disabled="disabled"
      :password="!showKey"
    />
    <view class="toggle-btn" @click="toggleVisibility">
      <text class="toggle-text">{{ showKey ? '隐藏' : '显示' }}</text>
    </view>
  </view>
</template>

<style scoped>
.api-key-input {
  display: flex;
  flex-direction: row;
  align-items: center;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 0 12px;
  background-color: #fff;
}

.api-key-field {
  flex: 1;
  height: 88rpx;
  font-size: 28rpx;
  color: #333;
}

.toggle-btn {
  padding: 8rpx 16rpx;
  flex-shrink: 0;
}

.toggle-text {
  font-size: 26rpx;
  color: #2b7cff;
}
</style>
