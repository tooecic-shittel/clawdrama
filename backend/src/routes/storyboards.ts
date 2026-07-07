import { Hono } from 'hono'
import { eq, inArray } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { success, created, now, badRequest, notFound, paymentRequired } from '../utils/response.js'
import { toSnakeCase } from '../utils/transform.js'
import { canAccess, episodeOwnerId, storyboardOwnerId } from '../middleware/ownership.js'
import { generateTTS } from '../services/tts-generation.js'
import { pickVoiceForCharacter } from '../services/voice-mapper.js'
import { getActiveConfig } from '../services/ai.js'
import { buildTTSInstruction } from '../services/tts-instruction.js'
import { enhanceShotVideoPrompt } from '../services/prompt-rewrite.js'
import { logTaskError, logTaskPayload, logTaskProgress, logTaskStart, logTaskSuccess } from '../utils/task-logger.js'

const app = new Hono()

function clipText(value: string | null | undefined, max = 1200): string {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  return text.length > max ? `${text.slice(0, max)}...` : text
}

function formatContextShot(sb: typeof schema.storyboards.$inferSelect): string {
  const bits = [
    `#${sb.storyboardNumber}`,
    sb.title ? `标题：${sb.title}` : '',
    sb.location ? `地点：${sb.location}` : '',
    sb.description ? `描述：${clipText(sb.description, 180)}` : '',
    sb.action ? `动作：${clipText(sb.action, 160)}` : '',
    sb.dialogue ? `对白：${clipText(sb.dialogue, 160)}` : '',
    sb.soundEffect ? `音效：${clipText(sb.soundEffect, 120)}` : '',
    sb.emotionBeat ? `情绪：${clipText(sb.emotionBeat, 120)}` : '',
    sb.result ? `结果：${clipText(sb.result, 140)}` : '',
  ].filter(Boolean)
  return bits.join('；')
}

// POST /storyboards/:id/enhance-video-prompt —— 用 storyboard_breaker skill 把视频提示词优化成电影级（带角色锚点）
app.post('/:id/enhance-video-prompt', async (c) => {
  const id = Number(c.req.param('id'))
  const [sb] = db.select().from(schema.storyboards).where(eq(schema.storyboards.id, id)).all()
  if (!sb) return badRequest(c, '镜头不存在')
  if (!canAccess(c, episodeOwnerId(sb.episodeId))) return notFound(c, '镜头不存在')
  const body = await c.req.json().catch(() => ({} as any))
  const links = db.select().from(schema.storyboardCharacters).where(eq(schema.storyboardCharacters.storyboardId, id)).all()
  const charIds = links.map(l => l.characterId)
  const chars = charIds.length ? db.select().from(schema.characters).where(inArray(schema.characters.id, charIds)).all() : []
  const scene = sb.sceneId ? (db.select().from(schema.scenes).where(eq(schema.scenes.id, sb.sceneId)).all()[0] || null) : null
  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, sb.episodeId)).all()
  const drama = ep ? (db.select().from(schema.dramas).where(eq(schema.dramas.id, ep.dramaId)).all()[0] || null) : null
  const episodeShots = db.select().from(schema.storyboards)
    .where(eq(schema.storyboards.episodeId, sb.episodeId))
    .orderBy(schema.storyboards.storyboardNumber)
    .all()
  const currentIndex = episodeShots.findIndex(item => item.id === sb.id)
  const previousShots = currentIndex >= 0 ? episodeShots.slice(Math.max(0, currentIndex - 2), currentIndex) : []
  const nextShots = currentIndex >= 0 ? episodeShots.slice(currentIndex + 1, currentIndex + 3) : []
  try {
    const prompt = await enhanceShotVideoPrompt({
      description: sb.description, action: sb.action, dialogue: sb.dialogue,
      shotType: sb.shotType, angle: sb.angle, movement: sb.movement, lighting: sb.lighting,
      composition: sb.composition, emotionBeat: sb.emotionBeat, result: sb.result,
      soundEffect: sb.soundEffect, bgmPrompt: sb.bgmPrompt,
      duration: sb.duration,
      location: sb.location || scene?.location || null, time: sb.time || null, atmosphere: sb.atmosphere,
      characters: chars.map(ch => ({ name: ch.name, appearance: ch.appearance })),
      dramaStyle: drama?.style || null,
      episodeContext: clipText(ep?.scriptContent || ep?.content || ep?.description || drama?.description, 1200),
      previousShots: previousShots.map(formatContextShot),
      nextShots: nextShots.map(formatContextShot),
      currentPrompt: (typeof body?.prompt === 'string' && body.prompt.trim()) ? body.prompt : sb.videoPrompt,
    })
    if (!prompt) return badRequest(c, 'AI 未返回优化结果')
    return success(c, { prompt })
  } catch (err: any) {
    return badRequest(c, err.message)
  }
})

