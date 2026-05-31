<template>
  <view class="chat-page">
    <!-- Splash screen -->
    <view class="splash" v-if="showSplash" :class="{ 'splash--fade': splashFading }">
      <view class="splash-content">
        <view class="splash-icon">
          <text class="splash-icon-text">💰</text>
        </view>
        <text class="splash-title">MoneyChat</text>
        <text class="splash-subtitle">AI 对话记账</text>
        <view class="splash-loader">
          <view class="splash-dot"></view>
          <view class="splash-dot"></view>
          <view class="splash-dot"></view>
        </view>
      </view>
      <text class="splash-credit">莞外校草 — leonan 开发</text>
    </view>

    <scroll-view
      class="chat-list"
      scroll-y
      :scroll-top="scrollTop"
      :scroll-with-animation="true"
      :style="{ height: scrollHeight + 'px' }"
      :enhanced="true"
      :show-scrollbar="false"
    >
      <view class="chat-list-inner">
        <template v-for="item in timeline" :key="item.key">
          <!-- 消息气泡 -->
          <view
            v-if="item.type === 'message'"
            class="message-row"
            :class="(item.data as UiMessage).role === 'user' ? 'message-row--right' : 'message-row--left'"
          >
            <image
              v-if="(item.data as UiMessage).role === 'assistant'"
              class="avatar"
              :src="aiAvatar"
              mode="aspectFill"
            />
            <view v-if="(item.data as UiMessage).role === 'assistant'" class="message-body message-body--left">
              <text class="nickname">{{ aiNickname }}</text>
              <view class="bubble bubble--ai">
                <text class="bubble-text" selectable>{{ (item.data as UiMessage).displayContent }}</text>
              </view>
            </view>

            <view v-if="(item.data as UiMessage).role === 'user'" class="message-body message-body--right">
              <text class="nickname">{{ userNickname }}</text>
              <view class="bubble bubble--user">
                <text class="bubble-text" selectable>{{ (item.data as UiMessage).content }}</text>
              </view>
            </view>
            <image
              v-if="(item.data as UiMessage).role === 'user'"
              class="avatar"
              :src="userAvatar"
              mode="aspectFill"
            />
          </view>

          <!-- 记账卡片 -->
          <view
            v-if="item.type === 'card'"
            class="expense-feedback-row"
          >
            <ExpenseFeedbackCard
              :expense="(item.data as ExpenseCard).expense"
              :is-deleted="(item.data as ExpenseCard).deleted"
              @edit="handleEditExpense"
              @delete="handleDeleteExpense"
            />
          </view>
        </template>

        <view v-if="isStreaming" class="message-row message-row--left">
          <image class="avatar" :src="aiAvatar" mode="aspectFill" />
          <view class="message-body message-body--left">
            <text class="nickname">{{ aiNickname }}</text>
            <view class="bubble bubble--ai">
              <text class="bubble-text">正在思考...</text>
            </view>
          </view>
        </view>

        <view v-if="messages.length === 0 && !isStreaming" class="empty-state">
          <text class="empty-title">开始记账吧</text>
          <text class="empty-hint">输入你的消费记录，例如「午饭花了 35 块」</text>
        </view>
      </view>
    </scroll-view>

    <view class="input-area">
      <view class="input-left">
        <view class="new-chat-btn" @tap="clearContext">
          <text class="new-chat-btn-text">新对话</text>
        </view>
      </view>
      <input
        class="input-box"
        v-model="inputText"
        placeholder="输入消费记录或问题..."
        :disabled="isStreaming"
        confirm-type="send"
        :cursor-spacing="20"
        :adjust-position="false"
        @confirm="handleSend"
        @focus="onInputFocus"
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
import { extractExpenses, buildExpenseOverview } from '@/utils/expense-parser'
import { expenseService } from '@/store/expenses'
import { categoryService } from '@/store/categories'
import { settingService } from '@/store/settings'
import { SettingKeys, type ChatMessage, type Expense } from '@/types'
import ExpenseFeedbackCard from '@/components/ExpenseFeedbackCard.vue'

