/**
 * 学习中心用户路由：兑换、课程总览、课节内容、学习进度。
 * 挂载在受 requireAuth 保护的 /api/v1 分组下。
 * 业务前提：学习卡在电商平台销售，这里只做兑换与交付，无任何购买/价格逻辑。
 */
import { Hono } from 'hono'
import { and, eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { success, badRequest, notFound } from '../utils/response.js'
import { getCourseOutline, getLesson } from '../services/learning-catalog.js'
import { getLessonBlocks } from '../services/learning-content.js'
import { createAssetToken } from '../services/learning-asset-token.js'
import {
  redeemLearningCode, hasCourseAccess, LearningError,
} from '../services/learning-redemption.js'
import {
  isRedemptionLimited, recordRedemptionFailure, clearRedemptionFailures,
} from '../services/learning-rate-limit.js'
import { logTaskSuccess, logTaskWarn } from '../utils/task-logger.js'

const app = new Hono()

function currentUser(c: any): { id: number; role: string } | null {
  const user = c.get('user')
  return user && typeof user.id === 'number' ? user : null
}

/** 管理员预览：可看内容但不计入兑换/学习统计。 */
function canPreview(user: { role: string }): boolean {
  return user.role === 'admin'
}

function assetUrl(userId: number, courseId: string, kind: 'videos' | 'downloads', filename: string): string {
  const token = createAssetToken({ userId, courseId, kind, filename })
  return `/api/v1/learning-assets/${encodeURIComponent(courseId)}/${kind}/${encodeURIComponent(filename)}?token=${token}`
}

function getProgressMap(userId: number, courseId: string) {
  const rows = db.select().from(schema.learningProgress)
    .where(and(
      eq(schema.learningProgress.userId, userId),
      eq(schema.learningProgress.courseId, courseId),
    )).all()
  const map: Record<string, { status: string; last_position_sec: number; completed_at: string | null }> = {}
  for (const r of rows) {
    map[r.lessonId] = { status: r.status, last_position_sec: r.lastPositionSec, completed_at: r.completedAt }
  }
  return map
}

// POST /learning/redeem — 兑换学习卡
app.post('/redeem', async (c) => {
  const user = currentUser(c)
  if (!user) return c.json({ code: 401, message: '未登录或登录已过期' }, 401)

  if (isRedemptionLimited(user.id)) {
    return c.json({ code: 429, message: '尝试次数过多，请 10 分钟后再试' }, 429)
  }

  const body = await c.req.json().catch(() => ({}))
  const code = String(body.code || '').trim()
  if (!code) return badRequest(c, '请输入兑换码')

  try {
    const result = await redeemLearningCode({ userId: user.id, code })
    clearRedemptionFailures(user.id)
    const [u] = await db.select({ credits: schema.users.credits })
      .from(schema.users).where(eq(schema.users.id, user.id)).limit(1)
    logTaskSuccess('Learning', 'redeem', { userId: user.id, courseId: result.courseId, status: result.status })
    return success(c, {
      status: result.status,
      course_id: result.courseId,
      credits_added: result.creditsAdded,
      balance: u?.credits ?? 0,
    })
  } catch (err: any) {
    if (err instanceof LearningError) {
      recordRedemptionFailure(user.id)
      // 不记录码内容，只记录失败类型
      logTaskWarn('Learning', 'redeem-rejected', { userId: user.id, reason: err.code })
      return c.json({ code: err.status, message: err.message, reason: err.code }, err.status as any)
    }
    throw err
  }
})

// GET /learning/courses — 课程总览（任何登录用户可见大纲；正文/链接仅开通后）
app.get('/courses', async (c) => {
  const user = currentUser(c)
  if (!user) return c.json({ code: 401, message: '未登录或登录已过期' }, 401)

  const course = getCourseOutline('aigc-short-drama-v1')!
  const access = hasCourseAccess(user.id, course.id) || canPreview(user)
  const progress = access ? getProgressMap(user.id, course.id) : {}
  const completed = Object.values(progress).filter(p => p.status === 'completed').length

  return success(c, {
    course: {
      id: course.id,
      title: course.title,
      subtitle: course.subtitle,
      outcome: course.outcome,
      deliverables: course.deliverables,
      lessons: course.lessons.map(l => ({
        id: l.id,
        number: l.number,
        title: l.title,
        summary: l.summary,
        duration_minutes: l.durationMinutes,
        outcome: l.outcome,
        progress: progress[l.id] || null,
      })),
    },
    access,
    is_admin_preview: !hasCourseAccess(user.id, course.id) && canPreview(user),
    completed_lessons: completed,
    total_lessons: course.lessons.length,
    // 群/直播入口：只对已开通用户下发，且未配置时隐藏
    wechat_url: access ? (process.env.LEARNING_WECHAT_URL || null) : null,
    live_url: access ? (process.env.LEARNING_LIVE_URL || null) : null,
  })
})

// GET /learning/courses/:courseId/lessons/:lessonId — 课节内容（需已开通）
app.get('/courses/:courseId/lessons/:lessonId', async (c) => {
  const user = currentUser(c)
  if (!user) return c.json({ code: 401, message: '未登录或登录已过期' }, 401)

  const courseId = c.req.param('courseId')
  const lessonId = c.req.param('lessonId')
  const course = getCourseOutline(courseId)
  const lesson = getLesson(courseId, lessonId)
  if (!course || !lesson) return notFound(c, '课节不存在')

  if (!hasCourseAccess(user.id, courseId) && !canPreview(user)) {
    return c.json({ code: 403, message: '请先使用学习卡兑换码开通课程', reason: 'locked' }, 403)
  }

  const blocks = getLessonBlocks(courseId, lessonId) || []
  const progress = getProgressMap(user.id, courseId)
  const index = course.lessons.findIndex(l => l.id === lessonId)
  const prev = index > 0 ? course.lessons[index - 1] : null
  const next = index < course.lessons.length - 1 ? course.lessons[index + 1] : null

  return success(c, {
    lesson: {
      id: lesson.id,
      number: lesson.number,
      title: lesson.title,
      summary: lesson.summary,
      duration_minutes: lesson.durationMinutes,
      outcome: lesson.outcome,
      example_project_id: lesson.exampleProjectId ?? null,
    },
    blocks,
    video_url: assetUrl(user.id, courseId, 'videos', lesson.videoFile),
    downloads: lesson.downloads.map(name => ({
      name,
      url: assetUrl(user.id, courseId, 'downloads', name),
    })),
    progress: progress[lessonId] || null,
    prev: prev ? { id: prev.id, title: prev.title } : null,
    next: next ? { id: next.id, title: next.title } : null,
    lessons: course.lessons.map(l => ({
      id: l.id, number: l.number, title: l.title,
      progress: progress[l.id] || null,
    })),
  })
})

// PUT /learning/courses/:courseId/lessons/:lessonId/progress — 保存进度
app.put('/courses/:courseId/lessons/:lessonId/progress', async (c) => {
  const user = currentUser(c)
  if (!user) return c.json({ code: 401, message: '未登录或登录已过期' }, 401)

  const courseId = c.req.param('courseId')
  const lessonId = c.req.param('lessonId')
  if (!getLesson(courseId, lessonId)) return notFound(c, '课节不存在')
  if (!hasCourseAccess(user.id, courseId)) {
    // 管理员预览不写进度，避免污染学习统计
    if (canPreview(currentUser(c)!)) return success(c, { skipped: true })
    return c.json({ code: 403, message: '请先使用学习卡兑换码开通课程' }, 403)
  }

  const body = await c.req.json().catch(() => ({}))
  const status = body.status === 'completed' ? 'completed' : 'in_progress'
  const { saveLessonProgress } = await import('../services/learning-redemption.js')
  saveLessonProgress({
    userId: user.id,
    courseId,
    lessonId,
    status,
    lastPositionSec: Number(body.last_position_sec) || 0,
  })
  return success(c, { saved: true })
})

export default app