const IGNORE_TTS_SPEAKERS = /^(环境音|环境声|音效|效果音|sfx|sound ?effect|bgm|背景音|背景音乐|ambient)$/i
const IGNORE_TTS_TEXT = /^(无|无对白|无台词|无旁白|无需配音|无需对白|none|null|n\/a|na|环境音|环境声|音效|效果音|纯音效|纯环境音|只有环境音|仅环境音|背景音|背景音乐|bgm|sfx|ambient)$/i

function parseDialogueForTTS(dialogue?: string | null) {
  const raw = dialogue?.trim() || ''
  if (!raw) return { speaker: '', pureText: '', ignorable: true }
  const speakerMatch = raw.match(/^(.+?)[:：]/)
  const speaker = speakerMatch ? speakerMatch[1].replace(/[（(].+?[)）]/g, '').trim() : ''
  const pureText = raw.replace(/^.+?[:：]\s*/, '').replace(/[（(].+?[)）]/g, '').trim()
  const ignorable = (!!speaker && IGNORE_TTS_SPEAKERS.test(speaker)) || !pureText || IGNORE_TTS_TEXT.test(pureText)
  return { speaker, pureText, ignorable }
}

function syncStoryboardCharacters(storyboardId: number, characterIds: number[]) {
  db.delete(schema.storyboardCharacters)
    .where(eq(schema.storyboardCharacters.storyboardId, storyboardId))
    .run()

  const uniqueIds = [...new Set((characterIds || []).filter(Boolean))]
  if (!uniqueIds.length) return

  for (const characterId of uniqueIds) {
    db.insert(schema.storyboardCharacters).values({
      storyboardId,
      characterId,
    }).run()
  }
}

function getStoryboardCharacterIds(storyboardId: number) {
  return db.select().from(schema.storyboardCharacters)
    .where(eq(schema.storyboardCharacters.storyboardId, storyboardId)).all()
    .map(link => link.characterId)
}

function validateStoryboardBindings(episodeId: number, sceneId: number | null | undefined, characterIds: number[] | undefined) {
  const episodeSceneIds = new Set(
    db.select().from(schema.episodeScenes)
      .where(eq(schema.episodeScenes.episodeId, episodeId)).all()
      .map(link => link.sceneId),
  )
  const episodeCharacterIds = new Set(
    db.select().from(schema.episodeCharacters)
      .where(eq(schema.episodeCharacters.episodeId, episodeId)).all()
      .map(link => link.characterId),
  )

  if (sceneId != null && !episodeSceneIds.has(sceneId)) {
    throw new Error('scene_id 必须来自当前集已关联场景')
  }

  const invalidCharacterIds = (characterIds || []).filter(id => !episodeCharacterIds.has(id))
  if (invalidCharacterIds.length) {
    throw new Error('character_ids 必须来自当前集已关联角色')
  }
}

// POST /storyboards
app.post('/', async (c) => {
  const body = await c.req.json()
  if (!canAccess(c, episodeOwnerId(body.episode_id))) return notFound(c, '剧集不存在')
  const ts = now()
  logTaskStart('StoryboardAPI', 'create', {
    episodeId: body.episode_id,
    shotNumber: body.storyboard_number || 1,
    sceneId: body.scene_id,
    characterIds: body.character_ids,
  })
  logTaskPayload('StoryboardAPI', 'create body', body)
  validateStoryboardBindings(body.episode_id, body.scene_id, body.character_ids)
  const res = db.insert(schema.storyboards).values({
    episodeId: body.episode_id,
    storyboardNumber: body.storyboard_number || 1,
    title: body.title,
    description: body.description,
    action: body.action,
    dialogue: body.dialogue,
    sceneId: body.scene_id,
    duration: body.duration || 10,
    createdAt: ts,
    updatedAt: ts,
  }).run()
  syncStoryboardCharacters(Number(res.lastInsertRowid), body.character_ids || [])
  const [result] = db.select().from(schema.storyboards)
    .where(eq(schema.storyboards.id, Number(res.lastInsertRowid))).all()
  logTaskSuccess('StoryboardAPI', 'create', {
    storyboardId: result.id,
    episodeId: result.episodeId,
    shotNumber: result.storyboardNumber,
  })
  return created(c, {
    ...toSnakeCase(result),
    character_ids: getStoryboardCharacterIds(result.id),
  })
})

