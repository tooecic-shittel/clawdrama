/**
 * TTS 语音合成服务
 * 支持 MiniMax TTS (hex 音频响应) 和 OpenAI 兼容 /audio/speech
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { v4 as uuid } from 'uuid'
import { getAudioConfigById } from './ai.js'
import { getTTSAdapter } from './adapters/registry.js'
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

/**
 * 生成 TTS 音频，返回本地文件路径
 */
export async function generateTTS(params: TTSParams): Promise<string> {
  const config = getAudioConfigById(params.configId)
  const adapter = getTTSAdapter(config.provider)

  logTaskStart('AudioTask', 'tts-generate', {
    provider: config.provider,
    voice: params.voice,
    model: params.model || config.model,
    textPreview: params.text.slice(0, 50),
    textLength: params.text.length,
  })
  logTaskPayload('AudioTask', 'tts params', {
    config: {
      provider: config.provider,
      model: config.model,
      baseUrl: config.baseUrl,
    },
    params,
  })

  const { url, method, headers, body } = adapter.buildGenerateRequest(config, params)
  logTaskProgress('AudioTask', 'request', {
    provider: config.provider,
    voice: params.voice,
    method,
    url: redactUrl(url),
    model: params.model || config.model,
  })
  logTaskPayload('AudioTask', 'request payload', {
    method,
    url,
    headers,
    body,
  })

  const resp = await fetch(url, {
    method,
    headers,
    body: JSON.stringify(body),
  })

  if (!resp.ok) {
    const errText = await resp.text()
    logTaskError('AudioTask', 'tts-generate', { provider: config.provider, voice: params.voice, status: resp.status, error: errText })
    throw new Error(`TTS API error ${resp.status}: ${errText}`)
  }

  let buffer: Buffer
  let metadata: { audioLength: number; sampleRate: number; bitrate: number; format: string; channel: number }

  // Some adapters (OpenAI-compatible /v1/audio/speech) return raw binary audio.
  // Others (MiniMax /v1/t2a_v2) return JSON with hex-encoded audio.
  // Gemini native TTS returns JSON with base64 PCM → we wrap it in a WAV header.
  const adapterAny = adapter as any
  if (adapterAny.responseType === 'binary') {
    const arrayBuf = await resp.arrayBuffer()
    buffer = Buffer.from(arrayBuf)
    metadata = adapterAny.getBinaryMetadata?.() || {
      audioLength: 0,
      sampleRate: 24000,
      bitrate: 160000,
      format: 'mp3',
      channel: 1,
    }
  } else if (adapterAny.responseType === 'gemini-pcm') {
    const result = await resp.json()
    const { base64, sampleRate, channels } = adapterAny.parsePcmResponse(result)
    const pcm = Buffer.from(base64, 'base64')
    buffer = pcmToWav(pcm, sampleRate, channels)
    metadata = {
      audioLength: Math.round((pcm.length / (sampleRate * channels * 2)) * 1000),
      sampleRate,
      bitrate: sampleRate * channels * 16,
      format: 'wav',
      channel: channels,
    }
  } else {
    const result = await resp.json()
    const parsed = adapter.parseResponse(result)
    buffer = Buffer.from(parsed.audioHex, 'hex')
    metadata = {
      audioLength: parsed.audioLength,
      sampleRate: parsed.sampleRate,
      bitrate: parsed.bitrate,
      format: parsed.format,
      channel: parsed.channel,
    }
  }

  // 保存到本地
  const audioDir = path.join(STORAGE_ROOT, 'audio')
  fs.mkdirSync(audioDir, { recursive: true })
  const filename = `${uuid()}.${metadata.format || 'mp3'}`
  const filePath = path.join(audioDir, filename)
  fs.writeFileSync(filePath, buffer)

  const relativePath = `static/audio/${filename}`
  logTaskSuccess('AudioTask', 'tts-saved', {
    provider: config.provider,
    voice: params.voice,
    path: relativePath,
    bytes: buffer.length,
    audioMs: metadata.audioLength,
  })
  return relativePath
}

/**
 * 为角色生成试听音频
 */
export async function generateVoiceSample(characterName: string, voiceId: string, configId?: number | null): Promise<string> {
  const sampleText = `你好，我是${characterName}。很高兴认识你，这是我的声音试听。`
  return generateTTS({ text: sampleText, voice: voiceId, configId })
}
