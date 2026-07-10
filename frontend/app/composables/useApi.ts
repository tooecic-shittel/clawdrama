import { getAuthToken, clearAuthOnUnauthorized } from './useAuth'

const BASE = '/api/v1'

/**
 * Translate raw upstream errors to user-friendly Chinese messages.
 * Returns the original message if no specific pattern matches.
 */
export function humanizeError(raw: string): string {
  if (!raw) return '操作失败'
  const s = String(raw)

  // 后端重启/网关错误时 nginx 返回 HTML 错误页，JSON.parse 抛 "Unexpected token '<'"
  if (/Unexpected token '?<'?|is not valid JSON|Bad Gateway|Gateway Time-?out/i.test(s)) {
    return '服务器正在重启或暂时不可用，等几秒再试一次即可'
  }

  if (/prompt length cannot exceed 2000 characters|prompt.*exceed.*2000/i.test(s)) {
    return 'Vidu 视频提示词超过 2000 字限制，系统会自动压缩后重试；如果仍失败，请缩短故事板提示词'
  }

  // Field validation BEFORE quota check (aggregators often wrap validation errors in 429)
  if (/invalid_request_error|field invalid|invalid.*voice/i.test(s)) {
    if (/voice/i.test(s)) {
      const m = s.match(/allowed values are[: ]+([a-z0-9, ]+)/i)
      return m ? `TTS 音色不支持，可用：${m[1]}` : 'TTS 音色不支持，请联系管理员'
    }
    if (/model/i.test(s)) return '当前模型不支持该请求格式'
    return '请求参数错误'
  }

  if (/local:quota_not_enough|Account quota insufficient|quota_not_enough/i.test(s)) {
    return '云雾 HappyHorse 账户余额或额度不足，请充值后再试'
  }
  if (/local:pre_consume_token_quota_failed|upstream load is saturated|饱和|do_response_failed/i.test(s)) {
    return '云雾上游繁忙，请稍后再试'
  }
  if (/AccountOverdueError|overdue balance/i.test(s)) {
    return '火山 Seedance 账户欠费或余额逾期，请到火山方舟充值/结清后再试'
  }
  if (/provider=minimax|MiniMax|Hailuo|海螺/i.test(s) && /insufficient balance/i.test(s)) {
    return '海螺 Hailuo 账户余额不足，请到 MiniMax 充值后再试'
  }
  if (/insufficient balance/i.test(s)) {
    return '当前视频引擎账户余额不足，请充值后再试'
  }

  // Quota / rate limit family — only if it's a TRUE quota error
  if (/RESOURCE_EXHAUSTED|exceeded your current quota|exceeded.*rate limit|insufficient quota/i.test(s)) {
    if (/veo|Veo|video/i.test(s)) return '视频生成配额已用完，请等几分钟后再试'
    return '请求过于频繁或配额已用完，请稍后再试'
  }
  // Plain 429 fallback (after specific checks above)
  if (/\b429\b/.test(s) && !/voice|model|field/i.test(s)) {
    return '请求过于频繁，请稍后再试'
  }
  // Auth / billing
  if (/invalid.?api.?key|无效的 ?API ?Key|invalid_request_error.*api/i.test(s)) {
    return 'API Key 无效，请联系管理员检查配置'
  }
  if (/billing|payment|未找到模型.*价格/i.test(s)) {
    return '该模型未开通付费/无价格配置，请联系管理员'
  }
  // Image / size errors
  if (/Inpaint image must match/i.test(s)) {
    return '参考图尺寸不匹配，请重新生成首帧后再试'
  }
  if (/Invalid URL .*POST/i.test(s)) {
    return '接口路径不正确，可能是模型/服务商配置错误'
  }
  // Network
  if (/Failed to fetch|Network|ECONNREFUSED|ETIMEDOUT/i.test(s)) {
    return '网络连接失败，请检查后端服务是否正常'
  }
  // FFmpeg
  if (/Cannot find ffmpeg/i.test(s)) {
    return 'FFmpeg 未安装，无法合成视频。请联系管理员'
  }
  // Credits
  if (/积分不足|insufficient credits/i.test(s)) {
    const m = s.match(/当前\s*(\d+)[^\d]+需要\s*(\d+)/)
    return m ? `积分余额不足：当前 ${m[1]}，本次需要 ${m[2]}` : '积分余额不足，请充值后再操作'
  }
  // Auth
  if (/未登录|token 无效|401|未授权/i.test(s)) {
    return '登录已过期，请重新登录'
  }
  // Veo specific
  if (/no video URL found/i.test(s)) {
    return '视频生成失败，未能获取视频地址，请重试'
  }
  // Generic API error JSON dump — try to extract message
  const m = s.match(/"message"\s*:\s*"([^"]{8,200})"/)
  if (m) return m[1]
  // Cut very long errors
  return s.length > 160 ? s.slice(0, 160) + '...' : s
}

