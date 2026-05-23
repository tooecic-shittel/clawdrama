import type { MiddlewareHandler } from 'hono'
import { verify } from 'hono/jwt'

const JWT_SECRET = process.env.JWT_SECRET || 'clawdrama-dev-secret-change-in-prod'

export type JwtPayload = {
  sub: number
  username: string
  role: string
  exp: number
}

export const requireAuth: MiddlewareHandler = async (c, next) => {
  const header = c.req.header('Authorization')
  if (!header || !header.startsWith('Bearer ')) {
    return c.json({ code: 401, message: '未登录或登录已过期' }, 401)
  }
  const token = header.slice(7)
  try {
    const payload = (await verify(token, JWT_SECRET, 'HS256')) as unknown as JwtPayload
    c.set('user', { id: payload.sub, username: payload.username, role: payload.role })
    await next()
  } catch {
    return c.json({ code: 401, message: 'token 无效' }, 401)
  }
}

export { JWT_SECRET }
