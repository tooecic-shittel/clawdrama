import { db, schema } from '../db/index.js'
import { eq } from 'drizzle-orm'
import { getActiveConfig, getConfigById, getActiveVideoConfigs } from './ai.js'
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
  const primary = params.configId
    ? getConfigById(params.configId)
    : getActiveConfig('video')
  if (!primary) throw new Error('No active video AI config')

  // 候选配置：主配置（指定的 configId 或最高优先级）排第一，其余「启用中」视频配置按优先级跟上（去重）。
  // 主配置失败（如官方 Veo 配额耗尽 429 / 轮询失败）时，自动落到下一个 provider 兜底（如云雾 happyhorse）。
  const seen = new Set<string>()
  const candidates: AIConfig[] = []
  for (const c of [primary, ...getActiveVideoConfigs()]) {
    const key = `${c.provider}|${c.baseUrl}|${c.model}`
    if (seen.has(key)) continue
    seen.add(key)
    candidates.push(c)
  }
  const config = primary

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
    fallbackProviders: candidates.slice(1).map((c) => c.provider),
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
  processVideoGeneration(lastId, candidates, params.model).catch(err => {
    logTaskError('VideoTask', 'process', { id: lastId, error: err.message })
    console.error(`Video generation ${lastId} failed:`, err)
  })
  return lastId
}

interface NormalizedRefs {
  imageUrl: string | null
  firstFrameUrl: string | null
  lastFrameUrl: string | null
  referenceImageUrls: string[]
}

type AttemptOutcome =
  | { ok: true; videoUrl: string; downloadAuth: { kind: 'query-key'; key: string } | null }
  | { ok: false; error: string }

async function processVideoGeneration(id: number, candidates: AIConfig[], userModel?: string) {
  const rows = db.select().from(schema.videoGenerations).where(eq(schema.videoGenerations.id, id)).all()
  const record = rows[0]
  if (!record) return

  // 引用图只需解析一次，所有候选 provider 复用
  const refs: NormalizedRefs = {
    imageUrl: await normalizeVideoReferenceUrl(record.imageUrl),
    firstFrameUrl: await normalizeVideoReferenceUrl(record.firstFrameUrl),
    lastFrameUrl: await normalizeVideoReferenceUrl(record.lastFrameUrl),
    referenceImageUrls: await normalizeVideoReferenceUrls(record.referenceImageUrls),
  }

  let lastErr = 'Video generation failed'
  for (let i = 0; i < candidates.length; i++) {
    const config = candidates[i]
    // 主配置用用户指定的 model（如有），兜底配置用各自配置里的 model
    const model = i === 0 ? (userModel || config.model) : config.model

    if (i > 0) {
      logTaskProgress('VideoTask', 'fallback-config', {
        id,
        from: candidates[i - 1].provider,
        to: config.provider,
        model,
        reason: lastErr.slice(0, 160),
      })
      // 切换到兜底 provider：同步行上的 provider/model，清掉上次的错误
      db.update(schema.videoGenerations)
        .set({ provider: config.provider, model, status: 'processing', errorMsg: null, updatedAt: now() })
        .where(eq(schema.videoGenerations.id, id))
        .run()
    }

    const outcome = await attemptVideoWithConfig(id, config, record, model, refs)
    if (outcome.ok) {
      await handleVideoComplete(id, outcome.videoUrl, record.duration, record.storyboardId, outcome.downloadAuth)
      return
    }
    lastErr = outcome.error
  }

  logTaskError('VideoTask', 'process', { id, candidates: candidates.length, error: lastErr })
  db.update(schema.videoGenerations)
    .set({ status: 'failed', errorMsg: lastErr, updatedAt: now() })
    .where(eq(schema.videoGenerations.id, id))
    .run()
}

/**
 * 用单个配置完整跑一遍「提交 + 轮询」，返回终态。
 * 任何失败（提交 4xx/429 耗尽、轮询 failed/超时、解析异常）都返回 { ok:false }，交上层落到下一个 provider。
 */
