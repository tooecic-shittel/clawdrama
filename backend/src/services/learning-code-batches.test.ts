import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const tmpDb = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'claw-batch-test-')), 'test.db')
process.env.DB_PATH = tmpDb
process.env.REDEMPTION_CODE_PEPPER = 'test-pepper-material-32-bytes-minimum!!'

const svc = await import('./learning-code-batches.js')

function validInput(over: Partial<Parameters<typeof svc.createLearningCodeBatch>[0]> = {}) {
  return {
    course_id: 'aigc-short-drama-v1',
    channel: 'douyin',
    sku: '抖音-学习卡-标准版',
    quantity: 5,
    included_credits: 30000,
    expires_at: new Date(Date.now() + 30 * 86400_000).toISOString(),
    ...over,
  }
}

after(() => {
  try { fs.rmSync(path.dirname(tmpDb), { recursive: true, force: true }) } catch {}
})

test('rejects quantity outside 1-5000', () => {
  assert.throws(() => svc.validateBatchInput(validInput({ quantity: 0 })), (e: any) => e.code === 'invalid_quantity')
  assert.throws(() => svc.validateBatchInput(validInput({ quantity: 5001 })), (e: any) => e.code === 'invalid_quantity')
  assert.throws(() => svc.validateBatchInput(validInput({ quantity: 2.5 })), (e: any) => e.code === 'invalid_quantity')
})

test('rejects unknown channel values', () => {
  assert.throws(() => svc.validateBatchInput(validInput({ channel: 'wechat' })), (e: any) => e.code === 'invalid_channel')
  for (const ch of ['douyin', 'taobao', 'influencer', 'reseller', 'physical', 'internal']) {
    svc.validateBatchInput(validInput({ channel: ch }))
  }
})

test('rejects negative included credits and past expiry', () => {
  assert.throws(() => svc.validateBatchInput(validInput({ included_credits: -1 })), (e: any) => e.code === 'invalid_credits')
  assert.throws(
    () => svc.validateBatchInput(validInput({ expires_at: new Date(Date.now() - 1000).toISOString() })),
    (e: any) => e.code === 'invalid_expiry',
  )
})

test('creates batches with unique batch numbers and correct CSV', () => {
  const a = svc.createLearningCodeBatch(validInput())
  const b = svc.createLearningCodeBatch(validInput({ channel: 'taobao' }))
  assert.notEqual(a.batch.batchNo, b.batch.batchNo)
  assert.match(a.batch.batchNo, /^LC-\d{8}-[A-Z2-9]{4}$/)

  const lines = a.csv.split('\n')
  assert.equal(lines[0], 'batch_no,channel,sku,course_name,redemption_code,redeem_url,expires_at,included_credits')
  assert.equal(lines.length, 1 + 5)
  for (const line of lines.slice(1)) {
    assert.ok(line.includes(a.batch.batchNo))
    assert.match(line, /ZZK-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}/)
    assert.ok(line.includes('30000'))
  }
})

test('list responses contain masked codes only, never full codes', () => {
  const { batch, csv } = svc.createLearningCodeBatch(validInput({ quantity: 3 }))
  const fullCodes = csv.split('\n').slice(1).map(l => l.split(',')[4])
  assert.equal(fullCodes.length, 3)

  const batches = JSON.stringify(svc.listLearningBatches())
  const codes = JSON.stringify(svc.listBatchCodes(batch.id))
  for (const code of fullCodes) {
    assert.ok(!batches.includes(code), 'batch list leaks full code')
    assert.ok(!codes.includes(code), 'code list leaks full code')
    // 掩码只保留末四位
    const suffix = code.replace(/-/g, '').slice(-4)
    assert.ok(codes.includes(`ZZK-****-****-${suffix}`))
  }
})

test('batch statistics track unused, redeemed, disabled and rate', async () => {
  const { batch, csv } = svc.createLearningCodeBatch(validInput({ quantity: 4, included_credits: 0 }))
  const fullCodes = csv.split('\n').slice(1).map(l => l.split(',')[4])

  const { db, schema } = await import('../db/index.js')
  const res = db.insert(schema.users).values({
    username: `batchuser${Date.now()}`,
    passwordHash: 'x', role: 'user', credits: 0,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  }).run()
  const userId = Number(res.lastInsertRowid)

  const { redeemLearningCode } = await import('./learning-redemption.js')
  await redeemLearningCode({ userId, code: fullCodes[0] })

  const codes = svc.listBatchCodes(batch.id)
  const redeemedRow = codes.find(c => c.status === 'redeemed')!
  svc.disableCode(codes.find(c => c.status === 'unused')!.id)

  const stats = svc.listLearningBatches().find(b => b.id === batch.id)!
  assert.equal(stats.total, 4)
  assert.equal(stats.redeemed, 1)
  assert.equal(stats.disabled, 1)
  assert.equal(stats.unused, 2)
  assert.equal(stats.redemption_rate, 25)
  assert.ok(redeemedRow.redeemed_by, 'redeemed row shows username')

  // 已兑换的码不能被停用
  assert.throws(() => svc.disableCode(redeemedRow.id), (e: any) => e.code === 'code_not_disableable')
})