interface UiMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  displayContent: string
  cards: ExpenseCard[]
  model?: string // 使用的模型名称
  provider?: string // 供应商 ID
  hasThinking?: boolean // 是否包含思考过程
}

interface ExpenseCard {
  id: string
  expense: Expense
  deleted: boolean
}

interface TimelineItem {
  type: 'message' | 'card'
  key: string
  data: UiMessage | ExpenseCard
}

type OnboardingStep = 'idle' | 'welcome' | 'name' | 'budget' | 'done'

const messages = ref<UiMessage[]>([])
const inputText = ref('')

const timeline = computed<TimelineItem[]>(() => {
  const items: TimelineItem[] = []
  for (const msg of messages.value) {
    items.push({ type: 'message', key: msg.id, data: msg })
    for (const card of msg.cards) {
      items.push({ type: 'card', key: card.id, data: card })
    }
  }
  return items
})
const isStreaming = ref(false)
const scrollTop = ref(0)
const scrollHeight = ref(300)
const inputAreaHeight = ref(0)

function getInputAreaH() {
  // 12rpx padding top + 64rpx input + 12rpx padding bottom + safe-area
  const info = uni.getSystemInfoSync()
  const rpx = info.screenWidth / 750
  return Math.round((12 + 64 + 12) * rpx)
}

function updateScrollHeight(keyboardH = 0) {
  const info = uni.getSystemInfoSync()
  const inputH = getInputAreaH()
  inputAreaHeight.value = inputH
  scrollHeight.value = info.windowHeight - inputH - keyboardH
}

function onInputFocus() {
  setTimeout(() => scrollToBottom(), 350)
}

function onKeyboardChange(res: { height: number }) {
  updateScrollHeight(res.height)
  if (res.height > 0) {
    setTimeout(() => scrollToBottom(), 100)
  }
}

const showSplash = ref(true)
const splashFading = ref(false)

function dismissSplash() {
  splashFading.value = true
  setTimeout(() => { showSplash.value = false }, 600)
}

const DEFAULT_USER_AVATAR = '/static/logo.png'
const DEFAULT_AI_AVATAR = '/static/logo.png'

const userAvatar = ref(DEFAULT_USER_AVATAR)
const aiAvatar = ref(DEFAULT_AI_AVATAR)
const userNickname = ref('我')
const aiNickname = ref('小记')

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
    displayContent: content,
    cards: [],
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
        onboardingStep.value = 'budget'
        addAiMessage(
          '没问题，不设预算也行！\n\n' +
          '现在你可以开始记账啦！直接跟我说花了什么就行，比如：\n' +
          '「午饭花了 35 块」\n' +
          '「打车 25，咖啡 18」\n\n' +
          '我会自动帮你分类记录，随时问我「这周花了多少」也行哦～开始试试吧！'
        )
      }
      settingService.set(SettingKeys.ONBOARDING_DONE, 'true')
      onboardingStep.value = 'done'
      break
    }
  }
}

loadProfile()

onShow(() => {
  loadProfile()
  updateScrollHeight()
  const done = settingService.get(SettingKeys.ONBOARDING_DONE)
  if (!done && messages.value.length === 0 && onboardingStep.value === 'idle') {
    startOnboarding()
  }
  setTimeout(() => dismissSplash(), 1500)
})

// Listen for keyboard height changes (WeChat-style adaptive input)
uni.onKeyboardHeightChange(onKeyboardChange)

let idCounter = 0
function makeId(): string {
  return `msg_${Date.now()}_${idCounter++}`
}

const canSend = computed(() => {
  return inputText.value.trim().length > 0 && !isStreaming.value
})

function saveExpensesFromText(text: string): ExpenseCard[] {
  const parsed = extractExpenses(text)
  if (parsed.length === 0) return []

  const categories = categoryService.getAll()
  const cards: ExpenseCard[] = []

  for (const item of parsed) {
    const validCategory = categories.some(c => c.name === item.category)
      ? item.category
      : '其他'

    const saved = expenseService.add({ ...item, category: validCategory })
    cards.push({
      id: saved.id,
      expense: saved,
      deleted: false,
    })
  }

  return cards
}

