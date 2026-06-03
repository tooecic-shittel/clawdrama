import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { success, badRequest, notFound, now, paymentRequired } from '../utils/response.js'
import { canAccess, characterOwnerId, dramaOwnerId, episodeOwnerId } from '../middleware/ownership.js'
import { enhanceCharacterImagePrompt } from '../services/prompt-rewrite.js'
import { generateVoiceSample } from '../services/tts-generation.js'
import { generateImage } from '../services/image-generation.js'
import { logTaskError, logTaskStart, logTaskSuccess } from '../utils/task-logger.js'

const app = new Hono()

// PUT /characters/:id
app.put('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  if (!canAccess(c, characterOwnerId(id))) return notFound(c, '角色不存在')
  const body = await c.req.json()
  const updates: Record<string, any> = { updatedAt: now() }
  for (const key of ['name', 'role', 'description', 'appearance', 'personality', 'voiceStyle', 'voiceProvider', 'imageUrl', 'localPath']) {
    const snakeKey = key.replace(/[A-Z]/g, m => '_' + m.toLowerCase())
    if (snakeKey in body) updates[key] = body[snakeKey]
    else if (key in body) updates[key] = body[key]
  }
  if ('voice_style' in body || 'voiceStyle' in body) {
    updates.voiceSampleUrl = null
  }
  db.update(schema.characters).set(updates).where(eq(schema.characters.id, id)).run()
  return success(c)
})

// DELETE /characters/:id
app.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  if (!canAccess(c, characterOwnerId(id))) return notFound(c, '角色不存在')
  db.update(schema.characters).set({ deletedAt: now() }).where(eq(schema.characters.id, id)).run()
  return success(c)
})

// POST /characters/:id/generate-voice-sample — 生成角色音色试听
app.post('/:id/generate-voice-sample', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json().catch(() => ({}))
  const [char] = db.select().from(schema.characters).where(eq(schema.characters.id, id)).all()
  if (!char) return badRequest(c, 'Character not found')
  if (!canAccess(c, dramaOwnerId(char.dramaId))) return notFound(c, '角色不存在')
  if (!char.voiceStyle) return badRequest(c, '请先分配音色')
  if (!body.episode_id) return badRequest(c, 'episode_id is required')

  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, Number(body.episode_id))).all()
  if (!ep) return badRequest(c, 'Episode not found')

  try {
    logTaskStart('VoiceSample', 'generate', { characterId: id, characterName: char.name, episodeId: ep.id, voice: char.voiceStyle })
    const audioPath = await generateVoiceSample(char.name, char.voiceStyle, ep.audioConfigId ?? undefined)
    db.update(schema.characters)
      .set({ voiceSampleUrl: audioPath, updatedAt: now() })
      .where(eq(schema.characters.id, id)).run()
    logTaskSuccess('VoiceSample', 'generate', { characterId: id, path: audioPath })
    return success(c, { voice_sample_url: audioPath })
  } catch (err: any) {
    logTaskError('VoiceSample', 'generate', { characterId: id, error: err.message })
    return badRequest(c, `TTS 生成失败: ${err.message}`)
  }
})

// POST /characters/:id/enhance-prompt — 让 AI 根据角色设定+画风改写丰富立绘提示词
app.post('/:id/enhance-prompt', async (c) => {
  const id = Number(c.req.param('id'))
  if (!canAccess(c, characterOwnerId(id))) return notFound(c, '角色不存在')
  const body = await c.req.json().catch(() => ({}))
  const [char] = db.select().from(schema.characters).where(eq(schema.characters.id, id)).all()
  if (!char) return badRequest(c, 'Character not found')
  const [drama] = char.dramaId
    ? db.select({ style: schema.dramas.style }).from(schema.dramas).where(eq(schema.dramas.id, char.dramaId)).all()
    : []
  try {
    const prompt = await enhanceCharacterImagePrompt({
      name: char.name,
      role: char.role,
      appearance: char.appearance,
      description: char.description,
      personality: char.personality,
      dramaStyle: drama?.style,
      currentPrompt: body.prompt,
    })
    if (!prompt) return badRequest(c, 'AI 未返回提示词，请重试')
    logTaskSuccess('CharacterImage', 'enhance-prompt', { characterId: id, length: prompt.length })
    return success(c, { prompt })
  } catch (err: any) {
    logTaskError('CharacterImage', 'enhance-prompt', { characterId: id, error: err.message })
    return badRequest(c, err.message || 'AI 改写失败')
  }
})

