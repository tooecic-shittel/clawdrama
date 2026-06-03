/**
 * OpenAI Sora 视频生成 Adapter（OpenAI 兼容路径，适配云雾等聚合站点）
 *
 * 端点：
 *   POST /v1/videos  →  { id, status: 'queued', progress: 0 }
 *   GET  /v1/videos/{id}  →  { status: 'completed', url: '...' }
 *
 * 注意：sora-2 的 seconds 是字符串 "4" / "8" / "12"，不是数字。
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

export class OpenAISoraVideoAdapter implements VideoProviderAdapter {
  provider = 'openai'

  buildGenerateRequest(config: AIConfig, record: VideoGenerationRecord): ProviderRequest {
    const model = record.model || config.model || 'sora-2'
    const url = joinProviderUrl(config.baseUrl, '/v1', '/videos')
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    }

    // 云雾 happyhorse 系列：POST /v1/videos，body = {model, prompt, resolution, duration}
    //   - resolution 在顶层，取值 '720P' / '1080P'（不是 sora 的 size '720x1280'）
    //   - duration 是数字（不是 sora 的字符串 seconds）
    // 实测：发对这套才能拿到 task 并出片；发 size/seconds 会被云雾上游拒。
    if (/happyhorse/i.test(model)) {
      const body: any = {
        model,
        prompt: record.prompt || '',
        resolution: this.resolveResolution(record.aspectRatio),
        duration: Math.round(Number(record.duration) || 5),
      }
      return { url, method: 'POST', headers, body }
    }

    // sora-2: seconds(字符串) + size
    const body: any = {
      model,
      prompt: record.prompt || '',
      seconds: String(this.normalizeDuration(record.duration)),
      size: this.resolveSize(record.aspectRatio),
    }
    if (record.referenceMode === 'single' && record.imageUrl) {
      body.input_reference = record.imageUrl
    } else if (record.referenceMode === 'first_last' && record.firstFrameUrl) {
      body.input_reference = record.firstFrameUrl
    }

    return { url, method: 'POST', headers, body }
  }

  parseGenerateResponse(result: any): VideoGenResponse {
    if (result.id) {
      // If already has URL (instant), return it
      if (result.url) {
        return { isAsync: false, videoUrl: result.url }
      }
      return { isAsync: true, taskId: result.id }
    }
    throw new Error('No video id in response: ' + JSON.stringify(result).slice(0, 200))
  }

  buildPollRequest(config: AIConfig, taskId: string): ProviderRequest {
    return {
      url: joinProviderUrl(config.baseUrl, '/v1', `/videos/${taskId}`),
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: undefined,
    }
  }

  parsePollResponse(result: any): VideoPollResponse {
    const status = result.status
    if (status === 'completed' || status === 'succeeded') {
      return {
        status: 'completed',
        videoUrl: result.url || result.video_url || result.metadata?.url,
      }
    }
    if (status === 'failed' || status === 'error') {
      const errMsg = result.error?.message || result.error || 'Video generation failed'
      return { status: 'failed', error: errMsg }
    }
    // queued / processing / in_progress
    return { status: 'processing' }
  }

  extractVideoUrl(result: any): string | null {
    // sora-2 returns flat `url`; happyhorse returns nested `metadata.url`; others vary.
    return result.url
      || result.video_url
      || result.metadata?.url
      || result.data?.[0]?.url
      || null
  }

  private normalizeDuration(duration?: number | null): 4 | 8 | 12 {
    const parsed = Math.round(Number(duration || 4))
    if (parsed <= 4) return 4
    if (parsed <= 8) return 8
    return 12
  }

  /** happyhorse 用 '720P' / '1080P' 枚举。短剧竖屏走 720P。 */
  private resolveResolution(aspectRatio?: string | null): string {
    const r = (aspectRatio || '9:16').toLowerCase()
    if (r.includes('16:9') || r === 'landscape' || r === 'horizontal') return '1080P'
    return '720P'
  }

  /** sora-2 supports specific sizes. Pick closest match to aspect. */
  private resolveSize(aspectRatio?: string | null): string {
    if (!aspectRatio) return '720x1280' // default vertical (short drama format)
    const ratio = aspectRatio.toLowerCase()
    if (ratio.includes('16:9') || ratio === 'landscape' || ratio === 'horizontal') return '1280x720'
    if (ratio === '1:1' || ratio === 'square') return '720x720'
    return '720x1280' // 9:16 vertical
  }
}
