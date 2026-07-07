/**
 * Prompt enhancement helpers — inject drama visual style + storyboard sound effects
 * into the prompt before sending to image/video generation models.
 */
import { db, schema } from '../db/index.js'
import { eq, and } from 'drizzle-orm'
import { MINIMAX_MALE_VOICES, MINIMAX_FEMALE_VOICES } from './minimax-voices.js'

// 原生音频对白（Seedance 自带配音+对口型）总开关。默认开 —— 实测视频本就自带对口型原生人声，
// 贴 TTS 反而盖掉它造成割裂。要回退旧的「静音视频 + TTS」流程：设环境变量 NATIVE_AUDIO_DIALOGUE=0。
export const NATIVE_AUDIO_DIALOGUE = process.env.NATIVE_AUDIO_DIALOGUE !== '0'

// 这些「说话人/文本」不是角色对白，不做原生口型注入（环境音/音效、以及旁白画外音→仍走 TTS）
const NA_IGNORE_SPEAKERS = /^(环境音|环境声|音效|效果音|sfx|sound ?effect|bgm|背景音|背景音乐|ambient)$/i
const NA_NARRATOR_SPEAKERS = /^(旁白|画外音|voice ?over|narrator|os|ob|内心|内心独白|心声|独白)$/i
const NA_IGNORE_TEXT = /^(无|无对白|无台词|无旁白|无需配音|无需对白|none|null|n\/a|na|环境音|环境声|音效|效果音|纯音效|纯环境音|只有环境音|仅环境音|背景音|背景音乐|bgm|sfx|ambient)$/i

function parseDialogueLite(dialogue?: string | null) {
  const raw = (dialogue || '').trim()
  if (!raw) return { speaker: '', pureText: '', onScreen: false }
  const m = raw.match(/^(.+?)[:：]/)
  const speaker = m ? m[1].replace(/[（(].+?[)）]/g, '').trim() : ''
  const pureText = raw.replace(/^.+?[:：]\s*/, '').replace(/[（(].+?[)）]/g, '').trim()
  // onScreen = 真·角色对白（排除空/环境音/旁白画外音）→ 才做原生口型
  const onScreen = !!pureText
    && !NA_IGNORE_TEXT.test(pureText)
    && !(speaker && (NA_IGNORE_SPEAKERS.test(speaker) || NA_NARRATOR_SPEAKERS.test(speaker)))
  return { speaker, pureText, onScreen }
}

/** 角色 → 一句「音色文字描述」（Seedance 靠它定声音）。确定性：同角色每次同描述 → 跨镜头声音一致。 */
function deriveVoiceDescription(speaker: string, dramaId: number | null): string {
  let gender: 'male' | 'female' | null = null
  let persona = ''
  try {
    if (speaker && dramaId) {
      const [ch] = db.select().from(schema.characters)
        .where(and(eq(schema.characters.dramaId, dramaId), eq(schema.characters.name, speaker))).all()
      if (ch) {
        const vs = ch.voiceStyle || ''
        // 1) 精选 catalog 命中最准
        if (MINIMAX_MALE_VOICES.includes(vs)) gender = 'male'
        else if (MINIMAX_FEMALE_VOICES.includes(vs)) gender = 'female'
        // 2) 否则看音色 id 名里的性别线索（catalog 外的 minimax 音色）
        else if (/girl|woman|lady|female|妹|姐|母|奶|婆|少女|女/i.test(vs)) gender = 'female'
        else if (/\b(man|gentleman|boy|male|brother|uncle)\b|哥|爷|叔|男/i.test(vs)) gender = 'male'
        persona = `${ch.personality || ''} ${ch.description || ''} ${ch.appearance || ''} ${ch.role || ''}`
      }
    }
  } catch {}
  if (!gender) {
    // 3) 角色文字兜底
    const t = `${persona} ${speaker}`
    if (/女|她|girl|female|小姐|女士|姑娘|妈|母|妹|姐/.test(t)) gender = 'female'
    else if (/男|他|boy|male|先生|大叔|哥|父|爷/.test(t)) gender = 'male'
    else gender = 'male' // 实在推不出 → 默认男声（确定性优先，宁可固定不乱跳；个别错的用户改音色即可）
  }
  // 人设微调（关键词命中才加，保持确定性）
  let tone = ''
  if (/成熟|沉稳|稳重|威严|霸总|总裁|老|大叔|父|帝王|将军/.test(persona)) tone = '成熟沉稳，'
  else if (/年轻|少年|少女|青春|学生|活泼|元气/.test(persona)) tone = '年轻清亮，'
  const base = gender === 'female' ? '自然亲和的女声' : '自然沉稳的男声'
  return `${tone}${base}`
}

