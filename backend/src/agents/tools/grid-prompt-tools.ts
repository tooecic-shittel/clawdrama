/**
 * 图片提示词生成 Agent 工具
 * 工厂函数模式 — 注入 episodeId + dramaId
 *
 * 支持三类提示词生成：
 * 1. 角色图片提示词
 * 2. 场景图片提示词
 * 3. 宫格图提示词
 */
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { db, schema } from '../../db/index.js'
import { eq } from 'drizzle-orm'

export function createGridPromptTools(episodeId: number, dramaId: number) {

  // ─── 角色提示词 ───────────────────────────────────────

  const readCharacters = createTool({
    id: 'read_characters',
    description: '读取当前剧集中的所有角色信息，用于生成角色图片提示词。',
    inputSchema: z.object({}),
    execute: async () => {
      const chars = db.select().from(schema.characters)
        .where(eq(schema.characters.dramaId, dramaId)).all()
        .filter(c => !c.deletedAt)
      return {
        characters: chars.map(c => ({
          id: c.id,
          name: c.name,
          role: c.role || '',
          description: c.description || '',
          appearance: c.appearance || '',
          personality: c.personality || '',
        })),
      }
    },
  })

  const generateCharacterPrompt = createTool({
    id: 'generate_character_prompt',
    description: '为角色生成 AI 图片生成的英文提示词。',
    inputSchema: z.object({
      character_id: z.number(),
    }),
    execute: async ({ character_id }) => {
      const [c] = db.select().from(schema.characters)
        .where(eq(schema.characters.id, character_id)).all()
      if (!c) return { error: 'Character not found' }

      const traits: string[] = []
      if (c.appearance) traits.push(c.appearance)
      if (c.description) traits.push(c.description)
      const traitStr = traits.join(', ')
      const styleHint = c.personality ? `气质神态：${c.personality}。` : ''
      // 角色资产「母图」：清晰、中性、锁定特征（发型/发色/五官标志/服装版型/配饰/色板），
      // 供后续所有镜头与参考图复用以保一致性（专业漫剧的「角色资产标准化」做法）。
      const prompt = `${c.name} 角色设定参考图：${traitStr}。`
        + `全身、正面、中性站姿、面向镜头。`
        + `五官清晰鲜明，发型与发色、服装版型、配饰与统一色板（所有镜头保持完全一致）。`
        + `柔和均匀的影棚布光，干净纯色背景，清晰锐利，高细节。${styleHint}`
        + `画风一致，设定稿级别质感，无文字，无水印。`

      return {
        character_id: c.id,
        character_name: c.name,
        prompt,
      }
    },
  })

  // ─── 场景提示词 ───────────────────────────────────────

  const readScenes = createTool({
    id: 'read_scenes',
    description: '读取当前剧集中的所有场景信息，用于生成场景图片提示词。',
    inputSchema: z.object({}),
    execute: async () => {
      const scenes = db.select().from(schema.scenes)
        .where(eq(schema.scenes.dramaId, dramaId)).all()
        .filter(s => !s.deletedAt)
      return {
        scenes: scenes.map(s => ({
          id: s.id,
          location: s.location,
          time: s.time || '',
          prompt: s.prompt || '',
        })),
      }
    },
  })

  const generateScenePrompt = createTool({
    id: 'generate_scene_prompt',
    description: '为场景生成 AI 图片生成的英文提示词。',
    inputSchema: z.object({
      scene_id: z.number(),
    }),
    execute: async ({ scene_id }) => {
      const [s] = db.select().from(schema.scenes)
        .where(eq(schema.scenes.id, scene_id)).all()
      if (!s) return { error: 'Scene not found' }

      const parts: string[] = []
      if (s.location) parts.push(s.location)
      if (s.time) parts.push(s.time)
      if (s.prompt) parts.push(s.prompt)
      const base = parts.join(', ')
      // 纯背景空镜：强调空间纵深、电影光影、材质质感、无人物（场景图作为后续镜头的环境底）
      const prompt = `${s.location || '场景'} 电影感空镜背景：${base}。`
        + `强烈空间纵深（前景/中景/远景分层），氛围定向光影，明确调色板，丰富材质质感。`
        + `空旷环境，无人物、无角色。画风一致，高质量，清晰锐利，无文字，无水印。`

      return {
        scene_id: s.id,
        location: s.location,
        prompt,
      }
    },
  })

  // ─── 宫格图提示词 ───────────────────────────────────────

  const readShotsForGrid = createTool({
    id: 'read_shots_for_grid',
    description: '读取选中镜头的详细信息，用于生成宫格图提示词。',
    inputSchema: z.object({
      shot_ids: z.array(z.number()),
    }),
    execute: async ({ shot_ids }) => {
      if (!shot_ids.length) return { shots: [] }
      const shots = db.select().from(schema.storyboards)
        .where(eq(schema.storyboards.episodeId, episodeId)).all()
        .filter(sb => shot_ids.includes(sb.id))
        .map(sb => ({
          shot_number: sb.storyboardNumber,
          description: sb.description || sb.title || '',
          shot_type: sb.shotType || '',
          dialogue: sb.dialogue || '',
          location: sb.location || '',
          time: sb.time || '',
        }))
      return { shots }
    },
  })

  const generateGridPrompt = createTool({
    id: 'generate_grid_prompt',
    description: '为宫格图生成整体画面描述和每个格子的独立提示词。遵循 grid-image-generator SKILL.md 的三种模式规范。',
    inputSchema: z.object({
      shots: z.array(z.object({
        shot_number: z.number(),
        description: z.string(),
        shot_type: z.string().optional(),
        dialogue: z.string().optional(),
        location: z.string().optional(),
        time: z.string().optional(),
      })),
      rows: z.number(),
      cols: z.number(),
      mode: z.string(), // 'first_frame' | 'first_last' | 'multi_ref'
      reference_legend: z.string().optional(),
    }),
    execute: async ({ shots, rows, cols, mode, reference_legend }) => {
      if (!shots.length) return { error: 'No shots provided', grid_prompt: '', cell_prompts: [] }
      const totalCells = rows * cols
      const legendPrefix = reference_legend ? `参考图映射：${reference_legend}, ` : ''

      if (mode === 'multi_ref') {
        const sb = shots[0]
        const gridPrompt = `${rows}x${cols} 宫格布局，正好 ${totalCells} 个可见分格，画风一致，电影质感，${legendPrefix}${sb.description}，所有分格光影与色板完全一致，不要合并分格、不要缺格，无文字，无水印`
        const cellPrompts = Array.from({ length: totalCells }, (_, i) => ({
          shot_number: sb.shot_number,
          frame_type: 'reference',
          prompt: `格${i + 1}：${reference_legend ? `参考${reference_legend}，` : ''}${sb.description}，电影感光影，与 ${rows}x${cols} 宫格其他分格保持一致`,
        }))
        return { grid_prompt: gridPrompt, cell_prompts: cellPrompts }
      }

      if (mode === 'first_last') {
        const cellPrompts = []
        for (let i = 0; i < totalCells; i++) {
          const s = shots[i % shots.length]
          const isFirst = i % 2 === 0
          cellPrompts.push({
            shot_number: s.shot_number,
            frame_type: isFirst ? 'first_frame' : 'last_frame',
            prompt: isFirst
              ? `格${i + 1}：${reference_legend ? `参考${reference_legend}，` : ''}${s.description}${s.location ? `, ${s.location}` : ''}${s.shot_type ? `, ${s.shot_type}` : ''}，开场画面`
              : `格${i + 1}：${reference_legend ? `参考${reference_legend}，` : ''}${s.description}${s.location ? `, ${s.location}` : ''}${s.shot_type ? `, ${s.shot_type}` : ''}，结束画面，动作连续`,
          })
        }
        const gridPrompt = `${rows}x${cols} 宫格布局，正好 ${totalCells} 个可见分格，画风一致，电影质感，${legendPrefix}${shots.map(s => s.description).join(' | ')}，不要合并分格、不要缺格，无文字，无水印`
        return { grid_prompt: gridPrompt, cell_prompts: cellPrompts }
      }

      // first_frame mode
      const cellPrompts = Array.from({ length: totalCells }, (_, i) => {
        const s = shots[i % shots.length]
        return {
          shot_number: s.shot_number,
          frame_type: 'first_frame',
          prompt: `格${i + 1}：${reference_legend ? `参考${reference_legend}，` : ''}${s.description}${s.location ? `, ${s.location}` : ''}${s.shot_type ? `, ${s.shot_type}` : ''}，开场画面`,
        }
      })
      const gridPrompt = `${rows}x${cols} 宫格布局，正好 ${totalCells} 个可见分格，画风一致，电影质感，${legendPrefix}${shots.map(s => s.description).join(' | ')}，不要合并分格、不要缺格，无文字，无水印`
      return { grid_prompt: gridPrompt, cell_prompts: cellPrompts }
    },
  })

  return {
    readCharacters,
    generateCharacterPrompt,
    readScenes,
    generateScenePrompt,
    readShotsForGrid,
    generateGridPrompt,
  }
}
