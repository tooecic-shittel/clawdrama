/**
 * TTS 语音合成服务
 * 支持 MiniMax TTS (hex 音频响应) 和 OpenAI 兼容 /audio/speech
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { v4 as uuid } from 'uuid'
import { getAudioConfigById, getActiveAudioConfigs, type AIConfig } from './ai.js'
import { getTTSAdapter } from './adapters/registry.js'
import { assertBalance, chargeForAction } from './credits.js'
import { logTaskError, logTaskPayload, logTaskProgress, logTaskStart, logTaskSuccess, redactUrl } from '../utils/task-logger.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const STORAGE_ROOT = process.env.STORAGE_PATH || path.resolve(__dirname, '../../../data/static')

interface TTSParams {
  text: string
  voice: string
  model?: string
  speed?: number
  emotion?: string
  configId?: number | null
  /** Owner of this generation — used to meter credits (undefined = unmetered/system, e.g. voice preview). */
  userId?: number
}

/**
 * 把裸 PCM（16-bit little-endian）包成可播放的 WAV。
 * Gemini TTS 返回的是 L16 PCM（默认 24kHz 单声道），没有 WAV 头，直接落盘无法播放。
 */
function pcmToWav(pcm: Buffer, sampleRate: number, channels: number): Buffer {
  const bitsPerSample = 16
  const blockAlign = (channels * bitsPerSample) / 8
  const byteRate = sampleRate * blockAlign
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + pcm.length, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16) // PCM fmt chunk size
  header.writeUInt16LE(1, 20) // audio format = PCM
  header.writeUInt16LE(channels, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(byteRate, 28)
  header.writeUInt16LE(blockAlign, 32)
  header.writeUInt16LE(bitsPerSample, 34)
  header.write('data', 36)
  header.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([header, pcm])
}

// 单个 provider 内的最大尝试次数。仅用于「瞬时」错误（网络 / 5xx / 429）重试；
// 200-但-空音频（Gemini finishReason:OTHER）和 4xx 硬错误会立即跳到下一个 provider 兜底，不在这里耗。
const MAX_TTS_ATTEMPTS = 3

interface DecodedAudio {
  buffer: Buffer
  metadata: { audioLength: number; sampleRate: number; bitrate: number; format: string; channel: number }
}

/**
 * 把 TTS 响应解码成可落盘的 buffer + 元数据。
 * 三种响应：binary（OpenAI /audio/speech）、gemini-pcm（base64 PCM → WAV）、
 * JSON+hex（MiniMax）。解码失败（如 Gemini 返回空音频）会抛错，交由上层重试。
 */
async function readTTSAudio(adapter: any, resp: Response): Promise<DecodedAudio> {
  if (adapter.responseType === 'binary') {
    const arrayBuf = await resp.arrayBuffer()
    return {
      buffer: Buffer.from(arrayBuf),
      metadata: adapter.getBinaryMetadata?.() || { audioLength: 0, sampleRate: 24000, bitrate: 160000, format: 'mp3', channel: 1 },
    }
  }
  if (adapter.responseType === 'gemini-pcm') {
    const result = await resp.json()
    const { base64, sampleRate, channels } = adapter.parsePcmResponse(result)
    const pcm = Buffer.from(base64, 'base64')
    return {
      buffer: pcmToWav(pcm, sampleRate, channels),
      metadata: {
        audioLength: Math.round((pcm.length / (sampleRate * channels * 2)) * 1000),
        sampleRate,
        bitrate: sampleRate * channels * 16,
        format: 'wav',
        channel: channels,
      },
    }
  }
  const result = await resp.json()
  const parsed = adapter.parseResponse(result)
  return {
    buffer: Buffer.from(parsed.audioHex, 'hex'),
    metadata: {
      audioLength: parsed.audioLength,
      sampleRate: parsed.sampleRate,
      bitrate: parsed.bitrate,
      format: parsed.format,
      channel: parsed.channel,
    },
  }
}

/**
 * 用单个配置尝试生成（含 provider 内重试）。成功返回 { decoded }，失败返回 { error } 交上层落到下一个 provider。
 *
 * 重试规则：
 *   - 网络错误 / 5xx / 429：瞬时问题，同一 provider 内最多重试 MAX_TTS_ATTEMPTS 次。
 *   - 4xx（非 429）：鉴权/参数硬错误，本 provider 不可用 → 立即返回，交上层换 provider。
 *   - 200 但解码失败（如 Gemini finishReason:OTHER 空音频）：对此「文本+模型」是确定性失败，
 *     重试同 provider 无意义 → 立即返回，交上层换 provider。
 */
