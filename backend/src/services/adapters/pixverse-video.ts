/**
 * PixVerse 视频生成 Adapter
 * 端点:
 *   - /openapi/v2/video/text/generate
 *   - /openapi/v2/video/img/generate
 *   - /openapi/v2/video/transition/generate
 *   - /openapi/v2/video/sound_effect/generate
 * 查询: /openapi/v2/video/result/{id}
 */
import { randomUUID } from 'crypto'
import type {
  VideoProviderAdapter,
  ProviderRequest,
  AIConfig,
  VideoGenerationRecord,
  VideoGenResponse,
  VideoPollResponse,
} from './types'
import { joinProviderUrl } from './url'

const PIXVERSE_PROMPT_LIMIT = 1800

export class PixVerseVideoAdapter implements VideoProviderAdapter {
  provider = 'pixverse'

  buildGenerateRequest(config: AIConfig, record: VideoGenerationRecord): ProviderRequest {
    const model = normalizePixverseModel(record.model || config.model || 'c1')
    const firstId = parsePixverseImageId(record.firstFrameUrl)
    const lastId = parsePixverseImageId(record.lastFrameUrl)
    const imageId = parsePixverseImageId(record.imageUrl) || firstId || parseFirstReferenceImageId(record.referenceImageUrls)
    const useTransition = record.referenceMode === 'first_last' && firstId && lastId

    const body: any = {
      model,
      prompt: compactPixversePrompt(record.prompt),
      duration: Math.min(16, Math.max(1, Math.round(Number(record.duration) || 5))),
      quality: normalizePixverseQuality(record.resolution),
      motion_mode: 'normal',
      seed: 0,
    }
    if (record.aspectRatio) body.aspect_ratio = record.aspectRatio

    const endpoint = useTransition
      ? '/openapi/v2/video/transition/generate'
      : imageId
        ? '/openapi/v2/video/img/generate'
        : '/openapi/v2/video/text/generate'

    if (useTransition) {
      body.first_frame_img = firstId
      body.last_frame_img = lastId
    } else if (imageId) {
      body.img_id = imageId
    }

    return {
      url: joinProviderUrl(config.baseUrl, '', endpoint),
      method: 'POST',
      headers: pixverseHeaders(config, true),
      body,
    }
  }

  parseGenerateResponse(result: any): VideoGenResponse {
    if (Number(result?.ErrCode ?? 0) !== 0) {
      throw new Error(result?.ErrMsg || result?.message || 'PixVerse generation failed')
    }
    const taskId = result?.Resp?.video_id || result?.video_id || result?.id || result?.data?.video_id
    if (taskId) return { isAsync: true, taskId: String(taskId) }
    const videoUrl = extractPixverseVideoUrl(result)
    if (videoUrl) return { isAsync: false, videoUrl }
    throw new Error('No video_id in PixVerse response')
  }

  buildPollRequest(config: AIConfig, taskId: string): ProviderRequest {
    return {
      url: joinProviderUrl(config.baseUrl, '', `/openapi/v2/video/result/${encodeURIComponent(taskId)}`),
      method: 'GET',
      headers: pixverseHeaders(config, false),
      body: undefined,
    }
  }

  parsePollResponse(result: any): VideoPollResponse {
    if (Number(result?.ErrCode ?? 0) !== 0) {
      return { status: 'failed', error: result?.ErrMsg || 'PixVerse generation failed' }
    }
    const resp = result?.Resp || result?.data || result
    const status = Number(resp?.status)
    if (status === 1) {
      const videoUrl = extractPixverseVideoUrl(result)
      return videoUrl ? { status: 'completed', videoUrl } : { status: 'processing' }
    }
    if (status === 7 || status === 8) {
      return { status: 'failed', error: resp?.err_msg || resp?.message || result?.ErrMsg || 'PixVerse generation failed' }
    }
    return { status: 'processing' }
  }

  extractVideoUrl(result: any): string | null {
    return extractPixverseVideoUrl(result)
  }
}

export async function preparePixverseVideoRecord(config: AIConfig, record: VideoGenerationRecord): Promise<VideoGenerationRecord> {
  const prepared: VideoGenerationRecord = { ...record }
  if (record.imageUrl) prepared.imageUrl = await uploadPixverseImage(config, record.imageUrl)
  if (record.firstFrameUrl) prepared.firstFrameUrl = await uploadPixverseImage(config, record.firstFrameUrl)
  if (record.lastFrameUrl) prepared.lastFrameUrl = await uploadPixverseImage(config, record.lastFrameUrl)
  if (record.referenceImageUrls) {
    try {
      const refs = JSON.parse(record.referenceImageUrls) as string[]
      const uploaded = []
      for (const ref of refs.slice(0, 2)) uploaded.push(await uploadPixverseImage(config, ref))
      prepared.referenceImageUrls = JSON.stringify(uploaded)
    } catch {}
  }
  return prepared
}

