import { Hono } from 'hono'
import { desc, eq, like, or } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { requireAuth } from '../middleware/auth.js'
import { applyCreditOp, getBalance, listHistory, PACKAGES } from '../services/credits.js'

const credits = new Hono()

credits.use('*', requireAuth)

// GET /credits/balance
credits.get('/balance', async (c) => {
  const u = c.get('user') as { id: number }
  const balance = await getBalance(u.id)
  return c.json({ data: { balance } })
})

// GET /credits/history
credits.get('/history', async (c) => {
  const u = c.get('user') as { id: number }
  const limit = Math.min(Number(c.req.query('limit') || 50), 200)
  const offset = Number(c.req.query('offset') || 0)
  const items = await listHistory(u.id, limit, offset)
  return c.json({ data: { items: items.map(t => ({ ...t, meta: t.meta ? JSON.parse(t.meta) : null })) } })
})

// GET /credits/packages — public catalog
credits.get('/packages', (c) => {
  return c.json({ data: { items: PACKAGES } })
})

// POST /credits/grant — ADMIN ONLY: manually add/remove credits for a user
credits.post('/grant', async (c) => {
  const operator = c.get('user') as { id: number; role: string }
  if (operator.role !== 'admin') {
    return c.json({ code: 403, message: '需要管理员权限' }, 403)
  }
  const body = await c.req.json()
  const targetUserId = Number(body.user_id)
  const amount = Number(body.amount)
  const description = body.description ? String(body.description) : null

  if (!targetUserId || !Number.isFinite(amount) || amount === 0) {
    return c.json({ code: 400, message: '参数错误：user_id + 非零 amount' }, 400)
  }

  try {
    const result = await applyCreditOp({
      userId: targetUserId,
      amount,
      type: 'admin_grant',
      description: description || `管理员${amount > 0 ? '充值' : '扣除'} ${Math.abs(amount)} 积分`,
      operatorId: operator.id,
    })
    return c.json({ data: { balance: result.balanceAfter, transaction: result.transaction } })
  } catch (e: any) {
    if (e.status === 402) {
      return c.json({ code: 402, message: e.message }, 402)
    }
    throw e
  }
})

// GET /credits/users — ADMIN ONLY: list users with balances (for top-up UI)
credits.get('/users', async (c) => {
  const operator = c.get('user') as { id: number; role: string }
  if (operator.role !== 'admin') {
    return c.json({ code: 403, message: '需要管理员权限' }, 403)
  }
  const q = c.req.query('q')
  let query = db.select({
    id: schema.users.id,
    username: schema.users.username,
    displayName: schema.users.displayName,
    email: schema.users.email,
    role: schema.users.role,
    credits: schema.users.credits,
    createdAt: schema.users.createdAt,
  }).from(schema.users)

  const rows = q
    ? await query.where(or(like(schema.users.username, `%${q}%`), like(schema.users.displayName, `%${q}%`))).orderBy(desc(schema.users.createdAt)).limit(50)
    : await query.orderBy(desc(schema.users.createdAt)).limit(50)
  return c.json({ data: { items: rows } })
})

export default credits
