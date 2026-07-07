/**
 * Agent 聊天路由 — 非流式版本
 */
import { Hono } from 'hono'
import { createAgent, validAgentTypes } from '../agents/index.js'
import { success, badRequest } from '../utils/response.js'
import { db, schema } from '../db/index.js'
import { eq, and } from 'drizzle-orm'
import { now } from '../utils/response.js'
import { getTextConfig, getTextProviderBaseUrl } from '../services/ai.js'
import { joinProviderUrl } from '../services/adapters/url.js'
import { canAccess, dramaOwnerId, episodeOwnerId } from '../middleware/ownership.js'
import { logTaskError, logTaskPayload, logTaskProgress, logTaskStart, logTaskSuccess } from '../utils/task-logger.js'

const app = new Hono()

function normalizeCharacterName(name: string) {
  return String(name || '').trim().replace(/\s+/g, '')
}

function isGenericCharacterName(name: string) {
  const normalized = normalizeCharacterName(name)
  return /^(他|她|它|他们|她们|男主|女主|主角|少年|少女|男人|女人|男子|女子|老人|老者|路人|群众|众人|旁人|下人|侍卫|手下|弟子|村民|店主|老板|司机|医生|护士|警察|老师|同学|同事|配角|反派)$/.test(normalized)
}

function linkCharToEpisode(episodeId: number, characterId: number) {
  const ts = now()
  const existing = db.select().from(schema.episodeCharacters)
    .where(and(eq(schema.episodeCharacters.episodeId, episodeId), eq(schema.episodeCharacters.characterId, characterId)))
    .all()
  if (!existing.length) db.insert(schema.episodeCharacters).values({ episodeId, characterId, createdAt: ts }).run()
}

function linkSceneToEpisode(episodeId: number, sceneId: number) {
  const ts = now()
  const existing = db.select().from(schema.episodeScenes)
    .where(and(eq(schema.episodeScenes.episodeId, episodeId), eq(schema.episodeScenes.sceneId, sceneId)))
    .all()
  if (!existing.length) db.insert(schema.episodeScenes).values({ episodeId, sceneId, createdAt: ts }).run()
}

function parseJsonObject(text: string) {
  const raw = String(text || '').trim()
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]
  const candidate = fenced || raw.match(/\{[\s\S]*\}/)?.[0] || raw
  return JSON.parse(candidate)
}

async function callTextJson(system: string, user: string) {
  const config = getTextConfig()
  const url = joinProviderUrl(getTextProviderBaseUrl(config), '', '/chat/completions')
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      temperature: 0.1,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
    signal: AbortSignal.timeout(180_000),
  })
  const json: any = await resp.json().catch(() => ({}))
  if (!resp.ok) throw new Error(json?.error?.message || json?.message || `Text API error ${resp.status}`)
  return parseJsonObject(json?.choices?.[0]?.message?.content || '')
}

function normalizeToolName(entry: any) {
  return entry?.toolName
    || entry?.tool?.toolName
    || entry?.tool?.id
    || entry?.name
    || entry?.type
    || null
}

function normalizeToolResult(entry: any) {
  const result = entry?.result ?? entry?.output ?? entry?.data ?? null
  return typeof result === 'string' ? result : JSON.stringify(result)
}

// POST /agent/:type/chat — 非流式 Agent 对话
app.post('/:type/chat', async (c) => {
  const agentType = c.req.param('type')
  if (!validAgentTypes.includes(agentType)) {
    return badRequest(c, `Invalid agent type: ${agentType}`)
  }

  const body = await c.req.json()
  const { message, drama_id, episode_id } = body

  logTaskStart('Agent', agentType, {
    dramaId: drama_id,
    episodeId: episode_id,
    message,
  })
  logTaskPayload('Agent', `${agentType} input`, body)

  if (!episode_id || !drama_id) {
    logTaskError('Agent', agentType, { reason: 'missing drama_id or episode_id' })
    return badRequest(c, 'drama_id and episode_id are required')
  }

  const agent = createAgent(agentType, episode_id, drama_id)
  if (!agent) {
    logTaskError('Agent', agentType, { reason: 'agent not found' })
    return badRequest(c, 'Agent not found')
  }

  const startTime = performance.now()

  try {
    const result = await agent.generate(
      [{ role: 'user', content: message }],
      { maxSteps: 20 },
    )

    const elapsed = ((performance.now() - startTime) / 1000).toFixed(1)
    logTaskSuccess('Agent', agentType, { elapsedSeconds: elapsed })

    // 收集所有 tool calls 和 results
    const toolCalls = result.toolCalls || []
    const toolResults = result.toolResults || []
    const normalizedToolCalls = toolCalls.map((tc: any) => ({
      toolName: normalizeToolName(tc),
      args: tc?.args ?? tc?.input ?? null,
    }))
    const normalizedToolResults = toolResults.map((tr: any) => ({
      toolName: normalizeToolName(tr),
      result: normalizeToolResult(tr),
    }))

    logTaskProgress('Agent', 'tool-summary', {
      agentType,
      toolCalls: normalizedToolCalls.map((tc: any) => tc.toolName),
      toolResults: normalizedToolResults.map((tr: any) => tr.toolName),
    })
    logTaskPayload('Agent', `${agentType} tool-results`, normalizedToolResults)

    return success(c, {
      type: 'done',
      text: result.text || '',
      toolCalls: normalizedToolCalls,
      toolResults: normalizedToolResults,
    })
  } catch (err: any) {
    const elapsed = ((performance.now() - startTime) / 1000).toFixed(1)
    logTaskError('Agent', agentType, { elapsedSeconds: elapsed, error: err.message })
    console.error(err.stack || err)
    return badRequest(c, err.message || 'Agent execution failed')
  }
})

