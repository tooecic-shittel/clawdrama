import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { success, created, now, badRequest, notFound, paymentRequired } from '../utils/response.js'
import { canAccess, dramaOwnerId, storyboardOwnerId, characterOwnerId, sceneOwnerId } from '../middleware/ownership.js'
import { generateImage } from '../services/image-generation.js'
import { logTaskError, logTaskPayload, logTaskStart, logTaskSuccess } from '../utils/task-logger.js'

const app = new Hono()

// POST /images — Generate image
app.post('/', async (c) => {
  const body = await c.req.json()
  if (!body.prompt) return badRequest(c, 'prompt is required')

  // 越权防护：若指定了归属资源，必须属于当前用户
  if (body.storyboard_id || body.character_id || body.scene_id || body.drama_id) {
    const ownerId = body.storyboard_id ? storyboardOwnerId(Number(body.storyboard_id))
      : body.character_id ? characterOwnerId(Number(body.character_id))
      : body.scene_id ? sceneOwnerId(Number(body.scene_id))
      : dramaOwnerId(Number(body.drama_id))
    if (!canAccess(c, ownerId)) return notFound(c, '资源不存在')
  }

  try {
    let configId: number | undefined = body.config_id
    if (body.storyboard_id) {
      const [sb] = db.select().from(schema.storyboards).where(eq(schema.storyboards.id, Number(body.storyboard_id))).all()
      if (sb) {
        const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, sb.episodeId)).all()
        if (ep?.imageConfigId != null) configId = ep.imageConfigId
      }
    }

    // Build reference_images:
    //   - reference_character_ids provided → resolve each id to image path,
    //     merge with any explicit reference_images. Empty array = no character refs (空镜).
    //   - Neither provided → undefined, backend will auto-detect characters from context.
    let finalReferenceImages: string[] | undefined
    let explicitMode = false
    if (Array.isArray(body.reference_character_ids)) {
      explicitMode = true
      const charPaths: string[] = []
      for (const cid of body.reference_character_ids) {
        const [ch] = db.select().from(schema.characters).where(eq(schema.characters.id, Number(cid))).all()
        const p = (ch as any)?.localPath || (ch as any)?.imageUrl
        if (p && typeof p === 'string' && (p.startsWith('static/') || p.startsWith('/static/'))) {
          charPaths.push(p)
        }
      }
      finalReferenceImages = [...charPaths, ...(Array.isArray(body.reference_images) ? body.reference_images : [])]
    } else if (Array.isArray(body.reference_images)) {
      explicitMode = true
      finalReferenceImages = body.reference_images
    }

    logTaskStart('ImageAPI', 'generate', {
      storyboardId: body.storyboard_id,
      sceneId: body.scene_id,
      characterId: body.character_id,
      dramaId: body.drama_id,
      frameType: body.frame_type,
      mode: explicitMode ? 'explicit' : 'auto',
      refCount: finalReferenceImages?.length ?? '(auto)',
    })
    logTaskPayload('ImageAPI', 'request body', body)
    const id = await generateImage({
      userId: (c.get('user') as any)?.id,
      storyboardId: body.storyboard_id,
      dramaId: body.drama_id,
      sceneId: body.scene_id,
      characterId: body.character_id,
      prompt: body.prompt,
      model: body.model,
      size: body.size,
      referenceImages: finalReferenceImages,
      frameType: body.frame_type,
      configId,
    })

    const [record] = db.select().from(schema.imageGenerations)
      .where(eq(schema.imageGenerations.id, id)).all()
    logTaskSuccess('ImageAPI', 'generate', { generationId: id, provider: record?.provider })
    return created(c, record)
  } catch (err: any) {
    logTaskError('ImageAPI', 'generate', { error: err.message })
    if (err?.status === 402) return paymentRequired(c, err.message)
    return badRequest(c, err.message)
  }
})

// GET /images/:id
app.get('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const [row] = db.select().from(schema.imageGenerations)
    .where(eq(schema.imageGenerations.id, id)).all()
  if (row && !canAccess(c, row.dramaId ? dramaOwnerId(row.dramaId) : (row.userId ?? null))) return success(c, null)
  return success(c, row || null)
})

// GET /images — List by storyboard_id or drama_id
app.get('/', async (c) => {
  const storyboardId = c.req.query('storyboard_id')
  const dramaId = c.req.query('drama_id')

  let rows = db.select().from(schema.imageGenerations).all()

  if (storyboardId) rows = rows.filter(r => r.storyboardId === Number(storyboardId))
  if (dramaId) rows = rows.filter(r => r.dramaId === Number(dramaId))

  // 只返回当前用户有权访问的（管理员全放行）
  if (c.get('user')?.role !== 'admin') {
    const uid = c.get('user')?.id
    rows = rows.filter(r => {
      const owner = r.dramaId ? dramaOwnerId(r.dramaId) : (r.userId ?? null)
      return owner != null && owner === uid
    })
  }

  return success(c, rows)
})

// DELETE /images/:id
app.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const [row] = db.select().from(schema.imageGenerations).where(eq(schema.imageGenerations.id, id)).all()
  if (!row || !canAccess(c, row.dramaId ? dramaOwnerId(row.dramaId) : (row.userId ?? null))) return notFound(c, '图片不存在')
  db.delete(schema.imageGenerations).where(eq(schema.imageGenerations.id, id)).run()
  return success(c)
})

export default app
