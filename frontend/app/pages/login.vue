<template>
  <div class="auth-shell">
    <div class="auth-bg-glow auth-bg-glow-1"></div>
    <div class="auth-bg-glow auth-bg-glow-2"></div>
    <div class="auth-bg-grid"></div>

    <div class="auth-card">
      <NuxtLink to="/" class="auth-brand">
        <img :src="logo" alt="ClawDrama" class="auth-logo" />
        <div>
          <div class="auth-brand-name">爪爪短剧</div>
          <div class="auth-brand-sub">ClawDrama</div>
        </div>
      </NuxtLink>

      <h1 class="auth-title">{{ mode === 'login' ? '欢迎回来' : '创建账号' }}</h1>
      <p class="auth-desc">
        {{ mode === 'login' ? '登录后开始你的 AI 短剧创作' : (status?.has_users ? '注册新账号加入 ClawDrama' : '你是首位用户，将自动成为管理员') }}
      </p>

      <form class="auth-form" @submit.prevent="submit">
        <label class="auth-field">
          <span class="auth-label">用户名</span>
          <input v-model="form.username" class="auth-input" type="text" autocomplete="username" required autofocus />
        </label>

        <label v-if="mode === 'register'" class="auth-field">
          <span class="auth-label">显示名 <span class="auth-label-hint">可选</span></span>
          <input v-model="form.display_name" class="auth-input" type="text" placeholder="如：导演 · 张三" />
        </label>

        <label class="auth-field">
          <span class="auth-label">密码 <span v-if="mode === 'register'" class="auth-label-hint">至少 6 位</span></span>
          <input v-model="form.password" class="auth-input" type="password" autocomplete="current-password" required />
        </label>

        <div v-if="errorMsg" class="auth-error">{{ errorMsg }}</div>

        <button type="submit" class="auth-submit" :disabled="loading">
          <span v-if="!loading">{{ mode === 'login' ? '登录' : '创建账号' }}</span>
          <span v-else class="auth-spinner"></span>
          <svg v-if="!loading" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round">
            <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
          </svg>
        </button>

        <div class="auth-switch">
          <span v-if="mode === 'login'">
            还没有账号？
            <NuxtLink to="/register" class="auth-link">立即注册 →</NuxtLink>
          </span>
          <span v-else>
            已有账号？
            <NuxtLink to="/login" class="auth-link">直接登录 →</NuxtLink>
          </span>
        </div>
      </form>

      <div class="auth-footer">
        <NuxtLink to="/" class="auth-back">← 返回首页</NuxtLink>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { authAPI } from '~/composables/useApi'
import { useAuth } from '~/composables/useAuth'
import logo from '~/assets/claw-logo.svg'

definePageMeta({ layout: false })

const route = useRoute()
const router = useRouter()
const { setSession } = useAuth()

const mode = computed(() => (route.path === '/register' ? 'register' : 'login'))
const status = ref(null)
const loading = ref(false)
const errorMsg = ref('')
const form = reactive({ username: '', password: '', display_name: '' })

onMounted(async () => {
  try { status.value = await authAPI.status() } catch {}
})

