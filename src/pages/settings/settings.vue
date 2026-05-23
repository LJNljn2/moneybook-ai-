<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import type { AiPlatform, ActivePlatformConfig } from '../../types'
import { SettingKeys } from '../../types'
import { aiPlatformService } from '../../store/ai-platforms'
import { apiKeyService } from '../../store/api-keys'
import { settingService } from '../../store/settings'
import ApiKeyInput from '../../components/ApiKeyInput.vue'

const platforms = ref<AiPlatform[]>([])
const selectedPlatformId = ref('')
const selectedModel = ref('')
const apiKey = ref('')
const baseUrl = ref('')
const customName = ref('')

// Custom platform form
const showCustomForm = ref(false)

const selectedPlatform = computed(() =>
  platforms.value.find(p => p.id === selectedPlatformId.value)
)

const isCustom = computed(() => selectedPlatform.value?.isCustom ?? false)

const modelOptions = computed(() => {
  if (!selectedPlatform.value) return []
  return selectedPlatform.value.models
})

function loadData() {
  platforms.value = aiPlatformService.getAllPlatforms()

  // Load active config
  const configStr = settingService.get(SettingKeys.PLATFORM_CONFIG)
  if (configStr) {
    try {
      const config: ActivePlatformConfig = JSON.parse(configStr)
      selectedPlatformId.value = config.platformId
      selectedModel.value = config.model
    } catch {
      // ignore invalid config
    }
  }

  // Default to first platform if none selected
  if (!selectedPlatformId.value && platforms.value.length > 0) {
    selectedPlatformId.value = platforms.value[0].id
  }

  loadPlatformDetails()
}

function loadPlatformDetails() {
  const platform = selectedPlatform.value
  if (!platform) return

  baseUrl.value = platform.baseUrl
  customName.value = platform.name
  apiKey.value = apiKeyService.get(platform.id) ?? ''

  // Default to first model if current model not in list
  if (platform.models.length > 0 && !platform.models.includes(selectedModel.value)) {
    selectedModel.value = platform.models[0]
  }
}

function onPlatformChange(e: { detail: { value: number } }) {
  const idx = e.detail.value
  selectedPlatformId.value = platforms.value[idx].id
  loadPlatformDetails()
}

function onModelChange(e: { detail: { value: number } }) {
  const idx = e.detail.value
  selectedModel.value = modelOptions.value[idx]
}

function toggleCustomForm() {
  showCustomForm.value = !showCustomForm.value
  if (showCustomForm.value) {
    customName.value = ''
    baseUrl.value = ''
    selectedModel.value = ''
    apiKey.value = ''
  }
}

function addCustomPlatform() {
  if (!customName.value.trim() || !baseUrl.value.trim()) {
    uni.showToast({ title: '请填写名称和 Base URL', icon: 'none' })
    return
  }

  const models = selectedModel.value
    ? selectedModel.value.split(',').map(m => m.trim()).filter(Boolean)
    : []

  const newPlatform = aiPlatformService.add({
    name: customName.value.trim(),
    baseUrl: baseUrl.value.trim(),
    models,
  })

  // Save API key for new platform
  if (apiKey.value.trim()) {
    apiKeyService.set(newPlatform.id, apiKey.value.trim())
  }

  // Select the new platform
  selectedPlatformId.value = newPlatform.id
  showCustomForm.value = false

  loadData()
  uni.showToast({ title: '已添加', icon: 'success' })
}

function deleteCustomPlatform() {
  if (!selectedPlatform.value?.isCustom) return

  uni.showModal({
    title: '确认删除',
    content: `确定要删除平台「${selectedPlatform.value.name}」吗？`,
    success(res) {
      if (res.confirm && selectedPlatform.value) {
        aiPlatformService.remove(selectedPlatform.value.id)
        apiKeyService.remove(selectedPlatform.value.id)

        // Switch to first available platform
        loadData()
        if (platforms.value.length > 0) {
          selectedPlatformId.value = platforms.value[0].id
          loadPlatformDetails()
        }

        uni.showToast({ title: '已删除', icon: 'success' })
      }
    },
  })
}

