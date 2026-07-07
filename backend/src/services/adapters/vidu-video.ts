/**
 * Vidu 视频生成 Adapter
 * 端点:
 *   - /ent/v2/text2video
 *   - /ent/v2/img2video
 *   - /ent/v2/start-end2video
 * 查询: /ent/v2/tasks/{task_id}/creations
 */
import type {
  VideoProviderAdapter,
  ProviderRequest,
  AIConfig,
  VideoGenerationRecord,
  VideoGenResponse,
  VideoPollResponse,
} from './types'
import { joinProviderUrl } from './url'

const VIDU_PROMPT_LIMIT = 1900

export class ViduVideoAdapter implements VideoProviderAdapter {
  provider = 'vidu'

  buildGenerateRequest(config: AIConfig, record: VideoGenerationRecord): ProviderRequest {
    const model = record.model || config.model || 'viduq3-pro'
    const images: string[] = []

    const body: any = {
      model,
      prompt: compactViduPrompt(record.prompt),
    }

    // 添加参考图
    if (record.referenceMode === 'single' && record.imageUrl) {
      images.push(record.imageUrl)
    } else if (record.referenceMode === 'first_last') {
      if (record.firstFrameUrl) images.push(record.firstFrameUrl)
      if (record.lastFrameUrl) images.push(record.lastFrameUrl)
    } else if (record.referenceMode === 'multiple' && record.referenceImageUrls) {
      try {
        const refs = JSON.parse(record.referenceImageUrls)
        images.push(...refs)
      } catch {}
    }
    // 可选参数
    if (record.duration) body.duration = Math.min(16, Math.max(1, Math.round(Number(record.duration) || 5)))
    if (record.aspectRatio) body.aspect_ratio = record.aspectRatio
    body.resolution = normalizeViduResolution(record.resolution)
    if (record.generateAudio) body.audio = true
    body.movement_amplitude = 'auto'

    const supportsStartEnd = !/viduq3-pro/i.test(model)
    const endpoint = supportsStartEnd && record.referenceMode === 'first_last' && images.length >= 2
      ? '/ent/v2/start-end2video'
      : images.length
        ? '/ent/v2/img2video'
        : '/ent/v2/text2video'
    if (endpoint === '/ent/v2/start-end2video') {
      body.images = images.slice(0, 2)
    } else if (endpoint === '/ent/v2/img2video') {
      body.images = images.slice(0, 1)
    }

    return {
      url: joinProviderUrl(config.baseUrl, '', endpoint),
      method: 'POST',
      headers: viduHeaders(config),
      body,
    }
  }

  parseGenerateResponse(result: any): VideoGenResponse {
    const taskId = result.task_id || result.id || result.data?.task_id || result.data?.id || result.output?.task_id
    if (taskId) {
      return { isAsync: true, taskId }
    }
    // 同步返回（不太可能发生）
    const videoUrl = extractViduVideoUrl(result)
    if (videoUrl) {
      return { isAsync: false, videoUrl }
    }
    throw new Error('No task_id in Vidu response')
  }

  buildPollRequest(config: AIConfig, taskId: string): ProviderRequest {
    return {
      url: joinProviderUrl(config.baseUrl, '', `/ent/v2/tasks/${encodeURIComponent(taskId)}/creations`),
      method: 'GET',
      headers: viduHeaders(config, false),
      body: undefined,
    }
  }

  parsePollResponse(result: any): VideoPollResponse {
    const state = String(result.state || result.status || result.data?.state || result.data?.status || '').toLowerCase()
    const creations = result.creations || result.data?.creations || result.output?.creations || []
    const videoUrl = extractViduVideoUrl(result)
      || (Array.isArray(creations) ? (creations[0]?.url || creations[0]?.video_url || creations[0]?.watermarked_url) : null)

    if ((state === 'success' || state === 'succeeded' || state === 'completed') && videoUrl) {
      return { status: 'completed', videoUrl }
    }
    if (state === 'failed' || state === 'error') {
      return { status: 'failed', error: result.error || result.err_msg || result.message || 'Vidu generation failed' }
    }
    return { status: 'processing' }
  }

  extractVideoUrl(result: any): string | null {
    return extractViduVideoUrl(result)
  }

  /**
   * Vidu 回调状态映射
   * Webhook 路由使用此方法解析回调
   */
  static parseCallbackState(body: any): { status: 'completed' | 'failed'; videoUrl?: string; error?: string } {
    const state = body.state
    if (state === 'success') {
      return { status: 'completed', videoUrl: extractViduVideoUrl(body) || undefined }
    }
    if (state === 'failed') {
      return { status: 'failed', error: body.error || 'Vidu generation failed' }
    }
    return { status: 'failed', error: `Unknown state: ${state}` }
  }
}

function viduHeaders(config: AIConfig, withJson = true): Record<string, string> {
  const headers: Record<string, string> = {}
  if (withJson) headers['Content-Type'] = 'application/json'
  if (config.apiKey) {
    // 官方 Vidu 是 Token；云雾/中转通常使用 Bearer。
    const scheme = /api\.vidu\.com/i.test(config.baseUrl || '') ? 'Token' : 'Bearer'
    headers.Authorization = `${scheme} ${config.apiKey}`
  }
  return headers
}

function normalizeViduResolution(value?: string | null): string {
  const v = String(value || '').toLowerCase()
  if (v.includes('1080')) return '1080p'
  if (v.includes('540')) return '540p'
  return '720p'
}

function compactViduPrompt(prompt?: string | null): string {
  const text = String(prompt || '')
    .replace(/\r?\n+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
  if (text.length <= VIDU_PROMPT_LIMIT) return text

  const suffix = '。保持人物身份、剧情因果、台词、音效、环境声和镜头运动连续一致。'
  const budget = VIDU_PROMPT_LIMIT - suffix.length
  const parts = text.split(/<n>/).map(p => p.trim()).filter(Boolean)

  if (parts.length > 1) {
    const delimiter = '<n>'
    const delimiterBudget = delimiter.length * (parts.length - 1)
    const contentBudget = Math.max(600, budget - delimiterBudget)
    const perPart = Math.max(120, Math.floor(contentBudget / parts.length))
    const kept: string[] = []
    let used = 0

    for (let i = 0; i < parts.length; i++) {
      const remainingParts = parts.length - i
      const remainingBudget = contentBudget - used
      const partBudget = i === parts.length - 1
        ? remainingBudget
        : Math.max(80, Math.min(perPart, Math.floor(remainingBudget / remainingParts)))
      const item = trimPromptPart(parts[i], partBudget)
      kept.push(item)
      used += item.length
    }

    const joined = kept.join(delimiter)
    if (joined.length + suffix.length <= VIDU_PROMPT_LIMIT) return `${joined}${suffix}`
  }

  return `${trimPromptPart(text, budget)}${suffix}`
}

function trimPromptPart(text: string, limit: number): string {
  if (limit <= 1) return ''
  if (text.length <= limit) return text
  const raw = text.slice(0, Math.max(1, limit - 1))
  const soft = raw.replace(/[，。；、：,.；:][^，。；、：,.；:]*$/, '')
  const trimmed = soft.length >= Math.floor(limit * 0.65) ? soft : raw
  return `${trimmed.trim()}…`
}

function extractViduVideoUrl(result: any): string | null {
  return result?.video_url
    || result?.url
    || result?.data?.video_url
    || result?.data?.url
    || result?.output?.video_url
    || result?.output?.url
    || null
}
