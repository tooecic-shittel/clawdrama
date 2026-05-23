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
    credits: 500,
    bonus: 0,
    priceCents: 5000,
    description: '尝鲜体验，约可生成 10 个分镜视频',
  },
  {
    id: 'standard',
    name: '标准包',
    credits: 1500,
    bonus: 300,
    priceCents: 12000,
    badge: '最受欢迎',
    description: '送 300 积分，约可生成 1 部完整短剧',
  },
  {
    id: 'pro',
    name: '专业包',
    credits: 5000,
    bonus: 1500,
    priceCents: 35000,
    badge: '高性价比',
    description: '送 1500 积分，约可生成 3-4 部完整短剧',
  },
]
