/**
 * 火山引擎 Seedance 视频生成 Adapter
 * 端点: /api/v3/contents/generations/tasks (注意 /api/v3 前缀)
 * 响应: { id: "task-xxx" } -> 轮询获取状态
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

export class VolcEngineVideoAdapter implements VideoProviderAdapter {
  provider = 'volcengine'

  buildGenerateRequest(config: AIConfig, record: VideoGenerationRecord): ProviderRequest {
    const model = record.model || config.model || 'doubao-seedance-2-0-260128'

    const content: any[] = [{ type: 'text', text: record.prompt || '' }]

    // 添加参考图
    if (record.referenceMode === 'single' && record.imageUrl) {
      // 我们的 i2v：用首帧图，画面跟随首帧
      content.push({ type: 'image_url', image_url: { url: record.imageUrl }, role: 'first_frame' })
    } else if (record.referenceMode === 'first_last') {
      if (record.firstFrameUrl) {
        content.push({ type: 'image_url', image_url: { url: record.firstFrameUrl }, role: 'first_frame' })
      }
      if (record.lastFrameUrl) {
        content.push({ type: 'image_url', image_url: { url: record.lastFrameUrl }, role: 'last_frame' })
      }
    } else if (record.referenceMode === 'multiple' && record.referenceImageUrls) {
      try {
        const refs = JSON.parse(record.referenceImageUrls)
        for (const url of refs) {
          content.push({ type: 'image_url', image_url: { url } })
        }
      } catch {}
    }

    const body: any = {
      model,
      content,
      // 我们的流程是「无声视频 + 单独 TTS 合成」，让 Seedance 不要自带音轨，避免和配音叠音
      generate_audio: false,
      ratio: this.resolveRatio(record.aspectRatio),
      resolution: this.normalizeResolution(record.resolution),
      duration: this.normalizeDuration(record.duration),
      watermark: false,
    }

    return {
      url: joinProviderUrl(config.baseUrl, '/api/v3', '/contents/generations/tasks'),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body,
    }
  }

  parseGenerateResponse(result: any): VideoGenResponse {
    if (result.id) {
      return { isAsync: true, taskId: result.id }
    }
    // 同步返回
    const videoUrl = result.video_url || result.content?.video_url || result.data?.video_url
    if (videoUrl) {
      return { isAsync: false, videoUrl }
    }
    throw new Error('No task_id or video_url in response')
  }

  buildPollRequest(config: AIConfig, taskId: string): ProviderRequest {
    return {
      url: joinProviderUrl(config.baseUrl, '/api/v3', `/contents/generations/tasks/${taskId}`),
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: undefined,
    }
  }

  parsePollResponse(result: any): VideoPollResponse {
    const status = result.status
    if (status === 'succeeded') {
      const videoUrl = result.video_url || result.content?.video_url || result.data?.video_url
      return {
        status: 'completed',
        videoUrl,
      }
    }
    if (status === 'failed') {
      return { status: 'failed', error: result.error || 'Video generation failed' }
    }
    return { status: status || 'processing' }
  }

  extractVideoUrl(result: any): string | null {
    return result.video_url || result.content?.video_url || result.data?.video_url || null
  }

  private normalizeDuration(duration?: number | null): number {
    const parsed = Math.round(Number(duration || 5))
    if (!Number.isFinite(parsed)) return 5
    return Math.min(12, Math.max(4, parsed))
  }

  /** 用户选的画质档 '720P'/'1080P' → Seedance 的 '720p'/'1080p'（小写）；缺省 720p。 */
  private normalizeResolution(res?: string | null): string {
    const r = String(res || '').trim().toLowerCase()
    if (r === '1080p' || r === '1080') return '1080p'
    if (r === '480p' || r === '480') return '480p'
    return '720p'
  }

  /** Seedance ratio 取值：16:9 / 9:16 / 4:3 / 3:4 / 1:1 / 21:9 / adaptive。短剧默认 16:9。 */
  private resolveRatio(aspectRatio?: string | null): string {
    const r = String(aspectRatio || '').toLowerCase().replace(/\s/g, '')
    const allowed = ['16:9', '9:16', '4:3', '3:4', '1:1', '21:9', 'adaptive']
    if (allowed.includes(r)) return r
    if (r === 'landscape' || r === 'horizontal') return '16:9'
    if (r === 'portrait' || r === 'vertical') return '9:16'
    return '16:9'
  }
}
