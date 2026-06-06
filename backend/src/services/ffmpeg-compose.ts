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
import { NATIVE_AUDIO_DIALOGUE, needsTtsVoiceover } from './prompt-enhance.js'
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

// 启动时打印容器实际用的 ffmpeg（路径 + 版本）——线上 "Option not found" 多半是这里的二进制/版本问题，便于根治。
try {
  const _v = execFileSync(_ffmpegBin || 'ffmpeg', ['-version']).toString().split('\n')[0]
  logTaskProgress('ComposeTask', 'ffmpeg-binary', { bin: _ffmpegBin || 'ffmpeg(PATH)', version: _v })
} catch (e: any) {
  logTaskProgress('ComposeTask', 'ffmpeg-binary-probe-failed', { bin: _ffmpegBin, error: String(e?.message || e).slice(0, 120) })
}

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

// 容器的 ffmpeg 是否带 libass（subtitles 滤镜）。缺则优雅跳过烧字幕，避免合成整体失败。
let subtitleFilterSupport: boolean | null = null
function supportsSubtitleFilter(): boolean {
  if (subtitleFilterSupport != null) return subtitleFilterSupport
  try {
    // 用已解析的二进制路径（容器里 ffmpeg 不在 PATH，写死 'ffmpeg' 会探测失败→永不烧字幕）
    const output = execFileSync(_ffmpegBin || 'ffmpeg', ['-hide_banner', '-filters'], { encoding: 'utf8' })
    subtitleFilterSupport = /\bsubtitles\b/.test(output)
  } catch {
    subtitleFilterSupport = false
  }
  return subtitleFilterSupport
}

/** 探测媒体时长（秒）。失败返回 0。 */
function getMediaDuration(filePath: string): Promise<number> {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err, meta) => {
      resolve(err ? 0 : (meta?.format?.duration || 0))
    })
  })
}