// POST /agent/extractor/prepare — 只分析角色/场景候选，不落库；前端确认后再保存
app.post('/extractor/prepare', async (c) => {
  const body = await c.req.json()
  const dramaId = Number(body.drama_id)
  const episodeId = Number(body.episode_id)
  if (!dramaId || !episodeId) return badRequest(c, 'drama_id and episode_id are required')
  if (!canAccess(c, dramaOwnerId(dramaId)) || !canAccess(c, episodeOwnerId(episodeId))) return badRequest(c, '无权访问')

  const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).all()
  if (!ep) return badRequest(c, 'Episode not found')
  const script = ep.scriptContent || ep.content
  if (!script) return badRequest(c, '请先保存剧本内容')

  const projectCharacters = db.select().from(schema.characters)
    .where(eq(schema.characters.dramaId, dramaId)).all()
    .filter(ch => !ch.deletedAt)
  const projectScenes = db.select().from(schema.scenes)
    .where(eq(schema.scenes.dramaId, dramaId)).all()
    .filter(sc => !sc.deletedAt)

  const system = [
    '你是短剧制片助理。请从当前集剧本中提取本集真实出现的角色和场景。',
    '只输出 JSON，不要输出解释。',
    '角色规则：不要把男主、女主、他、她、少年、路人、众人、侍卫等泛称当成角色名；角色名必须是剧本中可稳定复用的具体人物名。',
    '匹配规则：只有名字精确对应或剧本明确别名关系，才填写 matched_existing_character_id；不能凭感觉合并。',
    '已有角色有定妆资产时，不要改写其核心外貌，只补充本集剧情相关描述。',
  ].join('\n')
  const user = [
    `项目已有角色：${JSON.stringify(projectCharacters.map(ch => ({
      id: ch.id,
      name: ch.name,
      role: ch.role || '',
      description: ch.description || '',
      appearance: ch.appearance || '',
      has_visual: !!(ch.imageUrl || ch.localPath || ch.viewSide || ch.viewBack || ch.referenceImages),
    })))}`,
    `项目已有场景：${JSON.stringify(projectScenes.map(sc => ({ id: sc.id, location: sc.location, time: sc.time || '', prompt: sc.prompt || '' })))}`,
    `当前集剧本：\n${script}`,
    '输出格式：{"characters":[{"name":"","role":"","description":"","appearance":"","personality":"","matched_existing_character_id":null,"match_reason":"","action":"reuse|create|ignore"}],"scenes":[{"location":"","time":"","prompt":"","matched_existing_scene_id":null,"action":"reuse|create"}]}',
  ].join('\n\n')

  try {
    logTaskStart('ExtractionConfirm', 'prepare', { dramaId, episodeId })
    const result = await callTextJson(system, user)
    const characters = Array.isArray(result.characters) ? result.characters : []
    const scenes = Array.isArray(result.scenes) ? result.scenes : []
    const preparedCharacters = characters.map((ch: any) => {
      const name = normalizeCharacterName(ch.name)
      const exact = projectCharacters.find(pc => normalizeCharacterName(pc.name) === name)
      const byId = ch.matched_existing_character_id
        ? projectCharacters.find(pc => pc.id === Number(ch.matched_existing_character_id))
        : null
      const matched = byId || exact || null
      const generic = isGenericCharacterName(name)
      return {
        name: ch.name || '',
        role: ch.role || '',
        description: ch.description || '',
        appearance: ch.appearance || '',
        personality: ch.personality || '',
        action: generic ? 'ignore' : (matched ? 'reuse' : (ch.action === 'ignore' ? 'ignore' : 'create')),
        existing_character_id: matched?.id || null,
        matched_character: matched ? { id: matched.id, name: matched.name, has_visual: !!(matched.imageUrl || matched.localPath || matched.viewSide || matched.viewBack || matched.referenceImages) } : null,
        match_reason: generic ? '泛称，已建议忽略' : (matched ? (ch.match_reason || '名称匹配') : ''),
      }
    }).filter((ch: any) => ch.name)
    const preparedScenes = scenes.map((sc: any) => {
      const location = String(sc.location || '').trim()
      const time = String(sc.time || '').trim()
      const matched = sc.matched_existing_scene_id
        ? projectScenes.find(ps => ps.id === Number(sc.matched_existing_scene_id))
        : projectScenes.find(ps => ps.location === location && (ps.time || '') === time)
      return {
        location,
        time,
        prompt: sc.prompt || '',
        action: matched ? 'reuse' : 'create',
        existing_scene_id: matched?.id || null,
        matched_scene: matched ? { id: matched.id, location: matched.location, time: matched.time || '' } : null,
      }
    }).filter((sc: any) => sc.location)
    logTaskSuccess('ExtractionConfirm', 'prepare', { dramaId, episodeId, characters: preparedCharacters.length, scenes: preparedScenes.length })
    return success(c, {
      characters: preparedCharacters,
      scenes: preparedScenes,
      project_characters: projectCharacters.map(ch => ({
        id: ch.id,
        name: ch.name,
        role: ch.role || '',
        has_visual: !!(ch.imageUrl || ch.localPath || ch.viewSide || ch.viewBack || ch.referenceImages),
      })),
    })
  } catch (err: any) {
    logTaskError('ExtractionConfirm', 'prepare', { dramaId, episodeId, error: err.message })
    return badRequest(c, err.message || '提取失败')
  }
})

