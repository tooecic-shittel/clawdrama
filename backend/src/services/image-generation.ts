import { db, schema } from '../db/index.js'
import { eq } from 'drizzle-orm'
import { getActiveConfig, getConfigById } from './ai.js'
import { now } from '../utils/response.js'
import { downloadFile, readImageAsCompressedDataUrl, saveBase64Image } from '../utils/storage.js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const STORAGE_ROOT = process.env.STORAGE_PATH || path.resolve(__dirname, '../../../data/static')
import { getImageAdapter } from './adapters/registry'
import type { AIConfig } from './adapters/types'
import { logTaskError, logTaskPayload, logTaskProgress, logTaskStart, logTaskSuccess, logTaskWarn, redactUrl } from '../utils/task-logger.js'
import { enhanceImagePrompt, enhanceFramePromptForContinuity, resolveDramaId } from './prompt-enhance.js'
import { assertBalance, chargeForAction } from './credits.js'

/**
 * For storyboard frames that will be fed to sora-2 as input_reference,
 * pick an image size that exactly matches sora-2's supported sizes.
 * sora-2 supports only: 720x1280 (vertical), 1280x720 (horizontal), 720x720 (square).
 */
function resolveSoraCompatibleSize(storyboardId: number): string | null {
  try {
    // Video generation defaults to 16:9 (see video-generation.ts), so default
    // first-frame size to 1280x720 to match sora-2's accepted size for that ratio.
    // sora-2 supports: 720x1280 (9:16), 1280x720 (16:9), 720x720 (1:1).
    const [vid] = db.select().from(schema.videoGenerations)
      .where(eq(schema.videoGenerations.storyboardId, storyboardId)).orderBy(schema.videoGenerations.id).all()
    const aspect = (vid?.aspectRatio || '16:9').toLowerCase()
    if (aspect.includes('9:16') || aspect === 'portrait' || aspect === 'vertical') return '720x1280'
    if (aspect === '1:1' || aspect === 'square') return '720x720'
    return '1280x720'  // default 16:9
  } catch {
    return '1280x720'
  }
}

interface GenerateImageParams {
  storyboardId?: number
  dramaId?: number
  sceneId?: number
  characterId?: number
  prompt: string
  model?: string
  size?: string
  referenceImages?: string[]
  frameType?: string
  /** If true, skip auto-attaching character refs (caller already chose explicitly) */
  skipAutoCharRefs?: boolean
  configId?: number
  /** Owner of this generation — used to meter credits (undefined = unmetered/system). */
  userId?: number
}

export async function generateImage(params: GenerateImageParams): Promise<number> {
  const ts = now()
  // Gate on credits before doing any work (throws InsufficientCreditsError → 402 at route).
  await assertBalance(params.userId, 'image')
  const config = params.configId
    ? getConfigById(params.configId)
    : getActiveConfig('image')
  if (!config) throw new Error('No active image AI config')

  // Resolve image size:
  // - If caller passed explicit size, honor it
  // - If this is a storyboard frame (will be fed to sora-2 video), use sora-compatible size
  //   based on storyboard's aspect_ratio
  // - Otherwise use legacy default 1920x1080
  let resolvedSize = params.size
  if (!resolvedSize) {
    if (params.storyboardId && params.frameType) {
      resolvedSize = resolveSoraCompatibleSize(params.storyboardId) || '1280x720'
    } else {
      resolvedSize = '1920x1080'
    }
  }

  // Inject drama visual style into prompt
  const dramaId = resolveDramaId({
    dramaId: params.dramaId,
    storyboardId: params.storyboardId,
    sceneId: params.sceneId,
    characterId: params.characterId,
  })
  const enhancedPrompt = enhanceImagePrompt(params.prompt, dramaId)

  // referenceImages handling: undefined means "auto"; array (even empty) means "explicit".
  // Store explicit choice as JSON; auto stays null so processImageGeneration can detect.
  const refImagesField =
    params.referenceImages === undefined || params.referenceImages === null
      ? null
      : JSON.stringify(params.referenceImages)

  const res = db.insert(schema.imageGenerations).values({
    userId: params.userId,
    storyboardId: params.storyboardId,
    dramaId: params.dramaId,
    sceneId: params.sceneId,
    characterId: params.characterId,
    prompt: enhancedPrompt,
    model: params.model || config.model,
    provider: config.provider,
    size: resolvedSize,
    frameType: params.frameType,
    referenceImages: refImagesField,
    status: 'processing',
    createdAt: ts,
    updatedAt: ts,
  }).run()

  const lastId = Number(res.lastInsertRowid)
  logTaskStart('ImageTask', 'enqueue', {
    id: lastId,
    provider: config.provider,
    storyboardId: params.storyboardId,
    sceneId: params.sceneId,
    characterId: params.characterId,
    frameType: params.frameType,
    model: params.model || config.model,
  })
  logTaskPayload('ImageTask', 'enqueue params', {
    id: lastId,
    config: {
      provider: config.provider,
      model: config.model,
      baseUrl: config.baseUrl,
    },
    params,
  })
  processImageGeneration(lastId, config).catch(err => {
    logTaskError('ImageTask', 'process', { id: lastId, error: err.message })
    console.error(`Image generation ${lastId} failed:`, err)
  })
  return lastId
}

