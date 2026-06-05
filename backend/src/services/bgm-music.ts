/**
 * BGM 配乐生成 — 用 MiniMax music-2.6 按剧情情绪生成「纯音乐」背景乐，并「按情绪段落上时间轴」摆放。
 *
 * 成熟 AI 短剧/漫剧工作流的标准做法：配乐跟剧情情绪走、AI 生成贴合氛围的纯器乐、按场景/段落铺在对应画面下。
 * （参考：知乎 AI 漫剧制作攻略、七牛云指南 ——「用 AI(Mureka/MiniMax) 生成配乐让风格更贴合剧情」）
 *
 * 分段策略（解决「不合时宜的 BGM 出现在错误画面」）：
 *   1) 优先按 sceneId 分段（场景 = 天然情绪段落）；
 *   2) sceneId 没数据 → 退回「按情绪文字变化」启发式；
 *   3) 单一情绪 → 退回整集一首连续曲（不瞎切）。
 * 每段用「自己这段镜头的 bgm_prompt/atmosphere」生成一段曲，按时间轴 adelay 摆在对应画面下、段间淡入淡出。
 *
 * 全程优雅兜底：任何一步失败都退回单曲或无 BGM，绝不弄坏成片。复用 TTS 同一把 MiniMax key、零版权风险。
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { v4 as uuid } from 'uuid'
import ffmpeg from 'fluent-ffmpeg'
import { db, schema } from '../db/index.js'
import { eq } from 'drizzle-orm'
import { getActiveAudioConfigs } from './ai.js'
import { joinProviderUrl } from './adapters/url.js'
import { now } from '../utils/response.js'
import { logTaskProgress, logTaskWarn, logTaskError, logTaskStart } from '../utils/task-logger.js'
import { runFfmpegExclusive } from './ffmpeg-lock.js'

// @ts-ignore
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg'
// @ts-ignore
import ffprobeInstaller from '@ffprobe-installer/ffprobe'

// 解析 ffmpeg/ffprobe 二进制（与 ffmpeg-merge 一致）
{
  const ffmpegCandidates = [process.env.FFMPEG_PATH, (ffmpegInstaller as any)?.path, '/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg', '/usr/bin/ffmpeg'].filter(Boolean) as string[]
  for (const p of ffmpegCandidates) { try { if (fs.statSync(p).isFile()) { ffmpeg.setFfmpegPath(p); break } } catch {} }
  const ffprobeCandidates = [process.env.FFPROBE_PATH, (ffprobeInstaller as any)?.path, '/opt/homebrew/bin/ffprobe', '/usr/local/bin/ffprobe', '/usr/bin/ffprobe'].filter(Boolean) as string[]
  for (const p of ffprobeCandidates) { try { if (fs.statSync(p).isFile()) { ffmpeg.setFfprobePath(p); break } } catch {} }
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const STORAGE_ROOT = process.env.STORAGE_PATH || path.resolve(__dirname, '../../../data/static')
const DATA_ROOT = path.resolve(__dirname, '../../../data')

// 免费档已实测可用、零成本；要更高音质/并发可换 'music-2.6'（付费）。
const BGM_MODEL = process.env.MINIMAX_BGM_MODEL || 'music-2.6-free'
const MAX_BEATS = 3        // 一集最多分几段（= 最多几次音乐生成，控成本/限流）
const MIN_BEAT_SEC = 18    // 情绪启发式分段时，单段最短时长（避免切太碎）

interface Shot { mood: string; durSec: number; sceneId: number | null }
interface Beat { moods: string[]; durSec: number; startSec: number }

function toAbsPath(relativePath: string): string {
  if (path.isAbsolute(relativePath)) return relativePath
  if (relativePath.startsWith('static/')) return path.join(DATA_ROOT, relativePath)
  return path.join(STORAGE_ROOT, relativePath)
}

function probeDuration(filePath: string): Promise<number> {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err, md) => resolve(err ? 0 : (md?.format?.duration || 0)))
  })
}

/** 把一段镜头的情绪提示聚合成一句「纯器乐配乐」prompt */
function composeMoodPrompt(genre: string | null, moods: string[]): string {
  const uniq = Array.from(new Set(moods.map(m => m.trim()).filter(Boolean))).slice(0, 6)
  const parts = ['影视级纯器乐配乐，无人声']
  if (genre) parts.push(`题材：${genre}`)
  if (uniq.length) parts.push(`情绪氛围：${uniq.join('、')}`)
  parts.push('连续铺底、情绪统一、电影质感，避免突兀的节奏切换')
  return parts.join('。').slice(0, 2000)
}

/** 整集（单段）提示词 —— 给「单一情绪退回一首」用 */
export function buildEpisodeBgmPrompt(episodeId: number): string {
  const ep = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()[0]
  const drama = ep ? db.select().from(schema.dramas).where(eq(schema.dramas.id, ep.dramaId)).all()[0] : null
  const sbs = db.select().from(schema.storyboards).where(eq(schema.storyboards.episodeId, episodeId)).all()
  const moods = sbs.flatMap(s => [s.bgmPrompt, s.atmosphere]).filter((x): x is string => !!x)
  return composeMoodPrompt(drama?.genre ?? null, moods)
}

