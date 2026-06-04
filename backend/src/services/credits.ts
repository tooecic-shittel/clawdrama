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

// 视频每秒积分（按画质档），3x 毛利
export const VIDEO_CREDIT_PER_SEC: Record<string, number> = {
  '720p': 3000,
  '1080p': 6000,
}

/** 视频动态积分：时长(秒) × 画质费率。缺省按 5秒 / 720P。 */
export function videoCost(durationSec?: number | null, resolution?: string | null): number {
  const sec = Math.min(15, Math.max(1, Math.round(Number(durationSec) || 5)))
  const r = String(resolution || '').toLowerCase().includes('1080') ? '1080p' : '720p'
  return sec * (VIDEO_CREDIT_PER_SEC[r] ?? VIDEO_CREDIT_PER_SEC['720p'])
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
  credits: number
  bonus: number              // bonus credits on top of base
  priceCents: number         // CNY cents
  badge?: string
  description?: string
}

export const PACKAGES: CreditPackage[] = [
  {
    id: 'starter',
    name: '入门包',
    credits: 50000,
    bonus: 0,
    priceCents: 5000,
    description: '尝鲜体验，约可生成 6 个分镜视频或 50 张图',
  },
  {
    id: 'standard',
    name: '标准包',
    credits: 120000,
    bonus: 24000,
    priceCents: 12000,
    badge: '最受欢迎',
    description: '送 24000 积分（+20%），约可生成 19 个分镜视频',
  },
  {
    id: 'pro',
    name: '专业包',
    credits: 350000,
    bonus: 105000,
    priceCents: 35000,
    badge: '高性价比',
    description: '送 105000 积分（+30%），约可生成 60 个分镜视频',
  },
]
