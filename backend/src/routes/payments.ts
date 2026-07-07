import { Hono } from 'hono'
import { and, eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { requireAuth } from '../middleware/auth.js'
import { applyCreditOp, PACKAGES, TOPUP_PACKS, type CreditPackage } from '../services/credits.js'
import {
  createAlipayPagePayUrl,
  getAlipayConfig,
  verifyAlipayNotify,
  yuanToCents,
} from '../services/alipay.js'

const payments = new Hono()

function findPackage(packageId: string): CreditPackage | undefined {
  return [...PACKAGES, ...TOPUP_PACKS].find(pkg => pkg.id === packageId)
}

function createOrderNo(): string {
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase()
  return `CD${Date.now()}${suffix}`
}

function parseNotifyBody(body: Record<string, FormDataEntryValue | FormDataEntryValue[]>): Record<string, string> {
  const params: Record<string, string> = {}
  for (const [key, value] of Object.entries(body)) {
    if (Array.isArray(value)) {
      params[key] = String(value[0] ?? '')
    } else {
      params[key] = String(value ?? '')
    }
  }
  return params
}

payments.post('/orders', requireAuth, async (c) => {
  const user = c.get('user') as { id: number }
  const body = await c.req.json().catch(() => ({}))
  const packageId = String(body.package_id || '')
  const pkg = findPackage(packageId)
  if (!pkg) return c.json({ code: 400, message: '套餐不存在' }, 400)

  const config = getAlipayConfig()
  if (!config) {
    return c.json({ code: 503, message: '支付宝支付尚未配置完成：缺少 ALIPAY_APP_ID / ALIPAY_PRIVATE_KEY / ALIPAY_PUBLIC_KEY' }, 503)
  }

  const now = new Date().toISOString()
  const credits = (pkg.credits || 0) + (pkg.bonus || 0)
  const orderNo = createOrderNo()
  const subject = `爪爪短剧 ${pkg.name}`

  const inserted = await db.insert(schema.paymentOrders).values({
    orderNo,
    userId: user.id,
    packageId: pkg.id,
    packageName: pkg.name,
    credits,
    amountCents: pkg.priceCents,
    currency: 'CNY',
    provider: 'alipay',
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  }).returning()
  const order = inserted[0]

  const payUrl = createAlipayPagePayUrl(config, {
    outTradeNo: orderNo,
    subject,
    amountCents: pkg.priceCents,
    body: `${pkg.name} · ${credits} 积分`,
  })

  await db.update(schema.paymentOrders)
    .set({ payUrl, updatedAt: new Date().toISOString() })
    .where(eq(schema.paymentOrders.id, order.id))

  return c.json({
    data: {
      order_no: orderNo,
      pay_url: payUrl,
      amount_cents: pkg.priceCents,
      credits,
      package_name: pkg.name,
    },
  })
})

payments.get('/orders/:orderNo', requireAuth, async (c) => {
  const user = c.get('user') as { id: number; role: string }
  const orderNo = c.req.param('orderNo')
  const where = user.role === 'admin'
    ? eq(schema.paymentOrders.orderNo, orderNo)
    : and(eq(schema.paymentOrders.orderNo, orderNo), eq(schema.paymentOrders.userId, user.id))
  const rows = await db.select().from(schema.paymentOrders).where(where).limit(1)
  if (!rows[0]) return c.json({ code: 404, message: '订单不存在' }, 404)
  return c.json({ data: { order: rows[0] } })
})

payments.post('/alipay/notify', async (c) => {
  const config = getAlipayConfig()
  if (!config) {
    console.error('[alipay] notify rejected: missing config')
    return c.text('failure')
  }

  const body = await c.req.parseBody()
  const params = parseNotifyBody(body)
  if (!verifyAlipayNotify(params, config.alipayPublicKey)) {
    console.error('[alipay] notify rejected: invalid signature', params.out_trade_no || '')
    return c.text('failure')
  }

  const orderNo = params.out_trade_no
  const tradeStatus = params.trade_status
  const providerTradeNo = params.trade_no || null
  if (!orderNo) return c.text('failure')

  if (tradeStatus !== 'TRADE_SUCCESS' && tradeStatus !== 'TRADE_FINISHED') {
    return c.text('success')
  }

  const rows = await db.select().from(schema.paymentOrders)
    .where(eq(schema.paymentOrders.orderNo, orderNo))
    .limit(1)
  const order = rows[0]
  if (!order) {
    console.error('[alipay] notify rejected: order not found', orderNo)
    return c.text('failure')
  }

  const paidCents = yuanToCents(params.total_amount)
  if (paidCents !== order.amountCents) {
    console.error('[alipay] notify rejected: amount mismatch', orderNo, paidCents, order.amountCents)
    return c.text('failure')
  }

  if (order.status === 'paid') return c.text('success')

  const existingCredit = await db.select({ id: schema.creditTransactions.id })
    .from(schema.creditTransactions)
    .where(and(
      eq(schema.creditTransactions.referenceType, 'payment_order'),
      eq(schema.creditTransactions.referenceId, order.id),
    ))
    .limit(1)

  const now = new Date().toISOString()
  await db.update(schema.paymentOrders)
    .set({
      status: 'paid',
      providerTradeNo,
      paidAt: now,
      rawNotify: JSON.stringify(params),
      updatedAt: now,
    })
    .where(eq(schema.paymentOrders.id, order.id))

  if (!existingCredit[0]) {
    await applyCreditOp({
      userId: order.userId,
      amount: order.credits,
      type: 'topup',
      description: `购买 ${order.packageName} 到账 ${order.credits} 积分`,
      referenceType: 'payment_order',
      referenceId: order.id,
      meta: { order_no: order.orderNo, provider_trade_no: providerTradeNo, provider: 'alipay' },
    })
  }

  return c.text('success')
})

export default payments
