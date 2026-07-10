<template>
  <div class="au-page">
    <div class="au-head">
      <div>
        <h1 class="au-title">用户管理</h1>
        <p class="au-desc">共 {{ users.length }} 个账号 · 管理角色、积分、账号状态</p>
      </div>
      <input v-model="query" class="au-search" type="search" placeholder="搜索用户名 / 显示名 / 邮箱" />
    </div>

    <div v-if="loading" class="au-empty">加载中...</div>
    <div v-else-if="!filtered.length" class="au-empty">没有匹配的用户</div>
    <div v-else class="au-table-wrap">
      <table class="au-table">
        <thead>
          <tr>
            <th>用户</th>
            <th>角色</th>
            <th class="num">积分</th>
            <th class="num">图片</th>
            <th class="num">视频</th>
            <th class="num">充值</th>
            <th class="num">邀请</th>
            <th>来源码</th>
            <th>注册时间</th>
            <th>状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="u in filtered" :key="u.id" :class="{ 'is-disabled': u.disabled }">
            <td>
              <div class="au-user au-user-clickable" title="查看该用户的短剧作品" @click="openDramas(u)">
                <span class="au-avatar">{{ (u.display_name || u.username || '?')[0].toUpperCase() }}</span>
                <div>
                  <div class="au-name">{{ u.display_name || u.username }}</div>
                  <div class="au-sub">@{{ u.username }}{{ u.email ? ` · ${u.email}` : '' }}</div>
                </div>
              </div>
            </td>
            <td>
              <span class="au-badge" :class="u.role === 'admin' ? 'is-admin' : ''">{{ u.role === 'admin' ? '管理员' : '用户' }}</span>
            </td>
            <td class="num mono">{{ u.credits.toLocaleString() }}</td>
            <td class="num mono">{{ u.image_count }}</td>
            <td class="num mono">{{ u.video_count }}</td>
            <td class="num mono">{{ u.paid_cents ? `¥${(u.paid_cents / 100).toFixed(0)}` : '—' }}</td>
            <td class="num mono">{{ u.invited_count || '—' }}</td>
            <td class="mono au-sub">{{ u.invite_code || '—' }}</td>
            <td class="au-sub">{{ fmtTime(u.created_at) }}</td>
            <td>
              <span v-if="u.disabled" class="au-badge is-banned">已禁用</span>
              <span v-else class="au-badge is-ok">正常</span>
            </td>
            <td>
              <div class="au-actions">
                <button class="au-btn" title="调整积分（正数加负数扣）" @click="grantCredits(u)">积分±</button>
                <button v-if="u.id !== myId" class="au-btn" @click="toggleRole(u)">{{ u.role === 'admin' ? '撤管理员' : '设管理员' }}</button>
                <button v-if="u.id !== myId" class="au-btn" :class="u.disabled ? '' : 'is-danger'" @click="toggleStatus(u)">{{ u.disabled ? '启用' : '禁用' }}</button>
                <button class="au-btn" @click="resetPassword(u)">重置密码</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 用户作品弹窗 -->
    <div v-if="dramaDialog.open" class="au-modal-mask" @click.self="dramaDialog.open = false">
      <div class="au-modal">
        <div class="au-modal-head">
          <div>
            <div class="au-modal-title">{{ dramaDialog.userName }} 的短剧</div>
            <div class="au-sub">{{ dramaDialog.loading ? '加载中...' : `共 ${dramaDialog.items.length} 部 · 点击可进入项目` }}</div>
          </div>
          <button class="au-btn" @click="dramaDialog.open = false">关闭</button>
        </div>
        <div v-if="dramaDialog.loading" class="au-empty">加载中...</div>
        <div v-else-if="!dramaDialog.items.length" class="au-empty">该用户还没有创建短剧</div>
        <div v-else class="au-drama-list">
          <NuxtLink v-for="d in dramaDialog.items" :key="d.id" :to="`/drama/${d.id}`" class="au-drama-row">
            <div class="au-drama-main">
              <div class="au-drama-title">{{ d.title }}</div>
              <div class="au-sub">{{ styleLabel(d.style) }}{{ d.style ? ' · ' : '' }}创建于 {{ fmtTime(d.created_at) }} · 更新于 {{ fmtTime(d.updated_at) }}</div>
            </div>
            <div class="au-drama-stats">
              <span class="au-badge">{{ d.episode_count }} 集</span>
              <span class="au-badge">{{ d.video_count }} 条成片镜头</span>
            </div>
          </NuxtLink>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { toast } from 'vue-sonner'
