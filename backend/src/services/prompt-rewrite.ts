/**
 * 用文本 LLM（Gemini）把粗略的角色立绘提示词改写成专业、丰富的版本。
 * 复用文本配置（getTextConfig）+ 无工具的 Mastra Agent 做一次性生成。
 */
import { Agent } from '@mastra/core/agent'
import { createOpenAI } from '@ai-sdk/openai'
import { getTextConfig, getTextProviderBaseUrl } from './ai.js'
import { loadAgentSkills } from '../agents/skills.js'

const SYSTEM = `你是专业的 AI 绘画提示词工程师，专长「角色立绘 / 人物形象图」。
根据给定的角色设定与剧集画风，写出一段专业、丰富、可直接用于文生图的提示词。

硬性要求：
- 只输出提示词本身：中文、单段、不分点、不加引号、不写解释。
- 必须准确保留角色身份：性别、年龄段、关键外貌（发型/发色/脸型/体型/服装），绝不改变。
- 国籍/民族/人种特征必须显式写进提示词并放在开头（如「中国人，东亚面孔」）；设定未说明时，中文剧本默认按中国人写。绝不写成或暗示欧美面孔。
- 细化描写：五官与神态表情、发型发色、服装款式材质与配色、体态姿势、柔和影棚布光、镜头（正面半身或全身立绘）、画质（高清精致、统一画风）。
- 背景：干净纯色背景（除非设定另有要求）。
- 不要出现文字、水印、多人同框、分镜格子。`

export async function enhanceCharacterImagePrompt(input: {
  name: string
  role?: string | null
  appearance?: string | null
  description?: string | null
  personality?: string | null
  dramaStyle?: string | null
  currentPrompt?: string | null
}): Promise<string> {
  const cfg = getTextConfig()
  const provider = createOpenAI({ baseURL: getTextProviderBaseUrl(cfg), apiKey: cfg.apiKey } as any)
  const agent = new Agent({
    id: 'char-image-prompt',
    name: '角色立绘提示词改写',
    instructions: SYSTEM,
    model: provider.chat(cfg.model),
  })

  const userMsg = [
    `角色名：${input.name}`,
    input.role ? `角色定位：${input.role}` : '',
    input.appearance ? `外貌设定：${input.appearance}` : '',
    input.description ? `角色描述：${input.description}` : '',
    input.personality ? `性格：${input.personality}` : '',
    input.dramaStyle ? `剧集画风：${input.dramaStyle}` : '',
    input.currentPrompt ? `\n当前提示词（可参考改进，但身份/性别不得改变）：${input.currentPrompt}` : '',
    `\n请输出改写后的专业角色立绘提示词：`,
  ].filter(Boolean).join('\n')

  const result: any = await agent.generate([{ role: 'user', content: userMsg }])
  return String(result?.text || '').trim()
}

const VIDEO_SYS_TAIL = `

现在只针对【单个镜头】优化它的"视频提示词(video_prompt)"，严格遵守上面的分镜专业规范。
硬性要求：
- 只输出优化后的 video_prompt 本身：中文、导演级超长提示词、不要压缩、不要怕篇幅，不要为了任何视频模型把内容压到 2000 字以内。按 1-1.5 秒细分时间轴，用 <n> 分隔时间段；12 秒镜头至少 8 段，10 秒至少 7 段，8 秒至少 6 段，6 秒至少 5 段。
- 总长度必须足够长且细：12 秒最低 2600 个中文字符，10 秒最低 2200 个中文字符，8 秒最低 1800 个中文字符，6 秒最低 1500 个中文字符；这是最低线，不是上限。每个时间段尽量 250-420 个中文字符，宁可写到 3000-5000 字，也不要概括、删减、合并。
- 每个时间段都要写成"导演可执行分镜指令"，必须像现场导演、摄影指导、美术指导、声音指导共同给出的执行单：剧情功能、人物情绪弧线、主体站位/姿态、视线关系、手部动作、身体重心、动作因果、道具/符号使用、空间方位、镜头运动、焦距/景深、构图层次、前中后景、光源方向、材质反光、雨水/雾气/粒子、画面色温、剪辑节奏、声音层次、音效/台词触发点都要尽量写到。
- 不要复述剧本摘要，不要只列"中景/特写/固定镜头"；必须把剧本转译成可执行的画面变化：谁在什么位置、因为什么动作产生什么结果、镜头如何跟随、观众注意力被引到哪里、情绪如何递进、尾帧如何衔接下一镜。
- 首帧/尾帧只是起止画面边界和角色一致性参考，不是视频主体。必须明确写出中间过程的剧情动作、镜头调度、景别变化、焦点转移和节奏推进；禁止把视频写成首尾两张图的平移、缩放、闪烁、溶解、形变补间。
- 每个时间段都必须发生新的剧情信息或动作推进：人物不能只是站着/坐着微动；雨水、发丝、衣摆、光效、雾气只能作为辅助，不能替代剧情动作和镜头变化。
- 地点用 <location>地点</location>，角色用 <role>角色名[特征锚点]</role>，旁白或对白用 <voice>说话人：原文台词</voice>；角色外观锚点每段都要重复，绝不省略。
- 必须严格服从"当前镜头剧本约束"：画面事件、动作结果、对白/旁白、音效/环境音只能来自给定字段；不得新增剧本没有的事件、角色、台词、旁白、音效、BGM 或反转。
- 如果给定"对白/旁白"，必须原文保留台词文字，不得改写、扩写、删改语气词；如果没有对白/旁白，禁止编造人物说话。
- 如果给定"音效/环境音/BGM"，必须把它作为音频/环境声约束写入对应时间段；如果没有给定，只可根据画面中明确存在的自然环境写极轻微环境声，禁止乱加音乐和夸张音效。
- 凡有角色出场，必须从给定 appearance 提炼其外观锚点（发型/发色/服饰/标志等）原样带入，并在每个时间段一字不改地重复，保证一致性。
- 必须参考"本集剧情摘要"和"前后镜头"，让当前镜头动作承接上一镜、为下一镜铺垫；但不要改写到其他镜头的事件。
- 输出要明显比当前版本更丰富、更具体、更电影化：不要只写"中景、特写、固定镜头"这类泛词，要把镜头如何移动、画面如何变化、人物如何微动作、声音如何出现都写清楚。
- 不写解释、不加引号、不分点列表；只用连续的分段提示词。`

