/**
 * 学习卡批次运营：创建批次（一次性导出完整码 CSV）、统计、掩码查询、停用。
 * 完整兑换码只在创建响应里出现一次；之后任何接口只返回掩码 ZZK-****-****-XXXX。
 */
import { randomInt } from 'node:crypto'
import { desc, eq, sql } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { generateRedemptionCodes, hashRedemptionCode, normalizeRedemptionCode, LearningError } from './learning-redemption.js'
import { getCourseOutline } from './learning-catalog.js'

export const LEARNING_CHANNELS = ['douyin', 'taobao', 'influencer', 'reseller', 'physical', 'internal'] as const
export type LearningChannel = typeof LEARNING_CHANNELS[number]

export const CSV_COLUMNS = [
  'batch_no', 'channel', 'sku', 'course_name', 'redemption_code', 'redeem_url', 'expires_at', 'included_credits',
] as const

const BATCH_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

function siteBase(): string {
  return (process.env.PUBLIC_SITE_URL || 'https://clawdrama.claw-pi.cn').replace(/\/+$/, '')
}

function nowIso() {
  return new Date().toISOString()
}

export interface CreateBatchInput {
  course_id: string
  channel: string
  sku: string
  campaign?: string
  partner_name?: string
  quantity: number
  included_credits: number
  expires_at: string
}

export interface CreateBatchResult {
  batch: typeof schema.learningCodeBatches.$inferSelect
  csv: string
}

function generateBatchNo(): string {
  const d = new Date()
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  let tail = ''
  for (let i = 0; i < 4; i++) tail += BATCH_ALPHABET[randomInt(BATCH_ALPHABET.length)]
  return `LC-${ymd}-${tail}`
}

