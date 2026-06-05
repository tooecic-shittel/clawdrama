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

const STYLE_PROMPTS: Record<string, string> = {
  realistic: 'photorealistic, cinematic photography, natural lighting, fine skin detail',
  anime: 'anime style, vibrant colors, japanese animation aesthetic, expressive characters, sharp lineart',
  ghibli: 'Studio Ghibli style, soft watercolor backgrounds, dreamy atmosphere, warm tones',
  cinematic: 'cinematic film look, dramatic lighting, shallow depth of field, color graded',
  comic: 'comic book illustration, bold outlines, dynamic composition, vivid pop colors',
  watercolor: 'watercolor painting style, soft brush strokes, gentle gradients, artistic feel',
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
  return `${prompt}. Style: ${styleSuffix}.`
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
  if (styleSuffix) parts.push(`Visual style: ${styleSuffix}`)
  if (sb?.soundEffect) parts.push(`Audio: ${sb.soundEffect.trim()}`)

  if (parsed && parsed.pureText) {
    const voiceDesc = deriveVoiceDescription(parsed.speaker, dramaId)
    parts.push(`画面中的角色开口说出这句台词："${parsed.pureText}"，配音音色：${voiceDesc}，全程音色保持不变，口型与台词精确同步`)
  }

  return parts.join('. ')
}