function handleEditExpense(expense: Expense) {
  uni.showModal({
    title: '编辑备注',
    content: expense.note || '(无备注)',
    editable: true,
    placeholderText: '输入新的备注...',
    success(res) {
      if (res.confirm && res.content !== undefined) {
        const updated = expenseService.update(expense.id, { note: res.content })
        if (updated) {
          let found = false
          for (const msg of messages.value) {
            const card = msg.cards.find(c => c.id === expense.id)
            if (card) { card.expense = updated; found = true; break }
          }
        }
      }
    },
  })
}

function handleDeleteExpense(expense: Expense) {
  uni.showModal({
    title: '确认删除',
    content: `确定删除「${expense.category} ¥${expense.amount}」吗？`,
    confirmColor: '#ff4d4f',
    success(res) {
      if (res.confirm) {
        expenseService.remove(expense.id)
        for (const msg of messages.value) {
          const card = msg.cards.find(c => c.id === expense.id)
          if (card) { card.deleted = true; break }
        }
      }
    },
  })
}

function scrollToBottom() {
  nextTick(() => {
    scrollTop.value = messages.value.length * 2000
  })
}

function stripJsonBlocks(text: string): string {
  return text.replace(/```json\s*\n[\s\S]*?```/g, '').replace(/```\s*$/g, '').trim()
}

function clearContext() {
  messages.value = []
  scrollTop.value = 0
}

/**
 * 解析用户消息中提到的日期
 * 支持：昨天、前天、大前天、X月X日、上周X
 */
function resolveUserDate(text: string): string {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  if (/昨天/.test(text)) {
    const d = new Date(today)
    d.setDate(d.getDate() - 1)
    return formatYMD(d)
  }
  if (/前天/.test(text)) {
    const d = new Date(today)
    d.setDate(d.getDate() - 2)
    return formatYMD(d)
  }
  if (/大前天/.test(text)) {
    const d = new Date(today)
    d.setDate(d.getDate() - 3)
    return formatYMD(d)
  }

  // X月X日
  const monthDayMatch = text.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]/)
  if (monthDayMatch) {
    const month = parseInt(monthDayMatch[1])
    const day = parseInt(monthDayMatch[2])
    const d = new Date(now.getFullYear(), month - 1, day)
    if (d > today) d.setFullYear(d.getFullYear() - 1)
    return formatYMD(d)
  }

  // 上周X
  const lastWeekMatch = text.match(/上(?:个)?周([一二三四五六日天])/)
  if (lastWeekMatch) {
    const dayMap: Record<string, number> = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 0, '天': 0 }
    const targetDay = dayMap[lastWeekMatch[1]]
    const currentDay = today.getDay()
    const diff = currentDay - targetDay + 7
    const d = new Date(today)
    d.setDate(d.getDate() - diff)
    return formatYMD(d)
  }

  return ''
}

function formatYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

async function handleSend() {
  const text = inputText.value.trim()
  if (!text || isStreaming.value) return

  inputText.value = ''

  if (onboardingStep.value !== 'idle' && onboardingStep.value !== 'done') {
    messages.value.push({
      id: makeId(),
      role: 'user',
      content: text,
      displayContent: text,
      cards: [],
    })
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

  messages.value.push({
    id: makeId(),
    role: 'user',
    content: text,
    displayContent: text,
    cards: [],
  })
  scrollToBottom()

  isStreaming.value = true

  // 构建消费数据上下文 — 梗概 + 近3天明细（已存在记录，防止 AI 重复记账）
  const allExpenses = expenseService.getAll()
  const overview = buildExpenseOverview(allExpenses)

  const now = new Date()
  let recentDetail = ''
  for (let i = 0; i < 3; i++) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    const dateStr = formatYMD(d)
    const dayExpenses = allExpenses.filter(e => e.date === dateStr)
    const label = i === 0 ? '今天' : i === 1 ? '昨天' : '前天'
    if (dayExpenses.length > 0) {
      const items = dayExpenses.map(e => `${e.category} ¥${e.amount}${e.note ? '(' + e.note + ')' : ''}`).join('、')
      recentDetail += `${label}（${dateStr}）：${items}\n`
    } else {
      recentDetail += `${label}（${dateStr}）：无记录\n`
    }
  }

  // 检测用户是否在问某个范围的数据（本周/上周/本月/上月/最近N天）
  let rangeDetail = ''
  const rangeMatch = text.match(/(这?本?周|上[个]?周|这?本?月|上[个]?月|最近\d+天)/)
  if (rangeMatch) {
    const rangeKey = rangeMatch[1]
    let startStr = '', endStr = ''
    if (/周/.test(rangeKey)) {
      const isLast = /上/.test(rangeKey)
      const dayOfWeek = now.getDay() || 7
      const monday = new Date(now)
      monday.setDate(now.getDate() - dayOfWeek + 1 - (isLast ? 7 : 0))
      const sunday = new Date(monday)
      sunday.setDate(monday.getDate() + 6)
      startStr = formatYMD(monday)
      endStr = formatYMD(isLast ? sunday : now)
    } else if (/月/.test(rangeKey)) {
      const isLast = /上/.test(rangeKey)
      const y = isLast ? (now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()) : now.getFullYear()
      const m = isLast ? (now.getMonth() === 0 ? 11 : now.getMonth() - 1) : now.getMonth()
      const firstDay = new Date(y, m, 1)
      const lastDay = isLast ? new Date(y, m + 1, 0) : now
      startStr = formatYMD(firstDay)
      endStr = formatYMD(lastDay)
    } else {
      const daysMatch = rangeKey.match(/(\d+)/)
      if (daysMatch) {
        const days = parseInt(daysMatch[1])
        const start = new Date(now)
        start.setDate(start.getDate() - days + 1)
        startStr = formatYMD(start)
        endStr = formatYMD(now)
      }
    }
    if (startStr && endStr) {
      const rangeExpenses = allExpenses.filter(e => e.date >= startStr && e.date <= endStr)
      const total = rangeExpenses.reduce((s, e) => s + e.amount, 0)
      const detail = rangeExpenses.map(e => `${e.date} ${e.category} ¥${e.amount}${e.note ? '(' + e.note + ')' : ''}`).join('\n')
      rangeDetail = `\n[${rangeKey}明细 ${startStr}~${endStr}] 共${rangeExpenses.length}笔 ¥${total}\n${detail || '无记录'}`
    }
  }

  const enrichedText =
    `===== 以下为系统自动注入的[已存在消费记录]，仅供你参考回复，不要从中提取记账 =====\n` +
    `梗概：${overview}\n` +
    `近3天明细：\n${recentDetail}` +
    (rangeDetail ? rangeDetail : '') +
    `===== 注入结束 =====\n\n` +
    `用户消息：${text}`

  const chatMessages: ChatMessage[] = [{ role: 'user', content: enrichedText }]

  try {
    const aiMsgId = makeId()
    let fullAiText = ''

    messages.value.push({
      id: aiMsgId,
      role: 'assistant',
      content: '',
      displayContent: '',
      cards: [],
    })

    const cancel = chatCompletionStream(chatMessages, {
      onChunk(chunk: string) {
        const msg = messages.value.find((m) => m.id === aiMsgId)
        if (!msg) return

        fullAiText += chunk
        // 显示时实时过滤 JSON
        msg.displayContent = stripJsonBlocks(fullAiText)
        scrollToBottom()
      },
      onComplete(fullText: string) {
        const cards = saveExpensesFromText(fullText)
        const msg = messages.value.find((m) => m.id === aiMsgId)
        if (msg) {
          msg.content = fullText
          msg.displayContent = stripJsonBlocks(fullText)
          msg.cards = cards
        }
        isStreaming.value = false
        scrollToBottom()
      },
      onError(err: Error) {
        isStreaming.value = false
        const msg = messages.value.find((m) => m.id === aiMsgId)
        if (msg) {
          msg.content = `请求失败: ${err.message}`
          msg.displayContent = msg.content
        }
        scrollToBottom()
      },
    })
  } catch {
    try {
      const response = await chatCompletion(chatMessages)
      const cards = saveExpensesFromText(response)
      messages.value.push({
        id: makeId(),
        role: 'assistant',
        content: response,
        displayContent: stripJsonBlocks(response),
        cards,
      })
      isStreaming.value = false
      scrollToBottom()
    } catch (err: any) {
      isStreaming.value = false
      messages.value.push({
        id: makeId(),
        role: 'assistant',
        content: `请求失败: ${err.message || '未知错误'}`,
        displayContent: `请求失败: ${err.message || '未知错误'}`,
        cards: [],
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
  position: relative;
  padding-top: env(safe-area-inset-top);
  box-sizing: border-box;
}

.chat-list {
  width: 100%;
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

.expense-feedback-row {
  display: flex;
  justify-content: center;
  margin-bottom: 24rpx;
  padding: 0 24rpx;
}

.input-area {
  display: flex;
  align-items: center;
  padding: 12rpx 24rpx;
  padding-bottom: calc(12rpx + env(safe-area-inset-bottom));
  background-color: #fff;
  border-top: 1rpx solid #eee;
  gap: 12rpx;
  flex-shrink: 0;
  position: sticky;
  bottom: 0;
  z-index: 100;
}

.input-left {
  flex-shrink: 0;
}

.new-chat-btn {
  height: 64rpx;
  padding: 0 16rpx;
  background-color: #f0f0f0;
  border-radius: 32rpx;
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
  height: 64rpx;
  background-color: #f2f3f5;
  border-radius: 32rpx;
  padding: 0 24rpx;
  font-size: 28rpx;
  color: #333;
  border: 2rpx solid #e8e8e8;
}

.send-btn {
  margin-left: 0;
  width: 100rpx;
  height: 64rpx;
  background-color: #2b7cff;
  border-radius: 32rpx;
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

/* Splash screen */
.splash {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: linear-gradient(160deg, #1a1a2e 0%, #16213e 40%, #0f3460 100%);
  transition: opacity 0.6s ease;
}

.splash--fade {
  opacity: 0;
}

.splash-content {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.splash-icon {
  width: 140rpx;
  height: 140rpx;
  border-radius: 36rpx;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 40rpx;
  box-shadow: 0 16rpx 48rpx rgba(102, 126, 234, 0.4);
}

.splash-icon-text {
  font-size: 72rpx;
}

.splash-title {
  font-size: 52rpx;
  font-weight: 700;
  color: #ffffff;
  letter-spacing: 4rpx;
  margin-bottom: 12rpx;
}

.splash-subtitle {
  font-size: 26rpx;
  color: rgba(255, 255, 255, 0.5);
  letter-spacing: 8rpx;
  margin-bottom: 80rpx;
}

.splash-loader {
  display: flex;
  gap: 12rpx;
}

.splash-dot {
  width: 12rpx;
  height: 12rpx;
  border-radius: 50%;
  background-color: rgba(255, 255, 255, 0.3);
  animation: splash-bounce 1.2s ease-in-out infinite;
}

.splash-dot:nth-child(2) {
  animation-delay: 0.15s;
}

.splash-dot:nth-child(3) {
  animation-delay: 0.3s;
}

@keyframes splash-bounce {
  0%, 80%, 100% {
    transform: scale(0.6);
    opacity: 0.3;
  }
  40% {
    transform: scale(1);
    opacity: 1;
    background-color: #667eea;
  }
}

.splash-credit {
  position: absolute;
  bottom: calc(80rpx + env(safe-area-inset-bottom));
  font-size: 22rpx;
  color: rgba(255, 255, 255, 0.25);
  letter-spacing: 2rpx;
}
</style>
