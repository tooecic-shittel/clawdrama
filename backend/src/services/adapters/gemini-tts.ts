/**
 * Gemini 原生 TTS Adapter（Google AI Studio generateContent 协议）
 *
 * 端点: POST /v1beta/models/{model}:generateContent
 *   body: {
 *     contents: [{ parts: [{ text }] }],
 *     generationConfig: {
 *       responseModalities: ['AUDIO'],
 *       speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } }
 *     }
 *   }
 *   resp: { candidates: [{ content: { parts: [{ inlineData: { mimeType, data(base64 PCM) } }] } }] }
 *
 * 返回的是 16-bit PCM（L16，默认 24kHz 单声道）的 base64，不是 mp3。
 * generateTTS 会把它包成 WAV 再落盘。
 *
 * 为什么用它：gpt-4o-mini-tts 的中文有明显"机器人腔"，Gemini 原生 TTS 的
 * 中文自然得多，并且支持用一句自然语言前缀来控制语气/情绪（不会被读出来）。
 */
import type { TTSProviderAdapter, AIConfig, ProviderRequest } from './types'

// Gemini 预置音色（官方 30 个）。如果传入的 voice 已经是其中之一，直接用。
const GEMINI_VOICES = [
  'Zephyr', 'Puck', 'Charon', 'Kore', 'Fenrir', 'Leda', 'Orus', 'Aoede',
  'Callirrhoe', 'Autonoe', 'Enceladus', 'Iapetus', 'Umbriel', 'Algieba',
  'Despina', 'Erinome', 'Algenib', 'Rasalgethi', 'Laomedeia', 'Achernar',
  'Alnilam', 'Schedar', 'Gacrux', 'Pulcherrima', 'Achird', 'Zubenelgenubi',
  'Vindemiatrix', 'Sadachbia', 'Sadaltager', 'Sulafat',
]
const GEMINI_VOICE_RE = new RegExp(`^(${GEMINI_VOICES.join('|')})$`, 'i')

// 旧 OpenAI 音色 id → Gemini 音色（保持性别 & 角色定位）。仅作兜底：
// voice-mapper 通常已把 voice 规范成 Gemini 名，这里再防一手直接传入旧 id 的情况。
const OPENAI_TO_GEMINI: Record<string, string> = {
  // gpt-4o-mini-tts
  coral: 'Kore',      // 女 · 温暖亲和
  marin: 'Leda',      // 女 · 清新少女
  sage: 'Aoede',      // 中性/旁白 · 轻盈
  ash: 'Charon',      // 男 · 低沉磁性
  cedar: 'Orus',      // 男 · 醇厚稳重
  ballad: 'Algieba',  // 男 · 柔和抒情
  verse: 'Fenrir',    // 男 · 富有表现力
  // classic tts-1
  alloy: 'Aoede', echo: 'Charon', fable: 'Algieba', onyx: 'Orus', nova: 'Kore', shimmer: 'Leda',
}
const GEMINI_FALLBACK_POOL = ['Aoede', 'Kore', 'Charon', 'Leda', 'Orus']

function resolveVoice(voice?: string | null): string {
  const v = (voice || '').trim()
  if (!v) return 'Aoede'
  if (GEMINI_VOICE_RE.test(v)) {
    // 规范化大小写到官方拼写
    return GEMINI_VOICES.find(g => g.toLowerCase() === v.toLowerCase()) || 'Aoede'
  }
  const mapped = OPENAI_TO_GEMINI[v.toLowerCase()]
  if (mapped) return mapped
  // 未知音色 → 用名字哈希到固定池，保证同名稳定
  let h = 0
  for (let i = 0; i < v.length; i++) h = ((h << 5) - h + v.charCodeAt(i)) | 0
  return GEMINI_FALLBACK_POOL[Math.abs(h) % GEMINI_FALLBACK_POOL.length]
}

export class GeminiTTSAdapter implements TTSProviderAdapter {
  readonly provider = 'gemini'
  /** 自定义响应类型：JSON 里带 base64 PCM，由 generateTTS 转 WAV */
  readonly responseType = 'gemini-pcm' as const

  buildGenerateRequest(config: AIConfig, params: any): ProviderRequest {
    const model = params.model || config.model || 'gemini-2.5-flash-preview-tts'

    // 接受和文本 Gemini 相同的 base URL（…/v1beta/openai），去掉 /openai 后缀
    const base = (config.baseUrl || 'https://generativelanguage.googleapis.com/v1beta')
      .replace(/\/+$/, '')
      .replace(/\/openai$/, '')
    const url = `${base}/models/${model}:generateContent`

    // 语气/情绪：作为一句自然语言指令前缀。Gemini 会当成朗读风格而不会读出来。
    const text = params.emotion
      ? `${String(params.emotion).trim()}\n\n${params.text}`
      : params.text

    const body: any = {
      contents: [{ parts: [{ text }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: resolveVoice(params.voice) },
          },
        },
      },
    }

    return {
      url,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': config.apiKey,
      },
      body,
    }
  }

  /**
   * 从 generateContent 响应里取出 base64 PCM + 采样率。
   * 由 generateTTS 在 responseType==='gemini-pcm' 分支调用。
   */
  parsePcmResponse(result: any): { base64: string; sampleRate: number; channels: number } {
    const part = result?.candidates?.[0]?.content?.parts?.find((p: any) => p?.inlineData)
    const inline = part?.inlineData
    if (!inline?.data) {
      throw new Error(`Gemini TTS 响应缺少音频数据: ${JSON.stringify(result).slice(0, 300)}`)
    }
    const rateMatch = String(inline.mimeType || '').match(/rate=(\d+)/)
    return {
      base64: inline.data,
      sampleRate: rateMatch ? Number(rateMatch[1]) : 24000,
      channels: 1,
    }
  }

  /** 不走二进制/hex 路径 */
  parseResponse(_result: any): {
    audioHex: string; audioLength: number; sampleRate: number
    bitrate: number; format: string; channel: number
  } {
    throw new Error('GeminiTTSAdapter 返回 base64 PCM — 由 generateTTS 的 gemini-pcm 分支处理')
  }
}