async function processImageGeneration(id: number, config: AIConfig) {
  const adapter = getImageAdapter(config.provider)

  try {
    const rows = db.select().from(schema.imageGenerations).where(eq(schema.imageGenerations.id, id)).all()
    const record = rows[0]
    if (!record) return
    logTaskProgress('ImageTask', 'build-request', {
      id,
      provider: config.provider,
      storyboardId: record.storyboardId,
      sceneId: record.sceneId,
      characterId: record.characterId,
      frameType: record.frameType,
    })

    // 使用 Adapter 构建请求
    // Inject character refs only if caller did NOT provide reference_images.
    //   - If referenceImages is non-null (even '[]'): caller made an explicit choice → respect it
    //   - If referenceImages is null/undefined: auto-attach based on context
    //     · Storyboard frame: characters linked via storyboard_characters,
    //       fallback to all drama characters
    //     · Scene image: all drama characters
    //     · Character image: skip (it IS the reference)
    let refImagesRaw = record.referenceImages
    if (refImagesRaw === null || refImagesRaw === undefined) {
      let charRefs: string[] = []
      let matchCutRefs: string[] = []
      if (record.storyboardId && record.frameType && !record.characterId) {
        charRefs = collectStoryboardCharacterRefs(record.storyboardId)
        if (charRefs.length === 0) {
          charRefs = collectDramaCharacterRefsViaStoryboard(record.storyboardId)
        }
        // Match-cut continuity:
        //   - first_frame of shot N → uses shot N-1's last_frame (or first_frame as fallback)
        //   - last_frame of shot N → uses shot N's own first_frame as evolution anchor
        matchCutRefs = collectMatchCutRefs(record.storyboardId, record.frameType)
      } else if (record.sceneId && !record.characterId) {
        charRefs = collectDramaCharacterRefsViaScene(record.sceneId)
      }
      // Order matters for image-to-image models (first ref = strongest influence):
      //   match-cut anchor first (composition / lighting continuity),
      //   then character refs (face/outfit consistency).
      const combined = [...matchCutRefs, ...charRefs]
      if (combined.length > 0) {
        refImagesRaw = JSON.stringify(combined)
        logTaskProgress('ImageTask', 'auto-refs', {
          id,
          matchCut: matchCutRefs.length,
          charCount: charRefs.length,
          scope: record.storyboardId ? 'storyboard' : 'scene',
        })
        // If we attached a match-cut anchor, enhance the prompt to tell seedream
        // explicitly that the first reference is for continuity (not character).
        if (matchCutRefs.length > 0 && record.frameType) {
          const enhanced = enhanceFramePromptForContinuity(record.prompt || '', record.frameType)
          if (enhanced !== record.prompt) {
            db.update(schema.imageGenerations).set({ prompt: enhanced }).where(eq(schema.imageGenerations.id, id)).run()
            ;(record as any).prompt = enhanced
          }
        }
      }
    } else {
      logTaskProgress('ImageTask', 'refs-explicit', {
        id, refImagesLen: typeof refImagesRaw === 'string' ? refImagesRaw.length : 0,
      })
    }
    // 角色身份文字锚点（仅镜头帧）：和参考图配套，降低多角色同框时性别/外貌串味
    if (record.storyboardId && record.frameType && !record.characterId) {
      const identity = buildStoryboardIdentityClause(record.storyboardId)
      if (identity && !(record.prompt || '').includes('本画面出现的角色')) {
        const merged = `${identity}\n${record.prompt || ''}`
        db.update(schema.imageGenerations).set({ prompt: merged }).where(eq(schema.imageGenerations.id, id)).run()
        ;(record as any).prompt = merged
      }
    }

    const resolvedReferenceImages = await normalizeReferenceImages(refImagesRaw)
    const { url, method, headers, body } = adapter.buildGenerateRequest(config, {
      id: record.id,
      model: record.model,
      prompt: record.prompt,
      size: record.size,
      frameType: record.frameType,
      referenceImages: resolvedReferenceImages ? JSON.stringify(resolvedReferenceImages) : null,
    })
    logTaskProgress('ImageTask', 'request', {
      id,
      provider: config.provider,
      method,
      url: redactUrl(url),
      model: record.model,
    })
    logTaskPayload('ImageTask', 'request payload', {
      id,
      method,
      url,
      headers,
      body,
    })

    // Retry on transient network failures (yunwu drops large requests as "fetch failed").
    let resp: Response | null = null
    let lastErr: Error | null = null
    const maxAttempts = 3
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        resp = await fetch(url, {
          method,
          headers,
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(600_000),
        })
        if (resp.ok) break
        const txt = await resp.text()
        if ((resp.status === 429 || resp.status === 502 || resp.status === 503) && attempt < maxAttempts) {
          logTaskWarn('ImageTask', 'retry-upstream', { id, attempt, status: resp.status })
          await new Promise(r => setTimeout(r, 3000 * attempt))
          resp = null
          continue
        }
        throw new Error(`API error ${resp.status}: ${txt}`)
      } catch (err: any) {
        lastErr = err
        const msg = err?.message || String(err)
        const retryable = /fetch failed|ECONNRESET|ETIMEDOUT|socket hang up|network/i.test(msg)
        if (retryable && attempt < maxAttempts) {
          logTaskWarn('ImageTask', 'retry-network', { id, attempt, error: msg })
          await new Promise(r => setTimeout(r, 3000 * attempt))
          continue
        }
        throw err
      }
    }
    if (!resp) throw lastErr || new Error('No response after retries')
    const result = await resp.json() as any
    logTaskPayload('ImageTask', 'response payload', {
      id,
      provider: config.provider,
      result,
    })

    const { isAsync, taskId, imageUrl } = adapter.parseGenerateResponse(result)

    if (!isAsync && imageUrl) {
      logTaskProgress('ImageTask', 'sync-complete', { id, imageUrl })
      // 同步模式：直接下载图片
      await handleImageComplete(id, config.provider, imageUrl)
      return
    }

    if (!isAsync && !imageUrl) {
      // 同步模式但无 URL（Gemini 等返回 base64）
      const b64 = adapter.extractImageBase64(result)
      if (b64) {
        logTaskProgress('ImageTask', 'sync-base64-complete', { id, mimeType: b64.mimeType })
        await handleImageCompleteBase64(id, config.provider, b64.data, b64.mimeType)
        return
      }
      throw new Error('No image URL or base64 data in response')
    }

    // 异步模式：更新 taskId，开始轮询
    db.update(schema.imageGenerations)
      .set({ taskId, status: 'processing', updatedAt: now() })
      .where(eq(schema.imageGenerations.id, id))
      .run()
    logTaskProgress('ImageTask', 'poll-start', { id, taskId, provider: config.provider })
    pollImageTask(id, config, taskId!)
  } catch (err: any) {
    logTaskError('ImageTask', 'process', { id, provider: config.provider, error: err.message })
    db.update(schema.imageGenerations)
      .set({ status: 'failed', errorMsg: err.message, updatedAt: now() })
      .where(eq(schema.imageGenerations.id, id))
      .run()
  }
}