// PUT /storyboards/:id
app.put('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json()
  const [storyboard] = db.select().from(schema.storyboards).where(eq(schema.storyboards.id, id)).all()
  if (!storyboard) return badRequest(c, '镜头不存在')
  if (!canAccess(c, episodeOwnerId(storyboard.episodeId))) return notFound(c, '镜头不存在')
  logTaskStart('StoryboardAPI', 'update', {
    storyboardId: id,
    episodeId: storyboard.episodeId,
    fields: Object.keys(body),
  })
  logTaskPayload('StoryboardAPI', 'update body', body)

  const fieldMap: Record<string, string> = {
    title: 'title', description: 'description', shot_type: 'shotType',
    angle: 'angle', movement: 'movement', action: 'action',
    dialogue: 'dialogue', duration: 'duration', video_prompt: 'videoPrompt',
    image_prompt: 'imagePrompt', scene_id: 'sceneId', location: 'location',
    time: 'time', atmosphere: 'atmosphere', result: 'result',
    bgm_prompt: 'bgmPrompt', sound_effect: 'soundEffect',
    lighting: 'lighting', composition: 'composition', emotion_beat: 'emotionBeat',
  }

  const updates: Record<string, any> = { updatedAt: now() }
  for (const [snakeKey, camelKey] of Object.entries(fieldMap)) {
    if (snakeKey in body) updates[camelKey] = body[snakeKey]
  }

  if ('dialogue' in body) {
    updates.ttsAudioUrl = null
    updates.subtitleUrl = null
  }

  validateStoryboardBindings(
    storyboard.episodeId,
    'scene_id' in body ? body.scene_id : storyboard.sceneId,
    'character_ids' in body ? body.character_ids : getStoryboardCharacterIds(id),
  )

  db.update(schema.storyboards).set(updates).where(eq(schema.storyboards.id, id)).run()
  if ('character_ids' in body) syncStoryboardCharacters(id, body.character_ids || [])
  logTaskSuccess('StoryboardAPI', 'update', {
    storyboardId: id,
    updatedFields: Object.keys(updates),
    characterIds: body.character_ids,
  })
  return success(c)
})

// POST /storyboards/:id/generate-tts
app.post('/:id/generate-tts', async (c) => {
  const id = Number(c.req.param('id'))
  const [sb] = db.select().from(schema.storyboards).where(eq(schema.storyboards.id, id)).all()
  if (!sb) return badRequest(c, '镜头不存在')
  if (!canAccess(c, episodeOwnerId(sb.episodeId))) return notFound(c, '镜头不存在')
  const parsedDialogue = parseDialogueForTTS(sb.dialogue)
  if (parsedDialogue.ignorable) return badRequest(c, '该镜头没有可生成的对白或旁白')
  logTaskStart('StoryboardAPI', 'generate-tts', {
    storyboardId: id,
    episodeId: sb.episodeId,
    dialoguePreview: (sb.dialogue || '').slice(0, 40),
  })
  logTaskPayload('StoryboardAPI', 'generate-tts input', {
    storyboardId: id,
    episodeId: sb.episodeId,
    dialogue: sb.dialogue,
  })

  const speaker = parsedDialogue.speaker
  const [epForVoice] = db.select().from(schema.episodes).where(eq(schema.episodes.id, sb.episodeId)).all()
  const ttsBody = await c.req.json().catch(() => ({} as any))
  // voice 覆盖：优先 query 参数（最稳，绕开 body 解析），再退回 body。
  const overrideVoice = (c.req.query('voice_id') || (typeof ttsBody?.voice_id === 'string' ? ttsBody.voice_id : '') || '').trim()
  const voiceId = overrideVoice || pickVoiceForCharacter({
    characterName: speaker,
    dramaId: epForVoice?.dramaId,
    fallback: 'sage',
  })

  const pureDialogue = parsedDialogue.pureText
  if (!pureDialogue) return badRequest(c, '未提取到可合成的文本')

  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, sb.episodeId)).all()
  const emotion = buildTTSInstruction(
    { atmosphere: sb.atmosphere, action: sb.action, description: sb.description },
    pureDialogue,
    speaker,
  )
  try {
    // configId 强制传 null：忽略这一集可能残留的旧音频配置（迁移前的云雾/gemini），统一走当前启用的音频引擎（MiniMax），
    // 否则旧引擎不认 MiniMax 的 voice_id → 默认女声。
    const audioPath = await generateTTS({ text: pureDialogue, voice: voiceId, emotion, configId: null, userId: (c.get('user') as any)?.id })
  db.update(schema.storyboards)
    .set({ ttsAudioUrl: audioPath, updatedAt: now() })
    .where(eq(schema.storyboards.id, id))
    .run()

    logTaskSuccess('StoryboardAPI', 'generate-tts', {
      storyboardId: id,
      voiceId,
      path: audioPath,
      textLength: pureDialogue.length,
    })
    let audioEngine = ''
    try { audioEngine = getActiveConfig('audio')?.provider || '' } catch {}
    return success(c, { tts_audio_url: audioPath, voice_id: voiceId, text: pureDialogue, override_received: !!overrideVoice, audio_engine: audioEngine })
  } catch (err: any) {
    logTaskError('StoryboardAPI', 'generate-tts', { storyboardId: id, voiceId, error: err.message })
    if (err?.status === 402) return paymentRequired(c, err.message)
    return badRequest(c, err.message)
  }
})

// DELETE /storyboards/:id
app.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  if (!canAccess(c, storyboardOwnerId(id))) return notFound(c, '镜头不存在')
  logTaskStart('StoryboardAPI', 'delete', { storyboardId: id })
  db.delete(schema.storyboardCharacters).where(eq(schema.storyboardCharacters.storyboardId, id)).run()
  db.delete(schema.storyboards).where(eq(schema.storyboards.id, id)).run()
  logTaskSuccess('StoryboardAPI', 'delete', { storyboardId: id })
  return success(c)
})

export default app