async function submit() {
  errorMsg.value = ''
  loading.value = true
  try {
    // Strip whitespace from inputs — browser autofill / copy-paste often adds
    // leading/trailing spaces, especially in password fields.
    const payload = {
      username: form.username.trim(),
      password: form.password.trim(),
      display_name: form.display_name?.trim() || undefined,
    }
    const fn = mode.value === 'login' ? authAPI.login : authAPI.register
    const res = await fn(payload)
    setSession(res.token, res.user)
    const redirect = (route.query.redirect && typeof route.query.redirect === 'string') ? route.query.redirect : '/projects'
    await router.push(redirect)
  } catch (e) {
    errorMsg.value = e.message || '操作失败'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.auth-shell {
  min-height: 100vh;
  position: relative;
  display: flex; align-items: center; justify-content: center;
  padding: 32px 20px;
  background:
    radial-gradient(ellipse 80% 50% at 50% 0%, rgba(143,239,38,0.08), transparent 60%),
    linear-gradient(180deg, #ffffff 0%, #f6f8fb 50%, #fafbfc 100%);
  overflow: hidden;
}

.auth-bg-glow {
  position: absolute;
  border-radius: 50%;
  filter: blur(100px);
  pointer-events: none;
  animation: floatGlow 14s ease-in-out infinite;
}
.auth-bg-glow-1 {
  width: 480px; height: 480px;
  top: -160px; left: -120px;
  background: radial-gradient(circle, #C2F84E 0%, transparent 70%);
  opacity: 0.18;
}
.auth-bg-glow-2 {
  width: 540px; height: 540px;
  bottom: -200px; right: -140px;
  background: radial-gradient(circle, #8FEF26 0%, transparent 70%);
  animation-delay: -7s;
  opacity: 0.14;
}
@keyframes floatGlow {
  0%, 100% { transform: translate(0, 0); }
  50% { transform: translate(20px, -30px); }
}

.auth-bg-grid {
  position: absolute; inset: 0;
  background-image:
    linear-gradient(rgba(50,74,114,0.04) 1px, transparent 1px),
    linear-gradient(90deg, rgba(50,74,114,0.04) 1px, transparent 1px);
  background-size: 48px 48px;
  mask-image: radial-gradient(ellipse 70% 50% at 50% 50%, black 20%, transparent 80%);
  -webkit-mask-image: radial-gradient(ellipse 70% 50% at 50% 50%, black 20%, transparent 80%);
  pointer-events: none;
}

.auth-card {
  position: relative;
  z-index: 2;
  width: 100%;
  max-width: 440px;
  padding: 40px 36px 32px;
  background: rgba(255,255,255,0.9);
  border: 1px solid rgba(255,255,255,0.5);
  border-radius: 24px;
  backdrop-filter: blur(24px);
  box-shadow:
    0 32px 80px rgba(50,74,114,0.18),
    0 8px 24px rgba(50,74,114,0.1),
    inset 0 1px 0 rgba(255,255,255,1);
  animation: cardEnter 0.5s cubic-bezier(0.16, 1, 0.3, 1) both;
}
@keyframes cardEnter {
  from { opacity: 0; transform: translateY(20px) scale(0.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

.auth-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 28px;
  text-decoration: none;
  transition: opacity 0.2s;
}
.auth-brand:hover { opacity: 0.85; }
.auth-logo {
  width: 50px; height: 34px;
  object-fit: contain;
  padding: 5px 7px;
  background: linear-gradient(160deg, #1c2436 0%, #0a0e1a 100%);
  border-radius: 10px;
  border: 1px solid rgba(255,255,255,0.06);
  box-shadow: 0 6px 16px rgba(143,239,38,0.22), inset 0 1px 0 rgba(255,255,255,0.08);
}
.auth-brand-name {
  font-family: 'Noto Serif SC', serif;
  font-size: 15px;
  font-weight: 700;
  color: #182132;
  letter-spacing: -0.01em;
}
.auth-brand-sub {
  font-size: 11px;
  color: #8fa0b8;
  margin-top: 2px;
  letter-spacing: 0.03em;
}

.auth-title {
  font-family: 'Noto Serif SC', serif;
  font-size: 28px;
  font-weight: 700;
  color: #182132;
  letter-spacing: -0.02em;
  margin-bottom: 8px;
}
.auth-desc {
  font-size: 13.5px;
  line-height: 1.6;
  color: #60718a;
  margin-bottom: 28px;
}

.auth-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.auth-field { display: flex; flex-direction: column; gap: 7px; }
.auth-label {
  font-size: 12px;
  font-weight: 600;
  color: #2c3850;
  letter-spacing: 0.02em;
  display: flex; align-items: center; gap: 6px;
}
.auth-label-hint {
  font-weight: 400;
  font-size: 11px;
  color: #8fa0b8;
}
.auth-input {
  width: 100%;
  padding: 12px 14px;
  font-size: 14px;
  color: #182132;
  background: #ffffff;
  border: 1px solid #dbe4f0;
  border-radius: 10px;
  outline: none;
  transition: all 0.2s;
  font-family: inherit;
}
.auth-input::placeholder { color: #b0bcc9; }
.auth-input:hover { border-color: #bcc9d9; }
.auth-input:focus {
  border-color: #8FEF26;
  box-shadow: 0 0 0 3px rgba(143,239,38,0.18);
  background: #ffffff;
}

.auth-error {
  font-size: 12.5px;
  color: #b94257;
  background: rgba(210,79,102,0.08);
  border: 1px solid rgba(210,79,102,0.18);
  border-radius: 8px;
  padding: 9px 12px;
}

.auth-submit {
  display: flex; align-items: center; justify-content: center;
  gap: 8px;
  padding: 13px 20px;
  font-size: 14.5px;
  font-weight: 700;
  font-family: inherit;
  border: none;
  border-radius: 10px;
  background: linear-gradient(135deg, #C2F84E 0%, #8FEF26 100%);
  color: #0a0e1a;
  cursor: pointer;
  transition: all 0.25s;
  box-shadow:
    0 8px 24px rgba(143,239,38,0.3),
    inset 0 1px 0 rgba(255,255,255,0.3);
  margin-top: 6px;
}
.auth-submit:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow:
    0 12px 28px rgba(143,239,38,0.45),
    inset 0 1px 0 rgba(255,255,255,0.4);
  filter: brightness(1.05);
}
.auth-submit:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.auth-spinner {
  width: 16px; height: 16px;
  border: 2px solid rgba(10,14,26,0.3);
  border-top-color: #0a0e1a;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.auth-switch {
  text-align: center;
  margin-top: 8px;
  font-size: 13px;
  color: #60718a;
}
.auth-link {
  color: #5da817;
  text-decoration: none;
  font-weight: 700;
  transition: opacity 0.15s;
}
.auth-link:hover { opacity: 0.75; }

.auth-footer {
  margin-top: 24px;
  padding-top: 20px;
  border-top: 1px solid #e8eef8;
  text-align: center;
}
.auth-back {
  font-size: 12.5px;
  color: #8fa0b8;
  text-decoration: none;
  transition: color 0.15s;
}
.auth-back:hover { color: #2c3850; }
</style>
