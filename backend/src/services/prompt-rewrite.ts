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
- 只输出优化后的 video_prompt 本身：中文、按 3 秒分段、用 <n> 分隔时间段；地点用 <location>地点</location>，角色用 <role>角色名[特征锚点]</role>，旁白用 <voice>旁白</voice>。
- 凡有角色出场，必须从给定 appearance 提炼其外观锚点（发型/发色/服饰/标志等）原样带入，并在每个时间段一字不改地重复，保证一致性。
- 运镜/景别/光影/构图具体化，动作随时间推进、有节奏；比当前版本更专业、更有电影感。
- 不写解释、不加引号、不分点列表。`

// 用 storyboard_breaker skill（运镜/布光/beat + 角色一致性 + 视频提示词格式）把单镜 video_prompt 优化成电影级。
export async function enhanceShotVideoPrompt(input: {
  description?: string | null
  action?: string | null
  dialogue?: string | null
  shotType?: string | null
  angle?: string | null
  movement?: string | null
  lighting?: string | null
  location?: string | null
  time?: string | null
  atmosphere?: string | null
  characters?: { name: string; appearance?: string | null }[]
  dramaStyle?: string | null
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
  const userMsg = [
    input.dramaStyle ? `画风：${input.dramaStyle}` : '',
    input.location ? `地点：${input.location}` : '',
    input.time ? `时间：${input.time}` : '',
    input.shotType ? `景别：${input.shotType}` : '',
    input.angle ? `视角：${input.angle}` : '',
    input.movement ? `运镜：${input.movement}` : '',
    input.lighting ? `布光：${input.lighting}` : '',
    input.atmosphere ? `氛围：${input.atmosphere}` : '',
    input.description ? `画面描述：${input.description}` : '',
    input.action ? `动作：${input.action}` : '',
    input.dialogue ? `对白/旁白：${input.dialogue}` : '',
    charLines ? `出场角色（外观锚点从这里提炼并带入）：\n${charLines}` : '',
    input.currentPrompt ? `\n当前 video_prompt（在此基础上优化、更电影感）：${input.currentPrompt}` : '',
    `\n请输出优化后的 video_prompt：`,
  ].filter(Boolean).join('\n')

  const result: any = await agent.generate([{ role: 'user', content: userMsg }])
  return String(result?.text || '').trim()
}