import { adminAPI, creditsAPI } from '~/composables/useApi'
import { useAuth } from '~/composables/useAuth'
import { styleLabel } from '~/composables/useStyleLabels'

const { user: me, isAdmin } = useAuth()
const myId = computed(() => me.value?.id)

const users = ref([])
const loading = ref(true)
const query = ref('')

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return users.value
  return users.value.filter(u =>
    String(u.username || '').toLowerCase().includes(q)
    || String(u.display_name || '').toLowerCase().includes(q)
    || String(u.email || '').toLowerCase().includes(q))
})

async function load() {
  loading.value = true
  try {
    const res = await adminAPI.users()
    users.value = res.items || []
  } catch (e) {
    toast.error(e.message)
  } finally {
    loading.value = false
  }
}

const dramaDialog = ref({ open: false, userName: '', loading: false, items: [] })

async function openDramas(u) {
  dramaDialog.value = { open: true, userName: u.display_name || u.username, loading: true, items: [] }
  try {
    const res = await adminAPI.userDramas(u.id)
    dramaDialog.value.items = res.items || []
  } catch (e) {
    toast.error(e.message)
  } finally {
    dramaDialog.value.loading = false
  }
}

async function grantCredits(u) {
  const raw = window.prompt(`给「${u.display_name || u.username}」调整积分（正数加、负数扣）\n当前余额：${u.credits.toLocaleString()}`, '')
  if (raw === null) return
  const amount = Number(raw)
  if (!Number.isFinite(amount) || !amount) { toast.error('请输入非零数字'); return }
  try {
    const res = await creditsAPI.grant({ user_id: u.id, amount, description: '管理员在用户管理调整' })
    toast.success(`已变更：${amount > 0 ? '+' : ''}${amount}，余额 ${res.balance.toLocaleString()}`)
    await load()
  } catch (e) {
    toast.error(e.message)
  }
}

async function toggleRole(u) {
  const target = u.role === 'admin' ? 'user' : 'admin'
  if (!window.confirm(`确认把「${u.display_name || u.username}」${target === 'admin' ? '设为管理员' : '撤销管理员'}？`)) return
  try {
    await adminAPI.setRole(u.id, target)
    toast.success('角色已更新，即时生效')
    await load()
  } catch (e) {
    toast.error(e.message)
  }
}

async function toggleStatus(u) {
  const disable = !u.disabled
  if (!window.confirm(disable
    ? `确认禁用「${u.display_name || u.username}」？该账号将立即无法访问（含已登录的会话）。`
    : `确认恢复「${u.display_name || u.username}」的访问？`)) return
  try {
    await adminAPI.setStatus(u.id, disable)
    toast.success(disable ? '已禁用，即时生效' : '已启用')
    await load()
  } catch (e) {
    toast.error(e.message)
  }
}

async function resetPassword(u) {
  if (!window.confirm(`确认重置「${u.display_name || u.username}」的密码？旧密码将立即失效。`)) return
  try {
    const res = await adminAPI.resetPassword(u.id)
    try { await navigator.clipboard.writeText(res.temp_password) } catch {}
    window.alert(`临时密码（已复制到剪贴板，请立即转交用户）：\n\n${res.temp_password}`)
  } catch (e) {
    toast.error(e.message)
  }
}

function fmtTime(s) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

onMounted(async () => {
  if (!isAdmin.value) { toast.error('需要管理员权限'); navigateTo('/projects'); return }
  await load()
})
</script>

