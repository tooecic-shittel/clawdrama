/**
 * Map character → Gemini TTS voice deterministically.
 * Gemini 原生 TTS 中文最自然，现作为标准音色集。共 30 个官方音色，
 * 这里按性别/定位分池，并保证「同一部剧里不同角色音色不重复」。
 *
 * Strategy:
 *   1. If character.voiceStyle is already a Gemini voice → use as-is.
 *   1b. If it's a legacy OpenAI id (classic alloy.. or newer coral..) → remap to Gemini.
 *   2. Otherwise infer from character traits (gender / role keywords).
 *   3. Same character always gets same voice (deterministic by character id).
 *
 * 去重由调用方（assign_voice 工具）配合 nextUnusedVoice() 完成。
 */
import { db, schema } from '../db/index.js'
import { eq } from 'drizzle-orm'

export type VoiceGender = '男声' | '女声' | '中性'
export interface VoiceProfile {
  id: string
  gender: VoiceGender
  traits: string
  suitable: string
}

/**
 * Gemini 官方 30 个预置音色目录（单一事实来源）。
 * id 即 Gemini voiceName（generateContent 直接使用）。
 * 前端、list_voices、voice-mapper 都从这里取，保证三处一致。
 */
export const GEMINI_VOICE_CATALOG: VoiceProfile[] = [
  // —— 女声 14 ——
  { id: 'Kore',          gender: '女声', traits: '温暖、亲和、自然',     suitable: '女主、温柔母亲、知心朋友' },
  { id: 'Leda',          gender: '女声', traits: '清新、有少女感',       suitable: '少女、清纯女主、明亮角色' },
  { id: 'Despina',       gender: '女声', traits: '柔美、甜美',           suitable: '甜美女主、邻家女孩' },
  { id: 'Achernar',      gender: '女声', traits: '柔和、轻柔',           suitable: '温柔配角、抒情女声' },
  { id: 'Callirrhoe',    gender: '女声', traits: '随和、松弛',           suitable: '知性女性、都市女主' },
  { id: 'Autonoe',       gender: '女声', traits: '明亮、活泼',           suitable: '活泼少女、元气角色' },
  { id: 'Erinome',       gender: '女声', traits: '清晰、干净',           suitable: '职场女性、干练角色' },
  { id: 'Laomedeia',     gender: '女声', traits: '轻快、俏皮',           suitable: '俏皮少女、喜剧角色' },
  { id: 'Gacrux',        gender: '女声', traits: '成熟、稳重',           suitable: '御姐、成熟女性、女上司' },
  { id: 'Pulcherrima',   gender: '女声', traits: '直率、有态度',         suitable: '强势女性、大女主' },
  { id: 'Vindemiatrix',  gender: '女声', traits: '温柔、平和',           suitable: '温婉女性、抒情旁白' },
  { id: 'Sulafat',       gender: '女声', traits: '温暖、明亮',           suitable: '温暖女声、抒情旁白' },
  { id: 'Sadachbia',     gender: '女声', traits: '活力、轻盈',           suitable: '灵动角色、少女' },
  { id: 'Zephyr',        gender: '女声', traits: '明亮、轻盈',           suitable: '清亮女声、青春角色' },

  // —— 男声 15 ——
  { id: 'Charon',        gender: '男声', traits: '低沉、沉稳、有磁性',   suitable: '男主、霸总、成熟男性' },
  { id: 'Orus',          gender: '男声', traits: '醇厚、稳重',           suitable: '父辈、长者、正气角色' },
  { id: 'Algieba',       gender: '男声', traits: '柔和、抒情、温润',     suitable: '温润男主、暖男、内心戏' },
  { id: 'Fenrir',        gender: '男声', traits: '富有表现力、戏剧张力', suitable: '反派、戏精角色、张力场景' },
  { id: 'Puck',          gender: '男声', traits: '活泼、俏皮',           suitable: '少年、活力男主、喜剧角色' },
  { id: 'Iapetus',       gender: '男声', traits: '清晰、沉静',           suitable: '文质男性、书生角色' },
  { id: 'Umbriel',       gender: '男声', traits: '松弛、随和',           suitable: '邻家男孩、暖男配角' },
  { id: 'Enceladus',     gender: '男声', traits: '低沉、气声',           suitable: '神秘角色、低语场景' },
  { id: 'Algenib',       gender: '男声', traits: '沙哑、粗粝',           suitable: '硬汉、江湖角色' },
  { id: 'Rasalgethi',    gender: '男声', traits: '知性、清晰',           suitable: '旁白、解说、学者' },
  { id: 'Alnilam',       gender: '男声', traits: '坚定、有力',           suitable: '军人、领袖、正派' },
  { id: 'Schedar',       gender: '男声', traits: '平稳、均衡',           suitable: '旁白、成熟男性' },
  { id: 'Achird',        gender: '男声', traits: '友好、亲切',           suitable: '邻家男孩、朋友角色' },
  { id: 'Zubenelgenubi', gender: '男声', traits: '随性、口语化',         suitable: '市井角色、喜剧男配' },
  { id: 'Sadaltager',    gender: '男声', traits: '知性、沉稳',           suitable: '专家、长者、旁白' },

  // —— 中性 / 旁白 1 ——
  { id: 'Aoede',         gender: '中性', traits: '轻盈、自然、叙事感',   suitable: '旁白、知性角色、解说' },
]

export const GEMINI_VOICE_IDS = GEMINI_VOICE_CATALOG.map(v => v.id)
const VALID_RE = new RegExp(`^(${GEMINI_VOICE_IDS.join('|')})$`, 'i')

