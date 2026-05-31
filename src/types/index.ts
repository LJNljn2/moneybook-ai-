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
  THINKING_MODEL_DEFAULT: 'thinking_model_default',
  DEFAULT_THINKING_BUDGET: 'default_thinking_budget',
} as const

export type SettingKey = typeof SettingKeys[keyof typeof SettingKeys]

/** 模型配置（含思考能力标记） */
export interface ModelConfig {
  name: string
  supportsThinking: boolean
}

/** AI 平台配置 */
export interface AiPlatform {
  id: string
  name: string
  baseUrl: string
  models: ModelConfig[] // 可选模型列表
  isCustom: boolean // 是否用户自定义
}

/** 聊天消息角色 */
export type ChatRole = 'system' | 'user' | 'assistant'

/** 聊天消息 */
export interface ChatMessage {
  role: ChatRole
  content: string
  model?: string // 使用的模型名称
  provider?: string // 供应商 ID
  hasThinking?: boolean // 是否包含思考过程（内容不持久化）
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
  '4. 每次记账后，用朋友的口吻简短点评，可以结合最近消费数据给出分析',
  '5. 用户问账单问题时，用自然语言回答，根据提供的消费数据上下文给出具体数字和分析',
  '6. 如果用户消费较多时适当提醒控制预算，消费合理时给予鼓励',
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
  '- 用户消息开头的 [已存在消费记录] 区块是系统自动注入的历史数据，仅用于你参考和分析，绝对不要从中提取 JSON 记账数据',
  '- 只有用户在"用户消息："之后明确提到的消费才需要记账，不要重复记录已有的数据',
].join('\n')

/** 从平台获取所有模型名称 */
export function getModelNames(platform: AiPlatform): string[] {
  return platform.models.map(m => m.name)
}

/** 检查平台的指定模型是否支持思考 */
export function isThinkingModel(platform: AiPlatform, modelName: string): boolean {
  const model = platform.models.find(m => m.name === modelName)
  return model?.supportsThinking ?? false
}

/** 获取平台中所有支持思考的模型 */
export function getThinkingModels(platform: AiPlatform): ModelConfig[] {
  return platform.models.filter(m => m.supportsThinking)
}

/** 将旧格式 string[] 转换为 ModelConfig[]（数据迁移辅助） */
export function migrateModels(models: Array<string | ModelConfig>): ModelConfig[] {
  return models.map(m => {
    if (typeof m === 'string') {
      return { name: m, supportsThinking: false }
    }
    return m
  })
}
