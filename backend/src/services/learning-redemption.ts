/**
 * 学习卡兑换核心：码生成、HMAC 摘要、原子兑换、课程权限与学习进度。
 *
 * 业务前提：学习卡在抖音/淘宝等电商平台销售，网站只负责兑换与交付。
 * 安全底线：
 *  - 兑换码明文绝不入库/入日志，只存 HMAC-SHA256 摘要 + 末四位；
 *  - 同一码并发兑换只允许一次成功、一次开课、一次积分（单事务 + 唯一索引）；
 *  - 退款撤销后原码保持已使用，不能复用。
 */
import { createHmac, randomInt } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'

// 排除 0/O/1/I/L 的展示字母表
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const CODE_PREFIX = 'ZZK'

export class LearningError extends Error {
  code: string
  status: number
  constructor(code: string, message: string, status = 400) {
    super(message)
    this.name = 'LearningError'
    this.code = code
    this.status = status
  }
}

function pepper(): string {
  const value = process.env.REDEMPTION_CODE_PEPPER
  if (!value) {
    // 配置错误必须炸出来，绝不允许退回默认值（否则摘要可被离线枚举）
    throw new LearningError('pepper_missing', '服务器未配置 REDEMPTION_CODE_PEPPER', 500)
  }
  return value
}

function nowIso() {
  return new Date().toISOString()
}

/** 规范化：去空格/连字符、统一大写。用户抄码时的各种写法都归一。 */
export function normalizeRedemptionCode(input: string): string {
  return String(input || '').replace(/[\s-]+/g, '').toUpperCase()
}

/** HMAC-SHA256(pepper, normalized) — 数据库里只存这个摘要。 */
export function hashRedemptionCode(code: string): string {
  return createHmac('sha256', pepper()).update(normalizeRedemptionCode(code)).digest('hex')
}

/** 生成 count 个互不重复的 ZZK-XXXX-XXXX-XXXX 展示码。 */
export function generateRedemptionCodes(count: number): string[] {
  const out = new Set<string>()
  while (out.size < count) {
    let body = ''
    for (let i = 0; i < 12; i++) body += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]
    out.add(`${CODE_PREFIX}-${body.slice(0, 4)}-${body.slice(4, 8)}-${body.slice(8, 12)}`)
  }
  return Array.from(out)
}

export interface GrantAccessInput {
  userId: number
  courseId: string
  sourceCodeId?: number | null
  grantedBy?: number | null
}

/** 开通/恢复课程权限（同一 user+course 只有一行，复用行翻转状态）。 */
export function grantCourseAccess(input: GrantAccessInput) {
  const ts = nowIso()
  const [existing] = db.select().from(schema.learningEntitlements)
    .where(and(
      eq(schema.learningEntitlements.userId, input.userId),
      eq(schema.learningEntitlements.courseId, input.courseId),
    )).all()
  if (existing) {
    db.update(schema.learningEntitlements).set({
      status: 'active',
      sourceCodeId: input.sourceCodeId ?? existing.sourceCodeId,
      grantedBy: input.grantedBy ?? existing.grantedBy,
      grantedAt: ts,
      revokedAt: null,
      updatedAt: ts,
    }).where(eq(schema.learningEntitlements.id, existing.id)).run()
    return { ...existing, status: 'active' as const }
  }
  const res = db.insert(schema.learningEntitlements).values({
    userId: input.userId,
    courseId: input.courseId,
    sourceCodeId: input.sourceCodeId ?? null,
    status: 'active',
    grantedBy: input.grantedBy ?? null,
    grantedAt: ts,
    updatedAt: ts,
  }).run()
  const [row] = db.select().from(schema.learningEntitlements)
    .where(eq(schema.learningEntitlements.id, Number(res.lastInsertRowid))).all()
  return row
}

/** 撤销课程权限（退款/违规）。原兑换码保持 redeemed，不可复用。 */
export function revokeCourseAccess(userId: number, courseId: string, revokedBy?: number | null) {
  const ts = nowIso()
  db.update(schema.learningEntitlements).set({
    status: 'revoked',
    grantedBy: revokedBy ?? null,
    revokedAt: ts,
    updatedAt: ts,
  }).where(and(
    eq(schema.learningEntitlements.userId, userId),
    eq(schema.learningEntitlements.courseId, courseId),
  )).run()
}

export function hasCourseAccess(userId: number, courseId: string): boolean {
  const [row] = db.select().from(schema.learningEntitlements)
    .where(and(
      eq(schema.learningEntitlements.userId, userId),
      eq(schema.learningEntitlements.courseId, courseId),
      eq(schema.learningEntitlements.status, 'active'),
    )).all()
  return !!row
}

export interface RedeemInput {
  userId: number
  code: string
}

export interface RedeemResult {
  status: 'redeemed' | 'already_redeemed'
  courseId: string
  creditsAdded: number
  entitlementId: number
}

/**
 * 原子兑换：整个判定+落库在一个 SQLite 事务里完成。
 * better-sqlite3 事务是同步串行的，天然挡掉同码并发双兑。
 */
