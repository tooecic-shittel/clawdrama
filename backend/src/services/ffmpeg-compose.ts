/**
 * FFmpeg 单镜头合成 — 视频 + TTS音频 + 烧录字幕
 */
import ffmpeg from 'fluent-ffmpeg'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { execFileSync } from 'child_process'
import { v4 as uuid } from 'uuid'
import os from 'os'
import { db, schema } from '../db/index.js'
import { eq } from 'drizzle-orm'
import { now } from '../utils/response.js'
import { generateTTS } from './tts-generation.js'
import { pickVoiceForCharacter } from './voice-mapper.js'
import { buildTTSInstruction } from './tts-instruction.js'
import { runFfmpegExclusive } from './ffmpeg-lock.js'
import { logTaskError, logTaskProgress, logTaskStart, logTaskSuccess } from '../utils/task-logger.js'

// @ts-ignore - declared via dynamic require fallback
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg'
// @ts-ignore
import ffprobeInstaller from '@ffprobe-installer/ffprobe'

// Resolve ffmpeg binary path: env > npm-installed binary > common system locations
function resolveBin(envName: string, npmPath: string | undefined, names: string[]): string | null {
  if (process.env[envName]) return process.env[envName] as string
  if (npmPath) {
    try { if (fs.statSync(npmPath).isFile()) return npmPath } catch {}
  }
  const home = os.homedir()
  const candidates = names.flatMap(n => [
    `${home}/anaconda3/bin/${n}`,
    `${home}/miniconda3/bin/${n}`,
    `/opt/homebrew/bin/${n}`,
    `/usr/local/bin/${n}`,
    `/usr/bin/${n}`,
  ])
  for (const p of candidates) {
    try { if (fs.statSync(p).isFile()) return p } catch {}
  }
  return null
}
const _ffmpegBin = resolveBin('FFMPEG_PATH', (ffmpegInstaller as any)?.path, ['ffmpeg'])
const _ffprobeBin = resolveBin('FFPROBE_PATH', (ffprobeInstaller as any)?.path, ['ffprobe'])
if (_ffmpegBin) ffmpeg.setFfmpegPath(_ffmpegBin)
if (_ffprobeBin) ffmpeg.setFfprobePath(_ffprobeBin)

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const STORAGE_ROOT = process.env.STORAGE_PATH || path.resolve(__dirname, '../../../data/static')
const DATA_ROOT = path.resolve(__dirname, '../../../data')
let subtitleFilterSupport: boolean | null = null
const IGNORE_TTS_SPEAKERS = /^(环境音|环境声|音效|效果音|sfx|sound ?effect|bgm|背景音|背景音乐|ambient)$/i
const IGNORE_TTS_TEXT = /^(无|无对白|无台词|无旁白|无需配音|无需对白|none|null|n\/a|na|环境音|环境声|音效|效果音|纯音效|纯环境音|只有环境音|仅环境音|背景音|背景音乐|bgm|sfx|ambient)$/i

function toAbsPath(relativePath: string): string {
  if (path.isAbsolute(relativePath)) return relativePath
  if (relativePath.startsWith('static/')) return path.join(DATA_ROOT, relativePath)
  return path.join(STORAGE_ROOT, relativePath)
}

function supportsSubtitleFilter(): boolean {
  if (subtitleFilterSupport != null) return subtitleFilterSupport
  try {
    const output = execFileSync('ffmpeg', ['-hide_banner', '-filters'], { encoding: 'utf8' })
    subtitleFilterSupport = /\bsubtitles\b/.test(output)
  } catch {
    subtitleFilterSupport = false
  }
  return subtitleFilterSupport
}

function parseDialogueForTTS(dialogue?: string | null) {
  const raw = dialogue?.trim() || ''
  if (!raw) return { speaker: '', pureText: '', ignorable: true }
  const speakerMatch = raw.match(/^(.+?)[:：]/)
  const speaker = speakerMatch ? speakerMatch[1].replace(/[（(].+?[)）]/g, '').trim() : ''
  const pureText = raw.replace(/^.+?[:：]\s*/, '').replace(/[（(].+?[)）]/g, '').trim()
  const ignorable = (!!speaker && IGNORE_TTS_SPEAKERS.test(speaker)) || !pureText || IGNORE_TTS_TEXT.test(pureText)
  return { speaker, pureText, ignorable }
}