/**
 * 镜头是否走「原生音频对白」路径（开关开 + 有真·角色对白）。
 * 供视频生成（决定 generate_audio）和合成（决定是否跳过 TTS）共用，保证三处判断一致。
 */
export function isNativeDialogueShot(sb: { dialogue?: string | null }): boolean {
  if (!NATIVE_AUDIO_DIALOGUE) return false
  return parseDialogueLite(sb.dialogue).onScreen
}

/**
 * 这条镜头是否需要 TTS「旁白配音」（旁白/画外音说话人 + 有实质文本）。
 * 只有这种才不保留视频原生音轨、走 TTS 补旁白；
 * 其余（角色对白 / 纯环境无对白镜头）都应保留视频自带的原生音轨，绝不被静音盖掉。
 */
export function needsTtsVoiceover(dialogue?: string | null): boolean {
  const raw = (dialogue || '').trim()
  if (!raw) return false
  const m = raw.match(/^(.+?)[:：]/)
  const speaker = m ? m[1].replace(/[（(].+?[)）]/g, '').trim() : ''
  const pureText = raw.replace(/^.+?[:：]\s*/, '').replace(/[（(].+?[)）]/g, '').trim()
  if (!pureText || NA_IGNORE_TEXT.test(pureText)) return false
  return !!(speaker && NA_NARRATOR_SPEAKERS.test(speaker))
}

const STYLE_PROMPTS: Record<string, string> = {
  realistic: '写实摄影风格，电影质感，自然光影，皮肤细节细腻',
  anime: '日系动漫风格，色彩鲜明，赛璐璐上色，表情生动，线条干净利落',
  ghibli: '吉卜力风格，柔和水彩背景，梦幻氛围，温暖色调',
  cinematic: '电影感画面，戏剧性光影，浅景深，专业电影调色',
  mythic_chinese: '东方玄幻神话美学，山海经异兽与上古神话气质，古城屋脊、青铜纹样、玉石法器、墨色衣袂，冷月雨夜与云雾山海，电影级国风奇幻光影',
  comic: '美式漫画插画，粗黑描边，动态构图，鲜艳波普色彩',
  watercolor: '水彩画风格，柔和笔触，温柔渐变，手绘艺术感',
  '3d': '3D CGI 动画渲染，皮克斯/梦工厂风格，柔和全局光，次表面散射，精致风格化材质',
  ink: '中国水墨画风格，书法笔触，大量留白，淡雅墨色，古风武侠美学',
  painterly: '半写实厚涂 CG 插画，笔触质感丰富，戏剧性轮廓光，精细人物作画',
  cyberpunk: '赛博朋克美学，霓虹浸染，高科技低生活，雨夜反光街道，全息投影，青品红高饱和',
  webtoon: '韩系条漫风格，干净利落线稿，柔和赛璐璐上色，明亮现代配色',
  oil: '油画风格，可见厚涂笔触，古典浓郁色彩，古典明暗光影，美术质感',
}

/** Look up the drama and return its visual style descriptor (or empty string). */
export function getStyleSuffix(dramaId: number | null | undefined): string {
  if (!dramaId) return ''
  try {
    const [drama] = db.select().from(schema.dramas).where(eq(schema.dramas.id, dramaId)).all()
    if (!drama?.style) return ''
    return STYLE_PROMPTS[drama.style] || ''
  } catch {
    return ''
  }
}

/**
 * Resolve drama id given various locators (storyboardId/episodeId/sceneId/characterId).
 * Image gen records often have storyboardId but no dramaId.
 */
export function resolveDramaId(opts: {
  dramaId?: number | null
  storyboardId?: number | null
  episodeId?: number | null
  sceneId?: number | null
  characterId?: number | null
}): number | null {
  if (opts.dramaId) return opts.dramaId
  try {
    if (opts.storyboardId) {
      const [sb] = db.select().from(schema.storyboards).where(eq(schema.storyboards.id, opts.storyboardId)).all()
      if (sb?.episodeId) {
        const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, sb.episodeId)).all()
        return ep?.dramaId ?? null
      }
    }
    if (opts.episodeId) {
      const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, opts.episodeId)).all()
      return ep?.dramaId ?? null
    }
    if (opts.sceneId) {
      const [scene] = db.select().from(schema.scenes).where(eq(schema.scenes.id, opts.sceneId)).all()
      return scene?.dramaId ?? null
    }
    if (opts.characterId) {
      const [ch] = db.select().from(schema.characters).where(eq(schema.characters.id, opts.characterId)).all()
      return ch?.dramaId ?? null
    }
  } catch {}
  return null
}