/** Convert character record to a single front-view image path (legacy single-image helper). */
function characterToRefPath(ch: any): string | null {
  const p = ch?.localPath || ch?.imageUrl
  if (!p || typeof p !== 'string') return null
  if (p.startsWith('static/') || p.startsWith('/static/')) return p
  return null
}

/** 从 appearance/description 粗判性别，给提示词一个强锚点（只匹配明确词，避免人名误伤）。 */
function extractGender(text: string): string {
  const a = text || ''
  if (/女性|女人|女孩|少女|女子|female|woman|girl/i.test(a)) return '女性'
  if (/男性|男人|男孩|少年|男子|male|\bman\b|boy/i.test(a)) return '男性'
  return ''
}

/**
 * 为镜头里出现的角色构建「身份锚点」文字，与参考图配套，强约束模型别把性别/外貌搞混、别张冠李戴。
 * 这是多角色同框时一致性跑偏（如男角色被画成女）的主要缓解手段。
 */
function buildStoryboardIdentityClause(storyboardId: number): string {
  try {
    const links = db.select().from(schema.storyboardCharacters)
      .where(eq(schema.storyboardCharacters.storyboardId, storyboardId)).all()
    const parts: string[] = []
    for (const l of links) {
      const [ch] = db.select().from(schema.characters).where(eq(schema.characters.id, l.characterId)).all()
      if (!ch || ch.deletedAt) continue
      const gender = extractGender(`${ch.appearance || ''} ${ch.description || ''}`)
      const appr = String(ch.appearance || '')
        .replace(/性别[：:]\s*/g, '')
        .replace(/^(男性|女性|男人|女人|男|女)[，。,.、\s]*/, '')  // 去掉开头重复的性别词
        .replace(/^[，。,.\s]+/, '')
        .slice(0, 36)
      const tag = [gender, appr].filter(Boolean).join('，')
      parts.push(tag ? `${ch.name}（${tag}）` : ch.name)
    }
    if (!parts.length) return ''
    return `本画面出现的角色及其身份（必须与参考图严格对应，不得混淆性别、外貌或张冠李戴）：${parts.join('；')}。`
  } catch {
    return ''
  }
}