/** 按 sceneId 把连续镜头分组（场景 = 天然情绪段落）；sceneId 全空 → 返回 null（交给情绪启发式） */
function segmentByScene(shots: Shot[]): Shot[][] | null {
  if (shots.every(s => s.sceneId == null)) return null
  const groups: Shot[][] = []
  let curKey: number | null | undefined = undefined
  for (const s of shots) {
    if (s.sceneId !== curKey) { groups.push([s]); curKey = s.sceneId }
    else groups[groups.length - 1].push(s)
  }
  return groups.length > 1 ? groups : null
}

/** 按「情绪文字变化」启发式分段：情绪明显变了且当前段够长才切；全程同一情绪 → null */
function segmentByMood(shots: Shot[]): Shot[][] | null {
  const distinct = new Set(shots.map(s => s.mood).filter(Boolean))
  if (distinct.size <= 1) return null // 单一情绪不切
  const groups: Shot[][] = [[]]
  let curMood = ''
  let curDur = 0
  for (const s of shots) {
    const cur = groups[groups.length - 1]
    const changed = s.mood && curMood && s.mood !== curMood
    if (cur.length > 0 && changed && curDur >= MIN_BEAT_SEC && groups.length < MAX_BEATS) {
      groups.push([s]); curMood = s.mood; curDur = s.durSec
    } else {
      cur.push(s); curDur += s.durSec
      if (s.mood) curMood = s.mood
    }
  }
  return groups.length > 1 ? groups : null
}

/** 若分组超过 MAX_BEATS，合并「相邻时长最小」的两组，直到 <= MAX_BEATS */
function capBeats(groups: Shot[][]): Shot[][] {
  const g = groups.map(x => x.slice())
  while (g.length > MAX_BEATS) {
    let minI = 0, minSum = Infinity
    for (let i = 0; i < g.length - 1; i++) {
      const sum = g[i].reduce((a, s) => a + s.durSec, 0) + g[i + 1].reduce((a, s) => a + s.durSec, 0)
      if (sum < minSum) { minSum = sum; minI = i }
    }
    g.splice(minI, 2, [...g[minI], ...g[minI + 1]])
  }
  return g
}

/** 镜头序列 → 情绪段落（带累计起始时间） */
function segmentBeats(shots: Shot[]): Beat[] {
  let groups = segmentByScene(shots) || segmentByMood(shots)
  if (!groups) return [{ moods: shots.flatMap(s => [s.mood]).filter(Boolean), durSec: shots.reduce((a, s) => a + s.durSec, 0), startSec: 0 }]
  groups = capBeats(groups)
  const beats: Beat[] = []
  let start = 0
  for (const grp of groups) {
    const durSec = grp.reduce((a, s) => a + s.durSec, 0)
    beats.push({ moods: grp.map(s => s.mood).filter(Boolean), durSec, startSec: start })
    start += durSec
  }
  return beats
}

/** 调 MiniMax music_generation 生成纯音乐，下载落地，返回相对路径 static/bgm/xxx.mp3 */
export async function generateBgm(prompt: string): Promise<string> {
  const config = getActiveAudioConfigs().find(c => (c.provider || '').toLowerCase() === 'minimax')
  if (!config) throw new Error('BGM 生成需要启用中的 MiniMax 音频配置')

  const url = joinProviderUrl(config.baseUrl, '/v1', '/music_generation')
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: BGM_MODEL,
      prompt: prompt.slice(0, 2000),
      is_instrumental: true,
      output_format: 'url',
      audio_setting: { sample_rate: 44100, bitrate: 128000, format: 'mp3' },
    }),
  })
  const result: any = await resp.json()
  if (result?.base_resp?.status_code !== 0) {
    throw new Error(`MiniMax music_generation 失败: ${result?.base_resp?.status_msg || resp.status}`)
  }
  const audioUrl: string = result?.data?.audio
  if (!audioUrl || !/^https?:\/\//.test(audioUrl)) throw new Error('MiniMax music_generation 未返回音频链接')

  const fileResp = await fetch(audioUrl)
  if (!fileResp.ok) throw new Error(`下载 BGM 失败: HTTP ${fileResp.status}`)
  const buf = Buffer.from(await fileResp.arrayBuffer())

  const dir = path.join(STORAGE_ROOT, 'bgm')
  fs.mkdirSync(dir, { recursive: true })
  const filename = `${uuid()}.mp3`
  fs.writeFileSync(path.join(dir, filename), buf)
  return `static/bgm/${filename}`
}

