<template>
  <div class="al-page">
    <div class="al-head">
      <div>
        <h1 class="al-title">课程管理 · 学习卡</h1>
        <p class="al-desc">学习卡在抖音/淘宝等平台销售，这里负责批次生成、兑换运营与课程权限</p>
      </div>
    </div>

    <!-- 创建批次 -->
    <section class="al-card">
      <div class="al-card-title">创建兑换码批次</div>
      <div class="al-warning">⚠️ 完整兑换码仅可下载一次，请立即保存并上传到对应销售平台。遗失后只能停用本批次重新生成。</div>
      <form class="al-form" @submit.prevent="createBatch">
        <label class="al-field">
          <span>渠道</span>
          <select v-model="form.channel" class="input" required>
            <option value="douyin">抖音</option>
            <option value="taobao">淘宝</option>
            <option value="influencer">达人</option>
            <option value="reseller">代理商</option>
            <option value="physical">实体卡</option>
            <option value="internal">内部赠送</option>
          </select>
        </label>
        <label class="al-field"><span>平台 SKU / 活动名 *</span><input v-model="form.sku" class="input" required placeholder="如：抖音-学习卡-标准版" /></label>
        <label class="al-field"><span>活动</span><input v-model="form.campaign" class="input" placeholder="可选" /></label>
        <label class="al-field"><span>负责人/合作方</span><input v-model="form.partner_name" class="input" placeholder="可选" /></label>
        <label class="al-field"><span>数量 *</span><input v-model.number="form.quantity" class="input" type="number" min="1" max="5000" required /></label>
        <label class="al-field"><span>每卡积分 *</span><input v-model.number="form.included_credits" class="input" type="number" min="0" required /></label>
        <label class="al-field"><span>有效期至 *</span><input v-model="form.expires_at" class="input" type="date" required /></label>
        <button type="submit" class="btn btn-primary" :disabled="creating">{{ creating ? '生成中…' : '生成并下载 CSV' }}</button>
      </form>
    </section>

    <!-- 批次列表 -->
    <section class="al-card">
      <div class="al-card-title">批次统计</div>
      <div v-if="!batches.length" class="al-empty">还没有批次</div>
      <div v-else class="al-table-wrap">
        <table class="al-table">
          <thead>
            <tr><th>批次号</th><th>渠道</th><th>SKU</th><th class="num">数量</th><th class="num">未使用</th><th class="num">已兑换</th><th class="num">停用</th><th class="num">兑换率</th><th class="num">积分/卡</th><th>有效期</th><th>状态</th><th>操作</th></tr>
          </thead>
          <tbody>
            <tr v-for="b in batches" :key="b.id" :class="{ 'is-off': b.status === 'disabled' }">
              <td class="mono">{{ b.batch_no }}</td>
              <td>{{ channelLabel(b.channel) }}</td>
              <td>{{ b.sku }}</td>
              <td class="num mono">{{ b.total }}</td>
              <td class="num mono">{{ b.unused }}</td>
              <td class="num mono">{{ b.redeemed }}</td>
              <td class="num mono">{{ b.disabled }}</td>
              <td class="num mono">{{ b.redemption_rate }}%</td>
              <td class="num mono">{{ b.included_credits.toLocaleString() }}</td>
              <td class="al-sub">{{ fmtDate(b.expires_at) }}</td>
              <td><span class="al-badge" :class="b.status === 'active' ? 'is-ok' : 'is-banned'">{{ b.status === 'active' ? '启用' : '停用' }}</span></td>
              <td>
                <div class="al-actions">
                  <button class="al-btn" @click="showCodes(b)">明细</button>
                  <button class="al-btn" :class="b.status === 'active' ? 'is-danger' : ''" @click="toggleBatch(b)">{{ b.status === 'active' ? '停用' : '启用' }}</button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- 兑换用户 -->
    <section class="al-card">
      <div class="al-card-title-row">
        <div class="al-card-title">兑换用户与学习进度</div>
        <div style="display:flex;gap:8px">
          <input v-model="enrollQuery" class="input" style="width:220px;height:32px" type="search" placeholder="搜用户名/邮箱/批次号" @keyup.enter="loadEnrollments" />
          <button class="al-btn" @click="manualGrantDialog = true">手动开通</button>
        </div>
      </div>
      <div v-if="!enrollments.length" class="al-empty">暂无兑换记录</div>
      <div v-else class="al-table-wrap">
        <table class="al-table">
          <thead>
            <tr><th>用户</th><th>来源</th><th>兑换时间</th><th class="num">随卡积分</th><th class="num">完成课节</th><th>最近学习</th><th>状态</th><th>操作</th></tr>
          </thead>
          <tbody>
            <tr v-for="e in enrollments" :key="e.id">
              <td>
                <div class="al-name">{{ e.display_name || e.username }}</div>
                <div class="al-sub">@{{ e.username }}{{ e.email ? ` · ${e.email}` : '' }}</div>
              </td>
              <td>
                <span class="al-badge">{{ e.source.batch_no ? channelLabel(e.source.channel) : '手动开通' }}</span>
                <div v-if="e.source.batch_no" class="al-sub mono">{{ e.source.batch_no }}</div>
              </td>
              <td class="al-sub">{{ fmtDate(e.granted_at) }}</td>
              <td class="num mono">{{ e.credits_granted ? e.credits_granted.toLocaleString() : '—' }}</td>
              <td class="num mono">{{ e.completed_lessons }}/8</td>
              <td class="al-sub">{{ e.last_learned_at ? fmtDate(e.last_learned_at) : '—' }}</td>
              <td><span class="al-badge" :class="e.status === 'active' ? 'is-ok' : 'is-banned'">{{ e.status === 'active' ? '已开通' : '已撤销' }}</span></td>
              <td>
                <div class="al-actions">
                  <button v-if="e.status === 'active'" class="al-btn is-danger" @click="revoke(e)">撤销（退款）</button>
                  <button v-else class="al-btn" @click="restore(e)">恢复</button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- 码明细弹窗 -->
    <div v-if="codesDialog.open" class="al-modal-mask" @click.self="codesDialog.open = false">
      <div class="al-modal">
        <div class="al-modal-head">
          <div>
            <div class="al-card-title">{{ codesDialog.batchNo }} 兑换码明细</div>
            <div class="al-sub">完整码只在创建时导出过一次，这里永远只显示掩码</div>
          </div>
          <button class="al-btn" @click="codesDialog.open = false">关闭</button>
        </div>
        <div class="al-table-wrap">
          <table class="al-table">
            <thead><tr><th>兑换码</th><th>状态</th><th>兑换人</th><th>兑换时间</th><th>操作</th></tr></thead>
            <tbody>
              <tr v-for="code in codesDialog.items" :key="code.id">
                <td class="mono">{{ code.masked_code }}</td>
                <td><span class="al-badge" :class="code.status === 'redeemed' ? 'is-ok' : (code.status === 'disabled' ? 'is-banned' : '')">{{ codeStatusLabel(code.status) }}</span></td>
                <td>{{ code.redeemed_by || '—' }}</td>
                <td class="al-sub">{{ code.redeemed_at ? fmtDate(code.redeemed_at) : '—' }}</td>
                <td><button v-if="code.status === 'unused'" class="al-btn is-danger" @click="disableOne(code)">停用</button></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- 手动开通弹窗 -->
    <div v-if="manualGrantDialog" class="al-modal-mask" @click.self="manualGrantDialog = false">
      <div class="al-modal" style="width:460px">
        <div class="al-modal-head">
          <div class="al-card-title">手动开通课程（客服操作）</div>
          <button class="al-btn" @click="manualGrantDialog = false">关闭</button>
        </div>
        <div class="al-form" style="grid-template-columns:1fr">
          <label class="al-field">
            <span>选择用户</span>
            <select v-model="grantForm.userId" class="input">
              <option :value="null">— 选择用户 —</option>
              <option v-for="u in allUsers" :key="u.id" :value="u.id">{{ u.display_name || u.username }} (@{{ u.username }})</option>
            </select>
          </label>
          <label class="al-field">
            <span>补发积分（默认 0，不发）</span>
            <input v-model.number="grantForm.credits" class="input" type="number" min="0" placeholder="0" />
          </label>
          <button class="btn btn-primary" :disabled="!grantForm.userId" @click="manualGrant">确认开通</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { toast } from 'vue-sonner'