export function buildPixverseSoundEffectRequest(config: AIConfig, sourceVideoId: string, prompt?: string | null): ProviderRequest {
  const numericId = Number(sourceVideoId)
  return {
    url: joinProviderUrl(config.baseUrl, '', '/openapi/v2/video/sound_effect/generate'),
    method: 'POST',
    headers: pixverseHeaders(config, true),
    body: {
      source_video_id: Number.isFinite(numericId) ? numericId : sourceVideoId,
      original_sound_switch: true,
      sound_effect_content: compactPixverseSoundPrompt(prompt),
    },
  }
}

async function uploadPixverseImage(config: AIConfig, image: string): Promise<string> {
  if (parsePixverseImageId(image)) return image
  const form = new FormData()
  if (/^data:image\//i.test(image)) {
    const blob = dataUrlToBlob(image)
    form.append('image', blob, `frame-${Date.now()}.jpg`)
  } else {
    form.append('image_url', image)
  }
  const resp = await fetch(joinProviderUrl(config.baseUrl, '', '/openapi/v2/image/upload'), {
    method: 'POST',
    headers: pixverseHeaders(config, false),
    body: form,
  })
  const text = await resp.text()
  let json: any
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error(`PixVerse image upload invalid response: ${text.slice(0, 180)}`)
  }
  if (!resp.ok || Number(json?.ErrCode ?? 0) !== 0) {
    throw new Error(`PixVerse image upload failed: ${json?.ErrMsg || text.slice(0, 180)}`)
  }
  const id = json?.Resp?.img_id || json?.img_id || json?.data?.img_id
  if (!id) throw new Error('PixVerse image upload missing img_id')
  return `pixverse:${id}`
}

function pixverseHeaders(config: AIConfig, withJson: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    'Ai-Trace-Id': randomUUID(),
  }
  if (withJson) headers['Content-Type'] = 'application/json'
  if (config.apiKey) {
    // 官方 PixVerse 使用 API-KEY；云雾中转通常也接受 Bearer。双写兼容两种网关。
    headers['API-KEY'] = config.apiKey
    headers.Authorization = `Bearer ${config.apiKey}`
  }
  return headers
}

function parsePixverseImageId(value?: string | null): number | null {
  const m = String(value || '').match(/^pixverse:(\d+)$/)
  return m ? Number(m[1]) : null
}

function parseFirstReferenceImageId(value?: string | null): number | null {
  if (!value) return null
  try {
    const refs = JSON.parse(value) as string[]
    for (const ref of refs) {
      const id = parsePixverseImageId(ref)
      if (id) return id
    }
  } catch {}
  return null
}

function normalizePixverseQuality(value?: string | null): string {
  const v = String(value || '').toLowerCase()
  if (v.includes('1080')) return '1080p'
  if (v.includes('720')) return '720p'
  if (v.includes('540')) return '540p'
  return '360p'
}

function normalizePixverseModel(value?: string | null): string {
  const v = String(value || '').trim().toLowerCase()
  if (!v || v === 'pixverse-video') return 'c1'
  return v
}

function compactPixversePrompt(prompt?: string | null): string {
  const text = String(prompt || '').replace(/\r?\n+/g, ' ').replace(/\s{2,}/g, ' ').trim()
  if (text.length <= PIXVERSE_PROMPT_LIMIT) return text
  return `${text.slice(0, PIXVERSE_PROMPT_LIMIT - 28).replace(/[，。；、：,.；:][^，。；、：,.；:]*$/, '')}。保持剧情动作连续自然。`
}

function compactPixverseSoundPrompt(prompt?: string | null): string {
  const text = String(prompt || '')
    .replace(/<voice>[\s\S]*?<\/voice>/gi, '')
    .replace(/<dialogue>[\s\S]*?<\/dialogue>/gi, '')
    .replace(/<\/?(location|role)[^>]*>/gi, '')
    .replace(/\r?\n+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
  const base = text
    ? `为这段短剧画面生成电影感环境声、情绪配乐和自然音效，不要生成清晰对白或人声朗读。声音应贴合画面动作与情绪：${text}`
    : '为这段短剧画面生成电影感环境声、情绪配乐和自然音效，不要生成清晰对白或人声朗读。'
  return base.length <= 900 ? base : `${base.slice(0, 870)}。保持声音自然、克制、贴合剧情。`
}

function dataUrlToBlob(dataUrl: string): Blob {
  const m = dataUrl.match(/^data:([^;,]+);base64,(.+)$/)
  if (!m) throw new Error('Invalid image data URL')
  const bytes = Buffer.from(m[2], 'base64')
  return new Blob([bytes], { type: m[1] })
}

function extractPixverseVideoUrl(result: any): string | null {
  return result?.Resp?.url
    || result?.Resp?.video_url
    || result?.url
    || result?.video_url
    || result?.data?.url
    || result?.data?.video_url
    || null
}
