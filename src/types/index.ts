/** 消费记录 */
export interface Expense {
  id: string
  amount: number
  category: string
  date: string // YYYY-MM-DD
  note: string
  created_at: string // ISO 8601
}

/** 消费分类 */
export interface Category {
  id: string
  name: string
  icon: string
  color: string
  is_custom: boolean
}

/** 应用设置项 */
export interface SettingItem {
  key: string
  value: string
}

/** 设置 key 常量 */
export const SettingKeys = {
  SYSTEM_PROMPT: 'system_prompt',
  USER_AVATAR: 'user_avatar',
  USER_NICKNAME: 'user_nickname',
  AI_AVATAR: 'ai_avatar',
  AI_NICKNAME: 'ai_nickname',
  PLATFORM_CONFIG: 'platform_config',
  API_KEYS: 'api_keys',
  ONBOARDING_DONE: 'onboarding_done',
  MONTHLY_BUDGET: 'monthly_budget',
} as const

export type SettingKey = typeof SettingKeys[keyof typeof SettingKeys]

/** AI 平台配置 */
export interface AiPlatform {
  id: string
  name: string
  baseUrl: string
  models: string[] // 可选模型列表
  isCustom: boolean // 是否用户自定义
}

/** 聊天消息角色 */
export type ChatRole = 'system' | 'user' | 'assistant'

/** 聊天消息 */
export interface ChatMessage {
  role: ChatRole
  content: string
}

/** 当前使用的平台配置（运行时） */
export interface ActivePlatformConfig {
  platformId: string
  model: string
}

/** 默认系统提示词 */
export const DEFAULT_SYSTEM_PROMPT = [
  '你是一个智能记账助手「小记」，帮助用户通过自然对话记录消费。',
  '',
  '你的职责：',
  '1. 理解用户描述的消费行为，提取：金额(amount)、分类(category)、备注(note)、日期(date)',
  '2. 支持的分类：餐饮、交通、购物、住房、娱乐、医疗、教育、其他',
  '3. 如果用户一次性描述多笔消费，全部提取',
  '4. 每次记账后，用朋友的口吻简短点评',
  '5. 用户问账单问题时，用自然语言回答',
  '',
  '回复格式：',
  '先用自然语言回复用户，然后在最后一行附上 JSON 数据（如果没有记账则不附 JSON）：',
  '```json',
  '{"expenses": [{"amount": 数字, "category": "分类名", "note": "备注", "date": "YYYY-MM-DD"}]}',
  '```',
  '',
  '注意：',
  '- 日期默认为今天，如果用户提到其他日期请调整',
  '- 金额必须是正数',
  '- 如果信息不全，友好地追问',
].join('\n')
