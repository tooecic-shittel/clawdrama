<template>
  <div class="credits-page">
    <!-- Page Head -->
    <div class="page-head">
      <div>
        <h1 class="page-title">会员订阅</h1>
        <p class="page-desc">订阅获得积分，用于生成图片、视频与配音</p>
      </div>
    </div>

    <!-- Balance Card -->
    <section class="balance-card">
      <div class="balance-card-inner">
        <div class="balance-label">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/><path d="M8 10h6a2 2 0 0 1 0 4H8M8 14h8"/>
          </svg>
          当前可用余额
        </div>
        <div class="balance-num">
          {{ balance.toLocaleString() }}
          <span class="balance-unit">积分</span>
        </div>
        <div class="balance-meta">
          <span class="balance-meta-item">
            <span class="meta-dot meta-dot-success"></span>
            <span>账户正常</span>
          </span>
          <span class="balance-meta-divider"></span>
          <span class="balance-meta-item">
            <span>≈ 可生成 <b>{{ Math.floor(balance / 30) }}</b> 个分镜视频</span>
          </span>
        </div>
      </div>
      <div class="balance-decoration">
        <div v-for="i in 3" :key="i" class="balance-glow" :style="{ animationDelay: `${i * 1.2}s` }"></div>
      </div>
    </section>

    <!-- Packages -->
    <section class="packages-section">
      <div class="section-head">
        <h2 class="section-title">订阅套餐</h2>
        <p class="section-desc">按周期订阅，到账积分用于生成图片 / 视频 / 配音</p>
      </div>
      <div class="package-grid">
        <article
          v-for="p in packages"
          :key="p.id"
          class="package-card"
          :class="{ recommended: p.highlight }"
          @click="selectPackage(p)"
        >
          <div v-if="p.badge" class="package-badge">{{ p.badge }}</div>
          <div class="package-price">
            <span class="package-price-currency">¥</span>
            <span class="package-price-num">{{ priceYuan(p) }}</span>
            <span v-if="p.period" class="package-price-period">/ {{ p.period }}</span>
          </div>
          <div class="pkg-credit-box">
            <div class="pkg-credit-head">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.4 6.9L21 11l-6.6 2.1L12 20l-2.4-6.9L3 11l6.6-2.1z"/></svg>
              <span class="pkg-credit-num">{{ p.credits.toLocaleString() }}</span>
              <span class="pkg-credit-unit">积分</span>
              <span v-if="p.periodNote" class="pkg-credit-period">（{{ p.periodNote }}）</span>
            </div>
            <div class="pkg-credit-sub">最多生成 {{ maxImages(p) }} 张图片 · {{ maxVideos(p) }} 个视频</div>
            <div v-if="p.subNote" class="pkg-credit-sub">{{ p.subNote }}</div>
          </div>
          <ul class="pkg-features">
            <li v-for="(f, idx) in (p.features || [])" :key="idx">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              <span>{{ f }}</span>
            </li>
          </ul>
          <button class="package-btn">{{ isAdmin ? '管理员充值' : '立即订阅' }}</button>
        </article>
      </div>
    </section>

    <!-- Credit Top-up Packs -->
    <section v-if="topups.length" class="topup-section">
      <div class="section-head">
        <h2 class="section-title">积分加油包</h2>
        <p class="section-desc">订阅额度用完？随时加购，积分长期有效（一次性购买，不随月清零）</p>
      </div>
      <div class="topup-grid">
        <article
          v-for="t in topups"
          :key="t.id"
          class="topup-card"
          :class="{ recommended: !!t.badge }"
          @click="selectPackage(t)"
        >
          <div v-if="t.badge" class="topup-badge">{{ t.badge }}</div>
          <div class="topup-credits"><span class="topup-credits-num">{{ t.credits.toLocaleString() }}</span> 积分</div>
          <div class="topup-meta">≈ {{ maxImages(t) }} 图 / {{ maxVideos(t) }} 视频</div>
          <div class="topup-price"><span class="topup-price-cur">¥</span><span class="topup-price-num">{{ priceYuan(t) }}</span></div>
          <button class="package-btn">{{ isAdmin ? '管理员充值' : '立即购买' }}</button>
        </article>
      </div>
    </section>

    <!-- Admin Panel -->
    <section v-if="isAdmin" class="admin-section">
      <div class="section-head">
        <h2 class="section-title">
          <span class="admin-icon-wrap">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
          </span>
          管理员后台 · 手动充值
        </h2>
        <p class="section-desc">为用户增加（或扣除）积分。负数表示扣除。</p>
      </div>
      <form class="admin-form" @submit.prevent="grant">
        <div class="admin-form-row">
          <label class="field">
            <span class="field-label">选择用户</span>
            <select v-model="grantForm.userId" class="input" required>
              <option :value="null">— 选择用户 —</option>
              <option v-for="u in adminUsers" :key="u.id" :value="u.id">
                {{ u.displayName || u.username }} (@{{ u.username }}) · 当前 {{ u.credits }} 积分
              </option>
            </select>
          </label>
          <label class="field" style="max-width:180px">
            <span class="field-label">数量</span>
            <input v-model.number="grantForm.amount" class="input" type="number" required placeholder="正数加，负数扣" />
          </label>
        </div>
        <label class="field">
          <span class="field-label">备注</span>
          <input v-model="grantForm.description" class="input" placeholder="例如：双 11 福利赠送" />
        </label>
        <div class="admin-form-actions">
          <button type="submit" class="btn btn-primary" :disabled="grantLoading || !grantForm.userId || !grantForm.amount">
            {{ grantLoading ? '处理中...' : '执行充值' }}
          </button>
          <span v-if="lastGrantMsg" class="admin-form-msg">{{ lastGrantMsg }}</span>
        </div>
      </form>
    </section>

    <!-- History -->
    <section class="history-section">
      <div class="section-head">
        <h2 class="section-title">流水记录</h2>
        <p class="section-desc">最近 50 条积分变动</p>
      </div>
      <div v-if="loadingHistory" class="history-loading">加载中...</div>
      <div v-else-if="!history.length" class="history-empty">暂无流水</div>
      <div v-else class="history-list">
        <div v-for="tx in history" :key="tx.id" class="history-row">
          <div class="history-icon" :class="`history-icon-${txDirection(tx)}`">
            <span v-if="tx.amount > 0">+</span>
            <span v-else>−</span>
          </div>
          <div class="history-main">
            <div class="history-title">{{ tx.description || txTypeLabel(tx.type) }}</div>
            <div class="history-sub">
              <span class="history-type">{{ txTypeLabel(tx.type) }}</span>
              <span class="history-time">{{ fmtTime(tx.createdAt) }}</span>
            </div>
          </div>
          <div class="history-amount" :class="`history-amount-${txDirection(tx)}`">
            {{ tx.amount > 0 ? '+' : '' }}{{ tx.amount.toLocaleString() }}
          </div>
          <div class="history-balance">余额 {{ tx.balanceAfter.toLocaleString() }}</div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, onMounted, reactive } from 'vue'
