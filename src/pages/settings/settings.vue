<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import type { AiPlatform, ActivePlatformConfig, Category } from '../../types'
import { SettingKeys, DEFAULT_SYSTEM_PROMPT } from '../../types'
import { aiPlatformService } from '../../store/ai-platforms'
import { apiKeyService } from '../../store/api-keys'
import { settingService } from '../../store/settings'
import { categoryService } from '../../store/categories'
import ApiKeyInput from '../../components/ApiKeyInput.vue'

// Profile state
const DEFAULT_USER_AVATAR = '/static/logo.png'
const DEFAULT_AI_AVATAR = '/static/logo.png'
const DEFAULT_USER_NICKNAME = '我'
const DEFAULT_AI_NICKNAME = '小记'

const userAvatar = ref(DEFAULT_USER_AVATAR)
const userNickname = ref(DEFAULT_USER_NICKNAME)
const aiAvatar = ref(DEFAULT_AI_AVATAR)
const aiNickname = ref(DEFAULT_AI_NICKNAME)

const platforms = ref<AiPlatform[]>([])
const selectedPlatformId = ref('')
const selectedModel = ref('')
const apiKey = ref('')
const baseUrl = ref('')
const customName = ref('')

// System prompt
const systemPrompt = ref('')

// Category management
const categories = ref<Category[]>([])
const newCategoryName = ref('')
const newCategoryIcon = ref('')
const showCategoryForm = ref(false)

const ICON_OPTIONS = ['🍜', '🚗', '🛒', '🏠', '🎮', '💊', '📚', '📌', '✈️', '🎁', '☕', '🎬', '💪', '📱', '👕', '💇', '🐾', '🎵', '🏦', '💰']

const selectedPlatform = computed(() =>
  platforms.value.find(p => p.id === selectedPlatformId.value)
)

const isCustom = computed(() => selectedPlatform.value?.isCustom ?? false)
const isAddingNew = computed(() => selectedPlatformId.value === 'add_new')
const showCustomFields = computed(() => isCustom.value || isAddingNew.value)