const IGNORE_DIALOGUE_TEXT = /^(无|无对白|无台词|无旁白|无需配音|无需对白|none|null|n\/a|na|环境音|环境声|音效|效果音|纯音效|纯环境音|只有环境音|仅环境音|背景音|背景音乐|bgm|sfx|ambient)$/i
const IGNORE_DIALOGUE_SPEAKER = /^(环境音|环境声|音效|效果音|sfx|sound ?effect|bgm|背景音|背景音乐|ambient)$/i

function parseDialogueStrict(dialogue?: string | null): { speaker: string; text: string; tag: 'voice' | 'dialogue' } | null {
  const raw = String(dialogue || '').trim()
  if (!raw) return null
  const speakerMatch = raw.match(/^(.+?)[:：]/)
  const speaker = speakerMatch ? speakerMatch[1].replace(/[（(].+?[)）]/g, '').trim() : ''
  const text = raw.replace(/^.+?[:：]\s*/, '').replace(/[（(].+?[)）]/g, '').trim()
  if (!text || IGNORE_DIALOGUE_TEXT.test(text) || (speaker && IGNORE_DIALOGUE_SPEAKER.test(speaker))) return null
  const tag = /旁白|画外音|voice ?over|narrator|os|ob|内心|内心独白|心声|独白/i.test(speaker) ? 'voice' : 'dialogue'
  return { speaker, text, tag }
}

