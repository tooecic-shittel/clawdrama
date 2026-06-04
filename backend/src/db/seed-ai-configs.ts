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
 *   GOOGLE_API_KEY        —— Google Gemini（文本）
 *   GOOGLE_VIDEO_API_KEY  —— Google Veo 官方视频。与 GOOGLE_API_KEY 是不同的 key；缺失则跳过视频播种。
 *   YUNWU_API_KEY         —— 云雾（图片 + 视频 happyhorse 兜底）
 *   MINIMAX_API_KEY       —— MiniMax 官方语音（TTS，直连 api.minimaxi.com）
 *   ARK_API_KEY           —— 火山方舟 Seedance 官方视频（主力，直连 ark.cn-beijing.volces.com）
 */
import { eq, and } from 'drizzle-orm'
import { db, schema } from './index.js'
import { now } from '../utils/response.js'
import { MINIMAX_VOICE_CATALOG, LEGACY_TO_NEW_VOICE } from '../services/minimax-voices.js'
import { remapVoiceToMinimax } from '../services/voice-mapper.js'

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
  { serviceType: 'video', provider: 'volcengine', name: '火山 Seedance 视频（官方）', baseUrl: 'https://ark.cn-beijing.volces.com',                  model: 'doubao-seedance-2-0-260128',  priority: 100, envKey: 'ARK_API_KEY' },
  { serviceType: 'video', provider: 'openai', name: '云雾 HappyHorse 视频（兜底）', baseUrl: 'https://yunwu.ai/v1',                                 model: 'happyhorse-1.0-t2v',          priority: 95,  envKey: 'YUNWU_API_KEY' },
  { serviceType: 'video', provider: 'google-veo', name: 'Google Veo 视频（官方·兜底）', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', model: 'veo-3.0-fast-generate-001',   priority: 90,  envKey: 'GOOGLE_VIDEO_API_KEY' },
  { serviceType: 'audio', provider: 'minimax', name: 'MiniMax 语音（官方）',  baseUrl: 'https://api.minimaxi.com',                                model: 'speech-2.8-hd',               priority: 100, envKey: 'MINIMAX_API_KEY' },
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

  if (inserted || updated || skipped) {
    console.log(`🔑 AI 配置播种完成：新增 ${inserted}，更新 ${updated}，跳过 ${skipped}（缺环境变量）`)
  }

  migrateAudioToMinimax(ts)
}

/**
 * TTS 全量切到 MiniMax：停用其它音频配置（Gemini / 云雾），并把历史剧集
 * 仍指向被停用配置的 audioConfigId 改指 MiniMax，避免旧集还走老 TTS。
 * 仅在 MiniMax 音频配置已就绪（有 key、激活）时执行，否则不动以免 TTS 全断。
 */
function migrateAudioToMinimax(ts: string): void {
  const [mm] = db.select().from(schema.aiServiceConfigs)
    .where(and(
      eq(schema.aiServiceConfigs.serviceType, 'audio'),
      eq(schema.aiServiceConfigs.provider, 'minimax'),
    )).all()
  if (!mm || !mm.isActive) return

  // (1) 停用其它激活音频配置 + 把历史剧集指过来（仅当还存在激活的非 minimax 音频配置时）
  const others = db.select().from(schema.aiServiceConfigs)
    .where(eq(schema.aiServiceConfigs.serviceType, 'audio')).all()
    .filter(r => r.provider !== 'minimax' && r.isActive)
  let redirected = 0
  if (others.length) {
    for (const o of others) {
      db.update(schema.aiServiceConfigs).set({ isActive: false, updatedAt: ts })
        .where(eq(schema.aiServiceConfigs.id, o.id)).run()
    }
    const disabledIds = new Set(others.map(o => o.id))
    for (const ep of db.select().from(schema.episodes).all()) {
      if (ep.audioConfigId && disabledIds.has(ep.audioConfigId)) {
        db.update(schema.episodes).set({ audioConfigId: mm.id, updatedAt: ts })
          .where(eq(schema.episodes.id, ep.id)).run()
        redirected++
      }
    }
  }

  // (2) 角色音色对齐到 MiniMax —— 每次启动幂等执行（不受上面 early-exit 影响）：
  //   a. 旧 Gemini/OpenAI 音色 → 同性别 minimax（+清旧样本）。
  //   b. 已是 minimax 音色但 voiceProvider 没对齐 minimax —— 说明那条试听样本是「切换前用别的
  //      provider（如 Gemini）生成的」，会出现「显示男声、听到女声」的错位 → 校正 provider + 清旧样本，
  //      让用户重生（届时走 minimax，性别就对了）。校正后 voiceProvider=minimax，下次启动不再触发，幂等。
  const chars = db.select().from(schema.characters).all()
  let remapped = 0
  let realigned = 0
  for (const ch of chars) {
    const mmVoice = remapVoiceToMinimax(ch.voiceStyle)
    if (mmVoice) {
      db.update(schema.characters)
        .set({ voiceStyle: mmVoice, voiceProvider: 'minimax', voiceSampleUrl: null, updatedAt: ts })
        .where(eq(schema.characters.id, ch.id)).run()
      remapped++
    } else if (ch.voiceStyle && ch.voiceProvider !== 'minimax') {
      db.update(schema.characters)
        .set({ voiceProvider: 'minimax', voiceSampleUrl: null, updatedAt: ts })
        .where(eq(schema.characters.id, ch.id)).run()
      realigned++
    }
  }
  if (others.length || remapped || realigned) {
    console.log(`🎙️ TTS→MiniMax：停用 ${others.length} 个旧音频配置，重定向 ${redirected} 剧集，迁移 ${remapped} + 对齐 ${realigned} 个角色音色（清旧样本）`)
  }
}

/**
 * 启动时填充 ai_voices 的 MiniMax 音色（库为空时）。
 * 运营方可在后台 POST /ai-voices/sync 从官方 get_voice 拉全量覆盖。
 */
export function seedMinimaxVoices(): void {
  // 清理之前误加的旧版经典 id（不在官方标准音色表、行为不可靠：会出现「少女」却发男声）。
  for (const legacyId of Object.keys(LEGACY_TO_NEW_VOICE)) {
    db.delete(schema.aiVoices)
      .where(and(eq(schema.aiVoices.provider, 'minimax'), eq(schema.aiVoices.voiceId, legacyId)))
      .run()
  }

  // 增量补种：按 voiceId 补齐目录里还没入库的音色（不动运营方 sync 进来的其它音色）。
  const existing = new Set(db.select().from(schema.aiVoices)
    .where(eq(schema.aiVoices.provider, 'minimax')).all()
    .map(r => r.voiceId))

  const ts = now()
  const toAdd = MINIMAX_VOICE_CATALOG.filter(v => !existing.has(v.voiceId))
  if (!toAdd.length) return

  db.insert(schema.aiVoices).values(toAdd.map(v => ({
    voiceId: v.voiceId,
    voiceName: v.voiceName,
    description: JSON.stringify([v.desc]),
    language: '中文',
    provider: 'minimax',
    createdAt: ts,
  }))).run()
  console.log(`🎙️ MiniMax 音色播种：新增 ${toAdd.length} 个（库内原有 ${existing.size}）`)
}
