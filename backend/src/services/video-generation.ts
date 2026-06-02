import { db, schema } from '../db/index.js'
import { eq } from 'drizzle-orm'
import { getActiveConfig, getConfigById } from './ai.js'
import { now } from '../utils/response.js'
import { downloadFile, readImageAsCompressedDataUrl } from '../utils/storage.js'
import { getVideoAdapter } from './adapters/registry'
import type { AIConfig } from './adapters/types'
import { logTaskError, logTaskPayload, logTaskProgress, logTaskStart, logTaskSuccess, logTaskWarn, redactUrl } from '../utils/task-logger.js'
import { enhanceVideoPrompt } from './prompt-enhance.js'
import { assertBalance, chargeForAction } from './credits.js'

interface GenerateVideoParams {
  storyboardId?: number
  dramaId?: number
  prompt: string
  model?: string
  referenceMode?: string
  imageUrl?: string
  firstFrameUrl?: string
  lastFrameUrl?: string
  referenceImageUrls?: string[]
  duration?: number
  aspectRatio?: string
  configId?: number
  /** Owner of this generation — used to meter credits (undefined = unmetered/system). */
  userId?: number
}

export async function generateVideo(params: GenerateVideoParams): Promise<number> {
  const ts = now()
  // Gate on credits before doing any work (throws InsufficientCreditsError → 402 at route).
  await assertBalance(params.userId, 'video')
  const config = params.configId
    ? getConfigById(params.configId)
    : getActiveConfig('video')
  if (!config) throw new Error('No active video AI config')

  // Inject drama visual style + storyboard sound effect into video prompt.
  // Veo 3 generates audio from text — describing the soundscape gets baked in.
  const enhancedPrompt = enhanceVideoPrompt(params.prompt, {
    dramaId: params.dramaId,
    storyboardId: params.storyboardId,
  })

  const res = db.insert(schema.videoGenerations).values({
    userId: params.userId,
    storyboardId: params.storyboardId,
    dramaId: params.dramaId,
    prompt: enhancedPrompt,
    model: params.model || config.model,
    provider: config.provider,
    referenceMode: params.referenceMode || 'none',
    imageUrl: params.imageUrl,
    firstFrameUrl: params.firstFrameUrl,
    lastFrameUrl: params.lastFrameUrl,
    referenceImageUrls: params.referenceImageUrls ? JSON.stringify(params.referenceImageUrls) : null,
    duration: params.duration || 5,
    aspectRatio: params.aspectRatio || '16:9',
    status: 'processing',
    createdAt: ts,
    updatedAt: ts,
  }).run()

  const lastId = Number(res.lastInsertRowid)
  logTaskStart('VideoTask', 'enqueue', {
    id: lastId,
    provider: config.provider,
    storyboardId: params.storyboardId,
    dramaId: params.dramaId,
    referenceMode: params.referenceMode || 'none',
    duration: params.duration || 5,
  })
  logTaskPayload('VideoTask', 'enqueue params', {
    id: lastId,
    config: {
      provider: config.provider,
      model: config.model,
      baseUrl: config.baseUrl,
    },
    params,
  })
  processVideoGeneration(lastId, config).catch(err => {
    logTaskError('VideoTask', 'process', { id: lastId, error: err.message })
    console.error(`Video generation ${lastId} failed:`, err)
  })
  return lastId
}