async function generateWithConfig(config: AIConfig, params: TTSParams): Promise<{ decoded?: DecodedAudio; error?: unknown }> {
  const adapter = getTTSAdapter(config.provider)
  let lastErr: unknown

  for (let attempt = 1; attempt <= MAX_TTS_ATTEMPTS; attempt++) {
    const { url, method, headers, body } = adapter.buildGenerateRequest(config, params)
    logTaskProgress('AudioTask', 'request', {
      provider: config.provider,
      voice: params.voice,
      method,
      url: redactUrl(url),
      model: params.model || config.model,
      attempt,
    })
    logTaskPayload('AudioTask', 'request payload', { method, url, headers, body, attempt })

    let resp: Response
    try {
      resp = await fetch(url, { method, headers, body: JSON.stringify(body) })
    } catch (netErr) {
      // 网络层错误（连不上 / 超时）——瞬时，重试
      lastErr = netErr
      logTaskError('AudioTask', 'tts-generate', { provider: config.provider, voice: params.voice, error: String((netErr as any)?.message || netErr), attempt })
      if (attempt < MAX_TTS_ATTEMPTS) await new Promise((r) => setTimeout(r, 400))
      continue
    }

    if (!resp.ok) {
      const errText = await resp.text()
      logTaskError('AudioTask', 'tts-generate', { provider: config.provider, voice: params.voice, status: resp.status, error: errText, attempt })
      lastErr = new Error(`TTS API ${resp.status}: ${errText}`)
      // 4xx（非 429）硬错误：本 provider 不可用，立即换下一个
      if (resp.status < 500 && resp.status !== 429) return { error: lastErr }
      // 5xx / 429：瞬时，重试同 provider
      if (attempt < MAX_TTS_ATTEMPTS) await new Promise((r) => setTimeout(r, 400))
      continue
    }

    try {
      return { decoded: await readTTSAudio(adapter, resp) }
    } catch (decodeErr) {
      // 200 但无音频（OTHER 等）：对此文本+模型确定性失败，立即换下一个 provider，别耗在同一家
      logTaskProgress('AudioTask', 'tts-empty-audio', {
        provider: config.provider,
        voice: params.voice,
        attempt,
        error: String((decodeErr as any)?.message || decodeErr).slice(0, 160),
      })
      return { error: decodeErr }
    }
  }

  return { error: lastErr }
}

/**
 * 生成 TTS 音频，返回本地文件路径
 */
export async function generateTTS(params: TTSParams): Promise<string> {
  // Gate on credits before doing any work (throws InsufficientCreditsError → 402 at route).
  await assertBalance(params.userId, 'tts')

  // 候选配置：主配置（指定的 configId 或最高优先级）排第一，其余「启用中」音频配置按优先级跟在后面（去重）。
  // 主配置失败（空音频 / 4xx / 重试耗尽）时自动落到下一个 provider 兜底——例如 Gemini 对超短台词返回
  // OTHER 空音频时，落到云雾 gpt-4o-mini-tts 兜底。
  const primary = getAudioConfigById(params.configId)
  const seen = new Set<string>()
  const candidates: AIConfig[] = []
  for (const c of [primary, ...getActiveAudioConfigs()]) {
    const key = `${c.provider}|${c.baseUrl}|${c.model}`
    if (seen.has(key)) continue
    seen.add(key)
    candidates.push(c)
  }

  logTaskStart('AudioTask', 'tts-generate', {
    provider: primary.provider,
    voice: params.voice,
    model: params.model || primary.model,
    textPreview: params.text.slice(0, 50),
    textLength: params.text.length,
    fallbackProviders: candidates.slice(1).map((c) => c.provider),
  })
  logTaskPayload('AudioTask', 'tts params', {
    candidates: candidates.map((c) => ({ provider: c.provider, model: c.model, baseUrl: c.baseUrl })),
    params,
  })

  let decoded: DecodedAudio | undefined
  let usedConfig: AIConfig | undefined
  let lastErr: unknown

  for (let i = 0; i < candidates.length; i++) {
    const config = candidates[i]
    if (i > 0) {
      logTaskProgress('AudioTask', 'tts-fallback-provider', {
        from: candidates[i - 1].provider,
        to: config.provider,
        voice: params.voice,
        reason: String((lastErr as any)?.message || lastErr).slice(0, 160),
      })
    }
    const res = await generateWithConfig(config, params)
    if (res.decoded) {
      decoded = res.decoded
      usedConfig = config
      break
    }
    lastErr = res.error
  }

  if (!decoded || !usedConfig) {
    const msg = String((lastErr as any)?.message || lastErr || '无音频数据')
    logTaskError('AudioTask', 'tts-generate', { voice: params.voice, candidates: candidates.length, error: msg })
    throw new Error(`配音生成失败（已尝试 ${candidates.length} 个配置仍无音频）：${msg.slice(0, 200)}`)
  }

  const { buffer, metadata } = decoded

  // 保存到本地
  const audioDir = path.join(STORAGE_ROOT, 'audio')
  fs.mkdirSync(audioDir, { recursive: true })
  const filename = `${uuid()}.${metadata.format || 'mp3'}`
  const filePath = path.join(audioDir, filename)
  fs.writeFileSync(filePath, buffer)

  const relativePath = `static/audio/${filename}`
  logTaskSuccess('AudioTask', 'tts-saved', {
    provider: usedConfig.provider,
    voice: params.voice,
    path: relativePath,
    bytes: buffer.length,
    audioMs: metadata.audioLength,
  })
  await chargeForAction(params.userId, 'tts', {})
  return relativePath
}

/**
 * 为角色生成试听音频
 */
export async function generateVoiceSample(characterName: string, voiceId: string, configId?: number | null): Promise<string> {
  const sampleText = `你好，我是${characterName}。很高兴认识你，这是我的声音试听。`
  return generateTTS({ text: sampleText, voice: voiceId, configId })
}
