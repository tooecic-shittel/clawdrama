/**
 * 学习中心路由边界测试：鉴权、限流、兑换状态矩阵、课节访问、签名媒体与 Range。
 * 用独立 Hono 实例挂载真实路由，桩中间件注入用户。
 */
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'claw-learning-routes-'))
process.env.DB_PATH = path.join(tmpRoot, 'test.db')
process.env.REDEMPTION_CODE_PEPPER = 'test-pepper-material-32-bytes-minimum!!'
process.env.LEARNING_DATA_DIR = path.join(tmpRoot, 'learning')
process.env.LEARNING_WECHAT_URL = 'https://example.com/wechat'

// 准备媒体文件（lesson-01.mp4 用可辨识字节序列，便于 Range 校验）
const videoDir = path.join(tmpRoot, 'learning', 'aigc-short-drama-v1', 'videos')
fs.mkdirSync(videoDir, { recursive: true })
const VIDEO_BYTES = Buffer.from('0123456789abcdefghijklmnopqrstuvwxyz')
fs.writeFileSync(path.join(videoDir, 'lesson-01.mp4'), VIDEO_BYTES)

const { Hono } = await import('hono')
const learning = (await import('./learning.js')).default
const learningAssets = (await import('./learning-assets.js')).default
const { db, schema } = await import('../db/index.js')
const redemption = await import('../services/learning-redemption.js')
const batches = await import('../services/learning-code-batches.js')
const { createAssetToken } = await import('../services/learning-asset-token.js')

// 测试应用：/api/v1/learning 需要用户（经 X-Test-User 头注入），媒体路由公开
const app = new Hono()
app.use('/api/v1/learning/*', async (c, next) => {
  const raw = c.req.header('X-Test-User')
  if (raw) {
    const [id, role] = raw.split(':')
    c.set('user', { id: Number(id), username: `u${id}`, role: role || 'user' })
  } else {
    return c.json({ code: 401, message: '未登录或登录已过期' }, 401)
  }
  await next()
})
app.route('/api/v1/learning', learning)
app.route('/api/v1/learning-assets', learningAssets)

let userSeq = 100
function makeUser(role = 'user'): number {
  userSeq++
  const res = db.insert(schema.users).values({
    username: `route${userSeq}`, passwordHash: 'x', role, credits: 0,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  }).run()
  return Number(res.lastInsertRowid)
}

function makeCodes(quantity: number, over: any = {}): string[] {
  const { csv } = batches.createLearningCodeBatch({
    course_id: 'aigc-short-drama-v1', channel: 'internal', sku: 'route-test',
    quantity, included_credits: over.included_credits ?? 1000,
    expires_at: over.expires_at ?? new Date(Date.now() + 86400_000).toISOString(),
  })
  return csv.split('\n').slice(1).map(l => l.split(',')[4])
}

async function call(pathname: string, opts: { method?: string; user?: string; body?: any; headers?: Record<string, string> } = {}) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(opts.headers || {}) }
  if (opts.user) headers['X-Test-User'] = opts.user
  return app.request(pathname, {
    method: opts.method || 'GET',
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })
}

after(() => {
  try { fs.rmSync(tmpRoot, { recursive: true, force: true }) } catch {}
})

test('logged-out requests are rejected', async () => {
  const res = await call('/api/v1/learning/courses')
  assert.equal(res.status, 401)
})

test('valid redemption unlocks the course and adds credits once', async () => {
  const userId = makeUser()
  const [code] = makeCodes(1, { included_credits: 5000 })

  const res = await call('/api/v1/learning/redeem', { method: 'POST', user: `${userId}`, body: { code } })
  assert.equal(res.status, 200)
  const json = await res.json()
  assert.equal(json.data.status, 'redeemed')
  assert.equal(json.data.credits_added, 5000)
  assert.equal(json.data.balance, 5000)

  const overview = await (await call('/api/v1/learning/courses', { user: `${userId}` })).json()
  assert.equal(overview.data.access, true)
  assert.equal(overview.data.course.lessons.length, 8)
  assert.equal(overview.data.wechat_url, 'https://example.com/wechat')
  assert.equal(overview.data.live_url, null, 'unconfigured live link hidden')
})

test('invalid, expired, disabled and already-used codes return precise errors', async () => {
  const userId = makeUser()

  let res = await call('/api/v1/learning/redeem', { method: 'POST', user: `${userId}`, body: { code: 'ZZK-NOPE-NOPE-NOPE' } })
  assert.equal(res.status, 400)
  assert.equal((await res.json()).reason, 'code_invalid')

  const [expired] = makeCodes(1, { expires_at: new Date(Date.now() + 1000).toISOString() })
  await new Promise(r => setTimeout(r, 1100))
  res = await call('/api/v1/learning/redeem', { method: 'POST', user: `${userId}`, body: { code: expired } })
  assert.equal((await res.json()).reason, 'code_expired')

  const owner = makeUser()
  const [used] = makeCodes(1)
  await redemption.redeemLearningCode({ userId: owner, code: used })
  res = await call('/api/v1/learning/redeem', { method: 'POST', user: `${userId}`, body: { code: used } })
  assert.equal(res.status, 409)
  assert.equal((await res.json()).reason, 'code_used_by_other')
})