async function attemptVideoWithConfig(
  id: number,
  config: AIConfig,
  record: any,
  model: string,
  refs: NormalizedRefs,
): Promise<AttemptOutcome> {
  const adapter = getVideoAdapter(config.provider)
  const downloadAuth = (config.provider === 'google' || config.provider === 'google-veo')
    ? { kind: 'query-key' as const, key: config.apiKey }
    : null

  try {
    logTaskProgress('VideoTask', 'build-request', {
      id,
      provider: config.provider,
      storyboardId: record.storyboardId,
      referenceMode: record.referenceMode,
    })

    const { url, method, headers, body } = adapter.buildGenerateRequest(config, {
      id: record.id,
      model,
      prompt: record.prompt,
      referenceMode: record.referenceMode,
      imageUrl: refs.imageUrl,
      firstFrameUrl: refs.firstFrameUrl,
      lastFrameUrl: refs.lastFrameUrl,
      referenceImageUrls: refs.referenceImageUrls.length ? JSON.stringify(refs.referenceImageUrls) : null,
      duration: record.duration,
      aspectRatio: record.aspectRatio,
    })
    logTaskProgress('VideoTask', 'request', {
      id,
      provider: config.provider,
      method,
      url: redactUrl(url),
      model,
      referenceMode: record.referenceMode,
    })
    logTaskPayload('VideoTask', 'request payload', { id, method, url, headers, body })

    // 提交：429/503/上游饱和 指数退避重试
    let result: any = null
    const maxAttempts = 5
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const resp = await fetch(url, { method, headers, body: JSON.stringify(body) })
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
      logTaskProgress('VideoTask', 'retry-saturated', { id, provider: config.provider, attempt, maxAttempts, waitMs: Math.round(waitMs), status: resp.status })
      await new Promise(r => setTimeout(r, waitMs))
    }
    if (!result) throw new Error('No response after retries')

    const { isAsync, taskId, videoUrl } = adapter.parseGenerateResponse(result)

    if (!isAsync && videoUrl) {
      logTaskProgress('VideoTask', 'sync-complete', { id, provider: config.provider, videoUrl })
      return { ok: true, videoUrl, downloadAuth }
    }

    // 异步：存 taskId，轮询直到终态
    db.update(schema.videoGenerations)
      .set({ taskId, status: 'processing', updatedAt: now() })
      .where(eq(schema.videoGenerations.id, id))
      .run()
    logTaskProgress('VideoTask', 'poll-start', { id, taskId, provider: config.provider })

    // Vidu 没有轮询端点，依赖 Webhook 回调——无法在此自动兜底
    if (adapter.provider === 'vidu') {
      logTaskProgress('VideoTask', 'webhook-wait', { id, taskId, provider: adapter.provider })
      return { ok: false, error: 'vidu webhook 模式不支持自动兜底轮询' }
    }

    const poll = await pollVideoUntilDone(id, config, taskId!)
    if (poll.status === 'completed') {
      return { ok: true, videoUrl: poll.videoUrl, downloadAuth }
    }
    return { ok: false, error: poll.error }
  } catch (err: any) {
    logTaskError('VideoTask', 'attempt', { id, provider: config.provider, error: err.message })
    return { ok: false, error: err.message || 'Video generation failed' }
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

/**
 * 轮询直到终态。返回 completed/failed，由调用方决定下载或落到下一个 provider 兜底。
 * 不再自己下载/落库——把决定权交回 attemptVideoWithConfig，以支持失败兜底。
 */
async function pollVideoUntilDone(
  id: number,
  config: AIConfig,
  taskId: string,
): Promise<{ status: 'completed'; videoUrl: string } | { status: 'failed'; error: string }> {
  const adapter = getVideoAdapter(config.provider)
  let lastErr = 'poll timeout'

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
        return { status: 'completed', videoUrl: pollResp.videoUrl }
      }
      if (pollResp.status === 'failed') {
        logTaskError('VideoTask', 'poll-failed', { id, taskId, error: pollResp.error || 'Video generation failed' })
        return { status: 'failed', error: pollResp.error || 'Video generation failed' }
      }
    } catch (err: any) {
      lastErr = err.message
      logTaskWarn('VideoTask', 'poll-retry', { id, taskId, attempt: i + 1, error: err.message })
    }
  }

  logTaskError('VideoTask', 'poll-timeout', { id, taskId, error: lastErr })
  return { status: 'failed', error: `Timeout: ${lastErr}` }
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
