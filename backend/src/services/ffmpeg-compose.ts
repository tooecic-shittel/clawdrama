/**
 * FFmpeg 单镜头合成 — 视频 + TTS音频 + 烧录字幕
 */
import ffmpeg from 'fluent-ffmpeg'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
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
const IGNORE_TTS_SPEAKERS = /^(环境音|环境声|音效|效果音|sfx|sound ?effect|bgm|背景音|背景音乐|ambient)$/i
const IGNORE_TTS_TEXT = /^(无|无对白|无台词|无旁白|无需配音|无需对白|none|null|n\/a|na|环境音|环境声|音效|效果音|纯音效|纯环境音|只有环境音|仅环境音|背景音|背景音乐|bgm|sfx|ambient)$/i

function toAbsPath(relativePath: string): string {
  if (path.isAbsolute(relativePath)) return relativePath
  if (relativePath.startsWith('static/')) return path.join(DATA_ROOT, relativePath)
  return path.join(STORAGE_ROOT, relativePath)
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
        // -t 60 把 anullsrc 限定成有限源（够长，-shortest 会按视频时长截）；
        // 无限源配 -c:v copy + -shortest 收不了尾，必须限定。
        cmd = cmd.input('anullsrc=channel_layout=stereo:sample_rate=48000').inputOptions(['-f', 'lavfi', '-t', '60'])
      }

      // 视频必须重编码（不能 -c:v copy）：Seedance 等真实 MP4 带 edit list，流拷贝会保留偏移，
      // 跨镜头拼接后音画累积错位。重编码会把 edit list 解码应用、时间戳归零 → 一定同步。
      // ultrafast 关掉前瞻/B帧，内存/耗时已是 libx264 最低档；不烧字幕（SRT 仍生成保存）。
      // 音频：[1:a]apad 补到不短于视频，-shortest 对齐视频时长（短台词不截短）；统一 aac/48k/stereo。
      cmd = cmd.complexFilter('[1:a]apad[aout]')

      const outputOptions = [
        '-threads', '2',
        '-map', '0:v', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23',
        '-map', '[aout]', '-c:a', 'aac', '-ar', '48000', '-ac', '2', '-b:a', '192k',
        '-shortest',
      ]

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
