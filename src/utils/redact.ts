/**
 * 敏感数据脱敏工具
 * 用于日志输出等场景，防止 API Key 等敏感信息泄露
 */

/** 从字符串中脱敏 API Key 模式 */
export function redactApiKey(value: string): string {
  // 匹配常见 API Key 格式: sk-xxx, Bearer xxx, 以及长连续字符串
  return value
    // 脱敏 Authorization header 中的 token
    .replace(
      /(Authorization['":\s]*Bearer\s+)([A-Za-z0-9\-_.+/=]{8,})/gi,
      '$1****'
    )
    // 脱敏 sk- 开头的 OpenAI 格式 key
    .replace(/(sk-[A-Za-z0-9]{4})[A-Za-z0-9\-]+/g, '$1****')
    // 脱敏 api_key=xxx 查询参数
    .replace(
      /(api[_-]?key['":\s]*['"]?)([A-Za-z0-9\-_.]{8,})/gi,
      '$1****'
    )
}

/** 脱敏一个对象中可能包含 API Key 的字段 */
export function redactObject(obj: Record<string, unknown>): Record<string, unknown> {
  const sensitiveKeys = ['authorization', 'api_key', 'apikey', 'api-key', 'token']
  const result: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (sensitiveKeys.includes(k.toLowerCase()) && typeof v === 'string') {
      result[k] = '****' + (v.length > 4 ? v.slice(-4) : '')
    } else if (typeof v === 'string') {
      result[k] = redactApiKey(v)
    } else {
      result[k] = v
    }
  }
  return result
}
