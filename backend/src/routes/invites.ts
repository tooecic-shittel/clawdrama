import { Hono } from 'hono'
import { desc, eq, sql } from 'drizzle-orm'
import { db, schema } from '../db/index.js'

// 邀请码管理（仅管理员）。挂载在受 requireAuth 保护的 /api/v1 下。
const invites = new Hono()

function requireAdminUser(c: any): { id: number } | null {
  const user = c.get('user') as { id: number; role: string } | undefined
  if (!user || user.role !== 'admin') return null
  return user
}

// 去掉易混淆字符（0/O、1/I/L）的字母表
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

function randomCode(len = 8): string {
  let out = ''
  for (let i = 0; i < len; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
  }
  return out
}

// GET /invites — 列出全部邀请码及使用情况
invites.get('/', async (c) => {
  if (!requireAdminUser(c)) return c.json({ code: 403, message: '需要管理员权限' }, 403)
  const rows = await db.select().from(schema.inviteCodes).orderBy(desc(schema.inviteCodes.createdAt))
  // 附带每个码注册的用户名，方便追溯
  const usedBy = await db.select({ inviteCode: schema.users.inviteCode, username: schema.users.username })
    .from(schema.users).where(sql`${schema.users.inviteCode} IS NOT NULL`)
  const byCode = new Map<string, string[]>()
  for (const u of usedBy) {
    if (!u.inviteCode) continue
    const list = byCode.get(u.inviteCode) || []
    list.push(u.username)
    byCode.set(u.inviteCode, list)
  }
  return c.json({
    data: rows.map(r => ({
      id: r.id,
      code: r.code,
      note: r.note,
      max_uses: r.maxUses,
      used_count: r.usedCount,
      is_active: !!r.isActive,
      used_by: byCode.get(r.code) || [],
      created_at: r.createdAt,
    })),
  })
})

// POST /invites — 批量生成邀请码 { count?: 1-50, max_uses?: 1-1000, note?: string }
invites.post('/', async (c) => {
  const admin = requireAdminUser(c)
  if (!admin) return c.json({ code: 403, message: '需要管理员权限' }, 403)
  const body = await c.req.json().catch(() => ({}))
  const count = Math.min(50, Math.max(1, Math.round(Number(body.count) || 1)))
  const maxUses = Math.min(1000, Math.max(1, Math.round(Number(body.max_uses) || 1)))
  const note = body.note ? String(body.note).trim().slice(0, 200) : null

  const now = new Date().toISOString()
  const created: string[] = []
  for (let i = 0; i < count; i++) {
    // 撞码重试：8 位 31 字母表容量巨大，撞上纯属极端情况
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = randomCode()
      try {
        await db.insert(schema.inviteCodes).values({
          code,
          note,
          maxUses,
          usedCount: 0,
          isActive: 1,
          createdBy: admin.id,
          createdAt: now,
          updatedAt: now,
        })
        created.push(code)
        break
      } catch (err: any) {
        if (attempt === 4) throw err
      }
    }
  }
  return c.json({ data: { codes: created, max_uses: maxUses, note } })
})

// POST /invites/:id/toggle — 启用/停用
invites.post('/:id/toggle', async (c) => {
  if (!requireAdminUser(c)) return c.json({ code: 403, message: '需要管理员权限' }, 403)
  const id = Number(c.req.param('id'))
  const rows = await db.select().from(schema.inviteCodes).where(eq(schema.inviteCodes.id, id)).limit(1)
  if (rows.length === 0) return c.json({ code: 404, message: '邀请码不存在' }, 404)
  const next = rows[0].isActive ? 0 : 1
  await db.update(schema.inviteCodes)
    .set({ isActive: next, updatedAt: new Date().toISOString() })
    .where(eq(schema.inviteCodes.id, id))
  return c.json({ data: { id, is_active: !!next } })
})

export default invites