export async function redeemLearningCode(input: RedeemInput): Promise<RedeemResult> {
  const codeHash = hashRedemptionCode(input.code)
  const ts = nowIso()

  return db.transaction((tx) => {
    const [code] = tx.select().from(schema.learningCodes)
      .where(eq(schema.learningCodes.codeHash, codeHash)).all()
    if (!code) throw new LearningError('code_invalid', '兑换码不存在，请核对后重试')

    const [batch] = tx.select().from(schema.learningCodeBatches)
      .where(eq(schema.learningCodeBatches.id, code.batchId)).all()
    if (!batch) throw new LearningError('code_invalid', '兑换码不存在，请核对后重试')

    // 已使用的码：本人重放幂等返回；他人使用报冲突；被撤销权限的原码不可复用
    if (code.status === 'redeemed') {
      if (code.redeemedBy === input.userId) {
        const [ent] = tx.select().from(schema.learningEntitlements)
          .where(and(
            eq(schema.learningEntitlements.userId, input.userId),
            eq(schema.learningEntitlements.courseId, batch.courseId),
          )).all()
        if (ent && ent.status === 'active') {
          return { status: 'already_redeemed', courseId: batch.courseId, creditsAdded: 0, entitlementId: ent.id }
        }
        throw new LearningError('code_used_revoked', '该兑换码已使用且对应权限已被撤销，请联系客服', 409)
      }
      throw new LearningError('code_used_by_other', '该兑换码已被其他账号使用', 409)
    }
    if (code.status === 'disabled') throw new LearningError('code_disabled', '该兑换码已停用，请联系客服', 409)
    if (batch.status !== 'active') throw new LearningError('code_disabled', '该批次兑换码已停用，请联系客服', 409)
    if (batch.expiresAt && batch.expiresAt < ts) throw new LearningError('code_expired', '该兑换码已过期', 409)

    // 已有有效权限时，拒绝消耗第二张码（防误兑浪费）
    const [existingEnt] = tx.select().from(schema.learningEntitlements)
      .where(and(
        eq(schema.learningEntitlements.userId, input.userId),
        eq(schema.learningEntitlements.courseId, batch.courseId),
      )).all()
    if (existingEnt && existingEnt.status === 'active') {
      throw new LearningError('already_enrolled', '你已开通该课程，无需再次兑换（这张码可以留给朋友）', 409)
    }

    // 1) 标记码已使用（条件更新兜底并发：状态必须还是 unused）
    const claimed = tx.update(schema.learningCodes).set({
      status: 'redeemed',
      redeemedBy: input.userId,
      redeemedAt: ts,
      updatedAt: ts,
    }).where(and(
      eq(schema.learningCodes.id, code.id),
      eq(schema.learningCodes.status, 'unused'),
    )).run()
    if (claimed.changes === 0) throw new LearningError('code_used_by_other', '该兑换码已被使用', 409)

    // 2) 开通/恢复权限（复用已有行）
    let entitlementId: number
    if (existingEnt) {
      tx.update(schema.learningEntitlements).set({
        status: 'active',
        sourceCodeId: code.id,
        grantedAt: ts,
        revokedAt: null,
        updatedAt: ts,
      }).where(eq(schema.learningEntitlements.id, existingEnt.id)).run()
      entitlementId = existingEnt.id
    } else {
      const res = tx.insert(schema.learningEntitlements).values({
        userId: input.userId,
        courseId: batch.courseId,
        sourceCodeId: code.id,
        status: 'active',
        grantedAt: ts,
        updatedAt: ts,
      }).run()
      entitlementId = Number(res.lastInsertRowid)
    }

    // 3) 发放随课积分（批次快照）+ 一条流水
    const creditsAdded = batch.includedCredits || 0
    if (creditsAdded > 0) {
      const [user] = tx.select().from(schema.users).where(eq(schema.users.id, input.userId)).all()
      if (!user) throw new LearningError('user_missing', '用户不存在', 500)
      const newBalance = user.credits + creditsAdded
      tx.update(schema.users).set({ credits: newBalance, updatedAt: ts })
        .where(eq(schema.users.id, input.userId)).run()
      tx.insert(schema.creditTransactions).values({
        userId: input.userId,
        amount: creditsAdded,
        balanceAfter: newBalance,
        type: 'learning_redemption',
        description: `学习卡随课积分 ${creditsAdded}`,
        referenceType: 'learning_redemption',
        referenceId: code.id,
        createdAt: ts,
      }).run()
    }

    return { status: 'redeemed', courseId: batch.courseId, creditsAdded, entitlementId }
  })
}

export interface SaveProgressInput {
  userId: number
  courseId: string
  lessonId: string
  status: 'in_progress' | 'completed'
  lastPositionSec?: number
}

/** 保存课节进度（upsert）。播放位置钳制为非负整数。 */
export function saveLessonProgress(input: SaveProgressInput) {
  const ts = nowIso()
  const position = Math.max(0, Math.floor(Number(input.lastPositionSec) || 0))
  const [existing] = db.select().from(schema.learningProgress)
    .where(and(
      eq(schema.learningProgress.userId, input.userId),
      eq(schema.learningProgress.courseId, input.courseId),
      eq(schema.learningProgress.lessonId, input.lessonId),
    )).all()
  if (existing) {
    db.update(schema.learningProgress).set({
      // 已完成的课节不允许被 in_progress 回退（重看视频不清完成状态）
      status: existing.status === 'completed' ? 'completed' : input.status,
      lastPositionSec: position,
      completedAt: input.status === 'completed'
        ? (existing.completedAt || ts)
        : existing.completedAt,
      updatedAt: ts,
    }).where(eq(schema.learningProgress.id, existing.id)).run()
    return
  }
  db.insert(schema.learningProgress).values({
    userId: input.userId,
    courseId: input.courseId,
    lessonId: input.lessonId,
    status: input.status,
    lastPositionSec: position,
    completedAt: input.status === 'completed' ? ts : null,
    updatedAt: ts,
  }).run()
}
