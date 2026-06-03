/**
 * AI 服务抽象层 — 从数据库配置中获取 provider 和 API key
 */
import { db, schema } from '../db/index.js'
import { eq } from 'drizzle-orm'
import { logTaskProgress, logTaskWarn } from '../utils/task-logger.js'
import { joinProviderUrl } from './adapters/url.js'

export type ServiceType = 'text' | 'image' | 'video' | 'audio'

export interface AIConfig {
  provider: string
  baseUrl: string
  apiKey: string
  model: string
}

export function getTextProviderBaseUrl(config: AIConfig) {
  const provider = config.provider.toLowerCase()

  if (provider === 'openai' || provider === 'openrouter' || provider === 'chatfire') {
    return joinProviderUrl(config.baseUrl, '/v1', '')
  }

  if (provider === 'volcengine') {
    return joinProviderUrl(config.baseUrl, '/api/v3', '')
  }

  if (provider === 'ali') {
    return joinProviderUrl(config.baseUrl, '/api/v1', '')
  }

  return config.baseUrl
}

export function getActiveConfig(serviceType: ServiceType): AIConfig | null {
  const rows = db.select().from(schema.aiServiceConfigs)
    .where(eq(schema.aiServiceConfigs.serviceType, serviceType))
    .all()
    .filter(r => r.isActive)
    .sort((a, b) => (b.priority || 0) - (a.priority || 0)) // 高优先级优先

  const active = rows[0]
  if (!active) {
    logTaskWarn('AIConfig', 'active-config-missing', { serviceType })
    return null
  }

  const models = active.model ? JSON.parse(active.model) : []
  logTaskProgress('AIConfig', 'active-config-selected', {
    serviceType,
    configId: active.id,
    provider: active.provider,
    model: models[0] || '',
    priority: active.priority,
  })
  return {
    provider: active.provider || '',
    baseUrl: active.baseUrl,
    apiKey: active.apiKey,
    model: models[0] || '',
  }
}

export function getTextConfig(): AIConfig {
  const config = getActiveConfig('text')
  if (!config) throw new Error('No active text AI config')
  return config
}

export function getAudioConfig(): AIConfig {
  const config = getActiveConfig('audio')
  if (!config) throw new Error('No active audio AI config — 请在设置中添加音频服务')
  return config
}

export function getAudioConfigById(id?: number | null): AIConfig {
  if (id) {
    const config = getConfigById(id)
    if (config) return config
  }
  return getAudioConfig()
}

/**
 * 所有「启用中」的音频配置，按优先级从高到低。
 * 给 TTS 跨 provider 兜底用：主配置（最高优先级）生成失败时，依次落到下一个。
 */
export function getActiveAudioConfigs(): AIConfig[] {
  return db.select().from(schema.aiServiceConfigs)
    .where(eq(schema.aiServiceConfigs.serviceType, 'audio'))
    .all()
    .filter(r => r.isActive)
    .sort((a, b) => (b.priority || 0) - (a.priority || 0))
    .map(r => ({
      provider: r.provider || '',
      baseUrl: r.baseUrl,
      apiKey: r.apiKey,
      model: r.model ? (JSON.parse(r.model)[0] || '') : '',
    }))
}

/**
 * 所有「启用中」的视频配置，按优先级从高到低。
 * 给视频跨配置兜底用：主配置（如官方 Veo）失败/配额耗尽时，依次落到下一个（如云雾 happyhorse）。
 */
export function getActiveVideoConfigs(): AIConfig[] {
  return db.select().from(schema.aiServiceConfigs)
    .where(eq(schema.aiServiceConfigs.serviceType, 'video'))
    .all()
    .filter(r => r.isActive)
    .sort((a, b) => (b.priority || 0) - (a.priority || 0))
    .map(r => ({
      provider: r.provider || '',
      baseUrl: r.baseUrl,
      apiKey: r.apiKey,
      model: r.model ? (JSON.parse(r.model)[0] || '') : '',
    }))
}

export function getConfigById(id: number): AIConfig | null {
  const [row] = db.select().from(schema.aiServiceConfigs)
    .where(eq(schema.aiServiceConfigs.id, id)).all()
  if (!row || !row.isActive) {
    logTaskWarn('AIConfig', 'config-by-id-missing', { configId: id })
    return null
  }
  const models = row.model ? JSON.parse(row.model) : []
  logTaskProgress('AIConfig', 'config-by-id-selected', {
    configId: id,
    provider: row.provider,
    model: models[0] || '',
    serviceType: row.serviceType,
  })
  return {
    provider: row.provider || '',
    baseUrl: row.baseUrl,
    apiKey: row.apiKey,
    model: models[0] || '',
  }
}