/** Convert character record to all available views (front + side + back). Returns up to 3 paths. */
function characterToAllViews(ch: any): string[] {
  const out: string[] = []
  const pick = (p: any) => {
    if (typeof p === 'string' && (p.startsWith('static/') || p.startsWith('/static/'))) out.push(p)
  }
  pick(ch?.localPath || ch?.imageUrl)  // front
  pick(ch?.viewSide)                    // side
  pick(ch?.viewBack)                    // back
  return out
}

/**
 * Look up which characters appear in this storyboard (via storyboard_characters
 * junction table) and return their image paths.
 */
function collectStoryboardCharacterRefs(storyboardId: number): string[] {
  try {
    const links = db.select().from(schema.storyboardCharacters)
      .where(eq(schema.storyboardCharacters.storyboardId, storyboardId)).all()
    const charIds = links.map(l => l.characterId)
    if (charIds.length === 0) return []
    const refs: string[] = []
    for (const cid of charIds) {
      const [ch] = db.select().from(schema.characters).where(eq(schema.characters.id, cid)).all()
      // Use all available views (front + side + back) for max consistency
      refs.push(...characterToAllViews(ch))
    }
    return refs
  } catch {
    return []
  }
}

/** Get ALL drama characters via storyboard → episode → drama lookup. */
function collectDramaCharacterRefsViaStoryboard(storyboardId: number): string[] {
  try {
    const [sb] = db.select().from(schema.storyboards).where(eq(schema.storyboards.id, storyboardId)).all()
    if (!sb?.episodeId) return []
    const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, sb.episodeId)).all()
    if (!ep?.dramaId) return []
    return collectDramaCharacterRefs(ep.dramaId)
  } catch { return [] }
}

/** Get ALL drama characters via scene → drama. */
function collectDramaCharacterRefsViaScene(sceneId: number): string[] {
  try {
    const [scene] = db.select().from(schema.scenes).where(eq(schema.scenes.id, sceneId)).all()
    if (!scene?.dramaId) return []
    return collectDramaCharacterRefs(scene.dramaId)
  } catch { return [] }
}

