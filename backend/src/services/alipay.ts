import { createSign, createVerify } from 'crypto'

export interface AlipayConfig {
  appId: string
  privateKey: string
  alipayPublicKey: string
  gateway: string
  notifyUrl: string
  returnUrl: string
}

export interface AlipayPagePayInput {
  outTradeNo: string
  subject: string
  amountCents: number
  body?: string
}

type Params = Record<string, string | number | undefined | null>

const DEFAULT_GATEWAY = 'https://openapi.alipay.com/gateway.do'
const DEFAULT_BASE_URL = 'https://clawdrama.claw-pi.cn'

export function getAlipayConfig(): AlipayConfig | null {
  const appId = (process.env.ALIPAY_APP_ID || '').trim()
  const privateKey = (process.env.ALIPAY_PRIVATE_KEY || '').trim()
  const alipayPublicKey = (process.env.ALIPAY_PUBLIC_KEY || '').trim()
  if (!appId || !privateKey || !alipayPublicKey) return null

  const baseUrl = (process.env.PUBLIC_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '')
  return {
    appId,
    privateKey: normalizePrivateKey(privateKey),
    alipayPublicKey: normalizePublicKey(alipayPublicKey),
    gateway: (process.env.ALIPAY_GATEWAY || DEFAULT_GATEWAY).trim(),
    notifyUrl: (process.env.ALIPAY_NOTIFY_URL || `${baseUrl}/api/v1/payments/alipay/notify`).trim(),
    returnUrl: (process.env.ALIPAY_RETURN_URL || `${baseUrl}/credits?payment=success`).trim(),
  }
}

export function createAlipayPagePayUrl(config: AlipayConfig, input: AlipayPagePayInput): string {
  const params: Params = {
    app_id: config.appId,
    method: 'alipay.trade.page.pay',
    format: 'JSON',
    charset: 'utf-8',
    sign_type: 'RSA2',
    timestamp: formatAlipayTimestamp(new Date()),
    version: '1.0',
    notify_url: config.notifyUrl,
    return_url: config.returnUrl,
    biz_content: JSON.stringify({
      out_trade_no: input.outTradeNo,
      product_code: 'FAST_INSTANT_TRADE_PAY',
      total_amount: centsToYuan(input.amountCents),
      subject: input.subject,
      body: input.body || input.subject,
    }),
  }
  const sign = signParams(params, config.privateKey)
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && String(value) !== '') {
      query.set(key, String(value))
    }
  }
  query.set('sign', sign)
  return `${config.gateway}?${query.toString()}`
}

export function verifyAlipayNotify(params: Params, alipayPublicKey: string): boolean {
  const sign = params.sign ? String(params.sign) : ''
  if (!sign) return false
  const content = buildSignContent(params, true)
  const verifier = createVerify('RSA-SHA256')
  verifier.update(content, 'utf8')
  verifier.end()
  return verifier.verify(normalizePublicKey(alipayPublicKey), sign, 'base64')
}

export function centsToYuan(cents: number): string {
  return (Math.round(cents) / 100).toFixed(2)
}

export function yuanToCents(yuan: string | number | undefined | null): number {
  const value = Number(yuan)
  if (!Number.isFinite(value)) return 0
  return Math.round(value * 100)
}

function signParams(params: Params, privateKey: string): string {
  const content = buildSignContent(params, false)
  const signer = createSign('RSA-SHA256')
  signer.update(content, 'utf8')
  signer.end()
  return signer.sign(privateKey, 'base64')
}

function buildSignContent(params: Params, excludeSignType: boolean): string {
  return Object.keys(params)
    .filter(key => key !== 'sign' && (!excludeSignType || key !== 'sign_type'))
    .filter(key => params[key] !== undefined && params[key] !== null && String(params[key]) !== '')
    .sort()
    .map(key => `${key}=${String(params[key])}`)
    .join('&')
}

function normalizePrivateKey(key: string): string {
  if (key.includes('-----BEGIN')) return key.replace(/\\n/g, '\n')
  const compact = key.replace(/\s+/g, '')
  const label = compact.slice(0, 160).includes('BgkqhkiG9w0BAQE')
    ? 'PRIVATE KEY'
    : 'RSA PRIVATE KEY'
  return normalizePem(compact, label)
}

function normalizePublicKey(key: string): string {
  return normalizePem(key, 'PUBLIC KEY')
}

function normalizePem(key: string, label: 'PRIVATE KEY' | 'RSA PRIVATE KEY' | 'PUBLIC KEY'): string {
  if (key.includes('-----BEGIN')) return key.replace(/\\n/g, '\n')
  const compact = key.replace(/\s+/g, '')
  const body = compact.match(/.{1,64}/g)?.join('\n') || compact
  return `-----BEGIN ${label}-----\n${body}\n-----END ${label}-----`
}

function formatAlipayTimestamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join('-') + ' ' + [
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join(':')
}
