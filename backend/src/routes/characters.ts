import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { success, badRequest, notFound, now, paymentRequired } from '../utils/response.js'
import { canAccess, characterOwnerId, dramaOwnerId, episodeOwnerId } from '../middleware/ownership.js'
import { enhanceCharacterImagePrompt } from '../services/prompt-rewrite.js'
import { generateVoiceSample } from '../services/tts-generation.js'
import { generateImage } from '../services/image-generation.js'
import { saveUploadedFile } from '../utils/storage.js'
import { logTaskError, logTaskStart, logTaskSuccess } from '../utils/task-logger.js'

const app = new Hono()

// 设定里已出现国籍/民族/人种描述时不再叠加默认值
const ETHNICITY_HINT = /中国|华人|华裔|东亚|亚洲|亚裔|日本|韩国|欧美|西方|外国|美国|英国|法国|德国|俄罗斯|意大利|西班牙|拉丁|非洲|黑人|白人|印度|中东|东南亚|混血/
// 默认立绘提示词：中文短剧的角色默认按中国人生成——
// 文生图模型对「护士/医生」这类无国籍描述的词常随机出欧美面孔。
function defaultPortraitPrompt(char: { name: string; appearance: string | null; description: string | null }): string {
  const desc = char.appearance || char.description || '人物立绘'
  const ethnic = ETHNICITY_HINT.test(`${char.name} ${desc}`) ? '' : '中国人，东亚面孔，'
  return `${ethnic}${char.name}, ${desc}, 高质量, 正面, 白色背景`
}

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
  // 身份相关设定（名字/外貌/描述）变了就作废旧的生成提示词——
  // 否则「重新生成」永远复用旧 imagePrompt，用户改设定完全不生效（曾把中国护士一直生成成外国人）。
  const [current] = db.select().from(schema.characters).where(eq(schema.characters.id, id)).all()
  if (current) {
    const identityChanged = ['name', 'appearance', 'description'].some(
      key => key in updates && String(updates[key] ?? '') !== String((current as any)[key] ?? ''),
    )
    if (identityChanged) updates.imagePrompt = null
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
    || defaultPortraitPrompt(char)
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

// POST /characters/:id/upload-image — 上传用户参考图，并按项目画风生成角色正面形象
app.post('/:id/upload-image', async (c) => {
  const id = Number(c.req.param('id'))
  const [char] = db.select().from(schema.characters).where(eq(schema.characters.id, id)).all()
  if (!char) return badRequest(c, 'Character not found')
  if (!canAccess(c, dramaOwnerId(char.dramaId))) return notFound(c, '角色不存在')

  const body = await c.req.parseBody()
  const file = body.file
  if (!file || !(file instanceof File)) return badRequest(c, 'file is required')
  if (!file.type.startsWith('image/')) return badRequest(c, '请上传图片文件')
  if (file.size > 12 * 1024 * 1024) return badRequest(c, '图片不能超过 12MB')

  const buffer = await file.arrayBuffer()
  const referencePath = await saveUploadedFile(buffer, 'images', file.name || 'character-reference.png')
  db.update(schema.characters)
    .set({
      referenceImages: JSON.stringify([referencePath]),
      viewSide: null,
      viewBack: null,
      updatedAt: now(),
    })
    .where(eq(schema.characters.id, id))
    .run()

  const episodeId = Number((body as any).episode_id || (body as any).episodeId || 0)
  if (!episodeId) {
    logTaskSuccess('CharacterImage', 'upload-reference', { characterId: id, path: referencePath })
    return success(c, { reference_image_url: referencePath, referenceImageUrl: referencePath })
  }

  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  if (!ep) return badRequest(c, 'Episode not found')
  if (!canAccess(c, episodeOwnerId(episodeId))) return notFound(c, '剧集不存在')

  const prompt = [
    `根据用户上传的人物参考图，为短剧角色「${char.name}」生成一张项目统一画风的正面角色定妆图。`,
    `角色定位：${char.role || '角色'}。`,
    `角色设定：${char.appearance || char.description || '以参考图人物特征为核心'}。`,
    char.personality ? `人物气质：${char.personality}。` : '',
    '必须保留参考图人物的核心身份特征：脸型比例、五官关系、年龄感、体型、发型轮廓、发际线、肤色、神态气质和主要服装识别点。',
    '允许把现实照片转译成当前项目画风、服装质感和短剧角色设定，但不能换成另一个人，不能改变性别、年龄段、脸型骨相和发型大轮廓。',
    '正面半身或三分之二身角色定妆图，单人居中，干净背景，适合后续生成侧面和背面三视图。',
  ].filter(Boolean).join('\n')

  try {
    logTaskStart('CharacterImage', 'upload-reference-generate', { characterId: id, episodeId, dramaId: char.dramaId })
    const genId = await generateImage({
      userId: (c.get('user') as any)?.id,
      characterId: id,
      dramaId: char.dramaId,
      prompt,
      configId: ep.imageConfigId ?? undefined,
      referenceImages: [referencePath],
      frameType: 'character_from_reference',
    })
    logTaskSuccess('CharacterImage', 'upload-reference-generate', { characterId: id, generationId: genId, referencePath })
    return success(c, {
      image_generation_id: genId,
      reference_image_url: referencePath,
      referenceImageUrl: referencePath,
    })
  } catch (err: any) {
    logTaskError('CharacterImage', 'upload-reference-generate', { characterId: id, error: err.message })
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
    ? '把正面角色图中的同一角色转到正侧方视角，保留头身比例、脸型轮廓、发型高度、发际线、肤色、体型、服装款式、服装配色、材质纹理和标志性细节'
    : '把正面角色图中的同一角色转到背后视角，保留头身比例、后脑勺发型轮廓、发量、脖颈肩宽、体型、服装背面结构、服装配色、材质纹理和标志性细节'
  const prompt = [
    `基于唯一参考图生成${viewLabel}。`,
    angleHint,
    '必须是参考图里的同一角色，不要重新设计角色，不要改变性别、年龄段、脸型骨相、发型大轮廓、服装系统或人物气质。',
    '严格沿用参考图已经确定的项目画风、角色设定、线条/渲染方式、光影质感和服装设计。',
    '只改变观察角度，不改变身份和画风；不要添加参考图没有的长发、双马尾、披风、夸张装饰物或新背景。',
    '画面保持干净，单人半身或三分之二身角色三视图素材。',
  ].join('\n')

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
  let skippedLocked = 0
  for (const cid of ids) {
    const [char] = db.select().from(schema.characters).where(eq(schema.characters.id, cid)).all()
    if (!char || !canAccess(c, dramaOwnerId(char.dramaId))) continue
    if (!body.force && (char.imageUrl || char.localPath)) {
      skippedLocked++
      continue
    }
    const prompt = char.imagePrompt || defaultPortraitPrompt(char)
    try {
      const genId = await generateImage({ userId: (c.get('user') as any)?.id, characterId: cid, dramaId: char.dramaId, prompt, configId: ep.imageConfigId ?? undefined })
      results.push(genId)
    } catch {}
  }
  logTaskSuccess('CharacterImage', 'batch-generate', { episodeId: ep.id, requested: ids.length, started: results.length, skippedLocked })
  return success(c, { count: results.length, ids: results, skipped_locked: skippedLocked })
})

export default app