/**
 * Match-cut continuity references:
 *   - For first_frame of shot N: use shot N-1's last_frame (fallback to first_frame).
 *     This makes the new shot visually continue from where the previous one ended.
 *   - For last_frame of shot N: use this shot's own first_frame.
 *     This anchors the ending to evolve from the same scene/composition.
 *   - For first shot in episode: no continuity ref.
 */
function collectMatchCutRefs(storyboardId: number, frameType: string): string[] {
  try {
    const [sb] = db.select().from(schema.storyboards).where(eq(schema.storyboards.id, storyboardId)).all()
    if (!sb) return []

    if (frameType === 'last_frame') {
      // Use this shot's own first frame as evolution anchor
      const fr = (sb as any).firstFrameImage
      if (fr && typeof fr === 'string' && (fr.startsWith('static/') || fr.startsWith('/static/'))) {
        return [fr]
      }
      return []
    }

    if (frameType === 'first_frame') {
      // Find previous shot in same episode (by storyboard_number)
      if (!sb.episodeId || !sb.storyboardNumber || sb.storyboardNumber <= 1) return []
      const candidates = db.select().from(schema.storyboards)
        .where(eq(schema.storyboards.episodeId, sb.episodeId)).all()
      const prev = candidates.find(s => s.storyboardNumber === sb.storyboardNumber - 1)
      if (!prev) return []
      // Prefer last_frame (the actual ending), fall back to first_frame
      const anchor = (prev as any).lastFrameImage || (prev as any).firstFrameImage
      if (anchor && typeof anchor === 'string' && (anchor.startsWith('static/') || anchor.startsWith('/static/'))) {
        return [anchor]
      }
    }
    return []
  } catch { return [] }
}

/** Get all characters of a drama with their available views, capped to keep payload small. */
function collectDramaCharacterRefs(dramaId: number): string[] {
  try {
    const chars = db.select().from(schema.characters).where(eq(schema.characters.dramaId, dramaId)).all()
    const refs: string[] = []
    for (const ch of chars) {
      refs.push(...characterToAllViews(ch))
      if (refs.length >= 6) break  // cap at 6 (2 chars × 3 views)
    }
    return refs.slice(0, 6)
  } catch { return [] }
}

async function normalizeReferenceImages(raw: string | null | undefined): Promise<string[]> {
  if (!raw) return []
  let refs: string[] = []
  try {
    refs = JSON.parse(raw)
  } catch {
    refs = []
  }

  const deduped = Array.from(
    new Set(
      refs
        .map((item) => String(item || '').trim())
        .filter(Boolean),
    ),
  )

  // Cap to 4 refs (was 6) to reduce payload size — yunwu drops large requests as "fetch failed"
  const capped = deduped.slice(0, 4)

  const normalized = await Promise.all(capped.map(async (value) => {
    if (value.startsWith('data:image/')) return value
    if (value.startsWith('static/') || value.startsWith('/static/')) {
      const localPath = value.startsWith('/static/') ? value.slice(1) : value
      try {
        // Smaller refs (640x640 @ q60 ≈ 50KB each) to keep total payload < 250KB
        return await readImageAsCompressedDataUrl(localPath, {
          maxWidth: 640,
          maxHeight: 640,
          quality: 60,
        })
      } catch (err) {
        logTaskWarn('ImageTask', 'reference-read-failed', { path: localPath, error: (err as Error).message })
        return null
      }
    }
    return value
  }))

  return normalized.filter((item): item is string => !!item)
}

