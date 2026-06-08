import { eq, desc } from 'drizzle-orm'
import { db, schema } from '../db/index.js'

export type CreditTxType =
  | 'topup'           // user-initiated payment (future)
  | 'admin_grant'     // admin manually granted
  | 'register_bonus'  // welcome credits on signup
  | 'deduct'          // consumed by an action
  | 'refund'          // refund for failed action

export interface CreditOp {
  userId: number
  amount: number                  // positive=add, negative=deduct
  type: CreditTxType
  description?: string
  referenceType?: string
  referenceId?: number
  meta?: Record<string, any>
  operatorId?: number | null
}

export class InsufficientCreditsError extends Error {
  status = 402
  constructor(message = '积分余额不足') {
    super(message)
    this.name = 'InsufficientCreditsError'
  }
}

/**
 * Atomically update balance + write a transaction row.
 * Uses better-sqlite3 transaction for atomicity.
 */
export async function applyCreditOp(op: CreditOp) {
  const now = new Date().toISOString()

  // Fetch current balance
  const rows = await db.select().from(schema.users).where(eq(schema.users.id, op.userId)).limit(1)
  if (rows.length === 0) throw new Error(`user ${op.userId} not found`)
  const user = rows[0]
  const newBalance = user.credits + op.amount

  if (newBalance < 0) {
    throw new InsufficientCreditsError(`积分不足：当前 ${user.credits}，需要 ${-op.amount}`)
  }

  // Update balance
  await db.update(schema.users)
    .set({ credits: newBalance, updatedAt: now })
    .where(eq(schema.users.id, op.userId))

  // Insert transaction
  const inserted = await db.insert(schema.creditTransactions).values({
    userId: op.userId,
    amount: op.amount,
    balanceAfter: newBalance,
    type: op.type,
    description: op.description || null,
    referenceType: op.referenceType || null,
    referenceId: op.referenceId || null,
    meta: op.meta ? JSON.stringify(op.meta) : null,
    operatorId: op.operatorId || null,
    createdAt: now,
  }).returning()

  return {
    transaction: inserted[0],
    balanceBefore: user.credits,
    balanceAfter: newBalance,
  }
}

// === Per-action pricing (credits consumed per successful AI generation) ===
// 定价锚点：¥1 = 1000 积分（1 积分 = ¥0.001）。积分价 = 真实成本(元) × 毛利倍数 × 1000。
//   图片  doubao-seedream ¥0.20 × 5 = 1000   （≈¥1.0/张）
//   配音  MiniMax ≤¥0.03 × 5 = 150           （≈¥0.15/段，实际更低，留足余量）
//   视频  Seedance 2.0 按「时长 × 画质」动态：成本 720P≈¥1/秒、1080P≈¥2/秒，× 3 毛利
//         → 720P 3000 积分/秒、1080P 6000 积分/秒（见 videoCost）。例：5秒/720P=15000。
// 改成本/倍数/锚点时，同步更新这里、videoCost、PACKAGES、前端提示。
export type ChargeableAction = 'image' | 'video' | 'tts'

export const ACTION_COST: Record<ChargeableAction, number> = {
  image: 1000,
  video: 15000, // 兜底/默认（5秒·720P）；视频实际按 videoCost 动态计算
  tts: 150,
}

// 视频引擎：seedance（火山·高质量·较贵）/ happyhorse（云雾·经济·带水印·兜底）。
export type VideoEngine = 'seedance' | 'happyhorse'

// 视频每秒积分（按引擎 × 画质档）。
//   seedance：成本 720P≈¥1/秒、1080P≈¥2/秒 × 3 毛利 → 3000 / 6000。
//   happyhorse：更便宜的兜底引擎，按 seedance 的 8 折计（720P 2400 / 1080P 4800）。
//   480P：最省档，仅 seedance 原生支持；happyhorse 会回退到 720P 出片，故不设 480P 价，
//        由 videoCost 的 ?? table['720p'] 兜底按其实际产出的 720P 计费。
// 改价时同步更新前端 pricing 默认值与 PACKAGES 文案。
export const VIDEO_CREDIT_PER_SEC: Record<VideoEngine, Record<string, number>> = {
  seedance: { '480p': 1500, '720p': 3000, '1080p': 6000 },
  happyhorse: { '720p': 2400, '1080p': 4800 },
}

/** provider → 计费引擎档：火山=seedance，其余（云雾 happyhorse / Veo 兜底）=happyhorse 档。 */
export function providerToEngine(provider?: string | null): VideoEngine {
  return provider === 'volcengine' ? 'seedance' : 'happyhorse'
}

