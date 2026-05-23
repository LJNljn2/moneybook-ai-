<template>
  <view class="chat-page">
    <scroll-view
      class="chat-list"
      scroll-y
      :scroll-top="scrollTop"
      :scroll-with-animation="true"
    >
      <view class="chat-list-inner">
        <view
          v-for="msg in messages"
          :key="msg.id"
          class="message-row"
          :class="msg.role === 'user' ? 'message-row--right' : 'message-row--left'"
        >
          <!-- AI avatar (left) -->
          <image
            v-if="msg.role === 'assistant'"
            class="avatar"
            :src="aiAvatar"
            mode="aspectFill"
          />
          <view v-if="msg.role === 'assistant'" class="message-body message-body--left">
            <text class="nickname">{{ aiNickname }}</text>
            <view class="bubble bubble--ai">
              <text class="bubble-text" selectable>{{ msg.content }}</text>
            </view>
          </view>

          <!-- User avatar (right) -->
          <view v-if="msg.role === 'user'" class="message-body message-body--right">
            <text class="nickname">{{ userNickname }}</text>
            <view class="bubble bubble--user">
              <text class="bubble-text" selectable>{{ msg.content }}</text>
            </view>
          </view>
          <image
            v-if="msg.role === 'user'"
            class="avatar"
            :src="userAvatar"
            mode="aspectFill"
          />
        </view>

        <!-- AI typing indicator -->
        <view v-if="isStreaming" class="message-row message-row--left">
          <image class="avatar" :src="aiAvatar" mode="aspectFill" />
          <view class="message-body message-body--left">
            <text class="nickname">{{ aiNickname }}</text>
            <view class="bubble bubble--ai">
              <text class="bubble-text">正在思考...</text>
            </view>
          </view>
        </view>

        <!-- Empty state -->
        <view v-if="messages.length === 0 && !isStreaming" class="empty-state">
          <text class="empty-title">开始记账吧</text>
          <text class="empty-hint">输入你的消费记录，例如「午饭花了 35 块」</text>
        </view>
      </view>
    </scroll-view>

    <view class="input-area">
      <view class="input-left">
        <view class="new-chat-btn" @tap="clearContext" v-if="messages.length > 0">
          <text class="new-chat-btn-text">新对话</text>
        </view>
      </view>
      <input
        class="input-box"
        v-model="inputText"
        placeholder="输入消费记录或问题..."
        :disabled="isStreaming"
        confirm-type="send"
        @confirm="handleSend"
      />
      <view
        class="send-btn"
        :class="{ 'send-btn--disabled': !canSend }"
        @tap="handleSend"
      >
        <text class="send-btn-text">发送</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { chatCompletionStream, chatCompletion, isConfigured } from '@/utils/ai-api'
import { extractExpenses, buildRecentExpenseSummary } from '@/utils/expense-parser'
import { expenseService } from '@/store/expenses'
import { settingService } from '@/store/settings'
import { SettingKeys, type ChatMessage } from '@/types'

interface UiMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
}

type OnboardingStep = 'idle' | 'welcome' | 'name' | 'budget' | 'done'

const messages = ref<UiMessage[]>([])
const inputText = ref('')
const isStreaming = ref(false)
const scrollTop = ref(0)

const DEFAULT_USER_AVATAR = '/static/logo.png'
const DEFAULT_AI_AVATAR = '/static/logo.png'

const userAvatar = ref(DEFAULT_USER_AVATAR)
const aiAvatar = ref(DEFAULT_AI_AVATAR)
const userNickname = ref('我')
const aiNickname = ref('小记')

// Onboarding state
const onboardingStep = ref<OnboardingStep>('idle')
const onboardingName = ref('')

function loadProfile() {
  const ua = settingService.get(SettingKeys.USER_AVATAR)
  if (ua) userAvatar.value = ua
  const un = settingService.get(SettingKeys.USER_NICKNAME)
  if (un) userNickname.value = un
  const aa = settingService.get(SettingKeys.AI_AVATAR)
  if (aa) aiAvatar.value = aa
  const an = settingService.get(SettingKeys.AI_NICKNAME)
  if (an) aiNickname.value = an
}

function addAiMessage(content: string) {
  messages.value.push({
    id: makeId(),
    role: 'assistant',
    content,
  })
  scrollToBottom()
}

function startOnboarding() {
  onboardingStep.value = 'welcome'
  addAiMessage(
    '你好呀！我是你的智能记账助手「小记」～\n\n' +
    '我会帮你轻松记录每一笔消费，还能分析你的花钱习惯，做你的贴心财务小管家。\n\n' +
    '先来认识一下吧！你希望我怎么称呼你呢？'
  )
}

