/**
 * MiniMax 官方系统音色目录（中文短剧精选集，单一事实来源）。
 *
 * 取自官方 get_voice 的 system_voice（中文/普通话），这里精选 26 个覆盖
 * 男主/霸总/暖男/少年/御姐/少女/旁白/长者等短剧常见定位。
 *   - voiceId 即官方 voice_id，直接写进角色 voice_style，T2A v2 直接可用。
 *   - 启动时 seedMinimaxVoices() 据此填充 ai_voices（库为空时）；
 *     运营方也可在后台 POST /ai-voices/sync 从官方拉全量 32 个覆盖之。
 *   - voice-mapper 从这里取男女音色池 + 给旧 Gemini 音色做兼容映射。
 */

export type VoiceGender = '男声' | '女声' | '中性'

export interface MinimaxVoice {
  voiceId: string
  voiceName: string
  gender: VoiceGender
  desc: string
}

/** 精选中文系统音色（顺序即「通用度」优先级，越靠前越百搭）。 */
export const MINIMAX_VOICE_CATALOG: MinimaxVoice[] = [
  // —— 男声 14 ——
  { voiceId: 'Chinese (Mandarin)_Gentleman',            voiceName: '温润男声',     gender: '男声', desc: '温润磁性的青年男性，男主/暖男首选' },
  { voiceId: 'Chinese (Mandarin)_Reliable_Executive',   voiceName: '沉稳高管',     gender: '男声', desc: '沉稳可靠的中年男性，霸总/成熟男性' },
  { voiceId: 'Chinese (Mandarin)_Gentle_Youth',         voiceName: '温润青年',     gender: '男声', desc: '温柔的青年男性，暖男配角' },
  { voiceId: 'Chinese (Mandarin)_Unrestrained_Young_Man', voiceName: '不羁青年',   gender: '男声', desc: '潇洒不羁的青年男性，痞帅/反派' },
  { voiceId: 'Chinese (Mandarin)_Sincere_Adult',        voiceName: '真诚青年',     gender: '男声', desc: '真诚有鼓励性的青年男性，正派' },
  { voiceId: 'Chinese (Mandarin)_Lyrical_Voice',        voiceName: '抒情男声',     gender: '男声', desc: '磁性抒情的青年男性，深情/内心戏' },
  { voiceId: 'Chinese (Mandarin)_Radio_Host',           voiceName: '电台男主播',   gender: '男声', desc: '富有诗意的青年男主播，旁白/解说' },
  { voiceId: 'Chinese (Mandarin)_Straightforward_Boy',  voiceName: '率真弟弟',     gender: '男声', desc: '认真率真的少年，活力男配' },
  { voiceId: 'Chinese (Mandarin)_Pure-hearted_Boy',     voiceName: '清澈邻家弟弟', gender: '男声', desc: '清澈的邻家少年，学生角色' },
  { voiceId: 'Chinese (Mandarin)_Stubborn_Friend',      voiceName: '嘴硬竹马',     gender: '男声', desc: '嘴硬心软不羁的青年竹马' },
  { voiceId: 'Chinese (Mandarin)_Southern_Young_Man',   voiceName: '南方小哥',     gender: '男声', desc: '质朴的青年男性，市井角色' },
  { voiceId: 'Chinese (Mandarin)_Male_Announcer',       voiceName: '播报男声',     gender: '男声', desc: '磁性权威的中年男播报员，旁白' },
  { voiceId: 'Chinese (Mandarin)_Humorous_Elder',       voiceName: '搞笑大爷',     gender: '男声', desc: '爽朗幽默的老年男性，长者/喜剧' },
  { voiceId: 'Chinese (Mandarin)_Cute_Spirit',          voiceName: '憨憨萌兽',     gender: '男声', desc: '呆萌可爱的少年男声，萌系/喜剧' },

  // —— 女声 12 ——
  { voiceId: 'Chinese (Mandarin)_Warm_Girl',            voiceName: '温暖少女',     gender: '女声', desc: '温柔温暖的少女，女主首选' },
  { voiceId: 'Chinese (Mandarin)_Sweet_Lady',          voiceName: '甜美女声',     gender: '女声', desc: '温柔甜美的青年女性，甜美女主' },
  { voiceId: 'Chinese (Mandarin)_Mature_Woman',        voiceName: '傲娇御姐',     gender: '女声', desc: '妩媚成熟的御姐，女上司/强势女' },
  { voiceId: 'Chinese (Mandarin)_Gentle_Senior',       voiceName: '温柔学姐',     gender: '女声', desc: '温暖温柔的青年学姐，温婉角色' },
  { voiceId: 'Chinese (Mandarin)_Crisp_Girl',          voiceName: '清脆少女',     gender: '女声', desc: '温暖清脆的少女，青春女配' },
  { voiceId: 'Chinese (Mandarin)_Warm_Bestie',         voiceName: '温暖闺蜜',     gender: '女声', desc: '温暖清脆的青年女性，闺蜜/好友' },
  { voiceId: 'Chinese (Mandarin)_Wise_Women',          voiceName: '阅历姐姐',     gender: '女声', desc: '富有阅历抒情的中年姐姐，知性' },
  { voiceId: 'Chinese (Mandarin)_Soft_Girl',           voiceName: '软软女孩',     gender: '女声', desc: '温暖柔软的青年女性，软妹' },
  { voiceId: 'Chinese (Mandarin)_News_Anchor',         voiceName: '新闻女声',     gender: '女声', desc: '专业播音腔的中年女主播，职场/旁白' },
  { voiceId: 'Chinese (Mandarin)_Kind-hearted_Antie',  voiceName: '热心大婶',     gender: '女声', desc: '温和善良的中年大婶，市井女性' },
  { voiceId: 'Chinese (Mandarin)_Kind-hearted_Elder',  voiceName: '花甲奶奶',     gender: '女声', desc: '慈祥和蔼的老年女性，奶奶/长辈' },

  // —— 经典系列（更多选择）·男声 ——
  { voiceId: 'male-qn-badao',        voiceName: '霸道总裁',   gender: '男声', desc: '低沉霸气的青年男性，总裁/霸总' },
  { voiceId: 'male-qn-jingying',     voiceName: '精英青年',   gender: '男声', desc: '干练自信的青年男性，职场精英' },
  { voiceId: 'male-qn-daxuesheng',   voiceName: '青年大学生', gender: '男声', desc: '阳光的青年男性，学生/邻家' },
  { voiceId: 'male-qn-qingse',       voiceName: '青涩青年',   gender: '男声', desc: '青涩自然的青年男性，少年/校园' },
  { voiceId: 'audiobook_male_1',     voiceName: '有声书男声', gender: '男声', desc: '沉稳叙事的男声，旁白/有声书' },
  { voiceId: 'presenter_male',       voiceName: '男主播',     gender: '男声', desc: '清晰有力的男主播，解说/旁白' },
  // —— 经典系列·女声 ——
  { voiceId: 'female-yujie',         voiceName: '御姐',       gender: '女声', desc: '成熟妩媚的御姐声，女上司/强势女' },
  { voiceId: 'female-chengshu',      voiceName: '成熟女性',   gender: '女声', desc: '知性沉稳的成熟女性，职场/母亲' },
  { voiceId: 'female-tianmei',       voiceName: '甜美女声',   gender: '女声', desc: '甜美可爱的女声，娇俏女主' },
  { voiceId: 'female-shaonv',        voiceName: '少女',       gender: '女声', desc: '清纯娇俏的少女声，青春女主' },
  { voiceId: 'audiobook_female_1',   voiceName: '有声书女声', gender: '女声', desc: '温润叙事的女声，旁白/有声书' },
  { voiceId: 'presenter_female',     voiceName: '女主播',     gender: '女声', desc: '清晰亲和的女主播，解说/旁白' },
]