/** 视频动态积分：时长(秒) × 引擎档 × 画质费率。缺省 seedance / 5秒 / 720P。 */
export function videoCost(durationSec?: number | null, resolution?: string | null, engine: VideoEngine = 'seedance'): number {
  const sec = Math.min(15, Math.max(1, Math.round(Number(durationSec) || 5)))
  const rs = String(resolution || '').toLowerCase()
  const r = rs.includes('1080') ? '1080p' : rs.includes('480') ? '480p' : '720p'
  const table = VIDEO_CREDIT_PER_SEC[engine] ?? VIDEO_CREDIT_PER_SEC.seedance
  return sec * (table[r] ?? table['720p'])
}

/**
 * Pre-flight balance gate. Call BEFORE enqueuing a generation.
 * Throws InsufficientCreditsError (402) when the user can't afford the action.
 * `costOverride` lets variable-priced actions (video) pass the computed cost.
 * No-op when userId is absent (internal/system calls aren't metered).
 */
export async function assertBalance(userId: number | null | undefined, action: ChargeableAction, costOverride?: number) {
  if (!userId) return
  const cost = costOverride ?? ACTION_COST[action]
  if (!cost) return
  const balance = await getBalance(userId)
  if (balance < cost) {
    throw new InsufficientCreditsError(`积分不足：当前 ${balance}，本次「${action}」需要 ${cost}`)
  }
}

/**
 * Deduct credits for a COMPLETED action. Best-effort: never throws — the asset is
 * already produced, so a billing hiccup must not crash the completion handler or
 * lose the result. Access is gated up-front by assertBalance(); this only settles.
 * `opts.cost` overrides the flat ACTION_COST (used by video's dynamic pricing).
 * No-op when userId is absent.
 */
export async function chargeForAction(
  userId: number | null | undefined,
  action: ChargeableAction,
  opts: { referenceId?: number; meta?: Record<string, any>; cost?: number } = {},
) {
  if (!userId) return
  const cost = opts.cost ?? ACTION_COST[action]
  if (!cost) return
  try {
    await applyCreditOp({
      userId,
      amount: -cost,
      type: 'deduct',
      description: `${action} 生成扣费 ${cost} 积分`,
      referenceType: `${action}_generation`,
      referenceId: opts.referenceId,
      meta: opts.meta,
    })
  } catch (err: any) {
    console.error(`[credits] 扣费失败 user=${userId} action=${action} ref=${opts.referenceId}:`, err?.message || err)
  }
}

export async function getBalance(userId: number): Promise<number> {
  const rows = await db.select({ credits: schema.users.credits })
    .from(schema.users).where(eq(schema.users.id, userId)).limit(1)
  return rows[0]?.credits ?? 0
}

export async function listHistory(userId: number, limit = 50, offset = 0) {
  return db.select().from(schema.creditTransactions)
    .where(eq(schema.creditTransactions.userId, userId))
    .orderBy(desc(schema.creditTransactions.createdAt))
    .limit(limit)
    .offset(offset)
}

// === Package catalog (frontend display + future payment integration) ===
export interface CreditPackage {
  id: string
  name: string
  period?: string            // 订阅周期，用于「¥X / period」展示：'7 天' | '月' | '年'
  credits: number
  bonus: number              // bonus credits on top of base
  priceCents: number         // CNY cents
  badge?: string
  description?: string
}

// 订阅制：七日体验 / 月度 / 年度。每档授予对应积分（积分仍是计费单位，用户拿积分去生成）。
// ★价格与积分均为初始建议值，按实际运营调整★。
// 注意：真正的「周期性扣费 / 到期 / 自动续订」需接入支付网关，当前未实现——
//      前端「立即订阅」仍走占位提示（管理员手动充值），与改造前一致。
export const PACKAGES: CreditPackage[] = [
  {
    id: 'trial7',
    name: '七日体验',
    period: '7 天',
    credits: 30000,
    bonus: 0,
    priceCents: 1990,
    badge: '新手尝鲜',
    description: '7 天体验全部功能，含 3 万积分尝鲜',
  },
  {
    id: 'monthly',
    name: '月度会员',
    period: '月',
    credits: 100000,
    bonus: 0,
    priceCents: 6800,
    badge: '最受欢迎',
    description: '每月 10 万积分，畅享图片 / 视频 / 配音生成',
  },
  {
    id: 'yearly',
    name: '年度会员',
    period: '年',
    credits: 1500000,
    bonus: 0,
    priceCents: 59800,
    badge: '最划算',
    description: '相当于 ¥49.8/月（立省约 27%），每年 150 万积分',
  },
]
