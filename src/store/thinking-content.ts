/**
 * 思考内容内存存储
 *
 * 思考过程内容仅保存在内存中（不持久化到本地存储），
 * 用于在流式输出期间实时展示 thinking tokens。
 * 页面刷新或重新进入后思考内容将丢失（这是设计意图）。
 */

const thinkingMap = new Map<string, string>()

/** 获取指定消息的思考内容 */
export function getThinkingContent(messageId: string): string {
  return thinkingMap.get(messageId) ?? ''
}

/** 设置（覆盖）指定消息的思考内容 */
export function setThinkingContent(messageId: string, content: string): void {
  thinkingMap.set(messageId, content)
}

/** 追加思考内容（流式场景） */
export function appendThinkingContent(messageId: string, chunk: string): void {
  const existing = thinkingMap.get(messageId) ?? ''
  thinkingMap.set(messageId, existing + chunk)
}

/** 删除指定消息的思考内容 */
export function removeThinkingContent(messageId: string): void {
  thinkingMap.delete(messageId)
}

/** 清空所有思考内容 */
export function clearAllThinkingContent(): void {
  thinkingMap.clear()
}

/** 获取所有有思考内容的消息 ID */
export function getMessageIdsWithThinking(): string[] {
  return Array.from(thinkingMap.keys())
}

/** 检查指定消息是否有思考内容 */
export function hasThinkingContent(messageId: string): boolean {
  return thinkingMap.has(messageId) && thinkingMap.get(messageId)!.length > 0
}

/** 获取当前存储的思考内容条目数 */
export function getThinkingContentCount(): number {
  return thinkingMap.size
}

export const thinkingContentStore = {
  get: getThinkingContent,
  set: setThinkingContent,
  append: appendThinkingContent,
  remove: removeThinkingContent,
  clearAll: clearAllThinkingContent,
  getMessageIds: getMessageIdsWithThinking,
  has: hasThinkingContent,
  count: getThinkingContentCount,
}