/** 秒 → SRT 时间戳 HH:MM:SS,mmm */
function srtTime(sec: number): string {
  const t = Math.max(0, sec)
  const h = Math.floor(t / 3600)
  const m = Math.floor((t % 3600) / 60)
  const s = Math.floor(t % 60)
  const ms = Math.round((t - Math.floor(t)) * 1000)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`
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

/** 视频里有没有真实音轨（audio 流）—— 判断 Seedance 是否自带了原生配音。 */
function videoHasAudioStream(filePath: string): Promise<boolean> {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err, md) => {
      if (err) { resolve(false); return }
      resolve((md?.streams || []).some((s: any) => s.codec_type === 'audio'))
    })
  })
}

/**
 * 合成单个镜头：视频 + TTS对白音频 + 烧录字幕
 */
export async function composeStoryboard(storyboardId: number, userId?: number, opts?: { includeNarration?: boolean }): Promise<string> {
  const [sb] = db.select().from(schema.storyboards).where(eq(schema.storyboards.id, storyboardId)).all()
  if (!sb) throw new Error(`Storyboard ${storyboardId} not found`)
  if (!sb.videoUrl) throw new Error(`Storyboard ${storyboardId} has no video`)
  const includeNarration = opts?.includeNarration !== false

  // 保留原生音轨：视频自带原生音轨、且这条「不需要补旁白配音」时直接透传（角色对白原生人声、环境音/音效统统保留），
  // 绝不贴 TTS / 垫静音盖掉它。「需要补旁白」= 旁白镜头 且 用户开了「加入旁白配音」。
  // 关掉旁白开关时，旁白镜头也走透传（保留原声、只是不加旁白），避免把原声一起静音。
  // 只有「需要补旁白」或静音视频才走下面 TTS 路径。（拼接那步会重编码修 edit list / A-V 同步并垫 BGM。）
  if (NATIVE_AUDIO_DIALOGUE && !(needsTtsVoiceover(sb.dialogue) && includeNarration) && await videoHasAudioStream(toAbsPath(sb.videoUrl))) {
    db.update(schema.storyboards)
      .set({ composedVideoUrl: sb.videoUrl, status: 'composed', updatedAt: now() })
      .where(eq(schema.storyboards.id, storyboardId)).run()
    logTaskProgress('ComposeTask', 'native-audio-passthrough', { storyboardId, video: sb.videoUrl })
    return sb.videoUrl
  }

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
  // 「加入旁白」开关：关掉时旁白镜头跳过 TTS（对白镜头不受影响），避免旁白比镜头长被截断，旁白交给剪辑器。
  const shouldUseTTS = !parsedDialogue.ignorable && (includeNarration || !needsTtsVoiceover(sb.dialogue))

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
          const ttsPath = await generateTTS({ text: pureDialogue, voice: voiceId, emotion, configId: null, userId })
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

      const videoDur = sb.duration || 10
      const pureText = parsedDialogue.pureText
      // 字幕跟着配音走：从 0.2s 起，到配音结束(+0.3s 缓冲)，夹在视频时长内。
      // 这样「台词显示时段 ≈ 配音说话时段」，不会念完了字幕还挂着、也不会念着没字幕。
      const startSec = 0.2
      let endSec = Math.max(1.5, videoDur - 0.3)
      if (audioPath) {
        const audioDur = await getMediaDuration(audioPath)
        if (audioDur > 0.3) endSec = Math.min(videoDur, audioDur + 0.3)
      }
      const srtContent = `1\n${srtTime(startSec)} --> ${srtTime(endSec)}\n${pureText}\n`
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

    // 探测真实视频时长：用来把音频精确补齐到视频长度（apad=whole_dur）。
    // 关键：不能用无限的 [1:a]apad —— 它会一直生成静音，配合烧字幕/重编码时缓冲堆积 → OOM（Cannot allocate memory）。
    const videoSec = (await getMediaDuration(videoPath)) || sb.duration || 10

    // 全局串行 + 限线程，避免容器里多 ffmpeg/超多线程导致 pthread_create 失败 / OOM。
    try {
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
      // ultrafast 关掉前瞻/B帧，内存/耗时已是 libx264 最低档。
      const filterParts: string[] = []
      const videoOutLabel = '0:v'
      // 不再把字幕烧进画面：字幕交给剪辑器（仍生成 SRT 文件、保留 subtitleUrl，可随素材给剪映/CapCut 导入）。
      // 原因：容器缺中文字体，烧字幕会把中文渲染成豆腐块 □。保持成片画面干净。
      // 音频：apad=whole_dur 把配音(或静音垫底)精确补齐到视频时长（有限、不缓冲爆内存），
      // 短台词不会被 -shortest 截短，整段时长=视频；统一 aac/48k/stereo 保证拼接流一致。
      filterParts.push(`[1:a]apad=whole_dur=${videoSec.toFixed(3)}[aout]`)
      cmd = cmd.complexFilter(filterParts.join(';'))

      const outputOptions = [
        '-threads', '2', '-filter_complex_threads', '1',
        '-map', videoOutLabel, '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23',
        '-map', '[aout]', '-c:a', 'aac', '-ar', '48000', '-ac', '2', '-b:a', '192k',
        '-shortest',
      ]

      cmd.outputOptions(outputOptions)
        .output(outputPath)
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .run()
    }))
    } catch (composeErr: any) {
      // 合成 ffmpeg 失败（多半是容器里解析到的 ffmpeg 跟本地 4.4 不是同一个、不支持某滤镜选项）
      // → 退回用原始视频。原始视频自带 Seedance 原生音轨（对白镜头本身就是对口型的好声音），
      //   绝不因为合成失败就卡死整条镜头。日志带上 _ffmpegBin 以便定位容器到底用的哪个 ffmpeg。
      logTaskProgress('ComposeTask', 'ffmpeg-failed-fallback-raw', {
        storyboardId, ffmpegBin: _ffmpegBin, error: String(composeErr?.message || composeErr).slice(0, 240),
      })
      db.update(schema.storyboards)
        .set({ composedVideoUrl: sb.videoUrl, status: 'compose_completed', updatedAt: now() })
        .where(eq(schema.storyboards.id, storyboardId)).run()
      return sb.videoUrl
    }

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