export const MINIMAX_MALE_VOICES = MINIMAX_VOICE_CATALOG.filter(v => v.gender === '男声').map(v => v.voiceId)
export const MINIMAX_FEMALE_VOICES = MINIMAX_VOICE_CATALOG.filter(v => v.gender === '女声').map(v => v.voiceId)
/** 旁白/解说：叙事感强的精选 */
export const MINIMAX_NARRATOR_VOICES = [
  'Chinese (Mandarin)_Radio_Host',
  'Chinese (Mandarin)_Male_Announcer',
  'Chinese (Mandarin)_Wise_Women',
  'Chinese (Mandarin)_News_Anchor',
  'Chinese (Mandarin)_Lyrical_Voice',
]
/** 通用兜底音色（未知说话人 / 解析不出性别时） */
export const DEFAULT_MINIMAX_VOICE = 'Chinese (Mandarin)_Radio_Host'

const VALID_IDS = new Set(MINIMAX_VOICE_CATALOG.map(v => v.voiceId.toLowerCase()))

/** 是否是本目录里的 minimax 音色 id。 */
export function isMinimaxCatalogVoice(v?: string | null): boolean {
  return !!v && VALID_IDS.has(v.trim().toLowerCase())
}

/**
 * 去重选音：preferred 没被占用就用它；否则在同性别池里找第一个未占用的；
 * 再不行全目录里找。保证「同一部剧不同角色不撞音色」。
 */