function saveConfig() {
  if (!selectedPlatformId.value) {
    uni.showToast({ title: '请选择平台', icon: 'none' })
    return
  }

  // Save API key
  if (apiKey.value.trim()) {
    apiKeyService.set(selectedPlatformId.value, apiKey.value.trim())
  } else {
    apiKeyService.remove(selectedPlatformId.value)
  }

  // Save active platform config
  const config: ActivePlatformConfig = {
    platformId: selectedPlatformId.value,
    model: selectedModel.value,
  }
  settingService.set(SettingKeys.PLATFORM_CONFIG, JSON.stringify(config))

  // If custom platform, update name and baseUrl
  if (isCustom.value && selectedPlatform.value) {
    const models = selectedModel.value
      ? selectedModel.value.split(',').map(m => m.trim()).filter(Boolean)
      : selectedPlatform.value.models

    aiPlatformService.update(selectedPlatform.value.id, {
      name: customName.value.trim() || selectedPlatform.value.name,
      baseUrl: baseUrl.value.trim() || selectedPlatform.value.baseUrl,
      models,
    })
    loadData()
  }

  uni.showToast({ title: '已保存', icon: 'success' })
}

onMounted(() => {
  loadData()
})
</script>

<template>
  <scroll-view class="settings-page" scroll-y>
    <!-- Model Config Section -->
    <view class="section">
      <view class="section-header">
        <text class="section-title">模型配置</text>
      </view>

      <!-- Platform Selector -->
      <view class="form-item">
        <text class="form-label">AI 平台</text>
        <picker
          :range="platforms.map(p => p.name)"
          :value="platforms.findIndex(p => p.id === selectedPlatformId)"
          @change="onPlatformChange"
        >
          <view class="picker-value">
            <text>{{ selectedPlatform?.name || '请选择平台' }}</text>
            <text class="picker-arrow">></text>
          </view>
        </picker>
      </view>

      <!-- Model Selector (for platforms with preset models) -->
      <view class="form-item" v-if="modelOptions.length > 0 && !isCustom">
        <text class="form-label">模型</text>
        <picker
          :range="modelOptions"
          :value="modelOptions.indexOf(selectedModel)"
          @change="onModelChange"
        >
          <view class="picker-value">
            <text>{{ selectedModel || '请选择模型' }}</text>
            <text class="picker-arrow">></text>
          </view>
        </picker>
      </view>

      <!-- Custom platform fields -->
      <template v-if="isCustom">
        <view class="form-item">
          <text class="form-label">平台名称</text>
          <input
            class="form-input"
            v-model="customName"
            placeholder="自定义平台名称"
          />
        </view>

        <view class="form-item">
          <text class="form-label">Base URL</text>
          <input
            class="form-input"
            v-model="baseUrl"
            placeholder="https://api.example.com/v1"
          />
        </view>

        <view class="form-item">
          <text class="form-label">模型名称</text>
          <input
            class="form-input"
            v-model="selectedModel"
            placeholder="model-name（多个用逗号分隔）"
          />
        </view>
      </template>

      <!-- Base URL display for built-in -->
      <view class="form-item" v-if="!isCustom && selectedPlatform">
        <text class="form-label">Base URL</text>
        <text class="form-value-readonly">{{ selectedPlatform.baseUrl }}</text>
      </view>

      <!-- API Key -->
      <view class="form-item">
        <text class="form-label">API Key</text>
        <view class="api-key-wrapper">
          <ApiKeyInput v-model="apiKey" placeholder="请输入 API Key" />
        </view>
        <text class="form-hint" v-if="apiKeyService.getMasked(selectedPlatformId)">
          当前已存储: {{ apiKeyService.getMasked(selectedPlatformId) }}
        </text>
      </view>

      <!-- Actions -->
      <view class="actions">
        <button class="btn-save" @click="saveConfig">保存配置</button>
        <button
          class="btn-delete"
          v-if="isCustom"
          @click="deleteCustomPlatform"
        >
          删除平台
        </button>
      </view>
    </view>

    <!-- Add Custom Platform -->
    <view class="section">
      <view class="section-header" @click="toggleCustomForm">
        <text class="section-title">添加自定义平台</text>
        <text class="section-toggle">{{ showCustomForm ? '收起' : '展开' }}</text>
      </view>

      <view class="custom-form" v-if="showCustomForm">
        <view class="form-item">
          <text class="form-label">平台名称</text>
          <input
            class="form-input"
            v-model="customName"
            placeholder="如：我的 API"
          />
        </view>

        <view class="form-item">
          <text class="form-label">Base URL</text>
          <input
            class="form-input"
            v-model="baseUrl"
            placeholder="https://api.example.com/v1"
          />
        </view>

        <view class="form-item">
          <text class="form-label">模型名称</text>
          <input
            class="form-input"
            v-model="selectedModel"
            placeholder="model-name（多个用逗号分隔）"
          />
        </view>

        <view class="form-item">
          <text class="form-label">API Key</text>
          <view class="api-key-wrapper">
            <ApiKeyInput v-model="apiKey" placeholder="请输入 API Key" />
          </view>
        </view>

        <button class="btn-save" @click="addCustomPlatform">添加平台</button>
      </view>
    </view>
  </scroll-view>