async function req<T = any>(method: string, path: string, body?: any): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const token = getAuthToken()
  if (token) headers['Authorization'] = `Bearer ${token}`

  const opts: RequestInit = { method, headers }
  if (body) opts.body = JSON.stringify(body)

  const start = performance.now()
  console.log(`%c[API] %c${method} %c${path}`, 'color:#888', 'color:#4fc3f7;font-weight:bold', 'color:#ccc', body || '')

  try {
    const resp = await fetch(`${BASE}${path}`, opts)
    const json = await resp.json()
    const ms = Math.round(performance.now() - start)

    if (resp.status === 401) {
      clearAuthOnUnauthorized()
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login') && !window.location.pathname.startsWith('/register') && window.location.pathname !== '/') {
        const redirect = encodeURIComponent(window.location.pathname + window.location.search)
        window.location.href = `/login?redirect=${redirect}`
      }
      throw new Error(json.message || '未登录')
    }

    if (!resp.ok || (json.code && json.code >= 400)) {
      console.log(`%c[API] %c${method} ${path} %c${resp.status} %c${ms}ms`, 'color:#888', 'color:#ef5350', 'color:#ef5350;font-weight:bold', 'color:#888', json.message || '')
      throw new Error(humanizeError(json.message || `${resp.status}`))
    }

    console.log(`%c[API] %c${method} ${path} %c${resp.status} %c${ms}ms`, 'color:#888', 'color:#66bb6a', 'color:#66bb6a;font-weight:bold', 'color:#888')
    return json.data ?? json
  } catch (err: any) {
    if (!err.message?.match(/^\d{3}$/)) {
      const ms = Math.round(performance.now() - start)
      console.log(`%c[API] %c${method} ${path} %cERROR %c${ms}ms`, 'color:#888', 'color:#ef5350', 'color:#ef5350;font-weight:bold', 'color:#888', err.message)
    }
    // Re-throw with humanized message (idempotent — already-humanized strings pass through)
    throw new Error(humanizeError(err.message || String(err)))
  }
}

async function uploadReq<T = any>(path: string, formData: FormData): Promise<T> {
  const headers: Record<string, string> = {}
  const token = getAuthToken()
  if (token) headers.Authorization = `Bearer ${token}`

  const resp = await fetch(`${BASE}${path}`, { method: 'POST', headers, body: formData })
  const json = await resp.json().catch(() => ({}))
  if (resp.status === 401) {
    clearAuthOnUnauthorized()
    throw new Error(humanizeError(json.message || '未登录'))
  }
  if (!resp.ok || (json.code && json.code >= 400)) {
    throw new Error(humanizeError(json.message || `${resp.status}`))
  }
  return json.data ?? json
}

export const api = {
  get: <T = any>(p: string) => req<T>('GET', p),
  post: <T = any>(p: string, b?: any) => req<T>('POST', p, b),
  put: <T = any>(p: string, b?: any) => req<T>('PUT', p, b),
  del: <T = any>(p: string) => req<T>('DELETE', p),
}

export const dramaAPI = {
  list: (params?: { page?: number; page_size?: number; status?: string; keyword?: string }) => {
    const q = new URLSearchParams()
    if (params?.page) q.set('page', String(params.page))
    if (params?.page_size) q.set('page_size', String(params.page_size))
    if (params?.status) q.set('status', params.status)
    if (params?.keyword) q.set('keyword', params.keyword)
    const suffix = q.toString() ? `?${q.toString()}` : ''
    return api.get<{ items: any[]; pagination?: any }>(`/dramas${suffix}`)
  },
  get: (id: number) => api.get(`/dramas/${id}`),
  create: (data: any) => api.post('/dramas', data),
  update: (id: number, data: any) => api.put(`/dramas/${id}`, data),
  del: (id: number) => api.del(`/dramas/${id}`),
}