import { toast } from 'vue-sonner'
import { creditsAPI } from '~/composables/useApi'
import { useAuth } from '~/composables/useAuth'

const { isAdmin, setCredits } = useAuth()

const balance = ref(0)
const packages = ref([])
const topups = ref([])
const history = ref([])
const loadingHistory = ref(false)

// Admin form state
const adminUsers = ref([])
const grantForm = reactive({ userId: null, amount: null, description: '' })
const grantLoading = ref(false)
const lastGrantMsg = ref('')

async function loadAll() {
  try {
    const [bal, pkgs] = await Promise.all([creditsAPI.balance(), creditsAPI.packages()])
    balance.value = bal.balance
    packages.value = pkgs.items
    topups.value = pkgs.topups || []
    setCredits(bal.balance)
  } catch (e) {
    toast.error(e.message)
  }
}

async function loadHistory() {
  loadingHistory.value = true
  try {
    const res = await creditsAPI.history({ limit: 50 })
    history.value = res.items
  } catch (e) {
    toast.error(e.message)
  } finally {
    loadingHistory.value = false
  }
}

async function loadAdminUsers() {
  if (!isAdmin.value) return
  try {
    const res = await creditsAPI.listUsers()
    adminUsers.value = res.items
  } catch (e) {
    toast.error(e.message)
  }
}

async function grant() {
  if (!grantForm.userId || !grantForm.amount) return
  grantLoading.value = true
  lastGrantMsg.value = ''
  try {
    const res = await creditsAPI.grant({
      user_id: grantForm.userId,
      amount: grantForm.amount,
      description: grantForm.description || undefined,
    })
    toast.success(`已变更：${grantForm.amount > 0 ? '+' : ''}${grantForm.amount} 积分`)
    lastGrantMsg.value = `操作成功 · 用户当前余额：${res.balance}`
    grantForm.amount = null
    grantForm.description = ''
    await Promise.all([loadAdminUsers(), loadHistory(), loadAll()])
  } catch (e) {
    toast.error(e.message)
  } finally {
    grantLoading.value = false
  }
}

