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
  ONBOARDING_DONE: 'onboarding_done',
  MONTHLY_BUDGET: 'monthly_budget',
} as const

export type SettingKey = typeof SettingKeys[keyof typeof SettingKeys]