export const episodeAPI = {
  create: (data: any) => api.post('/episodes', data),
  update: (id: number, data: any) => api.put(`/episodes/${id}`, data),
  characters: (id: number) => api.get(`/episodes/${id}/characters`),
  scenes: (id: number) => api.get(`/episodes/${id}/scenes`),
  storyboards: (id: number) => api.get(`/episodes/${id}/storyboards`),
  pipelineStatus: (id: number) => api.get(`/episodes/${id}/pipeline-status`),
}

export const storyboardAPI = {
  create: (data: any) => api.post('/storyboards', data),
  update: (id: number, data: any) => api.put(`/storyboards/${id}`, data),
  generateTTS: (id: number, voiceId?: string) => api.post(`/storyboards/${id}/generate-tts${voiceId ? `?voice_id=${encodeURIComponent(voiceId)}` : ''}`, voiceId ? { voice_id: voiceId } : {}),
  enhanceVideoPrompt: (id: number, prompt?: string) => api.post<{ prompt: string }>(`/storyboards/${id}/enhance-video-prompt`, prompt ? { prompt } : {}),
  del: (id: number) => api.del(`/storyboards/${id}`),
}

export const characterAPI = {
  update: (id: number, data: any) => api.put(`/characters/${id}`, data),
  voiceSample: (id: number, episodeId: number) => api.post(`/characters/${id}/generate-voice-sample`, { episode_id: episodeId }),
  generateImage: (id: number, episodeId: number, opts?: { prompt?: string }) => api.post(`/characters/${id}/generate-image`, { episode_id: episodeId, ...(opts?.prompt ? { prompt: opts.prompt } : {}) }),
  uploadImage: (id: number, file: File, episodeId?: number) => {
    const form = new FormData()
    form.append('file', file)
    if (episodeId) form.append('episode_id', String(episodeId))
    return uploadReq(`/characters/${id}/upload-image`, form)
  },
  enhancePrompt: (id: number, prompt?: string) => api.post<{ prompt: string }>(`/characters/${id}/enhance-prompt`, prompt ? { prompt } : {}),
  generateView: (id: number, episodeId: number, view: 'side' | 'back') =>
    api.post(`/characters/${id}/generate-view`, { episode_id: episodeId, view }),
  batchImages: (ids: number[], episodeId: number) => api.post('/characters/batch-generate-images', { character_ids: ids, episode_id: episodeId }),
}

export const sceneAPI = {
  generateImage: (id: number, episodeId: number, opts?: { prompt?: string; referenceCharacterIds?: number[] | null }) => {
    const payload: any = { episode_id: episodeId }
    if (opts?.prompt) payload.prompt = opts.prompt
    if (Array.isArray(opts?.referenceCharacterIds)) payload.reference_character_ids = opts.referenceCharacterIds
    return api.post(`/scenes/${id}/generate-image`, payload)
  },
  uploadImage: (id: number, file: File, episodeId: number) => {
    const form = new FormData()
    form.append('file', file)
    form.append('episode_id', String(episodeId))
    return uploadReq(`/scenes/${id}/upload-image`, form)
  },
}

export const imageAPI = {
  generate: (d: any) => api.post('/images', d),
  list: (params?: { drama_id?: number; storyboard_id?: number }) => {
    const query = new URLSearchParams()
    if (params?.drama_id) query.set('drama_id', String(params.drama_id))
    if (params?.storyboard_id) query.set('storyboard_id', String(params.storyboard_id))
    return api.get(`/images${query.size ? `?${query.toString()}` : ''}`)
  },
}
export const gridAPI = {
  prompt: (d: any) => api.post('/grid/prompt', d),
  generate: (d: any) => api.post('/grid/generate', d),
  status: (id: number) => api.get(`/grid/status/${id}`),
  split: (d: any) => api.post('/grid/split', d),
}
export const videoAPI = {
  generate: (d: any) => api.post('/videos', d),
  get: (id: number) => api.get(`/videos/${id}`),
}
export const composeAPI = {
  shot: (id: number, includeNarration = true) => api.post(`/compose/storyboards/${id}/compose`, { include_narration: includeNarration }),
  all: (epId: number, includeNarration = true) => api.post(`/compose/episodes/${epId}/compose-all`, { include_narration: includeNarration }),
  status: (epId: number) => api.get(`/compose/episodes/${epId}/compose-status`),
}
export const mergeAPI = {
  merge: (epId: number) => api.post(`/merge/episodes/${epId}/merge`),
  status: (epId: number) => api.get(`/merge/episodes/${epId}/merge`),
}
export const aiConfigAPI = {
  list: (t?: string) => api.get(`/ai-configs${t ? `?service_type=${t}` : ''}`),
  create: (d: any) => api.post('/ai-configs', d),
  update: (id: number, d: any) => api.put(`/ai-configs/${id}`, d),
  del: (id: number) => api.del(`/ai-configs/${id}`),
  test: (d: any) => api.post('/ai-configs/test', d),
  huobaoPreset: (apiKey: string, baseUrl?: string) =>
    api.post('/ai-configs/huobao-preset', { api_key: apiKey, base_url: baseUrl }),
}