/** 把多段曲子按时间轴摆到一条「整集长度」的音轨上（adelay 定位 + 段内淡入淡出），输出一个 m4a。 */
function assembleScore(
  cues: { fileAbs: string; startSec: number; durSec: number }[],
  episodeDur: number,
  outAbs: string,
): Promise<void> {
  return runFfmpegExclusive(() => new Promise<void>((resolve, reject) => {
    const cmd = ffmpeg()
      .input('anullsrc=r=44100:cl=stereo').inputFormat('lavfi').inputOptions(['-t', episodeDur.toFixed(3)])
    cues.forEach(c => cmd.input(c.fileAbs))

    const filters: string[] = []
    const labels: string[] = ['[0:a]']
    cues.forEach((c, i) => {
      const idx = i + 1
      const fadeOut = Math.max(0, c.durSec - 1.5)
      const delayMs = Math.round(c.startSec * 1000)
      filters.push(
        `[${idx}:a]atrim=0:${c.durSec.toFixed(3)},asetpts=PTS-STARTPTS,` +
        `afade=t=in:d=1.5,afade=t=out:st=${fadeOut.toFixed(2)}:d=1.5,` +
        `adelay=${delayMs}|${delayMs}[b${idx}]`
      )
      labels.push(`[b${idx}]`)
    })
    // normalize=0 保各段原始响度（统一压低留到拼接那步做）；duration=first = 静音底=整集长度
    filters.push(`${labels.join('')}amix=inputs=${cues.length + 1}:duration=first:normalize=0[out]`)

    cmd.complexFilter(filters)
      .outputOptions(['-map', '[out]', '-threads', '2', '-c:a', 'aac', '-b:a', '192k'])
      .output(outAbs)
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .run()
  }))
}

/**
 * 确保整集有 BGM：已有且文件在 → 复用；否则按情绪段落生成并缓存到 episode.bgmUrl。
 * 失败不抛（BGM 是增强项）——返回 null，调用方走「无 BGM」分支。
 */
export async function ensureEpisodeBgm(episodeId: number): Promise<string | null> {
  const ep = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()[0]
  if (!ep) return null
  if (ep.bgmUrl) {
    try { if (fs.existsSync(toAbsPath(ep.bgmUrl))) return ep.bgmUrl } catch {}
  }

  try {
    const drama = db.select().from(schema.dramas).where(eq(schema.dramas.id, ep.dramaId)).all()[0]
    const sbs = db.select().from(schema.storyboards)
      .where(eq(schema.storyboards.episodeId, episodeId))
      .orderBy(schema.storyboards.storyboardNumber).all()

    // 只算进了成片时间轴的镜头（已合成的），与拼接顺序一致 → 段落起始时间才对得上
    const shots: Shot[] = []
    for (const sb of sbs) {
      if (!sb.composedVideoUrl) continue
      const durSec = await probeDuration(toAbsPath(sb.composedVideoUrl))
      if (durSec > 0) shots.push({ mood: (sb.bgmPrompt || sb.atmosphere || '').trim(), durSec, sceneId: sb.sceneId ?? null })
    }
    if (shots.length === 0) return null

    const beats = segmentBeats(shots)
    const episodeDur = shots.reduce((a, s) => a + s.durSec, 0)

    // 单段 → 整集一首连续曲（与旧版一致，不瞎切）
    if (beats.length <= 1) {
      const rel = await generateBgm(buildEpisodeBgmPrompt(episodeId))
      db.update(schema.episodes).set({ bgmUrl: rel, updatedAt: now() }).where(eq(schema.episodes.id, episodeId)).run()
      return rel
    }

    // 多段 → 逐段生成（顺序生成，避免免费档限流），失败的段跳过（留白）
    logTaskStart('BGM', 'scored', { episodeId, beats: beats.length, episodeDur: Number(episodeDur.toFixed(1)) })
    const cues: { fileAbs: string; startSec: number; durSec: number }[] = []
    for (const beat of beats) {
      try {
        const rel = await generateBgm(composeMoodPrompt(drama?.genre ?? null, beat.moods))
        cues.push({ fileAbs: toAbsPath(rel), startSec: beat.startSec, durSec: beat.durSec })
      } catch (e: any) {
        logTaskWarn('BGM', 'beat-gen-failed', { episodeId, startSec: beat.startSec, error: e?.message })
      }
    }
    if (cues.length === 0) return null

    // 组装到一条整集音轨
    const dir = path.join(STORAGE_ROOT, 'bgm')
    fs.mkdirSync(dir, { recursive: true })
    const outRel = `static/bgm/${uuid()}.m4a`
    try {
      await assembleScore(cues, episodeDur, toAbsPath(outRel))
      db.update(schema.episodes).set({ bgmUrl: outRel, updatedAt: now() }).where(eq(schema.episodes.id, episodeId)).run()
      logTaskProgress('BGM', 'scored-done', { episodeId, output: outRel, cues: cues.length })
      return outRel
    } catch (e: any) {
      // 组装失败 → 退回第一段当整集 BGM（有总比没有强）
      logTaskWarn('BGM', 'assemble-failed-fallback-single', { episodeId, error: e?.message })
      const firstRel = `static/bgm/${path.basename(cues[0].fileAbs)}`
      db.update(schema.episodes).set({ bgmUrl: firstRel, updatedAt: now() }).where(eq(schema.episodes.id, episodeId)).run()
      return firstRel
    }
  } catch (err: any) {
    logTaskError('BGM', 'ensure-failed', { episodeId, error: err?.message })
    return null
  }
}

export { toAbsPath as bgmToAbsPath }