<style scoped>
.au-page { padding: 28px 48px 60px; overflow-y: auto; height: 100%; }
.au-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; margin-bottom: 18px; flex-wrap: wrap; }
.au-title { font-size: 22px; font-weight: 700; color: var(--text-0, #182132); margin: 0 0 4px; }
.au-desc { font-size: 13px; color: var(--text-2, #60718a); margin: 0; }
.au-search {
  width: 280px; max-width: 100%; height: 34px; padding: 0 12px;
  border: 1px solid var(--border, #dbe4f0); border-radius: 10px;
  background: var(--bg-0, #fff); font-size: 13px; color: var(--text-1, #2c3850);
}
.au-search:focus { outline: none; border-color: var(--accent, #8FEF26); }
.au-empty { padding: 48px 0; text-align: center; color: var(--text-3, #8fa0b8); font-size: 13px; }

.au-table-wrap {
  border: 1px solid var(--border, #dbe4f0); border-radius: 14px;
  background: var(--bg-0, #fff); overflow-x: auto;
}
.au-table { width: 100%; border-collapse: collapse; font-size: 13px; min-width: 980px; }
.au-table th {
  text-align: left; font-weight: 600; font-size: 11px; color: var(--text-3, #8fa0b8);
  padding: 10px 12px; border-bottom: 1px solid var(--border, #dbe4f0); white-space: nowrap;
}
.au-table td { padding: 9px 12px; border-bottom: 1px solid var(--border, #dbe4f0); vertical-align: middle; white-space: nowrap; }
.au-table tr:last-child td { border-bottom: none; }
.au-table tr.is-disabled td { opacity: 0.55; }
.au-table .num { text-align: right; }
.mono { font-variant-numeric: tabular-nums; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }

.au-user { display: flex; align-items: center; gap: 9px; }
.au-user-clickable { cursor: pointer; border-radius: 8px; margin: -3px -6px; padding: 3px 6px; transition: background 0.15s; }
.au-user-clickable:hover { background: var(--accent-bg, rgba(143,239,38,0.14)); }
.au-user-clickable:hover .au-name { color: var(--accent-dark, #5da817); }

.au-modal-mask {
  position: fixed; inset: 0; z-index: 60;
  background: rgba(18, 26, 42, 0.45);
  display: flex; align-items: center; justify-content: center; padding: 24px;
}
.au-modal {
  width: 640px; max-width: 100%; max-height: 80vh; overflow-y: auto;
  background: var(--bg-0, #fff); border-radius: 16px; padding: 18px 20px;
  box-shadow: 0 24px 60px rgba(18, 26, 42, 0.25);
}
.au-modal-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
.au-modal-title { font-size: 16px; font-weight: 700; color: var(--text-0, #182132); }
.au-drama-list { display: flex; flex-direction: column; gap: 8px; }
.au-drama-row {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 11px 14px; border: 1px solid var(--border, #dbe4f0); border-radius: 12px;
  text-decoration: none; transition: border-color 0.15s, background 0.15s;
}
.au-drama-row:hover { border-color: var(--accent, #8FEF26); background: var(--accent-bg, rgba(143,239,38,0.14)); }
.au-drama-main { min-width: 0; }
.au-drama-title { font-size: 14px; font-weight: 600; color: var(--text-0, #182132); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.au-drama-stats { display: flex; gap: 6px; flex-shrink: 0; }
.au-avatar {
  width: 28px; height: 28px; flex-shrink: 0; display: flex; align-items: center; justify-content: center;
  border-radius: 50%; background: var(--accent-bg, rgba(143,239,38,0.14));
  color: var(--accent-dark, #5da817); font-size: 13px; font-weight: 800;
}
.au-name { font-weight: 600; color: var(--text-0, #182132); }
.au-sub { font-size: 11px; color: var(--text-3, #8fa0b8); }

.au-badge {
  display: inline-block; font-size: 11px; font-weight: 600; padding: 2px 9px;
  border-radius: 999px; background: var(--bg-2, #eef3f9); color: var(--text-2, #60718a);
}
.au-badge.is-admin { background: var(--accent-bg, rgba(143,239,38,0.14)); color: var(--accent-dark, #5da817); }
.au-badge.is-ok { background: rgba(48,164,108,0.12); color: #30a46c; }
.au-badge.is-banned { background: rgba(229,72,77,0.12); color: #e5484d; }

.au-actions { display: flex; gap: 5px; flex-wrap: wrap; }
.au-btn {
  font-size: 11px; padding: 3px 9px; border-radius: 7px; cursor: pointer;
  border: 1px solid var(--border, #dbe4f0); background: var(--bg-0, #fff); color: var(--text-1, #2c3850);
  transition: border-color 0.15s, background 0.15s;
}
.au-btn:hover { border-color: var(--accent, #8FEF26); background: var(--accent-bg, rgba(143,239,38,0.14)); }
.au-btn.is-danger { color: #e5484d; }
.au-btn.is-danger:hover { border-color: #e5484d; background: rgba(229,72,77,0.08); }

@media (max-width: 720px) {
  .au-page { padding: 20px 14px 48px; }
}
</style>
