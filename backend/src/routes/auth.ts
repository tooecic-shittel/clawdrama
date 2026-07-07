import { Hono } from 'hono'
import { sign } from 'hono/jwt'
import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { JWT_SECRET, requireAuth } from '../middleware/auth.js'
import { applyCreditOp } from '../services/credits.js'

// 售价 ¥1 ≈ 1500 积分。3000 积分 ≈ ¥2 体验额度：够生成 6 张图 + 几段配音，
// 但不够白嫖一个视频（5秒·720P ≈ 12500），既能试用又防薅羊毛。
const REGISTER_BONUS_CREDITS = 3000

const auth = new Hono()

const TOKEN_TTL = 60 * 60 * 24 * 14 // 14 days

function nowIso() {
  return new Date().toISOString()
}

async function signUserToken(user: { id: number; username: string; role: string }) {
  const exp = Math.floor(Date.now() / 1000) + TOKEN_TTL
  return sign({ sub: user.id, username: user.username, role: user.role, exp }, JWT_SECRET, 'HS256')
}

// POST /auth/register
auth.post('/register', async (c) => {
  const body = await c.req.json()
  const username = String(body.username || '').trim()
  const password = String(body.password || '')
  const displayName = body.display_name ? String(body.display_name).trim() : null
  const email = body.email ? String(body.email).trim() : null

  if (!username || username.length < 3) {
    return c.json({ code: 400, message: '用户名至少 3 个字符' }, 400)
  }
  if (!password || password.length < 6) {
    return c.json({ code: 400, message: '密码至少 6 个字符' }, 400)
  }

  const existing = await db.select().from(schema.users).where(eq(schema.users.username, username)).limit(1)
  if (existing.length > 0) {
    return c.json({ code: 409, message: '用户名已存在' }, 409)
  }

  const passwordHash = await bcrypt.hash(password, 10)

  // First user becomes admin
  const userCount = await db.select().from(schema.users).limit(1)
  const role = userCount.length === 0 ? 'admin' : 'user'

  const now = nowIso()
  const inserted = await db.insert(schema.users).values({
    username,
    email,
    passwordHash,
    displayName,
    role,
    createdAt: now,
    updatedAt: now,
  }).returning()

  const user = inserted[0]

  // Welcome bonus credits
  let finalCredits = user.credits
  try {
    const result = await applyCreditOp({
      userId: user.id,
      amount: REGISTER_BONUS_CREDITS,
      type: 'register_bonus',
      description: `注册赠送 ${REGISTER_BONUS_CREDITS} 积分`,
    })
    finalCredits = result.balanceAfter
  } catch (e) {
    // Bonus failure shouldn't block registration
    console.error('[auth] register bonus failed:', e)
  }

  const token = await signUserToken({ id: user.id, username: user.username, role: user.role })

  return c.json({
    data: {
      token,
      user: {
        id: user.id,
        username: user.username,
        display_name: user.displayName,
        email: user.email,
        role: user.role,
        credits: finalCredits,
      },
    },
  })
})

// POST /auth/login
auth.post('/login', async (c) => {
  const body = await c.req.json()
  const username = String(body.username || '').trim()
  const password = String(body.password || '')

  if (!username || !password) {
    return c.json({ code: 400, message: '请输入用户名和密码' }, 400)
  }

  const rows = await db.select().from(schema.users).where(eq(schema.users.username, username)).limit(1)
  if (rows.length === 0) {
    return c.json({ code: 401, message: '用户名或密码错误' }, 401)
  }

  const user = rows[0]
  const ok = await bcrypt.compare(password, user.passwordHash)
  if (!ok) {
    return c.json({ code: 401, message: '用户名或密码错误' }, 401)
  }

  const token = await signUserToken({ id: user.id, username: user.username, role: user.role })

  return c.json({
    data: {
      token,
      user: {
        id: user.id,
        username: user.username,
        display_name: user.displayName,
        email: user.email,
        role: user.role,
        credits: user.credits,
      },
    },
  })
})

// GET /auth/me
auth.get('/me', requireAuth, async (c) => {
  const ctxUser = c.get('user') as { id: number }
  const rows = await db.select().from(schema.users).where(eq(schema.users.id, ctxUser.id)).limit(1)
  if (rows.length === 0) {
    return c.json({ code: 404, message: '用户不存在' }, 404)
  }
  const u = rows[0]
  return c.json({
    data: {
      id: u.id,
      username: u.username,
      display_name: u.displayName,
      email: u.email,
      role: u.role,
      credits: u.credits,
    },
  })
})

// GET /auth/status — public, tells the FE if registration is open / first-user mode
auth.get('/status', async (c) => {
  const userCount = await db.select().from(schema.users).limit(1)
  return c.json({
    data: {
      has_users: userCount.length > 0,
      registration_open: true, // can be gated by env later
    },
  })
})

export default auth