test('ten failed attempts trigger the rate limit', async () => {
  const userId = makeUser()
  for (let i = 0; i < 10; i++) {
    await call('/api/v1/learning/redeem', { method: 'POST', user: `${userId}`, body: { code: `ZZK-BAD-${i}` } })
  }
  const res = await call('/api/v1/learning/redeem', { method: 'POST', user: `${userId}`, body: { code: 'ZZK-BAD-11' } })
  assert.equal(res.status, 429)
  assert.match((await res.json()).message, /尝试次数过多/)
})

test('locked lesson is rejected and entitled lesson returns blocks and signed urls', async () => {
  const locked = makeUser()
  let res = await call('/api/v1/learning/courses/aigc-short-drama-v1/lessons/lesson-01', { user: `${locked}` })
  assert.equal(res.status, 403)
  assert.equal((await res.json()).reason, 'locked')

  const learner = makeUser()
  const [code] = makeCodes(1)
  await redemption.redeemLearningCode({ userId: learner, code })
  res = await call('/api/v1/learning/courses/aigc-short-drama-v1/lessons/lesson-01', { user: `${learner}` })
  assert.equal(res.status, 200)
  const json = await res.json()
  assert.ok(json.data.blocks.length > 5, 'markdown blocks returned')
  assert.ok(json.data.blocks.every((b: any) => !('html' in b)), 'no raw html blocks')
  assert.match(json.data.video_url, /\/api\/v1\/learning-assets\/aigc-short-drama-v1\/videos\/lesson-01\.mp4\?token=/)
  assert.equal(json.data.prev, null)
  assert.equal(json.data.next.id, 'lesson-02')

  // 保存并读回进度（跨设备续播的基础）
  await call('/api/v1/learning/courses/aigc-short-drama-v1/lessons/lesson-01/progress', {
    method: 'PUT', user: `${learner}`, body: { status: 'in_progress', last_position_sec: 42 },
  })
  const again = await (await call('/api/v1/learning/courses/aigc-short-drama-v1/lessons/lesson-01', { user: `${learner}` })).json()
  assert.equal(again.data.progress.last_position_sec, 42)
})

test('signed media supports range, rejects tampering, expiry, revocation and traversal', async () => {
  const learner = makeUser()
  const [code] = makeCodes(1)
  await redemption.redeemLearningCode({ userId: learner, code })

  const token = createAssetToken({ userId: learner, courseId: 'aigc-short-drama-v1', kind: 'videos', filename: 'lesson-01.mp4' })
  const base = `/api/v1/learning-assets/aigc-short-drama-v1/videos/lesson-01.mp4?token=${token}`

  // 完整请求
  let res = await app.request(base)
  assert.equal(res.status, 200)
  assert.equal(res.headers.get('Accept-Ranges'), 'bytes')

  // Range 请求
  res = await app.request(base, { headers: { Range: 'bytes=10-19' } })
  assert.equal(res.status, 206)
  assert.equal(res.headers.get('Content-Range'), `bytes 10-19/${VIDEO_BYTES.length}`)
  assert.equal(res.headers.get('Content-Length'), '10')
  assert.equal(await res.text(), 'abcdefghij')

  // 篡改令牌
  res = await app.request(base.replace(/token=.{4}/, 'token=XXXX'))
  assert.equal(res.status, 401)

  // 过期令牌
  const expired = createAssetToken(
    { userId: learner, courseId: 'aigc-short-drama-v1', kind: 'videos', filename: 'lesson-01.mp4' }, -10,
  )
  res = await app.request(`/api/v1/learning-assets/aigc-short-drama-v1/videos/lesson-01.mp4?token=${expired}`)
  assert.equal(res.status, 401)

  // 令牌换文件名用（路由与载荷不一致）
  res = await app.request(`/api/v1/learning-assets/aigc-short-drama-v1/videos/lesson-02.mp4?token=${token}`)
  assert.equal(res.status, 401)

  // 路径穿越
  const evil = createAssetToken({ userId: learner, courseId: 'aigc-short-drama-v1', kind: 'videos', filename: '..%2Fsecret.txt' })
  res = await app.request(`/api/v1/learning-assets/aigc-short-drama-v1/videos/${encodeURIComponent('..%2Fsecret.txt')}?token=${evil}`)
  assert.ok([400, 404].includes(res.status), `traversal blocked, got ${res.status}`)

  // 撤销权限后旧令牌立即失效
  redemption.revokeCourseAccess(learner, 'aigc-short-drama-v1')
  res = await app.request(base)
  assert.equal(res.status, 403)
  assert.equal((await res.json()).reason, 'revoked')
})
