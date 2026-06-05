/**
 * FFmpeg 多镜头拼接 — 将所有合成后的镜头视频拼接为一集
 */
import ffmpeg from 'fluent-ffmpeg'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import os from 'os'
import { v4 as uuid } from 'uuid'
import { db, schema } from '../db/index.js'
import { eq } from 'drizzle-orm'
import { now } from '../utils/response.js'
import { logTaskError, logTaskStart, logTaskSuccess, logTaskProgress } from '../utils/task-logger.js'
import { runFfmpegExclusive } from './ffmpeg-lock.js'
import { ensureEpisodeBgm } from './bgm-music.js'

// @ts-ignore
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg'
// @ts-ignore
import ffprobeInstaller from '@ffprobe-installer/ffprobe'

// Resolve ffmpeg binary path (same approach as ffmpeg-compose.ts)
{
  const home = os.homedir()
  const ffmpegCandidates = [
    process.env.FFMPEG_PATH,
    (ffmpegInstaller as any)?.path,
    `${home}/anaconda3/bin/ffmpeg`,
    `${home}/miniconda3/bin/ffmpeg`,
    '/opt/homebrew/bin/ffmpeg',
    '/usr/local/bin/ffmpeg',
    '/usr/bin/ffmpeg',
  ].filter(Boolean) as string[]
  for (const p of ffmpegCandidates) {
    try { if (fs.statSync(p).isFile()) { ffmpeg.setFfmpegPath(p); break } } catch {}
  }
  const ffprobeCandidates = [
    process.env.FFPROBE_PATH,
    (ffprobeInstaller as any)?.path,
    `${home}/anaconda3/bin/ffprobe`,
    `${home}/miniconda3/bin/ffprobe`,
    '/opt/homebrew/bin/ffprobe',
    '/usr/local/bin/ffprobe',
    '/usr/bin/ffprobe',
  ].filter(Boolean) as string[]
  for (const p of ffprobeCandidates) {
    try { if (fs.statSync(p).isFile()) { ffmpeg.setFfprobePath(p); break } } catch {}
  }
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const STORAGE_ROOT = process.env.STORAGE_PATH || path.resolve(__dirname, '../../../data/static')
const DATA_ROOT = path.resolve(__dirname, '../../../data')

function toAbsPath(relativePath: string): string {
  if (path.isAbsolute(relativePath)) return relativePath
  if (relativePath.startsWith('static/')) return path.join(DATA_ROOT, relativePath)
  return path.join(STORAGE_ROOT, relativePath)
}

/**
 * 拼接一集的所有合成镜头视频
 */
export async function mergeEpisodeVideos(episodeId: number, dramaId: number): Promise<number> {
  const storyboards = db.select().from(schema.storyboards)
    .where(eq(schema.storyboards.episodeId, episodeId))
    .orderBy(schema.storyboards.storyboardNumber)
    .all()

  const composedStoryboards = storyboards.filter(sb => !!sb.composedVideoUrl)
  if (composedStoryboards.length !== storyboards.length) {
    throw new Error(`Only composed storyboards can be merged (${composedStoryboards.length}/${storyboards.length} ready)`)
  }
  const videos = composedStoryboards
    .map(sb => sb.composedVideoUrl)
    .filter(Boolean) as string[]

  if (videos.length === 0) throw new Error('No videos to merge')

  logTaskStart('MergeTask', 'episode-merge', { episodeId, dramaId, clips: videos.length })

  // 创建 merge 记录
  const ts = now()
  const res = db.insert(schema.videoMerges).values({
    episodeId,
    dramaId,
    title: `Episode ${episodeId} Merge`,
    provider: 'ffmpeg',
    model: 'ffmpeg-concat-h264-aac',
    status: 'processing',
    scenes: JSON.stringify(videos),
    createdAt: ts,
  }).run()
  const mergeId = Number(res.lastInsertRowid)

  // 异步执行
  doMerge(mergeId, episodeId, videos).catch(err => {
    logTaskError('MergeTask', 'episode-merge', { mergeId, episodeId, error: err.message })
    console.error(`[Merge] Failed:`, err)
    db.update(schema.videoMerges)
      .set({ status: 'failed', errorMsg: err.message })
      .where(eq(schema.videoMerges.id, mergeId)).run()
  })

  return mergeId
}

async function doMerge(mergeId: number, episodeId: number, videos: string[]) {
  // 生成 concat 列表文件
  const listDir = path.join(STORAGE_ROOT, 'temp')
  fs.mkdirSync(listDir, { recursive: true })
  const listPath = path.join(listDir, `${uuid()}.txt`)

  const listContent = videos
    .map(v => `file '${toAbsPath(v)}'`)
    .join('\n')
  fs.writeFileSync(listPath, listContent, 'utf-8')

  // 输出文件
  const outputDir = path.join(STORAGE_ROOT, 'merged')
  fs.mkdirSync(outputDir, { recursive: true })
  const outputFilename = `${uuid()}.mp4`
  const outputPath = path.join(outputDir, outputFilename)

  // BGM：拼接前确保整集有背景音乐（按剧情情绪生成、缓存到 episode.bgmUrl）。
  // 失败返回 null → 走「无 BGM」分支，绝不阻断成片（BGM 是增强项）。
  const bgmRel = await ensureEpisodeBgm(episodeId)
  const bgmAbs = bgmRel ? toAbsPath(bgmRel) : null

  // 整集时长（各镜头时长求和）——仅在要混 BGM 时计算，用于 BGM 淡出定位。
  let videoSec = 0
  if (bgmAbs) {
    const durs = await Promise.all(videos.map(v => probeDurationPrecise(toAbsPath(v))))
    videoSec = durs.reduce((a, b) => a + b, 0)
    logTaskStart('MergeTask', 'bgm-mix', { episodeId, bgm: bgmRel, videoSec: Number(videoSec.toFixed(2)) })
  }

  // 全局串行 + 限线程，避免与合成的 ffmpeg 并发把容器资源打满（pthread_create/OOM）。
  const runMergeFfmpeg = (useBgm: boolean) => runFfmpegExclusive(() => new Promise<void>((resolve, reject) => {
    const cmd = ffmpeg()
      .input(listPath)
      .inputOptions(['-f', 'concat', '-safe', '0'])

    if (useBgm && bgmAbs && videoSec > 0) {
      const fadeOutStart = Math.max(0, videoSec - 2)
      cmd
        .input(bgmAbs)
        // 循环 BGM 并截到整集时长（-t 上界，杜绝无限输入把 ffmpeg 缓冲打爆 → OOM）
        .inputOptions(['-stream_loop', '-1', '-t', videoSec.toFixed(3)])
        .complexFilter([
          // 用「音量补偿」代替 amix normalize=0（后者要 ffmpeg≥4.4，容器老版本会 "Option not found"）：
          // amix 默认按输入数(2)各 ×1/2 → 对白预乘 2 还原全量、BGM 预乘 0.44 → 最终 0.22 垫底。
          `[1:a]volume=0.44,afade=t=in:d=2,afade=t=out:st=${fadeOutStart.toFixed(2)}:d=2[bg]`,
          `[0:a]volume=2.0[dia]`,
          `[dia][bg]amix=inputs=2:duration=first:dropout_transition=3[aout]`,
        ])
        .outputOptions([
          '-threads', '2',
          '-fflags', '+genpts',
          '-map', '0:v',
          '-map', '[aout]',
          '-c:v', 'libx264',
          '-preset', 'ultrafast',
          '-crf', '23',
          '-c:a', 'aac',
          '-ar', '48000',
          '-b:a', '192k',
          '-movflags', '+faststart',
          '-shortest',
        ])
    } else {
      cmd.outputOptions([
        '-threads', '2',
        '-fflags', '+genpts',
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', '23',
        '-c:a', 'aac',
        '-ar', '48000',
        '-b:a', '192k',
        '-movflags', '+faststart',
      ])
    }

    cmd
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .run()
  }))

  try {
    await runMergeFfmpeg(!!(bgmAbs && videoSec > 0))
  } catch (mergeErr: any) {
    if (bgmAbs && videoSec > 0) {
      // BGM 混音失败（多半是容器 ffmpeg 版本问题）→ 退回无 BGM 的纯拼接，绝不因 BGM 阻断成片。
      logTaskProgress('MergeTask', 'bgm-mix-failed-retry-plain', { episodeId, error: String(mergeErr?.message || mergeErr).slice(0, 200) })
      await runMergeFfmpeg(false)
    } else {
      throw mergeErr
    }
  }

  // 清理临时文件
  fs.unlinkSync(listPath)

  // 获取时长
  const duration = await getVideoDuration(outputPath)

  const mergedRelative = `static/merged/${outputFilename}`

  // 更新 merge 记录
  db.update(schema.videoMerges)
    .set({ status: 'completed', mergedUrl: mergedRelative, duration, completedAt: now() })
    .where(eq(schema.videoMerges.id, mergeId)).run()

  // 更新 episode
  db.update(schema.episodes)
    .set({ videoUrl: mergedRelative, updatedAt: now() })
    .where(eq(schema.episodes.id, episodeId)).run()

  logTaskSuccess('MergeTask', 'episode-merge', { mergeId, episodeId, output: mergedRelative, duration, clips: videos.length })
}

function getVideoDuration(filePath: string): Promise<number> {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) { resolve(0); return }
      resolve(Math.round(metadata.format.duration || 0))
    })
  })
}

// 不取整的时长（秒）——给 BGM 淡出/截断定位用
function probeDurationPrecise(filePath: string): Promise<number> {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      resolve(err ? 0 : (metadata?.format?.duration || 0))
    })
  })
}
