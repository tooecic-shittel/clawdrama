/**
 * 为 gpt-4o-mini-tts 的 `instructions` 字段生成中文语气/情绪指令。
 *
 * 目标：解决"配音很单调"的问题。同一个 TTS 模型，只要给它一段自然语言的
 * 语气提示，朗读就会有明显的情绪起伏。完全基于分镜已有字段（氛围 / 动作 /
 * 台词标点关键词）做启发式推断，零成本、即时、不额外调用 AI。
 */

export interface StoryboardEmotionContext {
  atmosphere?: string | null
  action?: string | null
  description?: string | null
}

// 氛围关键词 → 语气描述（命中第一个即用）
const ATMOSPHERE_TONES: Array<[RegExp, string]> = [
  [/愤怒|暴怒|激烈|冲突|争吵|怒/, '语气强硬、音量提高，带着压抑不住的怒气'],
  [/紧张|危急|惊险|急迫|焦急|追逐|逃/, '语气紧绷、急促，带着压迫感和紧迫感'],
  [/悲伤|伤感|凄凉|绝望|痛苦|哀|落泪|离别/, '语气低沉、略带哽咽，充满悲伤与无力'],
  [/恐怖|惊悚|阴森|诡异|害怕|恐惧/, '语气压低、微微发颤，透着不安与恐惧'],
  [/浪漫|暧昧|深情|告白|心动/, '语气柔和、放轻、略带气声，充满暧昧与深情'],
  [/温馨|温暖|甜蜜|幸福|治愈|柔情/, '语气温柔、舒缓，带着暖意和笑意'],
  [/欢快|开心|喜悦|轻松|愉快|兴奋|搞笑|欢乐/, '语气轻快、明亮，带着雀跃和笑意'],
  [/严肃|庄重|正式|郑重|警告|命令/, '语气沉稳、郑重，一字一句有分量'],
  [/神秘|悬疑|悬念|阴谋|试探/, '语气低沉、克制，话里留着悬念'],
  [/震惊|惊讶|意外|错愕/, '语气陡然抬高，带着难以置信的惊讶'],
  [/冷漠|疏离|不屑|嘲讽|讥讽/, '语气冷淡、拖长尾音，带着疏离和嘲讽'],
]

// 旁白型说话人的基础语气
const NARRATOR_RE = /^(旁白|画外音|内心|心想|内心独白|narrator|voiceover|v\.?o\.?)$/i

/**
 * 根据分镜氛围 + 台词文本，生成一条中文语气指令。
 * @param ctx 分镜情绪上下文（氛围 / 动作 / 描述）
 * @param text 纯台词文本
 * @param speaker 说话人（用于判断是否旁白）
 */
export function buildTTSInstruction(
  ctx: StoryboardEmotionContext,
  text: string,
  speaker?: string | null,
): string {
  const atmosphere = `${ctx.atmosphere || ''} ${ctx.action || ''} ${ctx.description || ''}`.trim()
  const isNarrator = !!speaker && NARRATOR_RE.test(speaker.trim())

  // 1. 氛围基调
  let tone = ''
  for (const [re, desc] of ATMOSPHERE_TONES) {
    if (re.test(atmosphere)) { tone = desc; break }
  }

  // 2. 台词标点 / 关键词修饰
  const cues: string[] = []
  const t = text || ''
  if (/！{2,}|!{2,}/.test(t)) cues.push('情绪激动、加强力度')
  else if (/[！!]/.test(t)) cues.push('语气加重、有力')
  if (/[？?]\s*$/.test(t)) cues.push('结尾带着疑惑或质问的上扬')
  if (/(……|\.\.\.|—)\s*$/.test(t)) cues.push('结尾语速放慢、略作迟疑')
  if (/哭|泣|呜|抽泣|哽咽|眼泪/.test(t + atmosphere)) cues.push('带着哭腔、声音发抖')
  if (/喊|吼|叫|嘶吼|怒吼|大声/.test(atmosphere)) cues.push('提高音量、用力喊出')
  if (/低语|耳语|轻声|小声|呢喃/.test(atmosphere)) cues.push('压低声音、像耳语一样')
  if (/笑|哈哈|呵呵|噗嗤/.test(t)) cues.push('带着笑意')

  // 3. 组装
  const parts: string[] = []
  if (isNarrator) {
    parts.push('用沉稳、富有叙事感的旁白语气朗读，适度起伏，不要平淡')
  } else {
    parts.push('用自然、口语化、有代入感的中文表演式朗读')
  }
  if (tone) parts.push(tone)
  if (cues.length) parts.push(cues.join('，'))

  // 4. 兜底：哪怕没有任何情绪线索，也要求模型不要平铺直叙
  if (!tone && !cues.length) {
    parts.push('语气要有自然的情感起伏和轻重缓急，避免机械、平铺直叙')
  }

  return parts.join('；') + '。'
}