// POST /agent/extractor/confirm — 保存用户确认后的角色/场景映射
app.post('/extractor/confirm', async (c) => {
  const body = await c.req.json()
  const dramaId = Number(body.drama_id)
  const episodeId = Number(body.episode_id)
  if (!dramaId || !episodeId) return badRequest(c, 'drama_id and episode_id are required')
  if (!canAccess(c, dramaOwnerId(dramaId)) || !canAccess(c, episodeOwnerId(episodeId))) return badRequest(c, '无权访问')

  const ts = now()
  const projectCharacters = db.select().from(schema.characters)
    .where(eq(schema.characters.dramaId, dramaId)).all()
    .filter(ch => !ch.deletedAt)
  const results = { characters_created: 0, characters_reused: 0, characters_ignored: 0, scenes_created: 0, scenes_reused: 0 }

  for (const ch of Array.isArray(body.characters) ? body.characters : []) {
    const action = ch.action || 'create'
    const name = normalizeCharacterName(ch.name)
    if (action === 'ignore' || !name || isGenericCharacterName(name)) {
      results.characters_ignored++
      continue
    }
    const existing = action === 'reuse'
      ? projectCharacters.find(pc => pc.id === Number(ch.existing_character_id))
      : null
    if (existing) {
      const hasLockedVisual = !!(existing.imageUrl || existing.localPath || existing.viewSide || existing.viewBack || existing.referenceImages)
      db.update(schema.characters).set({
        role: ch.role || existing.role,
        description: ch.description || existing.description,
        appearance: hasLockedVisual ? existing.appearance : (ch.appearance || existing.appearance),
        personality: hasLockedVisual ? existing.personality : (ch.personality || existing.personality),
        updatedAt: ts,
      }).where(eq(schema.characters.id, existing.id)).run()
      linkCharToEpisode(episodeId, existing.id)
      results.characters_reused++
      continue
    }
    const res = db.insert(schema.characters).values({
      name: ch.name,
      role: ch.role || '',
      description: ch.description || '',
      appearance: ch.appearance || '',
      personality: ch.personality || '',
      dramaId,
      createdAt: ts,
      updatedAt: ts,
    }).run()
    linkCharToEpisode(episodeId, Number(res.lastInsertRowid))
    results.characters_created++
  }

  const projectScenes = db.select().from(schema.scenes)
    .where(eq(schema.scenes.dramaId, dramaId)).all()
    .filter(sc => !sc.deletedAt)
  for (const sc of Array.isArray(body.scenes) ? body.scenes : []) {
    const location = String(sc.location || '').trim()
    if (!location) continue
    const time = String(sc.time || '').trim()
    const existing = sc.action === 'reuse'
      ? projectScenes.find(ps => ps.id === Number(sc.existing_scene_id))
      : projectScenes.find(ps => ps.location === location && (ps.time || '') === time)
    if (existing) {
      linkSceneToEpisode(episodeId, existing.id)
      results.scenes_reused++
      continue
    }
    const res = db.insert(schema.scenes).values({
      dramaId,
      location,
      time,
      prompt: sc.prompt || '',
      status: 'pending',
      createdAt: ts,
      updatedAt: ts,
    }).run()
    linkSceneToEpisode(episodeId, Number(res.lastInsertRowid))
    results.scenes_created++
  }

  logTaskSuccess('ExtractionConfirm', 'confirm', { dramaId, episodeId, ...results })
  return success(c, results)
})

// GET /agent/:type/debug
app.get('/:type/debug', async (c) => {
  const agentType = c.req.param('type')
  if (!validAgentTypes.includes(agentType)) return badRequest(c, 'Invalid agent type')
  return success(c, { agent_type: agentType, valid: true })
})

export default app