async function processVideoGeneration(id: number, config: AIConfig) {
  const adapter = getVideoAdapter(config.provider)

  try {
    const rows = db.select().from(schema.videoGenerations).where(eq(schema.videoGenerations.id, id)).all()
    const record = rows[0]
    if (!record) return
    logTaskProgress('VideoTask', 'build-request', {
      id,
      provider: config.provider,
      storyboardId: record.storyboardId,
      referenceMode: record.referenceMode,
    })

    const resolvedImageUrl = await normalizeVideoReferenceUrl(record.imageUrl)
    const resolvedFirstFrameUrl = await normalizeVideoReferenceUrl(record.firstFrameUrl)
    const resolvedLastFrameUrl = await normalizeVideoReferenceUrl(record.lastFrameUrl)
    const resolvedReferenceImageUrls = await normalizeVideoReferenceUrls(record.referenceImageUrls)

    // 使用 Adapter 构建请求
    const { url, method, headers, body } = adapter.buildGenerateRequest(config, {
      id: record.id,
      model: record.model,
      prompt: record.prompt,
      referenceMode: record.referenceMode,
      imageUrl: resolvedImageUrl,
      firstFrameUrl: resolvedFirstFrameUrl,
      lastFrameUrl: resolvedLastFrameUrl,
      referenceImageUrls: resolvedReferenceImageUrls ? JSON.stringify(resolvedReferenceImageUrls) : null,
      duration: record.duration,
      aspectRatio: record.aspectRatio,
    })
    logTaskProgress('VideoTask', 'request', {
      id,
      provider: config.provider,
      method,
      url: redactUrl(url),
      model: record.model,
      referenceMode: record.referenceMode,
    })
    logTaskPayload('VideoTask', 'request payload', {
      id,
      method,
      url,
      headers,
      body,
    })

    // Retry on 429 (upstream saturated) with exponential backoff
    let resp: Response | null = null
    let result: any = null
    const maxAttempts = 5
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      resp = await fetch(url, { method, headers, body: JSON.stringify(body) })

      if (resp.ok) {
        result = await resp.json()
        break
      }

      const errText = await resp.text()
      const isRetryable =
        resp.status === 429 ||
        resp.status === 503 ||
        errText.includes('upstream load is saturated') ||
        errText.includes('饱和')

      if (!isRetryable || attempt === maxAttempts) {
        throw new Error(`API error ${resp.status}: ${errText}`)
      }

      const waitMs = Math.min(30000, 5000 * attempt + Math.random() * 2000)
      logTaskProgress('VideoTask', 'retry-saturated', {
        id, attempt, maxAttempts, waitMs: Math.round(waitMs), status: resp.status,
      })
      await new Promise(r => setTimeout(r, waitMs))
    }

    if (!result) throw new Error('No response after retries')

    const { isAsync, taskId, videoUrl } = adapter.parseGenerateResponse(result)

    if (!isAsync && videoUrl) {
      logTaskProgress('VideoTask', 'sync-complete', { id, videoUrl })
      // 同步模式
      await handleVideoComplete(id, videoUrl, record.duration)
      return
    }

    // 异步模式：更新 taskId，开始轮询
    db.update(schema.videoGenerations)
      .set({ taskId, status: 'processing', updatedAt: now() })
      .where(eq(schema.videoGenerations.id, id))
      .run()
    logTaskProgress('VideoTask', 'poll-start', { id, taskId, provider: config.provider })

    // Vidu 没有轮询端点，跳过轮询（依赖 Webhook 回调）
    if (adapter.provider === 'vidu') {
      logTaskProgress('VideoTask', 'webhook-wait', { id, taskId, provider: adapter.provider })
      return
    }

    pollVideoTask(id, config, taskId!, record.storyboardId)
  } catch (err: any) {
    logTaskError('VideoTask', 'process', { id, provider: config.provider, error: err.message })
    db.update(schema.videoGenerations)
      .set({ status: 'failed', errorMsg: err.message, updatedAt: now() })
      .where(eq(schema.videoGenerations.id, id))
      .run()
  }
}

async function normalizeVideoReferenceUrl(value: string | null | undefined): Promise<string | null> {
  const raw = String(value || '').trim()
  if (!raw) return null
  if (raw.startsWith('data:image/')) return raw
  if (raw.startsWith('static/') || raw.startsWith('/static/')) {
    const localPath = raw.startsWith('/static/') ? raw.slice(1) : raw
    try {
      return await readImageAsCompressedDataUrl(localPath, {
        maxWidth: 768,
        maxHeight: 768,
        quality: 68,
      })
    } catch (err) {
      logTaskWarn('VideoTask', 'reference-read-failed', { path: localPath, error: (err as Error).message })
      return null
    }
  }
  return raw
}

