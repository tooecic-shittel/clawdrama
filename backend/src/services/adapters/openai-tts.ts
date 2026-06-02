/**
 * OpenAI 兼容 TTS Adapter
 * 端点: POST /v1/audio/speech
 * 响应: 二进制音频流（audio/mpeg | audio/wav 等）
 *
 * 适配 OpenAI、云雾(yunwu)、其他聚合站点的 OpenAI 标准 TTS 接口
 */
import type { TTSProviderAdapter } from './types'
import { joinProviderUrl } from './url'

export class OpenAITTSAdapter implements TTSProviderAdapter {
  readonly provider = 'openai'
  /** 表示响应是二进制，不是 JSON */
  readonly responseType = 'binary' as const

  buildGenerateRequest(config: any, params: any): {
    url: string
    method: string
    headers: Record<string, string>
    body: any
  } {
    const url = joinProviderUrl(config.baseUrl, '/v1', '/audio/speech')

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    }

    // OpenAI TTS voices.
    //   classic (tts-1 / tts-1-hd):  alloy, echo, fable, onyx, nova, shimmer
    //   newer  (gpt-4o-mini-tts):    coral, sage, ash, ballad, verse, marin, cedar
    // Gemini 现为默认音色集，切回 OpenAI 备选时传进来的多半是 Gemini 音色名，
    // 用反向表映射成最接近的 OpenAI 音色，保证不同角色仍有区分。
    const GEMINI_TO_OPENAI: Record<string, string> = {
      kore: 'coral', leda: 'marin', achernar: 'coral', aoede: 'sage',
      charon: 'ash', orus: 'cedar', algieba: 'ballad', fenrir: 'verse',
    }
    const raw = String(params.voice || '')
    const mapped = GEMINI_TO_OPENAI[raw.toLowerCase()]
    const voice = mapped
      ? mapped
      : /^(alloy|echo|fable|onyx|nova|shimmer|coral|sage|ash|ballad|verse|marin|cedar)$/i.test(raw)
        ? raw
        : 'sage'

    const body: any = {
      // Default to gpt-4o-mini-tts: more natural Chinese, supports `instructions`
      // for tone control, and same /v1/audio/speech endpoint.
      model: params.model || 'gpt-4o-mini-tts',
      input: params.text,
      voice,
      response_format: 'mp3',
      speed: params.speed ?? 1.0,
    }

    // gpt-4o-mini-tts supports an `instructions` field to steer tone/emotion.
    // Caller can pass params.emotion (e.g. "急切", "温柔") which we forward.
    if (params.emotion && /gpt-4o.*tts|gpt-4o-mini-tts/i.test(body.model)) {
      body.instructions = String(params.emotion)
    }

    return { url, method: 'POST', headers, body }
  }

  /**
   * Used when response was already parsed as JSON elsewhere (error path).
   * Real audio data is read directly from response in generateTTS for binary mode.
   */
  parseResponse(_result: any): {
    audioHex: string
    audioLength: number
    sampleRate: number
    bitrate: number
    format: string
    channel: number
  } {
    throw new Error('OpenAITTSAdapter uses binary response — handled by generateTTS, not parseResponse')
  }

  /** Default audio metadata for OpenAI TTS responses */
  getBinaryMetadata() {
    return {
      audioLength: 0,
      sampleRate: 24000,
      bitrate: 160000,
      format: 'mp3',
      channel: 1,
    }
  }
}