function priceYuan(p) {
  const y = (p.priceCents || 0) / 100
  return Number.isInteger(y) ? String(y) : y.toFixed(2).replace(/\.?0+$/, '')
}
// 估算：1 张图 = 1000 积分；1 个视频 = 5 秒 720P = 15000 积分
function maxImages(p) { return Math.floor((p.credits || 0) / 1000).toLocaleString() }
function maxVideos(p) { return Math.floor((p.credits || 0) / 15000) }
function selectPackage(pkg) {
  if (isAdmin.value) {
    grantForm.amount = pkg.credits + pkg.bonus
    grantForm.description = `开通 ${pkg.name}（¥${priceYuan(pkg)}${pkg.period ? '/' + pkg.period : ''}）`
    toast.info(`已填入：${pkg.name} · 选择目标用户后点击执行`)
  } else {
    toast.info('订阅支付开发中，请联系管理员开通')
  }
}

function txTypeLabel(type) {
  const labels = {
    topup: '充值',
    admin_grant: '管理员发放',
    register_bonus: '注册赠送',
    deduct: '消费',
    refund: '退款',
  }
  return labels[type] || type
}
function txDirection(tx) {
  return tx.amount > 0 ? 'in' : 'out'
}
function fmtTime(s) {
  if (!s) return ''
  const d = new Date(s)
  return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

onMounted(async () => {
  await loadAll()
  await loadHistory()
  await loadAdminUsers()
})
</script>

<style scoped>
.credits-page {
  padding: 28px 48px 60px;
  overflow-y: auto;
  height: 100%;
  animation: fadeUp 0.35s var(--ease-out) both;
  max-width: 1100px;
  margin: 0 auto;
}

.page-head { margin-bottom: 28px; }
.page-title {
  font-family: var(--font-display);
  font-size: 26px; font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--text-0);
  margin-bottom: 4px;
}
.page-desc { font-size: 13px; color: var(--text-3); }