import { adminAPI } from '~/composables/useApi'
import { useAuth } from '~/composables/useAuth'

const { isAdmin } = useAuth()

const batches = ref([])
const enrollments = ref([])
const enrollQuery = ref('')
const creating = ref(false)
const allUsers = ref([])
const manualGrantDialog = ref(false)
const grantForm = reactive({ userId: null, credits: 0 })
const codesDialog = reactive({ open: false, batchNo: '', batchId: 0, items: [] })

const form = reactive({
  channel: 'douyin', sku: '', campaign: '', partner_name: '',
  quantity: 100, included_credits: 30000, expires_at: '',
})

function channelLabel(ch) {
  return ({ douyin: '抖音', taobao: '淘宝', influencer: '达人', reseller: '代理商', physical: '实体卡', internal: '内部', manual: '手动' })[ch] || ch
}
function codeStatusLabel(s) {
  return ({ unused: '未使用', redeemed: '已兑换', disabled: '已停用' })[s] || s
}
function fmtDate(s) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

async function loadBatches() {
  try { batches.value = (await adminAPI.learningBatches()).items || [] } catch (e) { toast.error(e.message) }
}
async function loadEnrollments() {
  try { enrollments.value = (await adminAPI.learningEnrollments(enrollQuery.value)).items || [] } catch (e) { toast.error(e.message) }
}