function handleOnboardingInput(text: string) {
  switch (onboardingStep.value) {
    case 'welcome': {
      // User tells us their name
      const name = text.trim()
      if (!name) return
      onboardingName.value = name
      settingService.set(SettingKeys.USER_NICKNAME, name)
      userNickname.value = name
      onboardingStep.value = 'name'
      addAiMessage(
        `好的，${name}！以后就这么叫你啦～\n\n` +
        '你有每月的预算计划吗？告诉我一个数字，我帮你追踪预算（比如「3000」）。如果暂时没有，直接说「没有」就好。'
      )
      break
    }
    case 'name': {
      // User tells us their budget
      const budgetMatch = text.match(/\d+/)
      if (budgetMatch) {
        const budget = budgetMatch[0]
        settingService.set(SettingKeys.MONTHLY_BUDGET, budget)
        onboardingStep.value = 'budget'
        addAiMessage(
          `收到！月预算设为 ¥${budget}，我会帮你盯着的。\n\n` +
          '现在你可以开始记账啦！直接跟我说花了什么就行，比如：\n' +
          '「午饭花了 35 块」\n' +
          '「打车 25，咖啡 18」\n\n' +
          '我会自动帮你分类记录，随时问我「这周花了多少」也行哦～开始试试吧！'
        )
      } else {
        // No budget
        onboardingStep.value = 'budget'
        addAiMessage(
          '没问题，不设预算也行！\n\n' +
          '现在你可以开始记账啦！直接跟我说花了什么就行，比如：\n' +
          '「午饭花了 35 块」\n' +
          '「打车 25，咖啡 18」\n\n' +
          '我会自动帮你分类记录，随时问我「这周花了多少」也行哦～开始试试吧！'
        )
      }
      // Onboarding complete
      settingService.set(SettingKeys.ONBOARDING_DONE, 'true')
      onboardingStep.value = 'done'
      break
    }
  }
}

loadProfile()

onShow(() => {
  loadProfile()
  // Check if onboarding is needed (first launch)
  const done = settingService.get(SettingKeys.ONBOARDING_DONE)
  if (!done && messages.value.length === 0 && onboardingStep.value === 'idle') {
    startOnboarding()
  }
})

let idCounter = 0
function makeId(): string {
  return `msg_${Date.now()}_${idCounter++}`
}

const canSend = computed(() => {
  return inputText.value.trim().length > 0 && !isStreaming.value
})

/**
 * 从 AI 回复文本中提取记账数据并保存到本地
 * 保存成功后显示 toast 提示
 */
function saveExpensesFromText(text: string) {
  const parsed = extractExpenses(text)
  if (parsed.length === 0) return

  for (const item of parsed) {
    expenseService.add(item)
  }

  const summary = parsed.length === 1
    ? `已记录：${parsed[0].category} ¥${parsed[0].amount}`
    : `已记录 ${parsed.length} 笔消费`

  uni.showToast({ title: summary, icon: 'success', duration: 2000 })
}

function scrollToBottom() {
  nextTick(() => {
    // Force scroll to a very large value to reach the bottom
    scrollTop.value = messages.value.length * 2000
  })
}

/**
 * 清除对话上下文（UI 消息列表）
 * 记账数据不受影响，持久保存在本地数据库
 */
function clearContext() {
  messages.value = []
  scrollTop.value = 0
}