/**
 * Enhance an image prompt with the drama's visual style.
 */
export function enhanceImagePrompt(prompt: string, dramaId: number | null | undefined): string {
  const styleSuffix = getStyleSuffix(dramaId)
  if (!styleSuffix) return prompt
  return `${prompt}。风格：${styleSuffix}。`
}

/**
 * Add a hint to a frame prompt indicating it should visually continue from the
 * previous shot (for match-cut continuity). Only used when match-cut refs exist.
 */
export function enhanceFramePromptForContinuity(prompt: string, frameType: string): string {
  if (frameType === 'first_frame') {
    return `${prompt}\nThe first reference image shows the previous shot's ending — continue from a similar composition, lighting and color palette to ensure smooth visual continuity (match cut).`
  }
  if (frameType === 'last_frame') {
    return `${prompt}\nThe first reference image shows this shot's first frame — the result should be the natural ending of the same scene (same location, same lighting), only with the action progressed.`
  }
  return prompt
}

/**
 * Enhance a video prompt with style + ambient sound effect description.
 * Veo 3 generates audio from text descriptions, so describing the soundscape
 * in the prompt gets baked into the output.
 */
export function enhanceVideoPrompt(
  prompt: string,
  opts: { dramaId?: number | null; storyboardId?: number | null },
): string {
  const dramaId = resolveDramaId(opts)
  const styleSuffix = getStyleSuffix(dramaId)

  let sb: typeof schema.storyboards.$inferSelect | null = null
  try {
    if (opts.storyboardId) {
      sb = db.select().from(schema.storyboards).where(eq(schema.storyboards.id, opts.storyboardId)).all()[0] || null
    }
  } catch {}

  // 原生音频对白：开关开且为真·角色对白时，下面会统一注入台词+音色。
  const parsed = (sb && isNativeDialogueShot(sb)) ? parseDialogueLite(sb.dialogue) : null

  let base = prompt
  if (parsed) {
    // 分镜 prompt 有时已内嵌台词（<voice>名</voice>："台词"）。避免和注入重复：
    // <voice> 标签降级为 <role>（纯视觉），并删掉内嵌的这句台词，台词统一由下面注入定。
    base = base.replace(/<voice>(.*?)<\/voice>\s*[:：]?\s*/g, '<role>$1</role>，')
    if (parsed.pureText) {
      const esc = parsed.pureText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      base = base.replace(new RegExp(`["“”]?${esc}["“”]?`, 'g'), '')
    }
  }

  const parts = [base]
  const motionDirectives = [
    '视频生成核心约束：首帧只作为起始画面和角色一致性参考，绝不能把首帧/尾帧当成静态图片做简单平移、缩放、闪烁或形变补间',
    '必须按照当前分镜剧情推进生成真实连续动作：人物要有明确的起势、过程、反应和落点，身体重心、手部动作、视线方向、表情变化都要随事件发展',
    '必须有可感知的镜头语言变化：推拉摇移、跟拍、景别转换、焦点转移、前中后景层次和光影变化要服务剧情，不要整段停留在同一张构图上',
    '如果提示词包含时间段，严格按时间段执行中间过程；每个时间段都要发生新的画面信息或动作推进，禁止只让雨、光、头发等局部元素循环运动',
  ]
  parts.push(motionDirectives.join('；'))
  if (styleSuffix) parts.push(`画面风格：${styleSuffix}`)
  if (sb?.soundEffect) parts.push(`音效：${sb.soundEffect.trim()}`)

  // 镜头电影维度（用户可在故事板下拉里改：景别/视角/运镜/布光/构图/情绪）→ 真实进视频提示词
  const cine = [sb?.shotType, sb?.angle, sb?.movement, sb?.lighting, sb?.composition].filter(Boolean)
  if (cine.length) parts.push(`镜头语言：${cine.join('、')}`)
  if (sb?.emotionBeat) parts.push(`情绪基调：${sb.emotionBeat}`)

  if (parsed && parsed.pureText) {
    const voiceDesc = deriveVoiceDescription(parsed.speaker, dramaId)
    parts.push(`画面中的角色开口说出这句台词："${parsed.pureText}"，配音音色：${voiceDesc}，全程音色保持不变，口型与台词精确同步`)
  }

  return parts.join('. ')
}
