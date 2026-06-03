/**
 * 用文本 LLM（Gemini）把粗略的角色立绘提示词改写成专业、丰富的版本。
 * 复用文本配置（getTextConfig）+ 无工具的 Mastra Agent 做一次性生成。
 */
import { Agent } from '@mastra/core/agent'
import { createOpenAI } from '@ai-sdk/openai'
import { getTextConfig, getTextProviderBaseUrl } from './ai.js'

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
