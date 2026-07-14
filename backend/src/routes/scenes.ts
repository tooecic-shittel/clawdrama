import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { success, created, badRequest, notFound, now, paymentRequired } from '../utils/response.js'
import { canAccess, dramaOwnerId, episodeOwnerId, sceneOwnerId } from '../middleware/ownership.js'
import { generateImage } from '../services/image-generation.js'
import { saveUploadedFile } from '../utils/storage.js'
import { logTaskError, logTaskStart, logTaskSuccess } from '../utils/task-logger.js'

const app = new Hono()

// POST /scenes
app.post('/', async (c) => {
  const body = await c.req.json()
  if (!canAccess(c, dramaOwnerId(body.drama_id))) return notFound(c, '剧本不存在')
  const ts = now()
  const res = db.insert(schema.scenes).values({
    dramaId: body.drama_id,
    episodeId: body.episode_id,
    location: body.location,
    time: body.time || '',
    prompt: body.prompt || body.location,
    createdAt: ts,
    updatedAt: ts,
  }).run()
  const sceneId = Number(res.lastInsertRowid)
  // 集内场景列表按 episode_scenes 关联表查询——不建关联的话，手动添加的场景在工作台看不到
  if (body.episode_id) {
    db.insert(schema.episodeScenes).values({ episodeId: Number(body.episode_id), sceneId, createdAt: ts }).run()
  }
  const [result] = db.select().from(schema.scenes)
    .where(eq(schema.scenes.id, sceneId)).all()
  return created(c, result)
})

// PUT /scenes/:id
app.put('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  if (!canAccess(c, sceneOwnerId(id))) return notFound(c, '场景不存在')
  const body = await c.req.json()
  const updates: Record<string, any> = { updatedAt: now() }
  if (body.location !== undefined) updates.location = body.location
  if (body.time !== undefined) updates.time = body.time
  if (body.prompt !== undefined) updates.prompt = body.prompt
  db.update(schema.scenes).set(updates).where(eq(schema.scenes.id, id)).run()
  return success(c)
})

// POST /scenes/:id/generate-image
app.post('/:id/generate-image', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json()
  const [scene] = db.select().from(schema.scenes).where(eq(schema.scenes.id, id)).all()
  if (!scene) return badRequest(c, 'Scene not found')
  if (!canAccess(c, dramaOwnerId(scene.dramaId))) return notFound(c, '场景不存在')
  if (!body.episode_id) return badRequest(c, 'episode_id is required')
  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, Number(body.episode_id))).all()
  if (!ep) return badRequest(c, 'Episode not found')

  // Allow caller to override prompt + pick which characters to include as refs
  const prompt: string = body.prompt || scene.prompt || `${scene.location}, ${scene.time || ''}, 高质量场景, 电影感`

  // reference_character_ids: array (even empty for 空镜) means explicit; undefined = auto
  let referenceImages: string[] | undefined
  if (Array.isArray(body.reference_character_ids)) {
    referenceImages = []
    for (const cid of body.reference_character_ids) {
      const [ch] = db.select().from(schema.characters).where(eq(schema.characters.id, Number(cid))).all()
      const p = (ch as any)?.localPath || (ch as any)?.imageUrl
      if (p && typeof p === 'string' && (p.startsWith('static/') || p.startsWith('/static/'))) {
        referenceImages.push(p)
      }
    }
  }

  try {
    logTaskStart('SceneImage', 'generate', {
      sceneId: id, episodeId: ep.id, dramaId: scene.dramaId,
      location: scene.location, mode: referenceImages ? 'explicit' : 'auto',
    })
    db.update(schema.scenes).set({ status: 'processing', updatedAt: now() }).where(eq(schema.scenes.id, id)).run()
    const genId = await generateImage({
      userId: (c.get('user') as any)?.id,
      sceneId: id, dramaId: scene.dramaId, prompt, configId: ep.imageConfigId ?? undefined,
      referenceImages,
    })
    logTaskSuccess('SceneImage', 'generate', { sceneId: id, generationId: genId })
    return success(c, { image_generation_id: genId })
  } catch (err: any) {
    logTaskError('SceneImage', 'generate', { sceneId: id, error: err.message })
    db.update(schema.scenes).set({ status: 'failed', updatedAt: now() }).where(eq(schema.scenes.id, id)).run()
    if (err?.status === 402) return paymentRequired(c, err.message)
    return badRequest(c, err.message)
  }
})

// POST /scenes/:id/upload-image — 上传场景参考图，并按项目画风生成场景图（对齐角色的导入参考）
app.post('/:id/upload-image', async (c) => {
  const id = Number(c.req.param('id'))
  const [scene] = db.select().from(schema.scenes).where(eq(schema.scenes.id, id)).all()
  if (!scene) return badRequest(c, 'Scene not found')
  if (!canAccess(c, dramaOwnerId(scene.dramaId))) return notFound(c, '场景不存在')

  const body = await c.req.parseBody()
  const file = body.file
  if (!file || !(file instanceof File)) return badRequest(c, 'file is required')
  if (!file.type.startsWith('image/')) return badRequest(c, '请上传图片文件')
  if (file.size > 12 * 1024 * 1024) return badRequest(c, '图片不能超过 12MB')

  const buffer = await file.arrayBuffer()
  const referencePath = await saveUploadedFile(buffer, 'images', file.name || 'scene-reference.png')

  const episodeId = Number((body as any).episode_id || (body as any).episodeId || 0)
  if (!episodeId) return badRequest(c, 'episode_id is required')
  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  if (!ep) return badRequest(c, 'Episode not found')
  if (!canAccess(c, episodeOwnerId(episodeId))) return notFound(c, '剧集不存在')

  const prompt = [
    `根据用户上传的场景参考图，为短剧场景「${scene.location}」生成一张项目统一画风的场景图。`,
    `场景设定：${scene.prompt || scene.location}${scene.time ? `，时间：${scene.time}` : ''}。`,
    '必须保留参考图的空间结构、建筑与环境特征、主要陈设布局和机位视角，不能变成另一个地点。',
    '允许把参考图转译成当前项目的画风、光线和氛围，并适配短剧的电影感构图。',
    '纯场景空镜，不要出现人物、文字或水印。',
  ].join('\n')

  try {
    logTaskStart('SceneImage', 'upload-reference-generate', { sceneId: id, episodeId, dramaId: scene.dramaId })
    db.update(schema.scenes).set({ status: 'processing', updatedAt: now() }).where(eq(schema.scenes.id, id)).run()
    const genId = await generateImage({
      userId: (c.get('user') as any)?.id,
      sceneId: id,
      dramaId: scene.dramaId,
      prompt,
      configId: ep.imageConfigId ?? undefined,
      referenceImages: [referencePath],
    })
    logTaskSuccess('SceneImage', 'upload-reference-generate', { sceneId: id, generationId: genId, referencePath })
    return success(c, { image_generation_id: genId, reference_image_url: referencePath })
  } catch (err: any) {
    logTaskError('SceneImage', 'upload-reference-generate', { sceneId: id, error: err.message })
    db.update(schema.scenes).set({ status: 'failed', updatedAt: now() }).where(eq(schema.scenes.id, id)).run()
    if (err?.status === 402) return paymentRequired(c, err.message)
    return badRequest(c, err.message)
  }
})

// DELETE /scenes/:id
app.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  if (!canAccess(c, sceneOwnerId(id))) return notFound(c, '场景不存在')
  db.delete(schema.scenes).where(eq(schema.scenes.id, id)).run()
  return success(c)
})

export default app
