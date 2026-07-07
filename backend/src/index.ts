import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import path from 'path'
import { fileURLToPath } from 'url'

import dramas from './routes/dramas.js'
import episodes from './routes/episodes.js'
import storyboards from './routes/storyboards.js'
import scenes from './routes/scenes.js'
import characters from './routes/characters.js'
import images from './routes/images.js'
import videos from './routes/videos.js'
import upload from './routes/upload.js'
import aiConfigs, { aiProviders } from './routes/aiConfigs.js'
import agentConfigs from './routes/agentConfigs.js'
import agent from './routes/agent.js'
import compose from './routes/compose.js'
import merge from './routes/merge.js'
import grid from './routes/grid.js'
import skills from './routes/skills.js'
import webhooks from './routes/webhooks.js'
import aiVoices from './routes/aiVoices.js'
import auth from './routes/auth.js'
import credits from './routes/credits.js'
import payments from './routes/payments.js'
import backup from './routes/backup.js'
import { requestLogger, errorHandler } from './middleware/logger.js'
import { requireAuth } from './middleware/auth.js'
import { seedAiConfigs, seedMinimaxVoices } from './db/seed-ai-configs.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '../..')

const app = new Hono()

// Middleware
app.use('*', cors({
  origin: ['http://localhost:3013', 'http://localhost:5679'],
  credentials: true,
}))
app.use('*', requestLogger)
app.use('*', errorHandler)

// 兜底错误处理：任何漏出中间件 try/catch 的异常（含子应用/框架层），统一返回 JSON，
// 避免前端拿到纯文本 "Internal Server Error" 再 JSON.parse 失败、看不到真正错因。
app.onError((err, c) => {
  const status = (err as any).status || 500
  console.error(`[onError] ${c.req.method} ${c.req.path}:`, (err as any)?.stack || err)
  return c.json({ code: status, message: (err as any)?.message || 'Internal Server Error' }, status)
})

// Health check
app.get('/api/v1/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }))

// Public auth routes (no token required)
app.route('/api/v1/auth', auth)

// Payment routes: order creation is protected per-route; provider callbacks must stay public.
app.route('/api/v1/payments', payments)

// Protected API routes — require Bearer token
const api = new Hono()
api.use('*', requireAuth)
api.route('/dramas', dramas)
api.route('/episodes', episodes)
api.route('/storyboards', storyboards)
api.route('/scenes', scenes)
api.route('/characters', characters)
api.route('/images', images)
api.route('/videos', videos)
api.route('/upload', upload)
api.route('/ai-configs', aiConfigs)
api.route('/ai-providers', aiProviders)
api.route('/agent-configs', agentConfigs)
api.route('/agent', agent)
api.route('/compose', compose)
api.route('/merge', merge)
api.route('/grid', grid)
api.route('/skills', skills)
api.route('/ai-voices', aiVoices)
api.route('/credits', credits)
api.route('/backup', backup) // 临时：迁移 Railway→阿里云 用，迁完删除

app.route('/api/v1', api)

// Webhook callbacks (Vidu, etc.) - outside /api/v1
app.route('/webhooks', webhooks)

// Serve static files (storage)
app.use('/static/*', serveStatic({ root: path.join(projectRoot, 'data') }))

// The SPA entry must not be cached, otherwise users can keep running an old
// hashed JS bundle after deploy. Hashed /_nuxt assets may still be cached.
app.use('*', async (c, next) => {
  await next()
  const contentType = c.res.headers.get('content-type') || ''
  if (contentType.includes('text/html')) {
    c.res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
    c.res.headers.set('Pragma', 'no-cache')
    c.res.headers.set('Expires', '0')
  }
})

// Serve frontend (production build)
const distPath = path.join(projectRoot, 'frontend', 'dist')
app.use('*', serveStatic({ root: distPath }))
app.get('*', serveStatic({ root: distPath, path: 'index.html' }))

// 启动时按环境变量预置全局 AI 配置（key 只来自环境变量，不进 git）
try {
  seedAiConfigs()
  seedMinimaxVoices()
} catch (err) {
  console.error('⚠️  AI 配置播种失败（不影响启动，可在设置页手动配置）:', err)
}

const port = Number(process.env.PORT || 5679)
console.log(`🚀 Huobao Drama TS server on http://localhost:${port}`)
serve({ fetch: app.fetch, port })
