import { Hono } from 'hono'
import bcrypt from 'bcryptjs'
import { eq, sql } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { requireAdmin } from '../middleware/auth.js'
import { success, badRequest, now } from '../utils/response.js'
import { logTaskSuccess } from '../utils/task-logger.js'

// 管理员用户管理。挂载在受 requireAuth 保护的 /api/v1 下，整组再加 requireAdmin。
const app = new Hono()
app.use('*', requireAdmin)

// GET /admin/users — 全量用户 + 运营统计（生成量/累计充值/邀请人数）
app.get('/users', async (c) => {
  const rows = await db.select({
    id: schema.users.id,
    username: schema.users.username,
    displayName: schema.users.displayName,
    email: schema.users.email,
    role: schema.users.role,
    credits: schema.users.credits,
    disabled: schema.users.disabled,
    inviteCode: schema.users.inviteCode,
    referralCode: schema.users.referralCode,
    createdAt: schema.users.createdAt,
    imageCount: sql<number>`(select count(*) from image_generations g where g.user_id = ${schema.users.id})`,
    videoCount: sql<number>`(select count(*) from video_generations v where v.user_id = ${schema.users.id})`,
    paidCents: sql<number>`(select coalesce(sum(p.amount_cents),0) from payment_orders p where p.user_id = ${schema.users.id} and p.status = 'paid')`,
    invitedCount: sql<number>`(select count(*) from users u2 where u2.invite_code = users.referral_code and users.referral_code is not null)`,
  }).from(schema.users).orderBy(schema.users.id)

  return success(c, {
    items: rows.map(u => ({
      id: u.id,
      username: u.username,
      display_name: u.displayName,
      email: u.email,
      role: u.role,
      credits: u.credits,
      disabled: !!u.disabled,
      invite_code: u.inviteCode,
      referral_code: u.referralCode,
      created_at: u.createdAt,
      image_count: u.imageCount,
      video_count: u.videoCount,
      paid_cents: u.paidCents,
      invited_count: u.invitedCount,
    })),
  })
})

// POST /admin/users/:id/role — 设为/撤销管理员（不能改自己）
app.post('/users/:id/role', async (c) => {
  const operator = c.get('user')
  const id = Number(c.req.param('id'))
  const body = await c.req.json().catch(() => ({}))
  const role = body.role === 'admin' ? 'admin' : 'user'
  if (id === operator.id) return badRequest(c, '不能修改自己的角色')
  const [target] = await db.select().from(schema.users).where(eq(schema.users.id, id)).limit(1)
  if (!target) return badRequest(c, '用户不存在')
  await db.update(schema.users).set({ role, updatedAt: now() }).where(eq(schema.users.id, id))
  logTaskSuccess('Admin', 'set-role', { operatorId: operator.id, userId: id, role })
  return success(c, { id, role })
})

// POST /admin/users/:id/status — 禁用/启用（不能禁自己；禁用即时生效，现有登录立即失效）
app.post('/users/:id/status', async (c) => {
  const operator = c.get('user')
  const id = Number(c.req.param('id'))
  const body = await c.req.json().catch(() => ({}))
  const disabled = body.disabled ? 1 : 0
  if (id === operator.id) return badRequest(c, '不能禁用自己的账号')
  const [target] = await db.select().from(schema.users).where(eq(schema.users.id, id)).limit(1)
  if (!target) return badRequest(c, '用户不存在')
  await db.update(schema.users).set({ disabled, updatedAt: now() }).where(eq(schema.users.id, id))
  logTaskSuccess('Admin', 'set-status', { operatorId: operator.id, userId: id, disabled })
  return success(c, { id, disabled: !!disabled })
})

// POST /admin/users/:id/reset-password — 生成临时密码（只在响应里出现一次，请立刻转交用户）
app.post('/users/:id/reset-password', async (c) => {
  const operator = c.get('user')
  const id = Number(c.req.param('id'))
  const [target] = await db.select().from(schema.users).where(eq(schema.users.id, id)).limit(1)
  if (!target) return badRequest(c, '用户不存在')
  // 10 位、去掉易混字符（0O1lI），够强且方便口头/微信转达
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  let password = ''
  for (let i = 0; i < 10; i++) password += alphabet[Math.floor(Math.random() * alphabet.length)]
  const passwordHash = await bcrypt.hash(password, 10)
  await db.update(schema.users).set({ passwordHash, updatedAt: now() }).where(eq(schema.users.id, id))
  logTaskSuccess('Admin', 'reset-password', { operatorId: operator.id, userId: id })
  return success(c, { id, temp_password: password })
})

export default app