</template>

<style scoped>
.settings-page {
  min-height: 100vh;
  background-color: #f5f5f5;
}

.section {
  background-color: #fff;
  margin: 20rpx 24rpx;
  border-radius: 16rpx;
  padding: 24rpx;
}

.section-header {
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20rpx;
  padding-bottom: 16rpx;
  border-bottom: 1rpx solid #eee;
}

.section-title {
  font-size: 32rpx;
  font-weight: 600;
  color: #333;
}

.section-toggle {
  font-size: 26rpx;
  color: #2b7cff;
}

.form-item {
  margin-bottom: 24rpx;
}

.form-label {
  display: block;
  font-size: 26rpx;
  color: #666;
  margin-bottom: 10rpx;
}

.picker-value {
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  padding: 16rpx 20rpx;
  background-color: #f8f8f8;
  border-radius: 8rpx;
  font-size: 28rpx;
  color: #333;
}

.picker-arrow {
  color: #ccc;
  font-size: 28rpx;
}

.form-input {
  padding: 16rpx 20rpx;
  background-color: #f8f8f8;
  border-radius: 8rpx;
  font-size: 28rpx;
  color: #333;
}

.form-value-readonly {
  display: block;
  padding: 16rpx 20rpx;
  background-color: #f0f0f0;
  border-radius: 8rpx;
  font-size: 24rpx;
  color: #999;
}

.form-hint {
  display: block;
  font-size: 22rpx;
  color: #999;
  margin-top: 8rpx;
}

.api-key-wrapper {
  margin-top: 8rpx;
}

.actions {
  display: flex;
  flex-direction: row;
  gap: 16rpx;
  margin-top: 16rpx;
}

.btn-save {
  flex: 1;
  background-color: #2b7cff;
  color: #fff;
  font-size: 28rpx;
  border-radius: 12rpx;
  padding: 16rpx 0;
  border: none;
  line-height: 1.5;
}

.btn-save:active {
  opacity: 0.8;
}

.btn-delete {
  flex: 0 0 auto;
  background-color: #fff;
  color: #ff4d4f;
  font-size: 28rpx;
  border-radius: 12rpx;
  padding: 16rpx 32rpx;
  border: 1rpx solid #ff4d4f;
  line-height: 1.5;
}

.btn-delete:active {
  opacity: 0.8;
}

.custom-form {
  padding-top: 8rpx;
}
</style>