async function handleSend() {
  const text = inputText.value.trim()
  if (!text || isStreaming.value) return

  inputText.value = ''

  // During onboarding, handle locally without AI API
  if (onboardingStep.value !== 'idle' && onboardingStep.value !== 'done') {
    const userMsg: UiMessage = {
      id: makeId(),
      role: 'user',
      content: text,
    }
    messages.value.push(userMsg)
    scrollToBottom()
    handleOnboardingInput(text)
    return
  }

  if (!isConfigured()) {
    uni.showModal({
      title: '未配置 AI',
      content: '请先在设置页面配置 AI 平台和 API Key',
      showCancel: false,
    })
    return
  }

  const userMsg: UiMessage = {
    id: makeId(),
    role: 'user',
    content: text,
  }
  messages.value.push(userMsg)
  scrollToBottom()

  isStreaming.value = true

  // Build recent expense summary for AI context
  const allExpenses = expenseService.getAll()
  const expenseSummary = buildRecentExpenseSummary(allExpenses)
  const enrichedText = `[消费数据上下文] ${expenseSummary}\n\n用户消息：${text}`

  const chatMessages: ChatMessage[] = [{ role: 'user', content: enrichedText }]

  // Try streaming first (H5), fallback to non-streaming
  try {
    const aiMsgId = makeId()
    messages.value.push({
      id: aiMsgId,
      role: 'assistant',
      content: '',
    })

    const cancel = chatCompletionStream(chatMessages, {
      onChunk(chunk: string) {
        const msg = messages.value.find((m) => m.id === aiMsgId)
        if (msg) {
          msg.content += chunk
          scrollToBottom()
        }
      },
      onComplete(fullText: string) {
        saveExpensesFromText(fullText)
        isStreaming.value = false
        scrollToBottom()
        // 一轮对话结束，自动清除上下文（记账数据不受影响）
        setTimeout(() => clearContext(), 1500)
      },
      onError(err: Error) {
        isStreaming.value = false
        const msg = messages.value.find((m) => m.id === aiMsgId)
        if (msg) {
          msg.content = `请求失败: ${err.message}`
        }
        scrollToBottom()
      },
    })
  } catch {
    // Fallback to non-streaming for non-H5 environments
    try {
      const response = await chatCompletion(chatMessages)
      saveExpensesFromText(response)
      const aiMsg: UiMessage = {
        id: makeId(),
        role: 'assistant',
        content: response,
      }
      messages.value.push(aiMsg)
      isStreaming.value = false
      scrollToBottom()
      // 一轮对话结束，自动清除上下文（记账数据不受影响）
      setTimeout(() => clearContext(), 1500)
    } catch (err: any) {
      isStreaming.value = false
      messages.value.push({
        id: makeId(),
        role: 'assistant',
        content: `请求失败: ${err.message || '未知错误'}`,
      })
      scrollToBottom()
    }
  }
}
</script>

<style scoped>
.chat-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background-color: #f8f8f8;
}

.chat-list {
  flex: 1;
  overflow: hidden;
}

.chat-list-inner {
  padding: 24rpx 24rpx 20rpx;
  min-height: 100%;
}

.message-row {
  display: flex;
  align-items: flex-start;
  margin-bottom: 32rpx;
}

.message-row--right {
  justify-content: flex-end;
}

.message-row--left {
  justify-content: flex-start;
}

.avatar {
  width: 80rpx;
  height: 80rpx;
  border-radius: 50%;
  flex-shrink: 0;
}

.message-body {
  display: flex;
  flex-direction: column;
  max-width: 65%;
}

.message-body--left {
  margin-left: 16rpx;
  align-items: flex-start;
}

.message-body--right {
  margin-right: 16rpx;
  align-items: flex-end;
}

.nickname {
  font-size: 22rpx;
  color: #999;
  margin-bottom: 8rpx;
  padding: 0 8rpx;
}

.bubble {
  padding: 20rpx 24rpx;
  border-radius: 16rpx;
  word-wrap: break-word;
  word-break: break-all;
}

.bubble--ai {
  background-color: #fff;
  border: 1rpx solid #eee;
}

.bubble--user {
  background-color: #2b7cff;
}

.bubble-text {
  font-size: 28rpx;
  line-height: 1.6;
}

.bubble--ai .bubble-text {
  color: #333;
}

.bubble--user .bubble-text {
  color: #fff;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding-top: 300rpx;
}

.empty-title {
  font-size: 36rpx;
  color: #333;
  font-weight: bold;
  margin-bottom: 16rpx;
}

.empty-hint {
  font-size: 26rpx;
  color: #999;
}

.input-area {
  display: flex;
  align-items: center;
  padding: 16rpx 24rpx;
  padding-bottom: calc(16rpx + env(safe-area-inset-bottom));
  background-color: #fff;
  border-top: 1rpx solid #eee;
}

.input-left {
  flex-shrink: 0;
  margin-right: 12rpx;
}

.new-chat-btn {
  height: 72rpx;
  padding: 0 20rpx;
  background-color: #f0f0f0;
  border-radius: 12rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.new-chat-btn-text {
  font-size: 24rpx;
  color: #666;
}

.input-box {
  flex: 1;
  height: 72rpx;
  background-color: #f8f8f8;
  border-radius: 8rpx;
  padding: 0 24rpx;
  font-size: 28rpx;
  color: #333;
}

.send-btn {
  margin-left: 16rpx;
  width: 120rpx;
  height: 72rpx;
  background-color: #2b7cff;
  border-radius: 12rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.send-btn--disabled {
  background-color: #b0d0ff;
}

.send-btn-text {
  font-size: 28rpx;
  color: #fff;
  font-weight: bold;
}
</style>
