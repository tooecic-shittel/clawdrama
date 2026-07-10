import type { MiddlewareHandler } from 'hono'
import { verify } from 'hono/jwt'
import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'

const JWT_SECRET = process.env.JWT_SECRET || 'clawdrama-dev-secret-change-in-prod'

export type JwtPayload = {
  sub: number
  username: string
  role: string
  exp: number
}

export type AuthUser = {
  id: number
  username: string
  role: string
}

// Type the `user` context variable set by requireAuth so `c.get('user')` is
// strongly typed across all routes (instead of the unknown-key overload error).
declare module 'hono' {
  interface ContextVariableMap {
    user: AuthUser
  }
}

export const requireAuth: MiddlewareHandler = async (c, next) => {
  const header = c.req.header('Authorization')
  if (!header || !header.startsWith('Bearer ')) {
    return c.json({ code: 401, message: '未登录或登录已过期' }, 401)
  }
  const token = header.slice(7)
  let payload: JwtPayload
  try {
    payload = (await verify(token, JWT_SECRET, 'HS256')) as unknown as JwtPayload
  } catch {
    return c.json({ code: 401, message: 'token 无效' }, 401)
  }
  // 以 DB 为准校验账号状态与角色：禁用立即生效，撤管理员不用等 token 过期。
  // better-sqlite3 主键查询开销微秒级，本产品量级下可接受。
  const rows = await db.select({ role: schema.users.role, disabled: schema.users.disabled })
    .from(schema.users).where(eq(schema.users.id, payload.sub)).limit(1)
  if (rows.length === 0) return c.json({ code: 401, message: '账号不存在' }, 401)
  if (rows[0].disabled) return c.json({ code: 403, message: '账号已被禁用，请联系管理员' }, 403)
  c.set('user', { id: payload.sub, username: payload.username, role: rows[0].role })
  await next()
}

// 运营配置类接口（AI 服务配置 / Agent / Skills 等）仅管理员可用。
// 必须挂在 requireAuth 之后——它依赖 requireAuth 设置好的 c.get('user')。
export const requireAdmin: MiddlewareHandler = async (c, next) => {
  const user = c.get('user')
  if (!user || user.role !== 'admin') {
    return c.json({ code: 403, message: '需要管理员权限' }, 403)
  }
  await next()
}

export { JWT_SECRET }
