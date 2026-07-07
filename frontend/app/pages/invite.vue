<template>
  <div class="invite-page">
    <!-- Hero -->
    <section class="invite-hero">
      <div class="invite-hero-inner">
        <div class="invite-hero-badge">邀请有礼</div>
        <h1 class="invite-hero-title">邀请好友，双方都得积分</h1>
        <p class="invite-hero-desc">
          好友通过你的链接注册成功，你得 <b>{{ (info?.reward_per_invite || 5000).toLocaleString() }}</b> 积分，
          好友额外多得 <b>{{ (info?.invitee_bonus || 1000).toLocaleString() }}</b> 积分
        </p>

        <div class="invite-code-box" :title="'点击复制邀请码'" @click="copyText(info?.code, '邀请码')">
          <span class="invite-code-label">我的专属邀请码</span>
          <span class="invite-code-value">{{ info?.code || '······' }}</span>
          <span class="invite-code-copy">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
            复制
          </span>
        </div>

        <div class="invite-link-row">
          <div class="invite-link-text">{{ shareUrl }}</div>
          <button class="invite-link-btn" @click="copyText(shareUrl, '邀请链接')">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
            </svg>
            复制邀请链接
          </button>
        </div>
      </div>
      <div class="invite-hero-deco">🎁</div>
    </section>

    <!-- Stats -->
    <section class="invite-stats">
      <div class="invite-stat-card">
        <div class="invite-stat-num">{{ info?.invited_count ?? 0 }}</div>
        <div class="invite-stat-label">已成功邀请（人）</div>
      </div>
      <div class="invite-stat-card">
        <div class="invite-stat-num invite-stat-accent">+{{ (info?.reward_total ?? 0).toLocaleString() }}</div>
        <div class="invite-stat-label">累计获得奖励（积分）</div>
      </div>
    </section>

    <!-- How it works -->
    <section class="invite-steps">
      <div class="invite-step">
        <div class="invite-step-num">1</div>
        <div class="invite-step-title">分享链接</div>
        <div class="invite-step-desc">把邀请链接或邀请码发给好友</div>
      </div>
      <div class="invite-step-arrow">→</div>
      <div class="invite-step">
        <div class="invite-step-num">2</div>
        <div class="invite-step-title">好友注册</div>
        <div class="invite-step-desc">好友打开链接注册，邀请码自动填好</div>
      </div>
      <div class="invite-step-arrow">→</div>
      <div class="invite-step">
        <div class="invite-step-num">3</div>
        <div class="invite-step-title">双方到账</div>
        <div class="invite-step-desc">你 +{{ (info?.reward_per_invite || 5000).toLocaleString() }}，好友 +{{ (info?.invitee_bonus || 1000).toLocaleString() }}，立即可用</div>
      </div>
    </section>

    <!-- Invited list -->
    <section v-if="info?.invited?.length" class="invite-list-section">
      <h2 class="invite-list-title">我邀请的好友</h2>
      <div class="invite-list">
        <div v-for="(u, i) in info.invited" :key="i" class="invite-list-row">
          <span class="invite-list-avatar">{{ (u.username || '?')[0].toUpperCase() }}</span>
          <span class="invite-list-name">{{ u.username }}</span>
          <span class="invite-list-time">{{ fmtTime(u.created_at) }}</span>
          <span class="invite-list-reward">+{{ (info.reward_per_invite || 5000).toLocaleString() }}</span>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { toast } from 'vue-sonner'
import { inviteAPI } from '~/composables/useApi'

const info = ref(null)

const shareUrl = computed(() => {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://clawdrama.claw-pi.cn'
  return `${origin}/register?invite=${info.value?.code || ''}`
})

function copyText(text, label) {
  if (!text) return
  navigator.clipboard.writeText(text)
    .then(() => toast.success(`${label}已复制，快去分享吧`))
    .catch(() => toast.error('复制失败，请手动选择复制'))
}

