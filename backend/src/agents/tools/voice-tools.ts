/**
 * 角色音色分配 Agent 工具
 */
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { db, schema } from '../../db/index.js'
import { eq } from 'drizzle-orm'
import { now } from '../../utils/response.js'
import { logTaskProgress, logTaskSuccess } from '../../utils/task-logger.js'
import { isGeminiVoice, nextUnusedVoice } from '../../services/voice-mapper.js'
import { MINIMAX_VOICE_CATALOG, nextUnusedMinimaxVoice } from '../../services/minimax-voices.js'

export function createVoiceTools(episodeId: number, dramaId: number) {
  function getEpisodeAudioProvider() {
    const [episode] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
    if (!episode?.audioConfigId) return null
    const [config] = db.select().from(schema.aiServiceConfigs).where(eq(schema.aiServiceConfigs.id, episode.audioConfigId)).all()
    return config?.provider || null
  }

  const getCharacters = createTool({
    id: 'get_characters',
    description: 'Get all characters for the current drama with their current voice assignments.',
    inputSchema: z.object({}),
    execute: async () => {
      const chars = db.select().from(schema.characters)
        .where(eq(schema.characters.dramaId, dramaId)).all()
      const payload = {
        characters: chars.map(c => ({
          id: c.id,
          name: c.name,
          role: c.role,
          personality: c.personality,
          description: c.description,
          current_voice: c.voiceStyle || '未分配',
        })),
      }
      logTaskSuccess('VoiceTool', 'get-characters', { episodeId, dramaId, count: payload.characters.length })
      return payload
    },
  })

  const listVoices = createTool({
    id: 'list_voices',
    description: 'List all available voice options for TTS.',
    inputSchema: z.object({}),
    execute: async () => {
      const provider = getEpisodeAudioProvider() || 'minimax'
      const rows = db.select().from(schema.aiVoices).where(eq(schema.aiVoices.provider, provider)).all()
      const voices = rows.length ? rows.map(v => {
        const desc = v.description ? JSON.parse(v.description) : []
        return {
          id: v.voiceId,
          name: v.voiceName,
          gender: inferGender(v.voiceName, desc),
          traits: Array.isArray(desc) && desc.length ? desc.slice(0, 2).join('、') : `${v.language || '多语言'}音色`,
          suitable_for: Array.isArray(desc) && desc.length > 2 ? desc.slice(2).join('、') : `${v.language || '通用'}角色`,
          language: v.language,
          provider,
        }
      }) : MINIMAX_VOICE_CATALOG.map(v => ({
        // ai_voices 为空时的兜底目录：MiniMax 官方中文精选音色
        id: v.voiceId, name: v.voiceName, gender: v.gender, traits: v.desc,
        suitable_for: v.desc, language: '中文', provider,
      }))

      const payload = {
        provider,
        voices,
        instruction: '根据角色的性别、性格、年龄来匹配最合适的音色，并且只能从当前集音频配置可用的音色列表中选择。当角色较多时，尽量为每个角色分配不同的音色，避免雷同。',
      }
      logTaskSuccess('VoiceTool', 'list-voices', { episodeId, provider, count: payload.voices.length })
      return payload
    },
  })

  const assignVoice = createTool({
    id: 'assign_voice',
    description: 'Assign a voice to a character.',
    inputSchema: z.object({
      character_id: z.number().describe('Character ID'),
      voice_id: z.string().describe('Voice ID from list_voices'),
      reason: z.string().optional().describe('Why this voice fits'),
    }),
    execute: async ({ character_id, voice_id, reason }) => {
      const provider = getEpisodeAudioProvider() || 'minimax'
      logTaskProgress('VoiceTool', 'assign-begin', { episodeId, dramaId, characterId: character_id, voiceId: voice_id, provider, reason })

      // 自动去重：若该音色已被本剧其它角色占用，顺延到同性别池里下一个未使用的，
      // 保证「同一部剧里不同角色音色不重复」。minimax / Gemini 各走各的池。
      const others = db.select().from(schema.characters)
        .where(eq(schema.characters.dramaId, dramaId)).all()
        .filter(c => c.id !== character_id)
      let finalVoice = voice_id
      if (isGeminiVoice(voice_id)) {
        finalVoice = nextUnusedVoice(voice_id, others.map(c => c.voiceStyle || '').filter(v => isGeminiVoice(v)))
      } else {
        finalVoice = nextUnusedMinimaxVoice(voice_id, others.map(c => c.voiceStyle || '').filter(Boolean))
      }
      const bumped = finalVoice.toLowerCase() !== voice_id.toLowerCase()

      db.update(schema.characters)
        .set({ voiceStyle: finalVoice, voiceProvider: provider, voiceSampleUrl: null, updatedAt: now() })
        .where(eq(schema.characters.id, character_id))
        .run()
      logTaskSuccess('VoiceTool', 'assign-complete', { episodeId, characterId: character_id, voiceId: finalVoice, requestedVoice: voice_id, bumped, provider })

      const message = bumped
        ? `音色 "${voice_id}" 已被本剧其它角色占用，已自动改为 "${finalVoice}" 分配给角色 ${character_id}（避免重复）`
        : `Assigned voice "${finalVoice}" to character ${character_id}`
      return { message, voice_id: finalVoice, requested_voice_id: voice_id, deduped: bumped, reason }
    },
  })

  return { getCharacters, listVoices, assignVoice }
}

function inferGender(name: string, desc: unknown) {
  const description = Array.isArray(desc) ? desc.join(' ') : ''
  const text = `${name} ${description}`
  if (/[男|青年|大爷|学长|boy|man|male]/i.test(text)) return '男声'
  if (/[女|少女|御姐|奶奶|girl|woman|female]/i.test(text)) return '女声'
  return '中性'
}
