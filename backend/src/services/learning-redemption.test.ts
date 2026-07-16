/**
 * 学习卡兑换核心逻辑测试。
 * 必须在导入 db 之前设置 DB_PATH（指向临时库）与 REDEMPTION_CODE_PEPPER，
 * 因此统一用动态 import。
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const tmpDb = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'claw-learning-test-')), 'test.db')
process.env.DB_PATH = tmpDb
process.env.REDEMPTION_CODE_PEPPER = 'test-pepper-material-32-bytes-minimum!!'

const svc = await import('./learning-redemption.js')
const { db, schema } = await import('../db/index.js')
const { eq } = await import('drizzle-orm')

let userSeq = 0
function makeUser(): number {
  userSeq++
  const res = db.insert(schema.users).values({
    username: `learner${userSeq}`,
    passwordHash: 'x',
    role: 'user',
    credits: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }).run()
  return Number(res.lastInsertRowid)
}

function makeBatch(opts: Partial<{ status: string; expiresAt: string; includedCredits: number }> = {}): number {
  const ts = new Date().toISOString()
  const res = db.insert(schema.learningCodeBatches).values({
    batchNo: `LC-TEST-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    courseId: 'aigc-short-drama-v1',
    channel: 'internal',
    sku: 'TEST-SKU',
    quantity: 10,
    includedCredits: opts.includedCredits ?? 30000,
    expiresAt: opts.expiresAt ?? new Date(Date.now() + 86400_000).toISOString(),
    status: opts.status ?? 'active',
    createdAt: ts,
    updatedAt: ts,
  }).run()
  return Number(res.lastInsertRowid)
}

function insertCode(batchId: number, fullCode: string): number {
  const ts = new Date().toISOString()
  const normalized = svc.normalizeRedemptionCode(fullCode)
  const res = db.insert(schema.learningCodes).values({
    batchId,
    codeHash: svc.hashRedemptionCode(normalized),
    codeSuffix: normalized.slice(-4),
    status: 'unused',
    createdAt: ts,
    updatedAt: ts,
  }).run()
  return Number(res.lastInsertRowid)
}

after(() => {
  try { fs.rmSync(path.dirname(tmpDb), { recursive: true, force: true }) } catch {}
})

test('normalizes spaces, lowercase, and hyphens to one canonical code', () => {
  const canonical = svc.normalizeRedemptionCode('ZZK-ABCD-EFGH-JKMN')
  assert.equal(canonical, 'ZZKABCDEFGHJKMN')
  assert.equal(svc.normalizeRedemptionCode(' zzk-abcd-efgh-jkmn '), canonical)
  assert.equal(svc.normalizeRedemptionCode('zzk abcd efgh jkmn'), canonical)
  assert.equal(svc.normalizeRedemptionCode('ZZKABCDEFGHJKMN'), canonical)
})

test('generates unique codes in ZZK-XXXX-XXXX-XXXX format', () => {
  const codes = svc.generateRedemptionCodes(500)
  assert.equal(codes.length, 500)
  const seen = new Set<string>()
  for (const code of codes) {
    assert.match(code, /^ZZK-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/)
    assert.doesNotMatch(code, /[0O1IL]/, `code ${code} contains ambiguous characters`)
    seen.add(code)
  }
  assert.equal(seen.size, 500)
})

test('stores a digest and suffix without storing the full code', () => {
  const batchId = makeBatch()
  const full = 'ZZK-TTTT-UUUU-WXYZ'
  const id = insertCode(batchId, full)
  const [row] = db.select().from(schema.learningCodes).where(eq(schema.learningCodes.id, id)).all()
  assert.equal(row.codeHash.length, 64)
  assert.equal(row.codeSuffix, 'WXYZ')
  const dump = JSON.stringify(row)
  assert.ok(!dump.includes('TTTTUUUU'), 'full code must not be stored')
  assert.ok(!dump.includes(full))
})

test('redeems one code into one entitlement and one credit transaction', async () => {
  const userId = makeUser()
  const batchId = makeBatch({ includedCredits: 30000 })
  insertCode(batchId, 'ZZK-AAAA-BBBB-CCCC')

  const result = await svc.redeemLearningCode({ userId, code: 'zzk aaaa bbbb cccc' })
  assert.equal(result.status, 'redeemed')
  assert.equal(result.creditsAdded, 30000)

  const ents = db.select().from(schema.learningEntitlements)
    .where(eq(schema.learningEntitlements.userId, userId)).all()
  assert.equal(ents.length, 1)
  assert.equal(ents[0].status, 'active')

  const txs = db.select().from(schema.creditTransactions)
    .where(eq(schema.creditTransactions.userId, userId)).all()
  assert.equal(txs.length, 1)
  assert.equal(txs[0].referenceType, 'learning_redemption')
  assert.equal(txs[0].amount, 30000)

  const [u] = db.select().from(schema.users).where(eq(schema.users.id, userId)).all()
  assert.equal(u.credits, 30000)
})

test('replaying the same code for the same user is idempotent', async () => {
  const userId = makeUser()
  const batchId = makeBatch()
  insertCode(batchId, 'ZZK-DDDD-EEEE-FFFF')

  const first = await svc.redeemLearningCode({ userId, code: 'ZZK-DDDD-EEEE-FFFF' })
  assert.equal(first.status, 'redeemed')
  const replay = await svc.redeemLearningCode({ userId, code: 'ZZK-DDDD-EEEE-FFFF' })
  assert.equal(replay.status, 'already_redeemed')
  assert.equal(replay.creditsAdded, 0)

  const txs = db.select().from(schema.creditTransactions)
    .where(eq(schema.creditTransactions.userId, userId)).all()
  assert.equal(txs.length, 1, 'no second credit transaction')
})

test('the same code cannot be redeemed by another user', async () => {
  const owner = makeUser()
  const thief = makeUser()
  const batchId = makeBatch()
  insertCode(batchId, 'ZZK-GGGG-HHHH-JJJJ')

  await svc.redeemLearningCode({ userId: owner, code: 'ZZK-GGGG-HHHH-JJJJ' })
  await assert.rejects(
    () => svc.redeemLearningCode({ userId: thief, code: 'ZZK-GGGG-HHHH-JJJJ' }),
    (err: any) => err.code === 'code_used_by_other',
  )
})

test('an active entitlement prevents consuming a second code', async () => {
  const userId = makeUser()
  const batchId = makeBatch()
  insertCode(batchId, 'ZZK-KKKK-MMMM-NNNN')
  insertCode(batchId, 'ZZK-PPPP-QQQQ-RRRR')

  await svc.redeemLearningCode({ userId, code: 'ZZK-KKKK-MMMM-NNNN' })
  await assert.rejects(
    () => svc.redeemLearningCode({ userId, code: 'ZZK-PPPP-QQQQ-RRRR' }),
    (err: any) => err.code === 'already_enrolled',
  )
  const [second] = db.select().from(schema.learningCodes)
    .where(eq(schema.learningCodes.codeSuffix, 'RRRR')).all()
  assert.equal(second.status, 'unused', 'second code must not be consumed')
})

test('an expired or disabled batch cannot be redeemed', async () => {
  const userId = makeUser()
  const expired = makeBatch({ expiresAt: new Date(Date.now() - 1000).toISOString() })
  insertCode(expired, 'ZZK-SSSS-TTTT-UUUU')
  await assert.rejects(
    () => svc.redeemLearningCode({ userId, code: 'ZZK-SSSS-TTTT-UUUU' }),
    (err: any) => err.code === 'code_expired',
  )

  const disabled = makeBatch({ status: 'disabled' })
  insertCode(disabled, 'ZZK-VVVV-WWWW-XXXX')
  await assert.rejects(
    () => svc.redeemLearningCode({ userId, code: 'ZZK-VVVV-WWWW-XXXX' }),
    (err: any) => err.code === 'code_disabled',
  )
})

test('a revoked entitlement can be reactivated with a new valid code', async () => {
  const userId = makeUser()
  const batchId = makeBatch()
  insertCode(batchId, 'ZZK-YYYY-ZZZZ-AABB')
  insertCode(batchId, 'ZZK-CCDD-EEFF-GGHH')

  await svc.redeemLearningCode({ userId, code: 'ZZK-YYYY-ZZZZ-AABB' })
  svc.revokeCourseAccess(userId, 'aigc-short-drama-v1')
  assert.equal(svc.hasCourseAccess(userId, 'aigc-short-drama-v1'), false)

  // 原码保持已使用，不可复用
  await assert.rejects(
    () => svc.redeemLearningCode({ userId, code: 'ZZK-YYYY-ZZZZ-AABB' }),
    (err: any) => err.code === 'code_used_revoked',
  )

  // 新码可重新开通
  const again = await svc.redeemLearningCode({ userId, code: 'ZZK-CCDD-EEFF-GGHH' })
  assert.equal(again.status, 'redeemed')
  assert.equal(svc.hasCourseAccess(userId, 'aigc-short-drama-v1'), true)

  const ents = db.select().from(schema.learningEntitlements)
    .where(eq(schema.learningEntitlements.userId, userId)).all()
  assert.equal(ents.length, 1, 'entitlement row is reused, not duplicated')
})

test('progress position is clamped to a non-negative integer', () => {
  const userId = makeUser()
  svc.grantCourseAccess({ userId, courseId: 'aigc-short-drama-v1' })

  svc.saveLessonProgress({ userId, courseId: 'aigc-short-drama-v1', lessonId: 'lesson-01', status: 'in_progress', lastPositionSec: -12.7 })
  let rows = db.select().from(schema.learningProgress)
    .where(eq(schema.learningProgress.userId, userId)).all()
  assert.equal(rows[0].lastPositionSec, 0)

  svc.saveLessonProgress({ userId, courseId: 'aigc-short-drama-v1', lessonId: 'lesson-01', status: 'in_progress', lastPositionSec: 93.9 })
  rows = db.select().from(schema.learningProgress)
    .where(eq(schema.learningProgress.userId, userId)).all()
  assert.equal(rows.length, 1, 'progress row is upserted')
  assert.equal(rows[0].lastPositionSec, 93)
})