/**
 * 合成单个镜头：视频 + TTS对白音频 + 烧录字幕
 */
export async function composeStoryboard(storyboardId: number, userId?: number): Promise<string> {
  const [sb] = db.select().from(schema.storyboards).where(eq(schema.storyboards.id, storyboardId)).all()
  if (!sb) throw new Error(`Storyboard ${storyboardId} not found`)
  if (!sb.videoUrl) throw new Error(`Storyboard ${storyboardId} has no video`)
  db.update(schema.storyboards)
    .set({ status: 'compose_processing', composedVideoUrl: null, updatedAt: now() })
    .where(eq(schema.storyboards.id, storyboardId))
    .run()

  logTaskStart('ComposeTask', 'storyboard-compose', {
    storyboardId,
    storyboardNumber: sb.storyboardNumber,
    episodeId: sb.episodeId,
  })

  const videoPath = toAbsPath(sb.videoUrl)
  let audioPath: string | null = null
  let subtitlePath: string | null = null
  const parsedDialogue = parseDialogueForTTS(sb.dialogue)

  // 视频用 Seedance/happyhorse 生成（generate_audio=false，视频是静音的），不再依赖视频自带人声。
  // 因此所有真实台词（角色 + 旁白）都要生成 TTS 配音；只跳过「环境音/无对白」这类 ignorable 行。
  // （历史背景：早期用 Veo 时只给旁白配 TTS，靠 Veo 出人物口型音，现已不适用。）
  const shouldUseTTS = !parsedDialogue.ignorable

  // 1. 生成 TTS 音频（所有台词都配音）
  try {
    if (shouldUseTTS) {
      if (sb.ttsAudioUrl) {
        const existingAudioPath = toAbsPath(sb.ttsAudioUrl)
        if (fs.existsSync(existingAudioPath)) {
          audioPath = existingAudioPath
        }
      }

      if (!audioPath) {
        const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, sb.episodeId)).all()
        // Map character → OpenAI voice (deterministic, per-character consistent)
        const voiceId = pickVoiceForCharacter({
          characterName: parsedDialogue.speaker,
          dramaId: ep?.dramaId,
          fallback: 'sage',
        })
        logTaskProgress('ComposeTask', 'voice-picked', {
          storyboardId, speaker: parsedDialogue.speaker, voice: voiceId,
        })

        const pureDialogue = parsedDialogue.pureText
        if (pureDialogue) {
          const emotion = buildTTSInstruction(
            { atmosphere: sb.atmosphere, action: sb.action, description: sb.description },
            pureDialogue,
            parsedDialogue.speaker,
          )
          logTaskProgress('ComposeTask', 'generate-inline-tts', { storyboardId, voiceId, emotion, textPreview: pureDialogue.slice(0, 40) })
          const ttsPath = await generateTTS({ text: pureDialogue, voice: voiceId, emotion, configId: ep?.audioConfigId ?? undefined, userId })
          audioPath = toAbsPath(ttsPath)
          db.update(schema.storyboards).set({ ttsAudioUrl: ttsPath, updatedAt: now() })
            .where(eq(schema.storyboards.id, storyboardId)).run()
        }
      }
    }

    // 2. 生成字幕文件（SRT）
    if (!parsedDialogue.ignorable) {
      const srtDir = path.join(STORAGE_ROOT, 'subtitles')
      fs.mkdirSync(srtDir, { recursive: true })
      const srtFilename = `${uuid()}.srt`
      subtitlePath = path.join(srtDir, srtFilename)

      const duration = sb.duration || 10
      const pureText = parsedDialogue.pureText
      const srtContent = `1\n00:00:00,500 --> 00:00:${String(Math.min(duration - 1, 59)).padStart(2, '0')},000\n${pureText}\n`
      fs.writeFileSync(subtitlePath, srtContent, 'utf-8')

      const srtRelative = `static/subtitles/${srtFilename}`
      db.update(schema.storyboards).set({ subtitleUrl: srtRelative, updatedAt: now() })
        .where(eq(schema.storyboards.id, storyboardId)).run()
    }

    // 3. FFmpeg 合成
    const outputDir = path.join(STORAGE_ROOT, 'composed')
    fs.mkdirSync(outputDir, { recursive: true })
    const outputFilename = `${uuid()}.mp4`
    const outputPath = path.join(outputDir, outputFilename)

    // 全局串行 + 限线程，避免容器里多 ffmpeg/超多线程导致 pthread_create 失败 / OOM。
    await runFfmpegExclusive(() => new Promise<void>((resolve, reject) => {
      let cmd = ffmpeg(videoPath)
      if (audioPath) {
        cmd = cmd.input(audioPath)
      } else {
        // 无对白镜头：补一条静音音轨，保证每个合成片段都是一致的「视频+音频」流结构。
        // 否则拼接（concat demuxer 要求各片段流结构完全一致）会丢镜头、丢声音。
        cmd = cmd.input('anullsrc=channel_layout=stereo:sample_rate=48000').inputOptions(['-f', 'lavfi'])
      }

      // Build a single complexFilter graph that does both subtitle burn-in (video side)
      // and audio mixing (audio side) — mixing videoFilter + complexFilter doesn't work
      // in fluent-ffmpeg.
      const hasSubs = subtitlePath && supportsSubtitleFilter()
      const filterParts: string[] = []
      let videoOutLabel = '0:v'

      if (hasSubs && subtitlePath) {
        const escapedPath = subtitlePath
          .replace(/\\/g, '/')
          .replace(/:/g, '\\:')
          .replace(/'/g, "\\'")
        const forceStyle = 'FontSize=20\\,PrimaryColour=&HFFFFFF&\\,OutlineColour=&H000000&\\,Outline=2'
        filterParts.push(`[0:v]subtitles=filename='${escapedPath}':force_style='${forceStyle}'[vout]`)
        videoOutLabel = '[vout]'
      } else if (subtitlePath) {
        logTaskProgress('ComposeTask', 'subtitle-filter-unavailable', { storyboardId, subtitlePath })
      }

      // 音频：把 input 1（TTS 对白 或 静音垫底）用 apad 补静音到不短于视频，再配合 -shortest 对齐视频时长。
      // 关键：避免「短台词镜头被 -shortest 截成台词长度」——那会让镜头一闪而过、看着像被拼接掉了。
      filterParts.push('[1:a]apad[aout]')

      cmd = cmd.complexFilter(filterParts.join(';'))

      // -threads/-filter_threads 限制：ffmpeg 默认按宿主 CPU 数（共享机可能几十核）开线程，
      // 会撞容器线程上限 → pthread_create failed。这里压到 2。
      // ultrafast：关掉 libx264 的前瞻/B帧缓冲，内存占用大幅下降（容器内存有限，防 OOM SIGKILL）。
      const outputOptions = ['-threads', '2', '-filter_complex_threads', '1', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23']
      // map video
      outputOptions.push('-map', videoOutLabel)
      // 音频统一来自 [aout]，统一编码参数 aac/48k/stereo，保证所有合成片段流结构一致 →
      // 拼接不丢镜头、不丢声；-shortest 让输出对齐到（更短的）视频时长，音频不足处由 apad 补静音。
      outputOptions.push('-map', '[aout]', '-c:a', 'aac', '-ar', '48000', '-ac', '2', '-b:a', '192k', '-shortest')

      cmd.outputOptions(outputOptions)
        .output(outputPath)
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .run()
    }))

    const composedRelative = `static/composed/${outputFilename}`
    db.update(schema.storyboards).set({ composedVideoUrl: composedRelative, status: 'compose_completed', updatedAt: now() })
      .where(eq(schema.storyboards.id, storyboardId)).run()

    logTaskSuccess('ComposeTask', 'storyboard-compose', {
      storyboardId,
      storyboardNumber: sb.storyboardNumber,
      output: composedRelative,
    })
    return composedRelative
  } catch (err) {
    db.update(schema.storyboards)
      .set({ status: 'compose_failed', composedVideoUrl: null, updatedAt: now() })
      .where(eq(schema.storyboards.id, storyboardId))
      .run()
    throw err
  }
}
