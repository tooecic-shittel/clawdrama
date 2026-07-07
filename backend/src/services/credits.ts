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

// 视频引擎：seedance（火山·高质量·较贵·拒真人图）/ vidu（当前试验入口：云雾 PixVerse）/ happyhorse（历史/暂时下架）/ happyhorse_full（阿里百炼官方 1.1）/ hailuo（海螺·写实真人可用·支持长时长·较贵）。
export type VideoEngine = 'seedance' | 'vidu' | 'happyhorse' | 'happyhorse_full' | 'hailuo'

// 视频每秒积分（按引擎 × 画质档）。
//   seedance：成本 720P≈¥1/秒、1080P≈¥2/秒 × 3 毛利 → 3000 / 6000。
//   vidu：云雾 PixVerse，按模型广场 360P 不带声约 0.246/s 做测试档，后续按真实消耗调价。
//   happyhorse：历史档位，暂时下架但保留兼容历史记录。
//   happyhorse_full：阿里云百炼官方 HappyHorse 1.1，按官方 720P≈¥0.9/s、1080P≈¥1.2/s 估算。
//   480P：最省档，仅 seedance 原生支持；其它引擎会回退到 720P/540P 出片，故不设 480P 价，
//        由 videoCost 的 ?? table['720p'] 兜底按其实际产出的 720P 计费。
// 改价时同步更新前端 pricing 默认值与 PACKAGES 文案。
export const VIDEO_CREDIT_PER_SEC: Record<VideoEngine, Record<string, number>> = {
  seedance: { '480p': 1500, '720p': 3000, '1080p': 6000 },
  vidu: { '360p': 1000, '540p': 1600, '720p': 2400, '1080p': 3200 },
  happyhorse: { '720p': 2400, '1080p': 4800 },
  happyhorse_full: { '720p': 2700, '1080p': 3600 },
  hailuo: { '720p': 3000, '1080p': 6000 },  // 海螺·与 seedance 同档（写实真人可用；成本算下来此档有 margin，后续按真实成本精调）
}

/** provider → 计费引擎档：火山=seedance，pixverse/vidu=试验视频档，minimax=hailuo（海螺），其余（历史云雾 / Veo 兜底）=happyhorse 档。 */
export function providerToEngine(provider?: string | null, model?: string | null): VideoEngine {
  if (provider === 'volcengine') return 'seedance'
  if (provider === 'vidu' || provider === 'pixverse') return 'vidu'
  if (provider === 'minimax') return 'hailuo'
  if (provider === 'ali' && /happyhorse-1\.1/i.test(model || '')) return 'happyhorse_full'
  return 'happyhorse'
}

/** 视频动态积分：时长(秒) × 引擎档 × 画质费率。缺省 seedance / 5秒 / 720P。 */
export function videoCost(durationSec?: number | null, resolution?: string | null, engine: VideoEngine = 'seedance'): number {
  const sec = Math.min(15, Math.max(1, Math.round(Number(durationSec) || 5)))
  const rs = String(resolution || '').toLowerCase()
  const r = rs.includes('1080') ? '1080p' : rs.includes('540') ? '540p' : rs.includes('480') ? '480p' : rs.includes('360') ? '360p' : '720p'
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

// === Package catalog (frontend display + Alipay payment integration) ===
export interface CreditPackage {
  id: string
  name: string
  period?: string            // 计价周期，用于「¥X / period」展示：'周' | '月' | '年'
  periodNote?: string        // 积分有效期说明：'每周有效' | '每月有效' | '全年有效'
  subNote?: string           // 补充说明，如「相当于每月 300,000 积分」
  credits: number            // 支付成功后实际到账的积分数
  bonus: number              // bonus credits on top of base
  priceCents: number         // CNY cents
  badge?: string
  highlight?: boolean        // 主推档（年卡）—— 前端高亮放大
  features?: string[]        // 卡片功能勾选列表
  description?: string
}

// 订阅制：包周 / 包月 / 包年。当前支付宝支付成功后一次性到账；
// 如后续改成按月发放 / 到期清零，需要新增积分有效期与定时发放任务。
// 定价锚点：充值 ¥1 ≈ 1500 积分；订阅按下方价格。★数字按实际运营调整★。
const SUB_FEATURES = [
  'Seedance 2.0 高清出片 · 去除水印',
  '视频对口型（原生人声对白）',
  '首尾帧控制 + 提示词 AI 改写',
  '480P / 720P / 1080P 任选',
  '同时生成最多 4 条',
  '一键下载全部 · 一键导出剪映',
]
export const PACKAGES: CreditPackage[] = [
  {
    id: 'weekly',
    name: '包周',
    period: '周',
    periodNote: '每周有效',
    credits: 120000,
    bonus: 0,
    priceCents: 10900,
    badge: '尝鲜',
    features: [...SUB_FEATURES, '每周 12 万积分，灵活尝鲜'],
  },
  {
    id: 'monthly',
    name: '包月',
    period: '月',
    periodNote: '每月有效',
    credits: 300000,
    bonus: 0,
    priceCents: 19900,
    badge: '最受欢迎',
    features: [...SUB_FEATURES, '每月 30 万积分，畅快创作'],
  },
  {
    id: 'yearly',
    name: '包年',
    period: '年',
    periodNote: '全年有效',
    subNote: '相当于每月 300,000 积分',
    credits: 3600000,
    bonus: 0,
    priceCents: 199900,
    badge: '最划算',
    highlight: true,
    features: [...SUB_FEATURES, '买 10 个月送 2 个月，年付低至 ≈¥166/月（立省 ¥389）'],
  },
]

// 积分加油包（一次性加购，类似流量包）：订阅额度用完时补充，不订阅也可单买。
// 按锚点 ¥1 = 1500 积分定价；与订阅不同，加油包积分长期有效（不随月清零）。
export const TOPUP_PACKS: CreditPackage[] = [
  { id: 'topup-s', name: '小加油包', credits: 45000, bonus: 0, priceCents: 3000 },
  { id: 'topup-m', name: '中加油包', credits: 150000, bonus: 0, priceCents: 10000, badge: '推荐' },
  { id: 'topup-l', name: '大加油包', credits: 450000, bonus: 0, priceCents: 30000 },
]