export const agentConfigAPI = {
  list: () => api.get('/agent-configs'),
  get: (id: number) => api.get(`/agent-configs/${id}`),
  create: (d: any) => api.post('/agent-configs', d),
  update: (id: number, d: any) => api.put(`/agent-configs/${id}`, d),
  del: (id: number) => api.del(`/agent-configs/${id}`),
}

export const agentExtractionAPI = {
  prepare: (dramaId: number, episodeId: number) => api.post('/agent/extractor/prepare', { drama_id: dramaId, episode_id: episodeId }),
  confirm: (dramaId: number, episodeId: number, data: { characters: any[]; scenes: any[] }) =>
    api.post('/agent/extractor/confirm', { drama_id: dramaId, episode_id: episodeId, ...data }),
}

export const skillsAPI = {
  list: () => api.get('/skills'),
  get: (id: string) => api.get(`/skills/${id}`),
  create: (data: { id: string; name: string; description?: string }) => api.post('/skills', data),
  update: (id: string, content: string) => api.put(`/skills/${id}`, { content }),
  del: (id: string) => api.del(`/skills/${id}`),
}

export const voicesAPI = {
  list: (provider?: string) => api.get(`/ai-voices${provider ? `?provider=${provider}` : ''}`),
  sync: () => api.post('/ai-voices/sync', {}),
}

export const authAPI = {
  status: () => api.get<{ has_users: boolean; registration_open: boolean; invite_required?: boolean }>('/auth/status'),
  register: (d: { username: string; password: string; display_name?: string; email?: string; invite_code?: string }) =>
    api.post<{ token: string; user: any }>('/auth/register', d),
  login: (d: { username: string; password: string }) =>
    api.post<{ token: string; user: any }>('/auth/login', d),
  me: () => api.get<any>('/auth/me'),
}

export const inviteAPI = {
  my: () => api.get<{ code: string; invited_count: number; invited: Array<{ username: string; created_at: string }>; reward_total: number; reward_per_invite: number; invitee_bonus: number }>('/invites/my'),
  list: () => api.get<Array<{ id: number; code: string; note: string | null; max_uses: number; used_count: number; is_active: boolean; used_by: string[]; created_at: string }>>('/invites'),
  create: (d: { count?: number; max_uses?: number; note?: string }) =>
    api.post<{ codes: string[]; max_uses: number; note: string | null }>('/invites', d),
  toggle: (id: number) => api.post<{ id: number; is_active: boolean }>(`/invites/${id}/toggle`, {}),
}

export const creditsAPI = {
  balance: () => api.get<{ balance: number }>('/credits/balance'),
  history: (params?: { limit?: number; offset?: number }) => {
    const q = new URLSearchParams()
    if (params?.limit) q.set('limit', String(params.limit))
    if (params?.offset) q.set('offset', String(params.offset))
    return api.get<{ items: any[] }>(`/credits/history${q.size ? `?${q.toString()}` : ''}`)
  },
  packages: () => api.get<{ items: any[]; topups: any[] }>('/credits/packages'),
  pricing: () => api.get<{ image: number; tts: number; videoPerSec: Record<string, Record<string, number>> }>('/credits/pricing'),
  grant: (d: { user_id: number; amount: number; description?: string }) =>
    api.post<{ balance: number; transaction: any }>('/credits/grant', d),
  listUsers: (q?: string) => api.get<{ items: any[] }>(`/credits/users${q ? `?q=${encodeURIComponent(q)}` : ''}`),
}

export const paymentAPI = {
  createOrder: (packageId: string) =>
    api.post<{ order_no: string; pay_url: string; amount_cents: number; credits: number; package_name: string }>(
      '/payments/orders',
      { package_id: packageId },
    ),
  getOrder: (orderNo: string) =>
    api.get<{ order: any }>(`/payments/orders/${encodeURIComponent(orderNo)}`),
}
