/**
 * 阿里云百炼（万相）视频生成 Adapter
 * API 文档: https://help.aliyun.com/zh/model-studio/image-to-video-api-reference
 */
import type { VideoProviderAdapter, VideoGenerationRecord } from './types'
import { joinProviderUrl } from './url'

export class AliVideoAdapter implements VideoProviderAdapter {
  readonly provider = 'ali'

  buildGenerateRequest(config: any, record: VideoGenerationRecord): {
    url: string
    method: string
    headers: Record<string, string>
    body: any
  } {
    const rawModel = record.model || config.model || 'wan2.6-i2v-flash'
    const baseUrl = config.baseUrl || 'https://dashscope.aliyuncs.com'
    const isHappyHorse = /happyhorse/i.test(rawModel)
    const isYunwuBailian = /yunwu\.ai/i.test(baseUrl)
    const url = isHappyHorse
      ? joinProviderUrl(baseUrl, isYunwuBailian ? '/alibailian/api/v1' : '/api/v1', '/services/aigc/video-generation/video-synthesis')
      : joinProviderUrl(baseUrl, '/api/v1', '/services/aigc/video-generation/video-synthesis')

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    }

    const referenceUrls = this.collectReferenceUrls(record)
    if (isHappyHorse) {
      const model = this.normalizeHappyHorseModel(rawModel, referenceUrls.length)
      headers['X-DashScope-Async'] = 'enable'
      const body: any = {
        model,
        input: {
          prompt: record.prompt || '',
        },
        parameters: {
          resolution: this.normalizeResolution(record.resolution ?? record.aspectRatio ?? '9:16'),
          duration: this.normalizeDuration(record.duration),
          watermark: false,
          seed: Math.floor(Math.random() * 2147483647),
        },
      }
      if (referenceUrls.length) {
        body.input.media = referenceUrls.map((url) => ({ type: 'reference_image', url })).slice(0, 9)
      }
      return { url, method: 'POST', headers, body }
    }

    const model = rawModel
    const body: any = {
      model,
      input: {
        prompt: record.prompt,
        img_url: record.imageUrl ?? record.firstFrameUrl ?? '',
      },
      parameters: {
        resolution: this.normalizeResolution(record.aspectRatio ?? '16:9'),
        duration: record.duration || 5,
        watermark: false,
        seed: Math.floor(Math.random() * 2147483647),
      },
    }

    // 尾帧模式
    if (record.lastFrameUrl) {
      body.input.last_img_url = record.lastFrameUrl as string
    }

    return { url, method: 'POST', headers, body }
  }

  parseGenerateResponse(result: any): {
    isAsync: boolean
    taskId?: string
    videoUrl?: string
  } {
    if (result.output?.task_status === 'PENDING' && result.output?.task_id) {
      return { isAsync: true, taskId: result.output.task_id }
    }

    if (result.output?.video_url) {
      return { isAsync: false, videoUrl: result.output.video_url }
    }

    throw new Error(`Unexpected Ali video response: ${JSON.stringify(result).slice(0, 200)}`)
  }

  buildPollRequest(config: any, taskId: string): {
    url: string
    method: string
    headers: Record<string, string>
    body: any
  } {
    const baseUrl = config.baseUrl || 'https://dashscope.aliyuncs.com'
    const isYunwuBailian = /yunwu\.ai/i.test(baseUrl)
    return {
      url: joinProviderUrl(baseUrl, isYunwuBailian ? '/alibailian/api/v1' : '/api/v1', `/tasks/${taskId}`),
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: undefined,
    }
  }

  parsePollResponse(result: any): {
    status: 'pending' | 'processing' | 'completed' | 'failed'
    videoUrl?: string
    error?: string
  } {
    const status = result.output?.task_status

    if (status === 'SUCCEEDED') {
      return { status: 'completed', videoUrl: result.output?.video_url }
    }

    if (status === 'FAILED') {
      return { status: 'failed', error: result.message || 'Video generation failed' }
    }

    if (status === 'PENDING' || status === 'RUNNING') {
      return { status: 'processing' }
    }

    return { status: 'pending' }
  }

  extractVideoUrl(result: any): string | null {
    return result.output?.video_url || null
  }

  private collectReferenceUrls(record: VideoGenerationRecord): string[] {
    const urls = [
      record.imageUrl,
      record.firstFrameUrl,
      ...this.parseReferenceImageUrls(record.referenceImageUrls),
      record.lastFrameUrl,
    ]
      .map((url) => String(url || '').trim())
      .filter(Boolean)
    return Array.from(new Set(urls))
  }

  private parseReferenceImageUrls(value?: string | null): string[] {
    if (!value) return []
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }

  private normalizeDuration(duration?: number | null): number {
    const d = Math.round(Number(duration) || 5)
    return Math.min(15, Math.max(3, d))
  }

  private normalizeResolution(value?: string): string {
    const ratio = value || '16:9'
    if (ratio === '720P' || ratio === '1080P') return ratio
    if (ratio === '9:16') return '720P'
    if (ratio === '1:1') return '720P'
    return '1080P'
  }

  private normalizeHappyHorseModel(model: string, referenceCount: number): string {
    if (!/happyhorse-1\.1/i.test(model)) return model
    return referenceCount > 0 ? 'happyhorse-1.1-r2v' : 'happyhorse-1.1-t2v'
  }
}
