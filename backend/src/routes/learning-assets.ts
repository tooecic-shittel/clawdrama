/**
 * 课程媒体流：签名 URL 鉴权（原生 <video>/<a download> 带不了 Bearer 头）。
 * 挂载在鉴权分组之外，安全性由三层保证：
 *   1. HMAC 签名令牌（两小时有效，绑定用户+课程+资源+文件名）；
 *   2. 令牌校验后再查该用户当前权限（退款撤销后旧令牌立即失效）；
 *   3. 路径解析强制落在课程目录内（拒绝任何穿越）。
 * 支持浏览器 Range 请求（拖动播放）。
 */
import { Hono } from 'hono'
import fs from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'
import { verifyAssetToken } from '../services/learning-asset-token.js'
import { hasCourseAccess } from '../services/learning-redemption.js'
import { db, schema } from '../db/index.js'
import { eq } from 'drizzle-orm'

const app = new Hono()

function learningDataDir(): string {
  return process.env.LEARNING_DATA_DIR || '/data/clawdrama/learning'
}

const MIME: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
}

/** 文件名安全检查：只允许单层文件名，拒绝一切分隔符与穿越。 */
function isSafeFilename(name: string): boolean {
  if (!name || name.length > 200) return false
  if (name.includes('..')) return false
  if (/[/\\]/.test(name)) return false
  if (name.includes('\0') || name.includes('%')) return false
  return true
}

app.get('/:courseId/:kind/:filename', async (c) => {
  const courseId = c.req.param('courseId')
  const kind = c.req.param('kind')
  const filename = c.req.param('filename')
  const token = c.req.query('token') || ''

  if (kind !== 'videos' && kind !== 'downloads') {
    return c.json({ code: 404, message: '资源不存在' }, 404)
  }
  if (!isSafeFilename(filename) || !isSafeFilename(courseId)) {
    return c.json({ code: 400, message: '非法文件名' }, 400)
  }

  const payload = verifyAssetToken(token, { courseId, kind, filename })
  if (!payload) {
    return c.json({ code: 401, message: '链接已过期或无效，请刷新课程页面', reason: 'token_invalid' }, 401)
  }

  // 令牌有效 ≠ 权限仍在：再查当前权限（管理员预览放行）
  if (!hasCourseAccess(payload.userId, courseId)) {
    const [u] = db.select({ role: schema.users.role }).from(schema.users)
      .where(eq(schema.users.id, payload.userId)).all()
    if (!u || u.role !== 'admin') {
      return c.json({ code: 403, message: '课程权限已失效', reason: 'revoked' }, 403)
    }
  }

  const baseDir = path.resolve(learningDataDir(), courseId, kind)
  const filePath = path.resolve(baseDir, filename)
  if (!filePath.startsWith(baseDir + path.sep)) {
    return c.json({ code: 400, message: '非法路径' }, 400)
  }
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return c.json({ code: 404, message: '文件不存在，请联系客服' }, 404)
  }

  const stat = fs.statSync(filePath)
  const total = stat.size
  const contentType = MIME[path.extname(filename).toLowerCase()] || 'application/octet-stream'
  const range = c.req.header('Range')

  c.header('Accept-Ranges', 'bytes')
  c.header('Content-Type', contentType)
  if (kind === 'downloads') {
    c.header('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`)
  }

  if (range) {
    const match = range.match(/bytes=(\d*)-(\d*)/)
    let start = match && match[1] ? parseInt(match[1], 10) : 0
    let end = match && match[2] ? parseInt(match[2], 10) : total - 1
    if (Number.isNaN(start) || start < 0) start = 0
    if (Number.isNaN(end) || end >= total) end = total - 1
    if (start > end || start >= total) {
      c.header('Content-Range', `bytes */${total}`)
      return c.body(null, 416)
    }
    c.header('Content-Range', `bytes ${start}-${end}/${total}`)
    c.header('Content-Length', String(end - start + 1))
    const stream = Readable.toWeb(fs.createReadStream(filePath, { start, end })) as ReadableStream
    return c.body(stream, 206)
  }

  c.header('Content-Length', String(total))
  const stream = Readable.toWeb(fs.createReadStream(filePath)) as ReadableStream
  return c.body(stream, 200)
})

export default app