export function nextUnusedMinimaxVoice(preferred: string, taken: Iterable<string>): string {
  const used = new Set(Array.from(taken, t => String(t).toLowerCase()))
  const pref = (preferred || '').trim()
  if (pref && !used.has(pref.toLowerCase())) return pref

  const prof = MINIMAX_VOICE_CATALOG.find(v => v.voiceId.toLowerCase() === pref.toLowerCase())
  const pool = prof?.gender === '女声' ? MINIMAX_FEMALE_VOICES
    : prof?.gender === '男声' ? MINIMAX_MALE_VOICES
    : [...MINIMAX_MALE_VOICES, ...MINIMAX_FEMALE_VOICES]
  const same = pool.find(v => !used.has(v.toLowerCase()))
  if (same) return same

  const any = MINIMAX_VOICE_CATALOG.map(v => v.voiceId).find(v => !used.has(v.toLowerCase()))
  return any || pref || DEFAULT_MINIMAX_VOICE
}

/**
 * minimax T2A v2 的 emotion 只认枚举。把上游传来的「自然语言语气指令」
 * （buildTTSInstruction 产出）或已是枚举的值，归一成 minimax 合法枚举。
 * 匹配不到时返回 'neutral'（安全、自然）。
 */
const MINIMAX_EMOTIONS = ['happy', 'sad', 'angry', 'fearful', 'disgusted', 'surprised', 'neutral'] as const
export type MinimaxEmotion = typeof MINIMAX_EMOTIONS[number]

export function normalizeMinimaxEmotion(raw?: string | null): MinimaxEmotion {
  const s = String(raw || '').toLowerCase().trim()
  if (!s) return 'neutral'
  // 已是合法枚举
  for (const e of MINIMAX_EMOTIONS) if (s === e) return e
  // 从中文语气指令里识别情绪（顺序：先强情绪后弱）
  if (/怒|愤|强硬|吼|喊|质问/.test(s)) return 'angry'
  if (/悲|哀|哽咽|哭|泣|绝望|痛苦|无力|落泪/.test(s)) return 'sad'
  if (/恐|怕|惧|发颤|不安|惊悚|害怕/.test(s)) return 'fearful'
  if (/惊讶|震惊|意外|难以置信|错愕/.test(s)) return 'surprised'
  if (/厌|嘲讽|讥讽|不屑|冷漠|疏离/.test(s)) return 'disgusted'
  if (/欢快|开心|喜悦|雀跃|笑意|明亮|温暖|暖意|甜|柔和|深情|温柔/.test(s)) return 'happy'
  return 'neutral'
}