function csvEscape(value: string | number): string {
  const s = String(value ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function validateBatchInput(input: CreateBatchInput) {
  const course = getCourseOutline(input.course_id)
  if (!course) throw new LearningError('invalid_course', '课程不存在')
  if (!LEARNING_CHANNELS.includes(input.channel as LearningChannel)) {
    throw new LearningError('invalid_channel', `渠道必须是 ${LEARNING_CHANNELS.join('/')} 之一`)
  }
  if (!String(input.sku || '').trim()) throw new LearningError('invalid_sku', 'SKU/活动名不能为空')
  const quantity = Number(input.quantity)
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 5000) {
    throw new LearningError('invalid_quantity', '数量必须是 1-5000 的整数')
  }
  const credits = Number(input.included_credits)
  if (!Number.isInteger(credits) || credits < 0) {
    throw new LearningError('invalid_credits', '随课积分必须是非负整数')
  }
  const expires = new Date(input.expires_at)
  if (Number.isNaN(expires.getTime()) || expires.getTime() <= Date.now()) {
    throw new LearningError('invalid_expiry', '有效期必须是未来的时间')
  }
  return { course, quantity, credits, expiresAt: expires.toISOString() }
}

/**
 * 创建批次：生成兑换码 → 只入库摘要+末四位 → 在内存里拼 CSV 返回。
 * 明文码绝不写盘、绝不写日志；本函数返回后明文即随响应消失。
 */
export function createLearningCodeBatch(input: CreateBatchInput, createdBy?: number | null): CreateBatchResult {
  const { course, quantity, credits, expiresAt } = validateBatchInput(input)
  const ts = nowIso()

  // 批次号唯一：撞号重试（唯一索引兜底）
  let batchId = 0
  let batchNo = ''
  for (let attempt = 0; attempt < 5 && !batchId; attempt++) {
    batchNo = generateBatchNo()
    try {
      const res = db.insert(schema.learningCodeBatches).values({
        batchNo,
        courseId: course.id,
        channel: input.channel,
        sku: String(input.sku).trim(),
        campaign: input.campaign ? String(input.campaign).trim() : null,
        partnerName: input.partner_name ? String(input.partner_name).trim() : null,
        quantity,
        includedCredits: credits,
        expiresAt,
        status: 'active',
        createdBy: createdBy ?? null,
        createdAt: ts,
        updatedAt: ts,
      }).run()
      batchId = Number(res.lastInsertRowid)
    } catch (err: any) {
      if (!/UNIQUE/i.test(String(err?.message))) throw err
    }
  }
  if (!batchId) throw new LearningError('batch_no_conflict', '批次号生成冲突，请重试', 500)

  const codes = generateRedemptionCodes(quantity)
  db.transaction((tx) => {
    for (const code of codes) {
      const normalized = normalizeRedemptionCode(code)
      tx.insert(schema.learningCodes).values({
        batchId,
        codeHash: hashRedemptionCode(normalized),
        codeSuffix: normalized.slice(-4),
        status: 'unused',
        createdAt: ts,
        updatedAt: ts,
      }).run()
    }
  })

  const redeemUrl = `${siteBase()}/learning`
  const lines = [CSV_COLUMNS.join(',')]
  for (const code of codes) {
    lines.push([
      batchNo, input.channel, String(input.sku).trim(), course.title,
      code, redeemUrl, expiresAt, credits,
    ].map(csvEscape).join(','))
  }

  const [batch] = db.select().from(schema.learningCodeBatches)
    .where(eq(schema.learningCodeBatches.id, batchId)).all()
  return { batch, csv: lines.join('\n') }
}

export function listLearningBatches() {
  const rows = db.select({
    id: schema.learningCodeBatches.id,
    batchNo: schema.learningCodeBatches.batchNo,
    courseId: schema.learningCodeBatches.courseId,
    channel: schema.learningCodeBatches.channel,
    sku: schema.learningCodeBatches.sku,
    campaign: schema.learningCodeBatches.campaign,
    partnerName: schema.learningCodeBatches.partnerName,
    quantity: schema.learningCodeBatches.quantity,
    includedCredits: schema.learningCodeBatches.includedCredits,
    expiresAt: schema.learningCodeBatches.expiresAt,
    status: schema.learningCodeBatches.status,
    createdAt: schema.learningCodeBatches.createdAt,
    total: sql<number>`(select count(*) from learning_codes c where c.batch_id = learning_code_batches.id)`,
    redeemed: sql<number>`(select count(*) from learning_codes c where c.batch_id = learning_code_batches.id and c.status = 'redeemed')`,
    disabled: sql<number>`(select count(*) from learning_codes c where c.batch_id = learning_code_batches.id and c.status = 'disabled')`,
  }).from(schema.learningCodeBatches).orderBy(desc(schema.learningCodeBatches.id)).all()

  return rows.map(r => ({
    id: r.id,
    batch_no: r.batchNo,
    course_id: r.courseId,
    channel: r.channel,
    sku: r.sku,
    campaign: r.campaign,
    partner_name: r.partnerName,
    quantity: r.quantity,
    included_credits: r.includedCredits,
    expires_at: r.expiresAt,
    status: r.status,
    created_at: r.createdAt,
    total: r.total,
    unused: r.total - r.redeemed - r.disabled,
    redeemed: r.redeemed,
    disabled: r.disabled,
    redemption_rate: r.total ? Math.round((r.redeemed / r.total) * 1000) / 10 : 0,
  }))
}

/** 批次内兑换码明细：只输出掩码。 */
export function listBatchCodes(batchId: number) {
  const rows = db.select({
    id: schema.learningCodes.id,
    codeSuffix: schema.learningCodes.codeSuffix,
    status: schema.learningCodes.status,
    redeemedBy: schema.learningCodes.redeemedBy,
    redeemedAt: schema.learningCodes.redeemedAt,
    username: schema.users.username,
  }).from(schema.learningCodes)
    .leftJoin(schema.users, eq(schema.users.id, schema.learningCodes.redeemedBy))
    .where(eq(schema.learningCodes.batchId, batchId))
    .orderBy(schema.learningCodes.id)
    .all()

  return rows.map(r => ({
    id: r.id,
    masked_code: `ZZK-****-****-${r.codeSuffix}`,
    status: r.status,
    redeemed_by: r.username || null,
    redeemed_at: r.redeemedAt,
  }))
}

export function setBatchStatus(batchId: number, status: 'active' | 'disabled') {
  const [batch] = db.select().from(schema.learningCodeBatches)
    .where(eq(schema.learningCodeBatches.id, batchId)).all()
  if (!batch) throw new LearningError('batch_not_found', '批次不存在', 404)
  db.update(schema.learningCodeBatches).set({ status, updatedAt: nowIso() })
    .where(eq(schema.learningCodeBatches.id, batchId)).run()
  return { id: batchId, status }
}

/** 停用单张未使用的码（已兑换的码不能停用——权限撤销走 entitlement）。 */
export function disableCode(codeId: number) {
  const ts = nowIso()
  const res = db.update(schema.learningCodes).set({ status: 'disabled', disabledAt: ts, updatedAt: ts })
    .where(sql`${schema.learningCodes.id} = ${codeId} and ${schema.learningCodes.status} = 'unused'`)
    .run()
  if (res.changes === 0) throw new LearningError('code_not_disableable', '只能停用未使用的兑换码', 409)
  return { id: codeId, status: 'disabled' }
}
