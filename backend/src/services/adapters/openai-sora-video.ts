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
      // 有参考首帧图 → 图生视频 i2v（视频锚定首帧，画面跟首帧一致）；没有 → 文生视频 t2v。
      // ref 已由 video-generation 的 normalizeVideoReferenceUrl 转成 base64 data URL 或 http URL。
      const ref = record.imageUrl || record.firstFrameUrl || null
      const body: any = {
        model: ref ? 'happyhorse-1.0-i2v' : 'happyhorse-1.0-t2v',
        prompt: record.prompt || '',
        // 优先用用户选的画质档；没选则按画幅默认
        resolution: this.normalizeResolution(record.resolution) || this.resolveResolution(record.aspectRatio),
        duration: Math.round(Number(record.duration) || 5),
      }
      if (ref) {
        body.image = ref  // i2v：画幅自动跟随首帧图，不发 ratio
      } else {
        body.ratio = this.resolveRatio(record.aspectRatio)  // t2v：需指定横竖比
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

  /** 把用户选的画质档规范成 '720P'/'1080P'；非法/空返回 ''（交由 resolveResolution 给默认）。 */
  private normalizeResolution(res?: string | null): string {
    const r = String(res || '').trim().toLowerCase()
    if (r === '1080p' || r === '1080') return '1080P'
    if (r === '720p' || r === '720') return '720P'
    return ''
  }

  /** happyhorse 用 '720P' / '1080P' 枚举（画质档，不含横竖）。 */
  private resolveResolution(aspectRatio?: string | null): string {
    const r = (aspectRatio || '9:16').toLowerCase()
    if (r.includes('16:9') || r === 'landscape' || r === 'horizontal') return '1080P'
    return '720P'
  }

  /** happyhorse 的横竖比 ratio：16:9 / 9:16 / 1:1 / 4:3 / 3:4 / 4:5 / 5:4 / 9:21 / 21:9。短剧默认竖屏 9:16。 */
  private resolveRatio(aspectRatio?: string | null): string {
    const r = (aspectRatio || '9:16').toLowerCase().replace(/\s/g, '')
    const allowed = ['16:9', '9:16', '1:1', '4:3', '3:4', '4:5', '5:4', '9:21', '21:9']
    if (allowed.includes(r)) return r
    if (r === 'landscape' || r === 'horizontal') return '16:9'
    if (r === 'portrait' || r === 'vertical') return '9:16'
    return '9:16'
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
