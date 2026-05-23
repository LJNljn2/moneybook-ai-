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
import { chatCompletionStream, chatCompletion, isConfigured } from '@/utils/ai-api'
import { settingService } from '@/store/settings'
import { SettingKeys, type ChatMessage } from '@/types'

interface UiMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
}

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

loadProfile()

let idCounter = 0
function makeId(): string {
  return `msg_${Date.now()}_${idCounter++}`
}

const canSend = computed(() => {
  return inputText.value.trim().length > 0 && !isStreaming.value
})

function scrollToBottom() {
  nextTick(() => {
    // Force scroll to a very large value to reach the bottom
    scrollTop.value = messages.value.length * 2000
  })
}

async function handleSend() {
  const text = inputText.value.trim()
  if (!text || isStreaming.value) return

  if (!isConfigured()) {
    uni.showModal({
      title: '未配置 AI',
      content: '请先在设置页面配置 AI 平台和 API Key',
      showCancel: false,
    })
    return
  }

  inputText.value = ''

  const userMsg: UiMessage = {
    id: makeId(),
    role: 'user',
    content: text,
  }
  messages.value.push(userMsg)
  scrollToBottom()

  isStreaming.value = true

  const chatMessages: ChatMessage[] = [{ role: 'user', content: text }]

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
        isStreaming.value = false
        scrollToBottom()
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
      const aiMsg: UiMessage = {
        id: makeId(),
        role: 'assistant',
        content: response,
      }
      messages.value.push(aiMsg)
      isStreaming.value = false
      scrollToBottom()
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