export function canonicalVoice(v: string): string {
  return GEMINI_VOICE_IDS.find(g => g.toLowerCase() === v.toLowerCase()) || v
}
export function isGeminiVoice(v?: string | null): boolean {
  return !!v && VALID_RE.test(v.trim())
}

// 按性别分池（顺序即优先级：常用/最自然的排前面）
export const FEMALE_VOICES = GEMINI_VOICE_CATALOG.filter(v => v.gender === '女声').map(v => v.id)
export const MALE_VOICES = GEMINI_VOICE_CATALOG.filter(v => v.gender === '男声').map(v => v.id)
// 旁白/中性：精选一小撮叙事感强的（含中性 Aoede）
export const NARRATOR_VOICES = ['Aoede', 'Rasalgethi', 'Schedar', 'Sulafat', 'Vindemiatrix']

function poolForVoice(voice: string): string[] {
  const profile = GEMINI_VOICE_CATALOG.find(v => v.id.toLowerCase() === voice.toLowerCase())
  if (profile?.gender === '女声') return FEMALE_VOICES
  if (profile?.gender === '男声') return MALE_VOICES
  return [...MALE_VOICES, ...FEMALE_VOICES]
}

/**
 * 去重选音：给定一个首选音色 + 已被占用的音色集合，
 * 返回一个尽量「同性别且未被占用」的音色。
 *   1. preferred 没被占用 → 直接用（规范大小写）。
 *   2. 同性别池里第一个没被占用的。
 *   3. 全部 30 个里第一个没被占用的。
 *   4. 实在全占满（>30 角色）→ 退回 preferred。
 */
export function nextUnusedVoice(preferred: string, taken: Iterable<string>): string {
  const used = new Set(Array.from(taken, t => String(t).toLowerCase()))
  const pref = canonicalVoice((preferred || '').trim()) || 'Aoede'
  if (!used.has(pref.toLowerCase())) return pref

  const sameGender = poolForVoice(pref).find(v => !used.has(v.toLowerCase()))
  if (sameGender) return sameGender

  const any = GEMINI_VOICE_IDS.find(v => !used.has(v.toLowerCase()))
  return any || pref
}

// Compat shim: 历史上存过的 OpenAI 音色 id（经典 tts-1 + gpt-4o-mini-tts）→ 最接近的 Gemini 音色。
const LEGACY_VOICE_MAP: Record<string, string> = {
  // classic tts-1
  alloy: 'Aoede', echo: 'Charon', fable: 'Algieba', onyx: 'Orus', nova: 'Kore', shimmer: 'Leda',
  // gpt-4o-mini-tts
  coral: 'Kore', marin: 'Leda', sage: 'Aoede', ash: 'Charon', cedar: 'Orus', ballad: 'Algieba', verse: 'Fenrir',
}

const FEMALE_KEYWORDS = /(女|姑娘|小姐|妹|姐|妈|奶奶|阿姨|女主|女孩|female|woman|girl|她)/i
const MALE_KEYWORDS = /(男|爷爷|爸|叔|哥|弟|先生|男主|男孩|male|man|boy|他)/i
const NARRATOR_KEYWORDS = /(旁白|解说|narrator|voiceover)/i

/**
 * Pick Gemini voice for a character (by id or name).
 * Falls back to deterministic hashing if no character info available.
 */
export function pickVoiceForCharacter(opts: {
  characterId?: number | null
  characterName?: string | null
  dramaId?: number | null
  fallback?: string
}): string {
  const fallback = opts.fallback || 'Aoede'

  // Try resolve full character record
  let character: any = null
  try {
    if (opts.characterId) {
      character = db.select().from(schema.characters).where(eq(schema.characters.id, opts.characterId)).all()[0]
    } else if (opts.characterName && opts.dramaId) {
      const chars = db.select().from(schema.characters).where(eq(schema.characters.dramaId, opts.dramaId)).all()
      character = chars.find(c => c.name === opts.characterName)
    } else if (opts.characterName) {
      const chars = db.select().from(schema.characters).all()
      character = chars.find(c => c.name === opts.characterName)
    }
  } catch {}

  // 1. Already set to a valid Gemini voice → use it (规范大小写)
  if (character?.voiceStyle && VALID_RE.test(character.voiceStyle)) {
    return canonicalVoice(character.voiceStyle)
  }
  // 1b. Legacy OpenAI id (classic alloy.. / newer coral..) → remap to Gemini
  if (character?.voiceStyle && LEGACY_VOICE_MAP[character.voiceStyle.toLowerCase()]) {
    return LEGACY_VOICE_MAP[character.voiceStyle.toLowerCase()]
  }

  // 2. Narrator check by name
  const name = (opts.characterName || character?.name || '').trim()
  if (NARRATOR_KEYWORDS.test(name)) {
    return NARRATOR_VOICES[hashStr(name) % NARRATOR_VOICES.length]
  }

  // 3. Infer gender from character description fields
  const corpus = [
    character?.appearance || '',
    character?.personality || '',
    character?.role || '',
    character?.description || '',
    name,
  ].join(' ')

  let pool: string[]
  if (FEMALE_KEYWORDS.test(corpus)) {
    pool = FEMALE_VOICES
  } else if (MALE_KEYWORDS.test(corpus)) {
    pool = MALE_VOICES
  } else {
    // Unknown gender — pick from broader pool, prefer narrator if no character match
    pool = character ? [...MALE_VOICES, ...FEMALE_VOICES] : NARRATOR_VOICES
  }

  // 4. Deterministic pick by character id / name
  const seed = character?.id || hashStr(name) || hashStr(fallback)
  return pool[seed % pool.length]
}

function hashStr(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h) + s.charCodeAt(i) | 0
  return Math.abs(h)
}
