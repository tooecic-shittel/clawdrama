/**
 * Google Veo 视频生成 Adapter（Google AI Studio 原生协议）
 *
 * 端点（key 在 query 里）：
 *   POST /v1beta/models/{model}:predictLongRunning?key={apiKey}
 *     body: { instances: [{ prompt, image? }], parameters: { aspectRatio, personGeneration } }
 *     resp: { name: 'models/{model}/operations/{opId}' }
 *
 *   GET /v1beta/{operation_name}?key={apiKey}
 *     resp: { done: bool, response?: { generateVideoResponse: { generatedSamples: [{ video: { uri } }] } } }
 *
 * 注意：Google 用 query param `?key=xxx`，不是 Bearer token。
 */
import type {
  VideoProviderAdapter,
  ProviderRequest,
  AIConfig,
  VideoGenerationRecord,
  VideoGenResponse,
  VideoPollResponse,
} from './types'

export class GoogleVeoVideoAdapter implements VideoProviderAdapter {
  provider = 'google-veo'

  buildGenerateRequest(config: AIConfig, record: VideoGenerationRecord): ProviderRequest {
    const model = record.model || config.model || 'veo-3.0-fast-generate-001'
    // Strip trailing slash + optional /openai suffix (we accept the same base URL as text Gemini)
    const base = (config.baseUrl || 'https://generativelanguage.googleapis.com/v1beta')
      .replace(/\/+$/, '')
      .replace(/\/openai$/, '')

    const url = `${base}/models/${model}:predictLongRunning?key=${encodeURIComponent(config.apiKey)}`

    const instance: any = { prompt: record.prompt || '' }

    // Image-to-video: pass base64 image as `image` field. Caller (video-generation.ts)
    // already converted local paths to "data:image/jpeg;base64,XXX" data URLs via
    // normalizeVideoReferenceUrl(). We extract the base64 + mimeType here.
    const refUrl =
      (record.referenceMode === 'single' || record.referenceMode === 'first_last')
        ? (record.firstFrameUrl || record.imageUrl)
        : record.imageUrl
    if (refUrl && typeof refUrl === 'string' && refUrl.startsWith('data:')) {
      const m = refUrl.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i)
      if (m) {
        instance.image = { mimeType: m[1], bytesBase64Encoded: m[2] }
      }
    }

    const body: any = {
      instances: [instance],
      parameters: {
        aspectRatio: this.resolveAspect(record.aspectRatio),
        // Veo 现已不支持 'allow_all'（尤其图生视频 / 涉及未成年人），用广泛支持的 'allow_adult'。
        // 注意：这意味着 Veo 不允许生成儿童形象——短剧里有小孩的镜头 Veo 仍会受限。
        personGeneration: 'allow_adult',
      },
    }

    // Veo seconds: veo-3.0 supports 8s, veo-3.1 supports 4/6/8s
    const dur = this.normalizeDuration(record.duration, model)
    if (dur) body.parameters.durationSeconds = dur

    return {
      url,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    }
  }

  parseGenerateResponse(result: any): VideoGenResponse {
    if (result.name) {
      // operation name is "models/{model}/operations/{opId}" — store full name as task id
      return { isAsync: true, taskId: result.name }
    }
    throw new Error('Veo: no operation name in response: ' + JSON.stringify(result).slice(0, 200))
  }

  buildPollRequest(config: AIConfig, taskId: string): ProviderRequest {
    const base = (config.baseUrl || 'https://generativelanguage.googleapis.com/v1beta')
      .replace(/\/+$/, '')
      .replace(/\/openai$/, '')

    // taskId is full operation name "models/X/operations/Y"
    return {
      url: `${base}/${taskId}?key=${encodeURIComponent(config.apiKey)}`,
      method: 'GET',
      headers: {},
      body: undefined,
    }
  }

  parsePollResponse(result: any): VideoPollResponse {
    if (!result.done) {
      return { status: 'processing' }
    }

    if (result.error) {
      const msg = result.error.message || result.error.code || 'Veo generation failed'
      return { status: 'failed', error: String(msg) }
    }

    // Veo Responsible AI safety filter rejection
    // Response shape: { response: { generateVideoResponse: { raiMediaFilteredCount, raiMediaFilteredReasons } } }
    const gvr = result.response?.generateVideoResponse || {}
    if (gvr.raiMediaFilteredCount && gvr.raiMediaFilteredCount > 0) {
      const reasons: string[] = gvr.raiMediaFilteredReasons || []
      const upstreamMsg = reasons[0] || 'Content rejected by safety filter'
      const isAudio = /audio/i.test(upstreamMsg)
      const friendly = isAudio
        ? '⚠️ Veo 安全过滤拒绝（音频内容触发限制）：请编辑分镜的 sound_effect 字段，去掉枪声 / 尖叫 / 暴力等敏感音效描述后重试'
        : '⚠️ Veo 安全过滤拒绝：请检查 prompt 是否包含敏感内容（暴力 / 血腥 / 真人 / 政治等），修改后重试'
      return { status: 'failed', error: friendly }
    }

    const videoUrl = this.extractVideoUrl(result)
    if (videoUrl) {
      return { status: 'completed', videoUrl }
    }

    return { status: 'failed', error: 'Veo 返回未知结构（无视频也无错误）' }
  }

  extractVideoUrl(result: any): string | null {
    // Response shape variations seen in Veo API:
    //   result.response.generateVideoResponse.generatedSamples[0].video.uri
    //   result.response.generatedVideos[0].video.uri  (newer)
    //   result.response.predictions[0].videoUri        (alt)
    const r = result.response || {}
    return (
      r.generateVideoResponse?.generatedSamples?.[0]?.video?.uri ||
      r.generatedVideos?.[0]?.video?.uri ||
      r.predictions?.[0]?.videoUri ||
      null
    )
  }

  private resolveAspect(aspectRatio?: string | null): string {
    // Veo accepts: '16:9' or '9:16' (depending on model)
    if (!aspectRatio) return '16:9'
    const r = aspectRatio.toLowerCase()
    if (r.includes('9:16') || r === 'portrait' || r === 'vertical') return '9:16'
    return '16:9'
  }

  private normalizeDuration(duration?: number | null, model?: string): number | null {
    if (!duration) return null
    const d = Math.round(Number(duration))
    if (model?.includes('3.1') || model?.includes('3-1')) {
      // veo-3.1: 4, 6, 8
      if (d <= 4) return 4
      if (d <= 6) return 6
      return 8
    }
    // veo-3.0 and veo-2.0: fixed 8s, ignore client preference
    return null
  }
}