async function pollImageTask(id: number, config: AIConfig, taskId: string) {
  const adapter = getImageAdapter(config.provider)
  const startedAt = Date.now()
  const maxDurationMs = 600_000

  for (let i = 0; i < 120; i++) {
    if (Date.now() - startedAt >= maxDurationMs) {
      logTaskError('ImageTask', 'poll-timeout', { id, taskId, error: 'Polling exceeded 10 minutes' })
      db.update(schema.imageGenerations)
        .set({ status: 'failed', errorMsg: 'Timeout: Polling exceeded 10 minutes', updatedAt: now() })
        .where(eq(schema.imageGenerations.id, id))
        .run()
      return
    }
    await new Promise(r => setTimeout(r, 5000))
    if (Date.now() - startedAt >= maxDurationMs) {
      logTaskError('ImageTask', 'poll-timeout', { id, taskId, error: 'Polling exceeded 10 minutes' })
      db.update(schema.imageGenerations)
        .set({ status: 'failed', errorMsg: 'Timeout: Polling exceeded 10 minutes', updatedAt: now() })
        .where(eq(schema.imageGenerations.id, id))
        .run()
      return
    }
    try {
      const { url, method, headers } = adapter.buildPollRequest(config, taskId)
      logTaskProgress('ImageTask', 'poll-request', {
        id,
        taskId,
        provider: config.provider,
        method,
        url: redactUrl(url),
        attempt: i + 1,
      })
      const remainingMs = Math.max(1_000, maxDurationMs - (Date.now() - startedAt))
      const resp = await fetch(url, {
        method,
        headers,
        signal: AbortSignal.timeout(remainingMs),
      })
      if (!resp.ok) continue
      const result = await resp.json() as any

      const pollResp = adapter.parsePollResponse(result)

      if (pollResp.status === 'completed' && pollResp.imageUrl) {
        logTaskSuccess('ImageTask', 'poll-complete', { id, taskId, imageUrl: pollResp.imageUrl })
        await handleImageComplete(id, config.provider, pollResp.imageUrl)
        return
      }
      if (pollResp.status === 'completed' && adapter.provider === 'gemini') {
        // Gemini 可能返回 base64
        const b64 = adapter.extractImageBase64(result)
        if (b64) {
          logTaskSuccess('ImageTask', 'poll-base64-complete', { id, taskId, mimeType: b64.mimeType })
          await handleImageCompleteBase64(id, config.provider, b64.data, b64.mimeType)
          return
        }
      }
      if (pollResp.status === 'failed') {
        logTaskError('ImageTask', 'poll-failed', { id, taskId, error: pollResp.error || 'Generation failed' })
        throw new Error(pollResp.error || 'Generation failed')
      }
    } catch (err: any) {
      if (i === 119 || Date.now() - startedAt >= maxDurationMs) {
        logTaskError('ImageTask', 'poll-timeout', { id, taskId, error: err.message })
        db.update(schema.imageGenerations)
          .set({ status: 'failed', errorMsg: `Timeout: ${err.message}`, updatedAt: now() })
          .where(eq(schema.imageGenerations.id, id))
          .run()
        return
      }
      logTaskWarn('ImageTask', 'poll-retry', { id, taskId, attempt: i + 1, error: err.message })
    }
  }
}

