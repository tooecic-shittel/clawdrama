/**
 * 课程媒体签名令牌：两小时有效的 HMAC-SHA256 签名 URL 参数。
 * 原生 <video> 请求带不了 Bearer 头，所以媒体路由用 ?token= 鉴权；
 * 令牌只授权「这个用户 + 这门课 + 这类资源 + 这个文件」，媒体路由
 * 校验签名后还会再查一次该用户当前权限（防退款后旧令牌继续用）。
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import { JWT_SECRET } from '../middleware/auth.js'

export const ASSET_TOKEN_TTL_SEC = 2 * 60 * 60

export type LearningAssetKind = 'videos' | 'downloads'

export interface LearningAssetPayload {
  userId: number
  courseId: string
  kind: LearningAssetKind
  filename: string
  exp: number
}

function sign(data: string): string {
  return createHmac('sha256', JWT_SECRET).update(data).digest('hex')
}

export function createAssetToken(payload: Omit<LearningAssetPayload, 'exp'>, ttlSec = ASSET_TOKEN_TTL_SEC): string {
  const full: LearningAssetPayload = { ...payload, exp: Math.floor(Date.now() / 1000) + ttlSec }
  const body = Buffer.from(JSON.stringify(full)).toString('base64url')
  return `${body}.${sign(body)}`
}

/** 校验令牌：签名、有效期、且必须与当前路由参数逐字段一致。 */
export function verifyAssetToken(
  token: string,
  expect: { courseId: string; kind: string; filename: string },
): LearningAssetPayload | null {
  const [body, signature] = String(token || '').split('.')
  if (!body || !signature) return null
  const wanted = sign(body)
  const a = Buffer.from(signature)
  const b = Buffer.from(wanted)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  let payload: LearningAssetPayload
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
  } catch {
    return null
  }
  if (!payload || typeof payload.userId !== 'number') return null
  if (payload.exp < Math.floor(Date.now() / 1000)) return null
  if (payload.courseId !== expect.courseId) return null
  if (payload.kind !== expect.kind) return null
  if (payload.filename !== expect.filename) return null
  return payload
}