async function createBatch() {
  if (creating.value) return
  if (!window.confirm(`确认生成 ${form.quantity} 张「${channelLabel(form.channel)}」渠道学习卡？\n\n完整兑换码仅可下载一次，请立即保存并上传到对应销售平台。`)) return
  creating.value = true
  try {
    const { blob, filename } = await adminAPI.learningCreateBatch({
      course_id: 'aigc-short-drama-v1',
      channel: form.channel,
      sku: form.sku,
      campaign: form.campaign || undefined,
      partner_name: form.partner_name || undefined,
      quantity: form.quantity,
      included_credits: form.included_credits,
      expires_at: new Date(`${form.expires_at}T23:59:59`).toISOString(),
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
    toast.success('批次已生成，CSV 已开始下载——这是唯一一次完整码导出，请立即妥善保存')
    form.sku = ''
    await loadBatches()
  } catch (e) {
    toast.error(e.message)
  } finally {
    creating.value = false
  }
}

async function toggleBatch(b) {
  const target = b.status === 'active' ? 'disabled' : 'active'
  if (target === 'disabled' && !window.confirm(`确认停用批次 ${b.batch_no}？未使用的码将全部无法兑换。`)) return
  try {
    await adminAPI.learningSetBatchStatus(b.id, target)
    toast.success(target === 'disabled' ? '批次已停用' : '批次已启用')
    await loadBatches()
  } catch (e) { toast.error(e.message) }
}

async function showCodes(b) {
  codesDialog.batchNo = b.batch_no
  codesDialog.batchId = b.id
  codesDialog.items = []
  codesDialog.open = true
  try { codesDialog.items = (await adminAPI.learningBatchCodes(b.id)).items || [] } catch (e) { toast.error(e.message) }
}

async function disableOne(code) {
  if (!window.confirm(`确认停用兑换码 ${code.masked_code}？`)) return
  try {
    await adminAPI.learningDisableCode(code.id)
    toast.success('已停用')
    await Promise.all([showCodes({ batch_no: codesDialog.batchNo, id: codesDialog.batchId }), loadBatches()])
  } catch (e) { toast.error(e.message) }
}

async function revoke(e) {
  if (!window.confirm(`确认撤销「${e.display_name || e.username}」的课程权限（退款处理）？\n原兑换码保持已使用状态，不可再次销售。`)) return
  try {
    await adminAPI.learningRevoke(e.user_id, e.course_id)
    toast.success('已撤销')
    await loadEnrollments()
  } catch (err) { toast.error(err.message) }
}

async function restore(e) {
  if (!window.confirm(`确认恢复「${e.display_name || e.username}」的课程权限？`)) return
  try {
    await adminAPI.learningRestore(e.user_id, e.course_id)
    toast.success('已恢复')
    await loadEnrollments()
  } catch (err) { toast.error(err.message) }
}

async function manualGrant() {
  const credits = Number(grantForm.credits) || 0
  const confirmText = credits > 0
    ? `确认为该用户手动开通课程并补发 ${credits.toLocaleString()} 积分？`
    : '确认为该用户手动开通课程（不发积分）？'
  if (!window.confirm(confirmText)) return
  try {
    await adminAPI.learningGrant(grantForm.userId, { course_id: 'aigc-short-drama-v1', credits: credits > 0 ? credits : undefined })
    toast.success('已开通')
    manualGrantDialog.value = false
    grantForm.userId = null
    grantForm.credits = 0
    await loadEnrollments()
  } catch (e) { toast.error(e.message) }
}

onMounted(async () => {
  if (!isAdmin.value) { navigateTo('/projects'); return }
  const d = new Date(Date.now() + 180 * 86400_000)
  form.expires_at = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  await Promise.all([loadBatches(), loadEnrollments()])
  try { allUsers.value = (await adminAPI.users()).items || [] } catch {}
})
</script>

<style scoped>
.al-page { padding: 28px 48px 60px; overflow-y: auto; height: 100%; }
.al-head { margin-bottom: 18px; }
.al-title { font-size: 22px; font-weight: 700; color: var(--text-0, #182132); margin: 0 0 4px; }
.al-desc { font-size: 13px; color: var(--text-2, #60718a); margin: 0; }

.al-card {
  border: 1px solid var(--border, #dbe4f0); background: var(--bg-0, #fff);
  border-radius: 14px; padding: 16px 18px; margin-bottom: 16px;
}
.al-card-title { font-size: 15px; font-weight: 700; color: var(--text-0, #182132); margin-bottom: 10px; }
.al-card-title-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 10px; flex-wrap: wrap; }
.al-warning {
  font-size: 12px; color: #9a6700; background: rgba(255,191,0,0.12);
  border: 1px solid rgba(255,191,0,0.4); border-radius: 9px; padding: 8px 12px; margin-bottom: 12px;
}
.al-empty { padding: 24px 0; text-align: center; color: var(--text-3, #8fa0b8); font-size: 13px; }

.al-form { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; align-items: end; }
.al-field { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--text-2, #60718a); }
.al-field .input { height: 34px; }

.al-table-wrap { overflow-x: auto; }
.al-table { width: 100%; border-collapse: collapse; font-size: 13px; min-width: 860px; }
.al-table th { text-align: left; font-weight: 600; font-size: 11px; color: var(--text-3, #8fa0b8); padding: 8px 10px; border-bottom: 1px solid var(--border, #dbe4f0); white-space: nowrap; }
.al-table td { padding: 8px 10px; border-bottom: 1px solid var(--border, #dbe4f0); vertical-align: middle; white-space: nowrap; }
.al-table tr:last-child td { border-bottom: none; }
.al-table tr.is-off td { opacity: 0.55; }
.al-table .num { text-align: right; }
.mono { font-variant-numeric: tabular-nums; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }

.al-name { font-weight: 600; color: var(--text-0, #182132); }
.al-sub { font-size: 11px; color: var(--text-3, #8fa0b8); }
.al-badge { display: inline-block; font-size: 11px; font-weight: 600; padding: 2px 9px; border-radius: 999px; background: var(--bg-2, #eef3f9); color: var(--text-2, #60718a); }
.al-badge.is-ok { background: rgba(48,164,108,0.12); color: #30a46c; }
.al-badge.is-banned { background: rgba(229,72,77,0.12); color: #e5484d; }

.al-actions { display: flex; gap: 5px; flex-wrap: wrap; }
.al-btn {
  font-size: 11px; padding: 3px 9px; border-radius: 7px; cursor: pointer;
  border: 1px solid var(--border, #dbe4f0); background: var(--bg-0, #fff); color: var(--text-1, #2c3850);
}
.al-btn:hover { border-color: var(--accent, #8FEF26); background: var(--accent-bg, rgba(143,239,38,0.14)); }
.al-btn.is-danger { color: #e5484d; }
.al-btn.is-danger:hover { border-color: #e5484d; background: rgba(229,72,77,0.08); }

.al-modal-mask { position: fixed; inset: 0; z-index: 60; background: rgba(18,26,42,0.45); display: flex; align-items: center; justify-content: center; padding: 24px; }
.al-modal { width: 720px; max-width: 100%; max-height: 80vh; overflow-y: auto; background: var(--bg-0, #fff); border-radius: 16px; padding: 18px 20px; box-shadow: 0 24px 60px rgba(18,26,42,0.25); }
.al-modal-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 12px; }

@media (max-width: 900px) {
  .al-page { padding: 20px 14px 48px; }
  .al-form { grid-template-columns: 1fr 1fr; }
}
</style>