async function handleImageComplete(id: number, provider: string, imageUrl: string) {
  const localPath = await downloadFile(imageUrl, 'images')
  const rows = db.select().from(schema.imageGenerations).where(eq(schema.imageGenerations.id, id)).all()
  const record = rows[0]

  // Storyboard frames must match sora-2's exact pixel size for use as input_reference.
  // Doubao seedream often returns 2048x2048 etc. regardless of requested size,
  // so force-resize to the recorded `size` here using sharp.
  let finalWidth: number | null = null
  let finalHeight: number | null = null
  if (record?.storyboardId && record?.frameType && record?.size) {
    const match = record.size.match(/^(\d+)x(\d+)$/)
    if (match) {
      const targetW = Number(match[1])
      const targetH = Number(match[2])
      try {
        // localPath is "static/<subDir>/<file>", STORAGE_ROOT is "<root>/data/static"
        // Strip leading "static/" and join with STORAGE_ROOT.
        const relUnderStatic = localPath.replace(/^static\//, '')
        const absPath = path.isAbsolute(localPath)
          ? localPath
          : path.join(STORAGE_ROOT, relUnderStatic)
        const meta = await sharp(absPath).metadata()
        if (meta.width !== targetW || meta.height !== targetH) {
          logTaskProgress('ImageTask', 'resize', {
            id, from: `${meta.width}x${meta.height}`, to: `${targetW}x${targetH}`,
          })
          const buf = await sharp(absPath)
            .resize(targetW, targetH, { fit: 'cover', position: 'center' })
            .jpeg({ quality: 92 })
            .toBuffer()
          fs.writeFileSync(absPath, buf)
        }
        finalWidth = targetW
        finalHeight = targetH
      } catch (e: any) {
        logTaskWarn('ImageTask', 'resize-failed', { id, error: e.message })
      }
    }
  }

  db.update(schema.imageGenerations)
    .set({
      imageUrl,
      localPath,
      status: 'completed',
      updatedAt: now(),
      ...(finalWidth ? { width: finalWidth } : {}),
      ...(finalHeight ? { height: finalHeight } : {}),
    })
    .where(eq(schema.imageGenerations.id, id))
    .run()
  logTaskSuccess('ImageTask', 'downloaded', { id, provider, localPath, w: finalWidth, h: finalHeight })
  await chargeForAction(record?.userId, 'image', { referenceId: id })

  // 更新关联表
  if (record?.storyboardId) {
    const sbUpdate: Record<string, any> = { updatedAt: now() }
    if (record.frameType === 'first_frame') sbUpdate.firstFrameImage = localPath
    else if (record.frameType === 'last_frame') sbUpdate.lastFrameImage = localPath
    else sbUpdate.composedImage = localPath
    db.update(schema.storyboards).set(sbUpdate).where(eq(schema.storyboards.id, record.storyboardId)).run()
  }
  if (record?.characterId) {
    // Route 3-view variants to dedicated columns; the main avatar stays in imageUrl
    if (record.frameType === 'view_side') {
      db.update(schema.characters).set({ viewSide: localPath, updatedAt: now() }).where(eq(schema.characters.id, record.characterId)).run()
    } else if (record.frameType === 'view_back') {
      db.update(schema.characters).set({ viewBack: localPath, updatedAt: now() }).where(eq(schema.characters.id, record.characterId)).run()
    } else {
      db.update(schema.characters).set({ imageUrl: localPath, updatedAt: now() }).where(eq(schema.characters.id, record.characterId)).run()
    }
  }
  if (record?.sceneId) {
    db.update(schema.scenes).set({ imageUrl: localPath, status: 'completed', updatedAt: now() }).where(eq(schema.scenes.id, record.sceneId)).run()
  }
}

async function handleImageCompleteBase64(id: number, provider: string, base64Data: string, mimeType: string) {
  const localPath = await saveBase64Image(base64Data, mimeType, 'images')
  const rows = db.select().from(schema.imageGenerations).where(eq(schema.imageGenerations.id, id)).all()
  const record = rows[0]

  db.update(schema.imageGenerations)
    .set({ localPath, status: 'completed', updatedAt: now() })
    .where(eq(schema.imageGenerations.id, id))
    .run()
  logTaskSuccess('ImageTask', 'saved-base64', { id, provider, mimeType, localPath })
  await chargeForAction(record?.userId, 'image', { referenceId: id })

  // 更新关联表
  if (record?.storyboardId) {
    const sbUpdate: Record<string, any> = { updatedAt: now() }
    if (record.frameType === 'first_frame') sbUpdate.firstFrameImage = localPath
    else if (record.frameType === 'last_frame') sbUpdate.lastFrameImage = localPath
    else sbUpdate.composedImage = localPath
    db.update(schema.storyboards).set(sbUpdate).where(eq(schema.storyboards.id, record.storyboardId)).run()
  }
  if (record?.characterId) {
    // Route 3-view variants to dedicated columns; the main avatar stays in imageUrl
    if (record.frameType === 'view_side') {
      db.update(schema.characters).set({ viewSide: localPath, updatedAt: now() }).where(eq(schema.characters.id, record.characterId)).run()
    } else if (record.frameType === 'view_back') {
      db.update(schema.characters).set({ viewBack: localPath, updatedAt: now() }).where(eq(schema.characters.id, record.characterId)).run()
    } else {
      db.update(schema.characters).set({ imageUrl: localPath, updatedAt: now() }).where(eq(schema.characters.id, record.characterId)).run()
    }
  }
  if (record?.sceneId) {
    db.update(schema.scenes).set({ imageUrl: localPath, status: 'completed', updatedAt: now() }).where(eq(schema.scenes.id, record.sceneId)).run()
  }
}