async function normalizeVideoReferenceUrls(raw: string | null | undefined): Promise<string[]> {
  if (!raw) return []
  let refs: string[] = []
  try {
    refs = JSON.parse(raw)
  } catch {
    refs = []
  }
  const normalized = await Promise.all(
    Array.from(new Set(refs.map((item) => String(item || '').trim()).filter(Boolean))).map((item) => normalizeVideoReferenceUrl(item)),
  )
  return normalized.filter((item): item is string => !!item)
}

async function pollVideoTask(id: number, config: AIConfig, taskId: string, storyboardId?: number | null) {
  const adapter = getVideoAdapter(config.provider)

  for (let i = 0; i < 300; i++) {
    await new Promise(r => setTimeout(r, 10000))
    try {
      const { url, method, headers } = adapter.buildPollRequest(config, taskId)
      logTaskProgress('VideoTask', 'poll-request', {
        id,
        taskId,
        provider: config.provider,
        method,
        url: redactUrl(url),
        attempt: i + 1,
      })
      const resp = await fetch(url, { method, headers })
      if (!resp.ok) continue
      const result = await resp.json() as any

      const pollResp = adapter.parsePollResponse(result)

      if (pollResp.status === 'completed' && pollResp.videoUrl) {
        logTaskSuccess('VideoTask', 'poll-complete', { id, taskId, videoUrl: pollResp.videoUrl })
        const downloadAuth = (config.provider === 'google' || config.provider === 'google-veo')
          ? { kind: 'query-key' as const, key: config.apiKey }
          : null
        await handleVideoComplete(id, pollResp.videoUrl, null, storyboardId, downloadAuth)
        return
      }
      if (pollResp.status === 'failed') {
        logTaskError('VideoTask', 'poll-failed', { id, taskId, error: pollResp.error || 'Video generation failed' })
        throw new Error(pollResp.error || 'Video generation failed')
      }
    } catch (err: any) {
      if (i === 299) {
        logTaskError('VideoTask', 'poll-timeout', { id, taskId, error: err.message })
        db.update(schema.videoGenerations)
          .set({ status: 'failed', errorMsg: `Timeout: ${err.message}`, updatedAt: now() })
          .where(eq(schema.videoGenerations.id, id))
          .run()
        return
      }
      logTaskWarn('VideoTask', 'poll-retry', { id, taskId, attempt: i + 1, error: err.message })
    }
  }
}

async function handleVideoComplete(id: number, videoUrl: string, duration: number | null | undefined, storyboardId?: number | null, downloadAuth?: { kind: 'query-key'; key: string } | null) {
  // For Veo: download URL must carry the API key as query param
  let downloadUrl = videoUrl
  if (downloadAuth?.kind === 'query-key' && downloadAuth.key) {
    const sep = videoUrl.includes('?') ? '&' : '?'
    downloadUrl = `${videoUrl}${sep}key=${encodeURIComponent(downloadAuth.key)}`
  }
  const localPath = await downloadFile(downloadUrl, 'videos')
  db.update(schema.videoGenerations)
    .set({ videoUrl, localPath, status: 'completed', completedAt: now(), updatedAt: now() })
    .where(eq(schema.videoGenerations.id, id))
    .run()
  logTaskSuccess('VideoTask', 'downloaded', { id, localPath, storyboardId, duration })
  const [vrec] = db.select({ userId: schema.videoGenerations.userId })
    .from(schema.videoGenerations).where(eq(schema.videoGenerations.id, id)).all()
  await chargeForAction(vrec?.userId, 'video', { referenceId: id })

  if (storyboardId) {
    db.update(schema.storyboards)
      .set({ videoUrl: localPath, duration: duration || undefined, updatedAt: now() })
      .where(eq(schema.storyboards.id, storyboardId))
      .run()
  }
}