function includesDialogueText(prompt: string, dialogueText: string): boolean {
  const normalize = (value: string) => value.replace(/[“”"'「」『』\s，。！？、,.!?：:；;—\-]/g, '')
  return normalize(prompt).includes(normalize(dialogueText))
}

function enforceDialogue(prompt: string, dialogue?: string | null): string {
  const parsed = parseDialogueStrict(dialogue)
  if (!parsed || includesDialogueText(prompt, parsed.text)) return prompt
  const speaker = parsed.speaker || '角色'
  const tag = parsed.tag === 'voice'
    ? `<voice>${speaker}：${parsed.text}</voice>`
    : `<voice>${speaker}：${parsed.text}</voice>`
  return `${prompt}<n>台词约束：${tag}，必须按原文说出，口型与台词同步。`
}

function durationGuidance(duration?: number | null): string {
  const sec = Math.max(4, Math.round(Number(duration) || 12))
  if (sec >= 12) return '目标时长约 12 秒：请输出至少 8 个时间段，建议 0-1.5秒、1.5-3秒、3-4.5秒、4.5-6秒、6-7.5秒、7.5-9秒、9-10.5秒、10.5-12秒；总长度最低 2600 个中文字符，不设上限，每段都要写足画面调度、演员调度、摄影调度、声音/台词落点和情绪推进。'
  if (sec >= 10) return '目标时长约 10 秒：请输出至少 7 个时间段，建议 0-1.5秒、1.5-3秒、3-4.5秒、4.5-6秒、6-7.5秒、7.5-9秒、9-10秒；总长度最低 2200 个中文字符，不设上限，每段都要写足画面调度、演员调度、摄影调度、声音/台词落点和情绪推进。'
  if (sec >= 8) return '目标时长约 8 秒：请输出至少 6 个时间段，建议 0-1.3秒、1.3-2.6秒、2.6-4秒、4-5.3秒、5.3-6.6秒、6.6-8秒；总长度最低 1800 个中文字符，不设上限，每段都要写足画面调度、演员调度、摄影调度、声音/台词落点和情绪推进。'
  return `目标时长约 ${sec} 秒：请输出至少 5 个时间段，按 1-1.5 秒细分动作推进；总长度最低 1500 个中文字符，不设上限，每段都要写足画面调度、演员调度、摄影调度、声音/台词落点和情绪推进。`
}

// 用 storyboard_breaker skill（运镜/布光/beat + 角色一致性 + 视频提示词格式）把单镜 video_prompt 优化成电影级。
export async function enhanceShotVideoPrompt(input: {
  description?: string | null
  action?: string | null
  dialogue?: string | null
  shotType?: string | null
  angle?: string | null
  movement?: string | null
  lighting?: string | null
  composition?: string | null
  emotionBeat?: string | null
  result?: string | null
  soundEffect?: string | null
  bgmPrompt?: string | null
  duration?: number | null
  location?: string | null
  time?: string | null
  atmosphere?: string | null
  characters?: { name: string; appearance?: string | null }[]
  dramaStyle?: string | null
  episodeContext?: string | null
  previousShots?: string[]
  nextShots?: string[]
  currentPrompt?: string | null
}): Promise<string> {
  const cfg = getTextConfig()
  const provider = createOpenAI({ baseURL: getTextProviderBaseUrl(cfg), apiKey: cfg.apiKey } as any)
  const agent = new Agent({
    id: 'shot-video-prompt',
    name: '视频提示词优化',
    instructions: loadAgentSkills('storyboard_breaker') + VIDEO_SYS_TAIL,
    model: provider.chat(cfg.model),
  })

  const charLines = (input.characters || []).map(c => `- ${c.name}：${c.appearance || '（无外观设定）'}`).join('\n')
  const previousLines = (input.previousShots || []).map(s => `- ${s}`).join('\n')
  const nextLines = (input.nextShots || []).map(s => `- ${s}`).join('\n')
  const userMsg = [
    input.episodeContext ? `本集剧情摘要（用于理解前因后果，不要逐字塞进提示词）：${input.episodeContext}` : '',
    previousLines ? `前置镜头（当前镜头需要自然承接）：\n${previousLines}` : '',
    nextLines ? `后续镜头（当前镜头需要为其铺垫）：\n${nextLines}` : '',
    `改写目标：把剧本/分镜字段改写成导演级长视频提示词。所有元素必须来自剧本与当前分镜字段，宁可详细，不要省略；不要只写镜头标签，要写可执行的画面变化、演员调度、摄影调度、美术光影、声音落点和情绪递进。`,
    `剧本依据优先级：1 当前镜头字段，2 出场角色外观，3 本集剧情摘要，4 前后镜头连续性。可以借前后镜头理解承接关系，但不能把前后镜头的独立事件挪进当前镜头。`,
    `当前镜头剧本约束（必须严格遵守，禁止新增不存在的剧情/台词/音效）：`,
    durationGuidance(input.duration),
    input.dramaStyle ? `画风：${input.dramaStyle}` : '',
    input.location ? `地点：${input.location}` : '',
    input.time ? `时间：${input.time}` : '',
    input.shotType ? `景别：${input.shotType}` : '',
    input.angle ? `视角：${input.angle}` : '',
    input.movement ? `运镜：${input.movement}` : '',
    input.lighting ? `布光：${input.lighting}` : '',
    input.composition ? `构图：${input.composition}` : '',
    input.atmosphere ? `氛围：${input.atmosphere}` : '',
    input.emotionBeat ? `情绪节拍：${input.emotionBeat}` : '',
    input.description ? `画面描述：${input.description}` : '',
    input.action ? `动作：${input.action}` : '',
    input.result ? `动作结果/镜头落点：${input.result}` : '',
    input.dialogue ? `对白/旁白：${input.dialogue}` : '',
    input.soundEffect ? `音效/环境音：${input.soundEffect}` : '',
    input.bgmPrompt ? `BGM/音乐约束：${input.bgmPrompt}` : '',
    charLines ? `出场角色（外观锚点从这里提炼并带入）：\n${charLines}` : '',
    input.currentPrompt ? `\n当前 video_prompt（在此基础上优化、更电影感）：${input.currentPrompt}` : '',
    `\n请输出优化后的 video_prompt：`,
  ].filter(Boolean).join('\n')

  const result: any = await agent.generate([{ role: 'user', content: userMsg }], { maxTokens: 12000 } as any)
  return enforceDialogue(String(result?.text || '').trim(), input.dialogue)
}
