/**
 * 启动时按环境变量预置全局 AI 服务配置（ai_service_configs 是全局表，无 user_id，所有用户共用）。
 *
 * 设计：
 *   - key 只来自环境变量（运营方在 Railway / 宿主机注入），绝不写进代码仓库。
 *   - 每条「受管」配置按 (serviceType + provider) upsert：存在则更新 key/baseUrl/model/priority，
 *     不存在则插入。只动这 5 条，运营方在设置页手动加的其它配置不受影响。
 *   - 某条对应的环境变量缺失时，跳过该条（设置页仍可手动配置）。
 *
 * 需要的环境变量：
 *   GOOGLE_API_KEY        —— Google Gemini（文本 + 原生 TTS）
 *   GOOGLE_VIDEO_API_KEY  —— Google Veo 官方视频。与 GOOGLE_API_KEY 是不同的 key；缺失则跳过视频播种。
 *   YUNWU_API_KEY         —— 云雾（图片 + TTS 兜底）
 *
 * 注：happyhorse 视频兜底已废弃（云雾中转接口生成时报 resolution 错，修不好），启动时会清掉残留配置。
 */
import { eq, and } from 'drizzle-orm'
import { db, schema } from './index.js'
import { now } from '../utils/response.js'

interface ManagedConfig {
  serviceType: string
  provider: string
  name: string
  baseUrl: string
  model: string
  priority: number
  envKey: string
}

const MANAGED_CONFIGS: ManagedConfig[] = [
  { serviceType: 'text',  provider: 'google', name: 'Google Gemini 文本',    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.5-flash',             priority: 100, envKey: 'GOOGLE_API_KEY' },
  { serviceType: 'image', provider: 'openai', name: '云雾图片服务',           baseUrl: 'https://yunwu.ai/v1',                                     model: 'doubao-seedream-4-5-251128',  priority: 99,  envKey: 'YUNWU_API_KEY' },
  { serviceType: 'video', provider: 'google-veo', name: 'Google Veo 视频（官方）', baseUrl: 'https://generativelanguage.googleapis.com/v1beta',     model: 'veo-3.0-fast-generate-001',   priority: 98,  envKey: 'GOOGLE_VIDEO_API_KEY' },
  { serviceType: 'audio', provider: 'openai', name: '云雾 TTS 服务',          baseUrl: 'https://yunwu.ai/v1',                                     model: 'gpt-4o-mini-tts',             priority: 97,  envKey: 'YUNWU_API_KEY' },
  { serviceType: 'audio', provider: 'gemini', name: 'Gemini 原生 TTS',        baseUrl: 'https://generativelanguage.googleapis.com/v1beta',        model: 'gemini-2.5-flash-preview-tts', priority: 98, envKey: 'GOOGLE_API_KEY' },
]

function resolveKey(envKey: string): string {
  return (process.env[envKey] || '').trim()
}

export function seedAiConfigs(): void {
  const ts = now()
  let inserted = 0
  let updated = 0
  let skipped = 0

  for (const cfg of MANAGED_CONFIGS) {
    const apiKey = resolveKey(cfg.envKey)
    if (!apiKey) {
      skipped++
      continue
    }

    const values = {
      serviceType: cfg.serviceType,
      provider: cfg.provider,
      name: cfg.name,
      baseUrl: cfg.baseUrl,
      apiKey,
      model: JSON.stringify([cfg.model]),
      priority: cfg.priority,
      isActive: true,
      updatedAt: ts,
    }

    const [existing] = db.select().from(schema.aiServiceConfigs)
      .where(and(
        eq(schema.aiServiceConfigs.serviceType, cfg.serviceType),
        eq(schema.aiServiceConfigs.provider, cfg.provider),
      )).all()

    if (existing) {
      db.update(schema.aiServiceConfigs).set(values).where(eq(schema.aiServiceConfigs.id, existing.id)).run()
      updated++
    } else {
      db.insert(schema.aiServiceConfigs).values({ ...values, createdAt: ts }).run()
      inserted++
    }
  }

  // 清理：happyhorse 视频兜底已废弃（云雾接口生成时报 resolution 错），删掉残留配置
  const stale = db.select().from(schema.aiServiceConfigs)
    .where(eq(schema.aiServiceConfigs.serviceType, 'video')).all()
    .filter(r => (r.model || '').includes('happyhorse'))
  for (const r of stale) {
    db.delete(schema.aiServiceConfigs).where(eq(schema.aiServiceConfigs.id, r.id)).run()
  }
  const dropped = stale.length

  if (inserted || updated || skipped || dropped) {
    console.log(`🔑 AI 配置播种完成：新增 ${inserted}，更新 ${updated}，跳过 ${skipped}（缺环境变量），清理废弃 ${dropped}`)
  }
}