function fmtTime(s) {
  if (!s) return ''
  const d = new Date(s)
  return d.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

onMounted(async () => {
  try {
    info.value = await inviteAPI.my()
  } catch (e) {
    toast.error(e.message || '加载失败')
  }
})
</script>

<style scoped>
.invite-page {
  padding: 28px 48px 60px;
  overflow-y: auto;
  height: 100%;
  max-width: 860px;
  margin: 0 auto;
}

/* Hero */
.invite-hero {
  position: relative;
  border-radius: 18px;
  padding: 34px 38px;
  background:
    radial-gradient(600px 260px at 85% -20%, var(--accent-bg, rgba(143,239,38,0.14)), transparent 70%),
    linear-gradient(135deg, var(--bg-1, #f8fbff), var(--bg-2, #eef3f9));
  border: 1px solid var(--border, #dbe4f0);
  overflow: hidden;
}
.invite-hero-inner { position: relative; z-index: 1; }
.invite-hero-badge {
  display: inline-block;
  font-size: 12px;
  font-weight: 600;
  color: var(--accent-text, #2d5008);
  background: var(--accent-bg, rgba(143,239,38,0.14));
  border: 1px solid var(--accent, #8FEF26);
  border-radius: 999px;
  padding: 3px 12px;
  margin-bottom: 12px;
}
.invite-hero-title {
  font-size: 26px;
  font-weight: 700;
  color: var(--text-0, #182132);
  margin: 0 0 6px;
}
.invite-hero-desc {
  font-size: 14px;
  color: var(--text-2, #60718a);
  margin: 0 0 22px;
}
.invite-hero-desc b { color: var(--accent-dark, #5da817); }
.invite-hero-deco {
  position: absolute;
  right: 34px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 84px;
  opacity: 0.9;
  filter: drop-shadow(0 6px 18px rgba(143,239,38,0.35));
  pointer-events: none;
}

/* Code box */
.invite-code-box {
  display: inline-flex;
  align-items: center;
  gap: 14px;
  padding: 12px 18px;
  border: 1.5px dashed var(--accent-dark, #5da817);
  border-radius: 12px;
  background: var(--bg-0, #fff);
  cursor: pointer;
  transition: box-shadow 0.15s ease;
  margin-bottom: 14px;
}
.invite-code-box:hover { box-shadow: 0 4px 18px rgba(143,239,38,0.25); }
.invite-code-label { font-size: 12px; color: var(--text-3, #8fa0b8); }
.invite-code-value {
  font-size: 26px;
  font-weight: 800;
  letter-spacing: 6px;
  color: var(--text-0, #182132);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.invite-code-copy {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 600;
  color: var(--accent-dark, #5da817);
}

/* Share link row */
.invite-link-row {
  display: flex;
  align-items: stretch;
  gap: 10px;
  max-width: 640px;
}
.invite-link-text {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  padding: 0 14px;
  font-size: 13px;
  color: var(--text-2, #60718a);
  background: var(--bg-0, #fff);
  border: 1px solid var(--border, #dbe4f0);
  border-radius: 10px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.invite-link-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 10px 18px;
  font-size: 13px;
  font-weight: 700;
  color: var(--accent-text, #2d5008);
  background: var(--accent, #8FEF26);
  border: none;
  border-radius: 10px;
  cursor: pointer;
  white-space: nowrap;
  transition: filter 0.15s ease, transform 0.1s ease;
}
.invite-link-btn:hover { filter: brightness(1.05); }
.invite-link-btn:active { transform: scale(0.98); }

/* Stats */
.invite-stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
  margin-top: 16px;
}
.invite-stat-card {
  border: 1px solid var(--border, #dbe4f0);
  background: var(--bg-0, #fff);
  border-radius: 14px;
  padding: 18px 22px;
}
.invite-stat-num {
  font-size: 30px;
  font-weight: 800;
  color: var(--text-0, #182132);
  line-height: 1.2;
}
.invite-stat-accent { color: var(--accent-dark, #5da817); }
.invite-stat-label { font-size: 12px; color: var(--text-3, #8fa0b8); margin-top: 4px; }

/* Steps */
.invite-steps {
  display: flex;
  align-items: stretch;
  gap: 10px;
  margin-top: 16px;
}
.invite-step {
  flex: 1;
  border: 1px solid var(--border, #dbe4f0);
  background: var(--bg-0, #fff);
  border-radius: 14px;
  padding: 16px 18px;
}
.invite-step-num {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--accent-bg, rgba(143,239,38,0.14));
  color: var(--accent-dark, #5da817);
  font-size: 13px;
  font-weight: 800;
  margin-bottom: 8px;
}
.invite-step-title { font-size: 14px; font-weight: 700; color: var(--text-0, #182132); }
.invite-step-desc { font-size: 12px; color: var(--text-2, #60718a); margin-top: 3px; }
.invite-step-arrow {
  display: flex;
  align-items: center;
  color: var(--text-3, #8fa0b8);
  font-size: 16px;
}

/* Invited list */
.invite-list-section { margin-top: 26px; }
.invite-list-title { font-size: 16px; font-weight: 700; color: var(--text-0, #182132); margin: 0 0 10px; }
.invite-list {
  border: 1px solid var(--border, #dbe4f0);
  background: var(--bg-0, #fff);
  border-radius: 14px;
  overflow: hidden;
}
.invite-list-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 11px 18px;
}
.invite-list-row + .invite-list-row { border-top: 1px solid var(--border, #dbe4f0); }
.invite-list-avatar {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--accent-bg, rgba(143,239,38,0.14));
  color: var(--accent-dark, #5da817);
  font-size: 13px;
  font-weight: 800;
}
.invite-list-name { flex: 1; font-size: 13px; font-weight: 600; color: var(--text-1, #2c3850); }
.invite-list-time { font-size: 12px; color: var(--text-3, #8fa0b8); }
.invite-list-reward { font-size: 13px; font-weight: 700; color: var(--accent-dark, #5da817); }

@media (max-width: 720px) {
  .invite-page { padding: 20px 16px 48px; }
  .invite-hero { padding: 24px 20px; }
  .invite-hero-deco { display: none; }
  .invite-steps { flex-direction: column; }
  .invite-step-arrow { display: none; }
  .invite-link-row { flex-direction: column; }
  .invite-code-value { font-size: 20px; letter-spacing: 4px; }
}
</style>