// POST /characters/:id/generate-image
app.post('/:id/generate-image', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json()
  const [char] = db.select().from(schema.characters).where(eq(schema.characters.id, id)).all()
  if (!char) return badRequest(c, 'Character not found')
  if (!canAccess(c, dramaOwnerId(char.dramaId))) return notFound(c, '角色不存在')
  if (!body.episode_id) return badRequest(c, 'episode_id is required')

  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, Number(body.episode_id))).all()
  if (!ep) return badRequest(c, 'Episode not found')

  // 自定义提示词优先；没传则用角色上次存的；都没有才现拼默认。
  // 用过的自定义提示词存回角色，下次「自定义」预填、「重新生成」也复用，不再回退到默认那版。
  const customPrompt = (body.prompt && String(body.prompt).trim()) ? String(body.prompt).trim() : ''
  const prompt = customPrompt
    || char.imagePrompt
    || `${char.name}, ${char.appearance || char.description || '人物立绘'}, 高质量, 正面, 白色背景`
  if (customPrompt && customPrompt !== char.imagePrompt) {
    db.update(schema.characters).set({ imagePrompt: customPrompt, updatedAt: now() }).where(eq(schema.characters.id, id)).run()
  }
  try {
    logTaskStart('CharacterImage', 'generate', { characterId: id, episodeId: ep.id, dramaId: char.dramaId, customPrompt: !!body.prompt })
    const genId = await generateImage({ userId: (c.get('user') as any)?.id, characterId: id, dramaId: char.dramaId, prompt, configId: ep.imageConfigId ?? undefined })
    logTaskSuccess('CharacterImage', 'generate', { characterId: id, generationId: genId })
    return success(c, { image_generation_id: genId })
  } catch (err: any) {
    logTaskError('CharacterImage', 'generate', { characterId: id, error: err.message })
    if (err?.status === 402) return paymentRequired(c, err.message)
    return badRequest(c, err.message)
  }
})

// POST /characters/:id/generate-view  body: { view: 'side' | 'back', episode_id }
// Generate side / back view using existing front avatar as image-to-image reference.
app.post('/:id/generate-view', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json()
  const view = String(body.view || '').toLowerCase()
  if (view !== 'side' && view !== 'back') return badRequest(c, 'view must be "side" or "back"')
  if (!body.episode_id) return badRequest(c, 'episode_id is required')

  const [char] = db.select().from(schema.characters).where(eq(schema.characters.id, id)).all()
  if (!char) return badRequest(c, 'Character not found')
  if (!canAccess(c, dramaOwnerId(char.dramaId))) return notFound(c, '角色不存在')
  const frontUrl = char.imageUrl || char.localPath
  if (!frontUrl) return badRequest(c, '请先生成正面头像')

  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, Number(body.episode_id))).all()
  if (!ep) return badRequest(c, 'Episode not found')

  const viewLabel = view === 'side' ? '侧面（profile view）' : '背面（back view）'
  const angleHint = view === 'side'
    ? '从正侧方拍摄，能看到完整的发型轮廓和服装侧面，保持同一人物的身材比例'
    : '从背后拍摄，能看到后脑勺发型和服装背面，保持同一人物的身高与体型'
  const prompt = `${char.name}的${viewLabel}立绘，${char.appearance || char.description || ''}。\n${angleHint}。与参考图为同一角色，**严格保留参考图中的发型、发色、服装款式与配色、肤色、身材**。白色简洁背景，全身或半身，高质量人物立绘。`

  try {
    logTaskStart('CharacterView', 'generate', { characterId: id, view, episodeId: ep.id })
    const genId = await generateImage({
      userId: (c.get('user') as any)?.id,
      characterId: id,
      dramaId: char.dramaId,
      prompt,
      configId: ep.imageConfigId ?? undefined,
      // Pass front avatar as the reference for img2img consistency
      referenceImages: [frontUrl],
      // Tag with frame_type so downstream code knows this is a "view" generation
      frameType: `view_${view}`,
    })
    logTaskSuccess('CharacterView', 'generate', { characterId: id, view, generationId: genId })
    return success(c, { image_generation_id: genId, view })
  } catch (err: any) {
    logTaskError('CharacterView', 'generate', { characterId: id, view, error: err.message })
    if (err?.status === 402) return paymentRequired(c, err.message)
    return badRequest(c, err.message)
  }
})

// POST /characters/batch-generate-images
app.post('/batch-generate-images', async (c) => {
  const body = await c.req.json()
  const ids: number[] = body.character_ids || []
  if (!body.episode_id) return badRequest(c, 'episode_id is required')
  if (!canAccess(c, episodeOwnerId(body.episode_id))) return notFound(c, '剧集不存在')
  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, Number(body.episode_id))).all()
  if (!ep) return badRequest(c, 'Episode not found')
  const results: number[] = []
  for (const cid of ids) {
    const [char] = db.select().from(schema.characters).where(eq(schema.characters.id, cid)).all()
    if (!char || !canAccess(c, dramaOwnerId(char.dramaId))) continue
    const prompt = `${char.name}, ${char.appearance || char.description || '人物立绘'}, 高质量, 正面, 白色背景`
    try {
      const genId = await generateImage({ userId: (c.get('user') as any)?.id, characterId: cid, dramaId: char.dramaId, prompt, configId: ep.imageConfigId ?? undefined })
      results.push(genId)
    } catch {}
  }
  logTaskSuccess('CharacterImage', 'batch-generate', { episodeId: ep.id, requested: ids.length, started: results.length })
  return success(c, { count: results.length, ids: results })
})

export default app