const modelOptions = computed(() => {
  if (!selectedPlatform.value) return []
  return selectedPlatform.value.models.map(m => m.name)
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

  // Load system prompt
  systemPrompt.value = settingService.get(SettingKeys.SYSTEM_PROMPT) ?? DEFAULT_SYSTEM_PROMPT

  // Load profile
  const ua = settingService.get(SettingKeys.USER_AVATAR)
  if (ua) userAvatar.value = ua
  const un = settingService.get(SettingKeys.USER_NICKNAME)
  if (un) userNickname.value = un
  const aa = settingService.get(SettingKeys.AI_AVATAR)
  if (aa) aiAvatar.value = aa
  const an = settingService.get(SettingKeys.AI_NICKNAME)
  if (an) aiNickname.value = an

  loadPlatformDetails()
  loadCategories()
}

function loadPlatformDetails() {
  const platform = selectedPlatform.value
  if (!platform) return

  baseUrl.value = platform.baseUrl
  customName.value = platform.name
  apiKey.value = apiKeyService.get(platform.id) ?? ''

  // Default to first model if current model not in list
  const modelNames = platform.models.map(m => m.name)
  if (platform.models.length > 0 && !modelNames.includes(selectedModel.value)) {
    selectedModel.value = modelNames[0]
  }
}

function onPlatformChange(e: { detail: { value: number } }) {
  const idx = e.detail.value
  if (idx === platforms.value.length) {
    // "添加自定义平台" selected
    selectedPlatformId.value = 'add_new'
    startAddNewPlatform()
    return
  }
  selectedPlatformId.value = platforms.value[idx].id
  loadPlatformDetails()
}

function onModelChange(e: { detail: { value: number } }) {
  const idx = e.detail.value
  selectedModel.value = modelOptions.value[idx]
}

function startAddNewPlatform() {
  customName.value = ''
  baseUrl.value = ''
  selectedModel.value = ''
  apiKey.value = ''
}

function cancelAddNew() {
  selectedPlatformId.value = ''
  loadData()
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

  // If adding a new custom platform, create it first
  if (isAddingNew.value) {
    if (!customName.value.trim() || !baseUrl.value.trim()) {
      uni.showToast({ title: '请填写平台名称和 Base URL', icon: 'none' })
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

    selectedPlatformId.value = newPlatform.id
  }

  // Save API key
  if (apiKey.value.trim()) {
    apiKeyService.set(selectedPlatformId.value, apiKey.value.trim())
  } else {
    apiKeyService.remove(selectedPlatformId.value)
  }

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
  }

  // Save active platform config
  const config: ActivePlatformConfig = {
    platformId: selectedPlatformId.value,
    model: selectedModel.value,
  }
  settingService.set(SettingKeys.PLATFORM_CONFIG, JSON.stringify(config))

  loadData()
  uni.showToast({ title: '已保存', icon: 'success' })
}

function saveSystemPrompt() {
  settingService.set(SettingKeys.SYSTEM_PROMPT, systemPrompt.value)
  uni.showToast({ title: '已保存', icon: 'success' })
}

function resetSystemPrompt() {
  uni.showModal({
    title: '重置提示词',
    content: '确定要恢复为默认系统提示词吗？',
    success(res) {
      if (res.confirm) {
        systemPrompt.value = DEFAULT_SYSTEM_PROMPT
        settingService.set(SettingKeys.SYSTEM_PROMPT, DEFAULT_SYSTEM_PROMPT)
        uni.showToast({ title: '已重置', icon: 'success' })
      }
    },
  })
}

function retriggerOnboarding() {
  uni.showModal({
    title: '重新引导',
    content: '将清除引导完成标记，返回对话页后会重新开始引导流程。确定继续吗？',
    success(res) {
      if (res.confirm) {
        settingService.remove(SettingKeys.ONBOARDING_DONE)
        uni.switchTab({ url: '/pages/index/index' })
      }
    },
  })
}

function chooseAvatar(type: 'user' | 'ai') {
  uni.chooseImage({
    count: 1,
    sizeType: ['compressed'],
    sourceType: ['album', 'camera'],
    success(res) {
      const tempPath = res.tempFilePaths[0]
      if (type === 'user') {
        userAvatar.value = tempPath
        settingService.set(SettingKeys.USER_AVATAR, tempPath)
      } else {
        aiAvatar.value = tempPath
        settingService.set(SettingKeys.AI_AVATAR, tempPath)
      }
      uni.showToast({ title: '头像已更新', icon: 'success' })
    },
  })
}

function loadCategories() {
  categories.value = categoryService.getAll()
}

function toggleCategoryForm() {
  showCategoryForm.value = !showCategoryForm.value
  if (showCategoryForm.value) {
    newCategoryName.value = ''
    newCategoryIcon.value = '📌'
  }
}

function selectIcon(icon: string) {
  newCategoryIcon.value = icon
}

function addCategory() {
  if (!newCategoryName.value.trim()) {
    uni.showToast({ title: '请输入分类名称', icon: 'none' })
    return
  }
  const exists = categories.value.some(c => c.name === newCategoryName.value.trim())
  if (exists) {
    uni.showToast({ title: '分类已存在', icon: 'none' })
    return
  }
  const colors = ['#FF6B6B', '#4ECDC4', '#FFD93D', '#6BCB77', '#9B5DE5', '#F4845F', '#00BBF9', '#E91E63', '#FF9800', '#795548']
  const color = colors[categories.value.length % colors.length]
  categoryService.add({
    name: newCategoryName.value.trim(),
    icon: newCategoryIcon.value || '📌',
    color,
    is_custom: true,
  })
  loadCategories()
  showCategoryForm.value = false
  newCategoryName.value = ''
  newCategoryIcon.value = ''
  uni.showToast({ title: '已添加', icon: 'success' })
}

function deleteCategory(id: string) {
  const cat = categories.value.find(c => c.id === id)
  if (!cat || !cat.is_custom) return

  uni.showModal({
    title: '确认删除',
    content: `确定要删除分类「${cat.name}」吗？已有记账记录中的该分类不会被删除。`,
    success(res) {
      if (res.confirm) {
        categoryService.remove(id)
        loadCategories()
        uni.showToast({ title: '已删除', icon: 'success' })
      }
    },
  })
}

function saveUserNickname() {
  if (!userNickname.value.trim()) {
    uni.showToast({ title: '昵称不能为空', icon: 'none' })
    return
  }
  settingService.set(SettingKeys.USER_NICKNAME, userNickname.value.trim())
  uni.showToast({ title: '已保存', icon: 'success' })
}

function saveAiNickname() {
  if (!aiNickname.value.trim()) {
    uni.showToast({ title: '昵称不能为空', icon: 'none' })
    return
  }
  settingService.set(SettingKeys.AI_NICKNAME, aiNickname.value.trim())
  uni.showToast({ title: '已保存', icon: 'success' })
}

onMounted(() => {
  loadData()
})
</script>

<template>
  <scroll-view class="settings-page" scroll-y>
    <!-- Personal Profile Section -->
    <view class="section">
      <view class="section-header">
        <text class="section-title">个人资料</text>
      </view>

      <view class="form-item">
        <text class="form-label">头像</text>
        <view class="avatar-row" @click="chooseAvatar('user')">
          <image class="avatar-preview" :src="userAvatar" mode="aspectFill" />
          <text class="avatar-hint">点击更换头像</text>
        </view>
      </view>

      <view class="form-item">
        <text class="form-label">昵称</text>
        <view class="nickname-row">
          <input
            class="form-input nickname-input"
            v-model="userNickname"
            placeholder="请输入昵称"
          />
          <view class="btn-save-nickname" @click="saveUserNickname">保存</view>
        </view>
      </view>
    </view>

    <!-- AI Assistant Section -->
    <view class="section">
      <view class="section-header">
        <text class="section-title">AI 助手</text>
      </view>

      <view class="form-item">
        <text class="form-label">头像</text>
        <view class="avatar-row" @click="chooseAvatar('ai')">
          <image class="avatar-preview" :src="aiAvatar" mode="aspectFill" />
          <text class="avatar-hint">点击更换头像</text>
        </view>
      </view>

      <view class="form-item">
        <text class="form-label">昵称</text>
        <view class="nickname-row">
          <input
            class="form-input nickname-input"
            v-model="aiNickname"
            placeholder="请输入 AI 昵称"
          />
          <view class="btn-save-nickname" @click="saveAiNickname">保存</view>
        </view>
      </view>
    </view>

    <!-- Model Config Section -->
    <view class="section">
      <view class="section-header">
        <text class="section-title">模型配置</text>
      </view>

      <!-- Platform Selector -->
      <view class="form-item">
        <text class="form-label">AI 平台</text>
        <picker
          :range="[...platforms.map(p => p.name), '＋ 添加自定义平台']"
          :value="isAddingNew ? platforms.length : platforms.findIndex(p => p.id === selectedPlatformId)"
          @change="onPlatformChange"
        >
          <view class="picker-value">
            <text>{{ isAddingNew ? '新建自定义平台' : (selectedPlatform?.name || '请选择平台') }}</text>
            <text class="picker-arrow">></text>
          </view>
        </picker>
      </view>

      <!-- Model Selector (for platforms with preset models) -->
      <view class="form-item" v-if="modelOptions.length > 0 && !showCustomFields">
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
      <template v-if="showCustomFields">
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
      <view class="form-item" v-if="!showCustomFields && selectedPlatform">
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
        <button class="btn-save" @click="saveConfig">{{ isAddingNew ? '创建并保存' : '保存配置' }}</button>
        <button
          class="btn-delete"
          v-if="isCustom && !isAddingNew"
          @click="deleteCustomPlatform"
        >
          删除平台
        </button>
        <button
          class="btn-reset"
          v-if="isAddingNew"
          @click="cancelAddNew"
        >
          取消
        </button>
      </view>
    </view>

    <!-- System Prompt Section -->
    <view class="section">
      <view class="section-header">
        <text class="section-title">系统提示词</text>
      </view>

      <view class="form-item">
        <text class="form-label">AI 助手的行为指令</text>
        <textarea
          class="form-textarea"
          v-model="systemPrompt"
          placeholder="请输入系统提示词"
          :maxlength="-1"
        />
      </view>

      <view class="actions">
        <button class="btn-save" @click="saveSystemPrompt">保存提示词</button>
        <button class="btn-reset" @click="resetSystemPrompt">恢复默认</button>
      </view>
    </view>

    <!-- Category Management Section -->
    <view class="section">
      <view class="section-header">
        <text class="section-title">消费分类管理</text>
      </view>

      <view class="category-list">
        <view
          class="category-item"
          v-for="cat in categories"
          :key="cat.id"
        >
          <view class="category-info">
            <text class="category-icon">{{ cat.icon }}</text>
            <text class="category-name">{{ cat.name }}</text>
            <text class="category-badge" v-if="!cat.is_custom">默认</text>
          </view>
          <text
            class="category-delete"
            v-if="cat.is_custom"
            @click="deleteCategory(cat.id)"
          >删除</text>
        </view>
      </view>

      <view class="add-category-toggle" @click="toggleCategoryForm">
        <text class="add-category-text">{{ showCategoryForm ? '收起' : '+ 添加自定义分类' }}</text>
      </view>

      <view class="custom-form" v-if="showCategoryForm">
        <view class="form-item">
          <text class="form-label">分类名称</text>
          <input
            class="form-input"
            v-model="newCategoryName"
            placeholder="如：宠物、礼物"
          />
        </view>

        <view class="form-item">
          <text class="form-label">选择图标</text>
          <view class="icon-picker">
            <text
              class="icon-option"
              v-for="icon in ICON_OPTIONS"
              :key="icon"
              :class="{ 'icon-selected': newCategoryIcon === icon }"
              @click="selectIcon(icon)"
            >{{ icon }}</text>
          </view>
        </view>

        <button class="btn-save" @click="addCategory">添加分类</button>
      </view>
    </view>

    <!-- Onboarding Section -->
    <view class="section">
      <view class="section-header">
        <text class="section-title">新手引导</text>
      </view>
      <text class="form-label">如果你希望重新体验首次使用的引导流程，可以点击下方按钮重新开始。</text>
      <view class="actions">
        <button class="btn-save" @click="retriggerOnboarding">重新引导</button>
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

.form-textarea {
  width: 100%;
  min-height: 240rpx;
  padding: 16rpx 20rpx;
  background-color: #f8f8f8;
  border-radius: 8rpx;
  font-size: 26rpx;
  color: #333;
  box-sizing: border-box;
  line-height: 1.6;
}

.btn-reset {
  flex: 0 0 auto;
  background-color: #fff;
  color: #666;
  font-size: 28rpx;
  border-radius: 12rpx;
  padding: 16rpx 32rpx;
  border: 1rpx solid #ccc;
  line-height: 1.5;
}

.btn-reset:active {
  opacity: 0.8;
}

.avatar-row {
  display: flex;
  align-items: center;
  gap: 24rpx;
  padding: 16rpx 0;
}

.avatar-preview {
  width: 100rpx;
  height: 100rpx;
  border-radius: 50%;
  border: 2rpx solid #eee;
}

.avatar-hint {
  font-size: 26rpx;
  color: #2b7cff;
}

.nickname-row {
  display: flex;
  align-items: center;
  gap: 16rpx;
}

.nickname-input {
  flex: 1;
}

.btn-save-nickname {
  flex-shrink: 0;
  background-color: #2b7cff;
  color: #fff;
  font-size: 26rpx;
  border-radius: 8rpx;
  padding: 14rpx 28rpx;
  text-align: center;
  line-height: 1.4;
}

.category-list {
  margin-bottom: 16rpx;
}

.category-item {
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  padding: 16rpx 0;
  border-bottom: 1rpx solid #f0f0f0;
}

.category-item:last-child {
  border-bottom: none;
}

.category-info {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.category-icon {
  font-size: 36rpx;
}

.category-name {
  font-size: 28rpx;
  color: #333;
}

.category-badge {
  font-size: 20rpx;
  color: #999;
  background-color: #f0f0f0;
  padding: 2rpx 10rpx;
  border-radius: 6rpx;
}

.category-delete {
  font-size: 24rpx;
  color: #ff4d4f;
  padding: 8rpx 16rpx;
}

.add-category-toggle {
  padding: 16rpx 0;
  text-align: center;
}

.add-category-text {
  font-size: 26rpx;
  color: #2b7cff;
}

.icon-picker {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
  padding: 12rpx 0;
}

.icon-option {
  font-size: 40rpx;
  width: 64rpx;
  height: 64rpx;
  text-align: center;
  line-height: 64rpx;
  border-radius: 12rpx;
  border: 2rpx solid #eee;
  background-color: #fff;
}

.icon-selected {
  border-color: #2b7cff;
  background-color: #e8f0ff;
}
</style>