/* Balance Card */
.balance-card {
  position: relative;
  padding: 36px 40px;
  border-radius: 22px;
  background:
    radial-gradient(circle at 20% 30%, rgba(143,239,38,0.22), transparent 50%),
    radial-gradient(circle at 80% 80%, rgba(143,239,38,0.14), transparent 50%),
    linear-gradient(135deg, #131a2f 0%, #0a0e1a 100%);
  border: 1px solid rgba(143,239,38,0.18);
  color: #fff;
  overflow: hidden;
  margin-bottom: 36px;
}
.balance-card-inner { position: relative; z-index: 2; }
.balance-label {
  display: inline-flex; align-items: center; gap: 7px;
  font-family: var(--font-mono);
  font-size: 11.5px;
  letter-spacing: 0.12em;
  color: rgba(255,255,255,0.65);
  margin-bottom: 14px;
}
.balance-label svg { color: #C2F84E; }
.balance-num {
  font-family: var(--font-display);
  font-size: 56px;
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1;
  background: linear-gradient(135deg, #C2F84E 0%, #8FEF26 100%);
  background-clip: text;
  -webkit-background-clip: text;
  color: transparent;
  -webkit-text-fill-color: transparent;
  margin-bottom: 14px;
}
.balance-unit {
  font-size: 18px;
  font-weight: 600;
  color: rgba(255,255,255,0.5);
  -webkit-text-fill-color: rgba(255,255,255,0.5);
  margin-left: 10px;
  letter-spacing: 0.02em;
}
.balance-meta {
  display: flex; align-items: center; gap: 14px;
  font-size: 13px;
  color: rgba(255,255,255,0.6);
}
.balance-meta-item { display: inline-flex; align-items: center; gap: 6px; }
.balance-meta-item b {
  font-family: var(--font-mono);
  color: #C2F84E;
  font-weight: 700;
}
.balance-meta-divider {
  width: 1px; height: 12px;
  background: rgba(255,255,255,0.15);
}
.meta-dot {
  width: 7px; height: 7px;
  border-radius: 50%;
}
.meta-dot-success { background: #C2F84E; box-shadow: 0 0 8px #C2F84E; animation: pulse 2s ease-in-out infinite; }
@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.45} }

.balance-decoration {
  position: absolute; inset: 0;
  pointer-events: none;
  z-index: 1;
}
.balance-glow {
  position: absolute;
  width: 180px; height: 180px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(143,239,38,0.18), transparent 70%);
  filter: blur(40px);
  animation: floatGlow 8s ease-in-out infinite;
}
.balance-glow:nth-child(1) { top: -60px; right: -40px; }
.balance-glow:nth-child(2) { bottom: -80px; left: 40%; }
.balance-glow:nth-child(3) { top: 30%; left: -60px; }
@keyframes floatGlow {
  0%,100% { transform: translate(0,0); }
  50% { transform: translate(20px, -20px); }
}

/* Section heads */
.section-head { margin-bottom: 18px; }
.section-title {
  font-family: var(--font-display);
  font-size: 19px; font-weight: 700;
  color: var(--text-0);
  display: flex; align-items: center; gap: 10px;
  margin-bottom: 4px;
}
.section-desc { font-size: 12.5px; color: var(--text-3); }
.admin-icon-wrap {
  display: inline-flex; align-items: center; justify-content: center;
  width: 22px; height: 22px;
  border-radius: 6px;
  background: var(--accent-bg);
  color: var(--accent-text);
}

/* Packages */
.packages-section { margin-bottom: 36px; }
.package-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  align-items: stretch;
  gap: 16px;
}
.package-card {
  position: relative;
  padding: 24px 22px;
  background: #ffffff;
  border: 1px solid var(--border);
  border-radius: 16px;
  cursor: pointer;
  transition: all 0.22s var(--ease-out);
  box-shadow: var(--shadow-card);
}
.package-card:hover {
  transform: translateY(-3px);
  border-color: rgba(143,239,38,0.5);
  box-shadow: 0 16px 36px rgba(143,239,38,0.16);
}
.package-card.recommended {
  border: 2px solid #8FEF26;
  background:
    radial-gradient(circle at 50% 0%, rgba(143,239,38,0.14), transparent 60%),
    #ffffff;
  box-shadow: 0 18px 44px rgba(143,239,38,0.24);
}
.package-card.recommended .package-btn {
  background: linear-gradient(135deg, #C2F84E, #8FEF26);
  color: #0a0e1a;
  border-color: transparent;
}
.package-badge {
  position: absolute;
  top: -10px;
  right: 16px;
  padding: 3px 10px;
  background: linear-gradient(135deg, #C2F84E, #8FEF26);
  color: #0a0e1a;
  border-radius: 99px;
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.04em;
  box-shadow: 0 4px 10px rgba(143,239,38,0.3);
}
.pkg-credit-box {
  background: var(--bg-2);
  border-radius: 12px;
  padding: 12px 14px;
  margin-bottom: 16px;
}
.pkg-credit-head { display: flex; align-items: baseline; gap: 4px; color: var(--text-0); }
.pkg-credit-head svg { color: #5da817; align-self: center; }
.pkg-credit-num { font-family: var(--font-display); font-size: 20px; font-weight: 800; letter-spacing: -0.01em; }
.pkg-credit-unit { font-size: 12.5px; color: var(--text-1); font-weight: 600; }
.pkg-credit-period { font-size: 11px; color: var(--text-3); font-weight: 500; }
.pkg-credit-sub { font-size: 11.5px; color: var(--text-3); margin-top: 6px; line-height: 1.5; }
.recommended .pkg-credit-box { background: rgba(143,239,38,0.12); }
.pkg-features { list-style: none; padding: 0; margin: 0 0 18px; display: flex; flex-direction: column; gap: 9px; }
.pkg-features li { display: flex; align-items: flex-start; gap: 8px; font-size: 12.5px; color: var(--text-1); line-height: 1.45; }
.pkg-features li svg { flex-shrink: 0; color: #5da817; margin-top: 1px; }
.package-price {
  display: flex; align-items: baseline; gap: 3px;
  font-family: var(--font-display);
  margin-bottom: 10px;
}
.package-price-currency {
  font-size: 20px;
  color: var(--text-1);
  font-weight: 700;
}
.package-price-num {
  font-size: 44px;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--text-0);
  line-height: 1;
}
.package-price-period {
  font-size: 14px;
  color: var(--text-3);
  font-weight: 600;
  margin-left: 2px;
}
.package-btn {
  width: 100%;
  padding: 8px 12px;
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-1);
  cursor: pointer;
  transition: all 0.15s;
}
.package-card:hover .package-btn {
  background: var(--accent);
  color: #0a0e1a;
  border-color: transparent;
}

/* Top-up packs */
.topup-section { margin-bottom: 36px; }
.topup-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
.topup-card { position: relative; padding: 18px 18px 16px; background: #fff; border: 1px solid var(--border); border-radius: 14px; cursor: pointer; transition: all 0.2s var(--ease-out); box-shadow: var(--shadow-card); text-align: center; }
.topup-card:hover { transform: translateY(-2px); border-color: rgba(143,239,38,0.5); box-shadow: 0 12px 28px rgba(143,239,38,0.14); }
.topup-card.recommended { border-color: rgba(143,239,38,0.6); }
.topup-badge { position: absolute; top: -9px; left: 50%; transform: translateX(-50%); padding: 2px 10px; background: linear-gradient(135deg,#C2F84E,#8FEF26); color: #0a0e1a; border-radius: 99px; font-size: 10px; font-weight: 700; white-space: nowrap; }
.topup-credits { font-size: 13px; color: var(--text-2); margin-bottom: 3px; }
.topup-credits-num { font-family: var(--font-display); font-size: 24px; font-weight: 800; color: var(--text-0); }
.topup-meta { font-size: 11px; color: var(--text-3); margin-bottom: 12px; }
.topup-price { display: flex; align-items: baseline; justify-content: center; gap: 2px; margin-bottom: 12px; font-family: var(--font-display); }
.topup-price-cur { font-size: 14px; color: var(--text-2); font-weight: 700; }
.topup-price-num { font-size: 26px; font-weight: 800; color: var(--text-0); }
@media (max-width: 860px) { .topup-grid { grid-template-columns: 1fr; } }

/* Admin */
.admin-section {
  padding: 24px;
  background: #ffffff;
  border: 1px solid var(--border);
  border-radius: 18px;
  margin-bottom: 36px;
  box-shadow: var(--shadow-card);
}
.admin-form { display: flex; flex-direction: column; gap: 14px; }
.admin-form-row { display: flex; gap: 12px; }
.admin-form-row .field { flex: 1; }
.field { display: flex; flex-direction: column; gap: 6px; }
.field-label { font-size: 12px; font-weight: 600; color: var(--text-1); }
.admin-form-actions { display: flex; align-items: center; gap: 12px; padding-top: 4px; }
.admin-form-msg { font-size: 12.5px; color: var(--success); }

/* History */
.history-section {
  padding: 24px;
  background: #ffffff;
  border: 1px solid var(--border);
  border-radius: 18px;
  box-shadow: var(--shadow-card);
}
.history-loading, .history-empty {
  padding: 32px;
  text-align: center;
  color: var(--text-3);
  font-size: 13px;
}
.history-list { display: flex; flex-direction: column; }
.history-row {
  display: grid;
  grid-template-columns: 36px 1fr auto auto;
  align-items: center;
  gap: 14px;
  padding: 12px 0;
  border-bottom: 1px solid var(--border);
}
.history-row:last-child { border-bottom: none; }
.history-icon {
  width: 32px; height: 32px;
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-family: var(--font-display);
  font-size: 16px;
  font-weight: 700;
}
.history-icon-in {
  background: var(--accent-bg);
  color: var(--accent-text);
  border: 1px solid rgba(143,239,38,0.32);
}
.history-icon-out {
  background: var(--error-bg);
  color: var(--error);
  border: 1px solid rgba(210,79,102,0.2);
}
.history-main { min-width: 0; }
.history-title {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text-0);
  margin-bottom: 3px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.history-sub {
  display: flex; align-items: center; gap: 10px;
  font-size: 11.5px;
  color: var(--text-3);
}
.history-type {
  padding: 1px 6px;
  background: var(--bg-2);
  border-radius: 3px;
  font-family: var(--font-mono);
}
.history-amount {
  font-family: var(--font-mono);
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.02em;
}
.history-amount-in { color: var(--accent-text); }
.history-amount-out { color: var(--error); }
.history-balance {
  font-family: var(--font-mono);
  font-size: 11.5px;
  color: var(--text-3);
  white-space: nowrap;
}

@media (max-width: 860px) {
  .package-grid { grid-template-columns: 1fr; }
}
@media (max-width: 720px) {
  .credits-page { padding: 18px 18px 40px; }
  .balance-card { padding: 24px 20px; }
  .balance-num { font-size: 40px; }
  .admin-form-row { flex-direction: column; }
  .admin-form-row .field { max-width: 100% !important; }
  .history-row { grid-template-columns: 30px 1fr auto; }
  .history-balance { grid-column: 2 / 4; font-size: 10.5px; }
}
</style>
