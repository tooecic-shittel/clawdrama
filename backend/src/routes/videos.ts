import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { success, created, badRequest, notFound, paymentRequired } from '../utils/response.js'
import { canAccess, dramaOwnerId, storyboardOwnerId } from '../middleware/ownership.js'
import { generateVideo } from '../services/video-generation.js'
import { logTaskError, logTaskPayload, logTaskStart, logTaskSuccess } from '../utils/task-logger.js'

const app = new Hono()

// POST /videos — Generate video
app.post('/', async (c) => {
  const body = await c.req.json()
  if (!body.prompt) return badRequest(c, 'prompt is required')

  // 越权防护：若指定了归属资源，必须属于当前用户
  if (body.storyboard_id || body.drama_id) {
    const ownerId = body.storyboard_id ? storyboardOwnerId(Number(body.storyboard_id)) : dramaOwnerId(Number(body.drama_id))
    if (!canAccess(c, ownerId)) return notFound(c, '资源不存在')
  }

  try {
    let configId: number | undefined = body.config_id
    if (body.storyboard_id) {
      const [sb] = db.select().from(schema.storyboards).where(eq(schema.storyboards.id, Number(body.storyboard_id))).all()
      if (sb) {
        const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, sb.episodeId)).all()
        if (ep?.videoConfigId != null) configId = ep.videoConfigId
      }
    }

    // Auto-fill reference image from storyboard's first_frame_image
    // for character consistency (when frontend didn't pass image_url explicitly).
    const useLastFrame = body.use_last_frame === true
    let imageUrl = body.image_url
    let firstFrameUrl = body.first_frame_url
    let referenceMode = body.reference_mode
    const lastFrameUrl = useLastFrame ? body.last_frame_url : undefined
    if (body.storyboard_id && !imageUrl && !firstFrameUrl) {
      const [sb] = db.select().from(schema.storyboards).where(eq(schema.storyboards.id, Number(body.storyboard_id))).all()
      if (sb?.firstFrameImage) {
        imageUrl = sb.firstFrameImage
        if (!referenceMode) referenceMode = 'single'
      }
    }

    logTaskStart('VideoAPI', 'generate', {
      storyboardId: body.storyboard_id,
      dramaId: body.drama_id,
      referenceMode,
      duration: body.duration,
      hasImageRef: !!imageUrl,
      useLastFrame,
    })
    logTaskPayload('VideoAPI', 'request body', body)
    const id = await generateVideo({
      userId: (c.get('user') as any)?.id,
      storyboardId: body.storyboard_id,
      dramaId: body.drama_id,
      prompt: body.prompt,
      model: body.model,
      engine: body.engine,
      referenceMode,
      imageUrl,
      firstFrameUrl,
      lastFrameUrl,
      referenceImageUrls: body.reference_image_urls,
      duration: body.duration,
      aspectRatio: body.aspect_ratio,
      resolution: body.resolution,
      configId,
    })

    const [record] = db.select().from(schema.videoGenerations)
      .where(eq(schema.videoGenerations.id, id)).all()
    logTaskSuccess('VideoAPI', 'generate', { generationId: id, provider: record?.provider })
    return created(c, record)
  } catch (err: any) {
    logTaskError('VideoAPI', 'generate', { error: err.message })
    if (err?.status === 402) return paymentRequired(c, err.message)
    return badRequest(c, err.message)
  }
})

// GET /videos/:id
app.get('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const [row] = db.select().from(schema.videoGenerations)
    .where(eq(schema.videoGenerations.id, id)).all()
  if (row && !canAccess(c, row.dramaId ? dramaOwnerId(row.dramaId) : (row.userId ?? null))) return success(c, null)
  return success(c, row || null)
})

// GET /videos — List by storyboard_id or drama_id
app.get('/', async (c) => {
  const storyboardId = c.req.query('storyboard_id')
  const dramaId = c.req.query('drama_id')

  let rows = db.select().from(schema.videoGenerations).all()

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

// DELETE /videos/:id
app.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const [row] = db.select().from(schema.videoGenerations).where(eq(schema.videoGenerations.id, id)).all()
  if (!row || !canAccess(c, row.dramaId ? dramaOwnerId(row.dramaId) : (row.userId ?? null))) return notFound(c, '视频不存在')
  db.delete(schema.videoGenerations).where(eq(schema.videoGenerations.id, id)).run()
  return success(c)
})

export default app
