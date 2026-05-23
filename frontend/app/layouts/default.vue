<template>
  <div class="shell">
    <!-- Header -->
    <header class="header">
      <div class="header-left">
        <button class="brand" @click="navigateTo('/')">
          <div class="brand-mark">
            <img v-if="showBrandImage" :src="brandLogo" alt="爪爪短剧" class="brand-logo" @error="showBrandImage = false" />
            <span v-else class="brand-fallback">C</span>
          </div>
          <div class="brand-text">
            <span class="brand-name">爪爪短剧</span>
            <span class="brand-sub">ClawDrama</span>
          </div>
        </button>
      </div>

      <nav class="header-nav">
        <NuxtLink to="/" class="nav-link" :class="{ active: route.path === '/' }">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 12l9-9 9 9"/><path d="M5 10v10h14V10"/>
          </svg>
          <span>首页</span>
        </NuxtLink>
        <NuxtLink to="/projects" class="nav-link" :class="{ active: route.path.startsWith('/projects') }">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
            <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
          </svg>
          <span>项目</span>
        </NuxtLink>
        <NuxtLink to="/settings" class="nav-link" :class="{ active: route.path === '/settings' }">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
          <span>设置</span>
        </NuxtLink>
      </nav>

      <div class="header-right">
        <NuxtLink v-if="isAuthenticated && user" to="/credits" class="credits-chip" title="我的积分">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 6v12M8 10h6a2 2 0 0 1 0 4H8M8 14h8"/>
          </svg>
          <span class="credits-num">{{ credits.toLocaleString() }}</span>
        </NuxtLink>
        <div v-if="isAuthenticated && user" class="user-menu" :class="{ open: userMenuOpen }" @click.stop>
          <button class="user-btn" @click="userMenuOpen = !userMenuOpen">
            <span class="user-avatar">{{ avatarLetter }}</span>
            <span class="user-name">{{ user.display_name || user.username }}</span>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" :class="{ flip: userMenuOpen }">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>
          <div v-if="userMenuOpen" class="user-dropdown">
            <div class="user-dropdown-head">
              <div class="user-dropdown-name">{{ user.display_name || user.username }}</div>
              <div class="user-dropdown-role">@{{ user.username }} · {{ user.role }}</div>
              <div class="user-dropdown-credits">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M8 10h6a2 2 0 0 1 0 4H8M8 14h8"/></svg>
                <span>{{ credits.toLocaleString() }} 积分</span>
              </div>
            </div>
            <NuxtLink to="/credits" class="user-dropdown-item" @click="userMenuOpen = false">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/><path d="M12 6v12M8 10h6a2 2 0 0 1 0 4H8M8 14h8"/>
              </svg>
              充值中心
            </NuxtLink>
            <button class="user-dropdown-item user-dropdown-item-danger" @click="doLogout">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
              退出登录
            </button>
          </div>
        </div>
        <NuxtLink v-else to="/login" class="header-login">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/>
          </svg>
          登录
        </NuxtLink>
      </div>
    </header>

    <main class="content">
      <slot />
    </main>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import brandLogo from '~/assets/claw-logo.svg'
import { useAuth } from '~/composables/useAuth'

const route = useRoute()
const showBrandImage = ref(true)
const { user, isAuthenticated, credits, logout, setCredits } = useAuth()
const userMenuOpen = ref(false)

// Refresh credits when navigating to authenticated pages (catch admin grants etc.)
async function refreshCredits() {
  if (!isAuthenticated.value) return
  try {
    const { creditsAPI } = await import('~/composables/useApi')
    const res = await creditsAPI.balance()
    setCredits(res.balance)
  } catch {}
}
onMounted(refreshCredits)
watch(() => route.path, refreshCredits)


const avatarLetter = computed(() => {
  const name = user.value?.display_name || user.value?.username || ''
  return name.trim().charAt(0).toUpperCase() || 'C'
})

function doLogout() {
  userMenuOpen.value = false
  logout()
}

function onDocClick() { userMenuOpen.value = false }
onMounted(() => document.addEventListener('click', onDocClick))
onBeforeUnmount(() => document.removeEventListener('click', onDocClick))
</script>

<style scoped>
.shell {
  display: flex; flex-direction: column;
  height: 100vh; overflow: hidden;
  background: var(--bg-base);
}
.shell-dark {
  background: #0a0e1a;
}

/* === Header === */
.header {
  display: flex; align-items: center;
  height: 64px; flex-shrink: 0;
  padding: 0 24px;
  background: var(--bg-1);
  border-bottom: 1px solid var(--border);
  gap: 28px;
}
/* Dark variant — applied only on landing route */
.header-dark {
  background: rgba(10,14,26,0.75);
  backdrop-filter: blur(16px);
  border-bottom-color: rgba(255,255,255,0.06);
}
.header-dark .brand-name { color: #fff; }
.header-dark .brand-sub { color: rgba(255,255,255,0.45); }
.header-dark .nav-link { color: rgba(255,255,255,0.65); border-color: transparent; }
.header-dark .nav-link:hover {
  background: rgba(255,255,255,0.06);
  color: #fff;
  border-color: rgba(255,255,255,0.08);
}
.header-dark .nav-link.active {
  background: rgba(143,239,38,0.12);
  color: #C2F84E;
  border-color: rgba(143,239,38,0.3);
}
.header-dark .user-btn {
  background: rgba(255,255,255,0.05);
  border-color: rgba(255,255,255,0.1);
}
.header-dark .user-btn:hover { border-color: rgba(255,255,255,0.18); }
.header-dark .user-name { color: #fff; }
.header-dark .user-btn svg { color: rgba(255,255,255,0.5); }

.header-left { display: flex; align-items: center; }

.brand {
  display: flex; align-items: center; gap: 10px;
  background: none; border: none; cursor: pointer; padding: 0;
  text-decoration: none; border-radius: var(--radius);
  transition: opacity 0.15s;
}
.brand:hover { opacity: 0.7; }
.brand-mark {
  position: relative;
  display: flex; align-items: center; justify-content: center;
  width: 40px; height: 40px;
  border-radius: 10px;
  background:
    radial-gradient(circle at 30% 20%, rgba(194,248,78,0.06), transparent 60%),
    linear-gradient(160deg, #1c2436 0%, #0a0e1a 70%, #050810 100%);
  flex-shrink: 0;
  box-shadow:
    0 1px 0 rgba(255,255,255,0.05) inset,
    0 0 0 0.5px rgba(255,255,255,0.04),
    0 2px 4px rgba(10,14,26,0.3),
    0 6px 16px rgba(10,14,26,0.18);
  transition: box-shadow 0.3s var(--ease-out), transform 0.25s var(--ease-out);
}
.brand-mark::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: linear-gradient(180deg, rgba(255,255,255,0.04) 0%, transparent 40%);
  pointer-events: none;
}
.brand:hover .brand-mark {
  box-shadow:
    0 1px 0 rgba(255,255,255,0.08) inset,
    0 0 0 0.5px rgba(255,255,255,0.06),
    0 2px 4px rgba(10,14,26,0.35),
    0 10px 22px rgba(143,239,38,0.18),
    0 6px 14px rgba(10,14,26,0.2);
  transform: translateY(-1px);
}
.brand-logo {
  position: relative;
  width: 28px;
  height: 19px;
  object-fit: contain;
  display: block;
  filter: drop-shadow(0 1px 2px rgba(143,239,38,0.25));
  z-index: 1;
}
.brand-fallback {
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 700;
  color: #C2F84E;
  line-height: 1;
}
.brand-text { display: flex; flex-direction: column; align-items: flex-start; line-height: 1; gap: 3px; }
.brand-name {
  font-family: var(--font-display);
  font-size: 16px; font-weight: 700;
  color: var(--text-0);
  letter-spacing: -0.01em;
}
.brand-sub {
  font-size: 10.5px; font-weight: 400;
  color: var(--text-3);
  letter-spacing: 0.03em;
  font-family: var(--font-body);
}

/* Nav */
.header-nav { display: flex; gap: 4px; flex: 1; }
.nav-link {
  display: flex; align-items: center; gap: 7px;
  padding: 7px 14px; border-radius: var(--radius);
  font-size: 13px; font-weight: 500;
  color: var(--text-2); text-decoration: none;
  transition: all 0.18s var(--ease-out);
  border: 1px solid transparent;
}
.nav-link:hover {
  background: var(--bg-hover); color: var(--text-0);
  border-color: var(--border);
}
.nav-link.active {
  background: var(--accent-bg);
  color: var(--accent-text);
  border-color: rgba(76,125,255,0.18);
  font-weight: 600;
}

.header-right { display: flex; align-items: center; margin-left: auto; }

/* Credits chip */
.credits-chip {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 6px 12px;
  margin-right: 10px;
  background: linear-gradient(135deg, rgba(143,239,38,0.18), rgba(143,239,38,0.1));
  border: 1px solid rgba(143,239,38,0.32);
  border-radius: 99px;
  color: var(--accent-text);
  font-family: var(--font-mono);
  font-size: 12.5px;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-decoration: none;
  transition: all 0.18s var(--ease-out);
}
.credits-chip:hover {
  border-color: rgba(143,239,38,0.55);
  box-shadow: 0 4px 12px rgba(143,239,38,0.2);
  transform: translateY(-1px);
}
.credits-chip svg { opacity: 0.85; }
.credits-num { line-height: 1; }

/* User dropdown extras */
.user-dropdown-credits {
  display: inline-flex; align-items: center; gap: 6px;
  margin-top: 8px;
  padding: 4px 10px;
  background: var(--accent-bg);
  border: 1px solid rgba(143,239,38,0.28);
  border-radius: 99px;
  font-family: var(--font-mono);
  font-size: 11.5px;
  font-weight: 700;
  color: var(--accent-text);
}

/* User menu */
.user-menu { position: relative; }
.user-btn {
  display: flex; align-items: center; gap: 8px;
  padding: 5px 10px 5px 5px;
  background: var(--bg-0);
  border: 1px solid var(--border);
  border-radius: 99px;
  cursor: pointer;
  transition: all 0.18s var(--ease-out);
  font-family: var(--font-body);
}
.user-btn:hover { border-color: var(--border-strong); box-shadow: var(--shadow-sm); }
.user-menu.open .user-btn { border-color: #8FEF26; box-shadow: 0 0 0 3px rgba(143,239,38,0.12); }
.user-avatar {
  width: 26px; height: 26px;
  display: flex; align-items: center; justify-content: center;
  background: linear-gradient(135deg, #C2F84E, #8FEF26);
  color: #0a0e1a;
  border-radius: 50%;
  font-size: 12px;
  font-weight: 700;
  font-family: var(--font-display);
}
.user-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-0);
  max-width: 120px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.user-btn svg { color: var(--text-3); transition: transform 0.2s; }
.user-btn svg.flip { transform: rotate(180deg); }

.user-dropdown {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  min-width: 220px;
  background: var(--bg-0);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: 0 18px 40px rgba(50,74,114,0.16), 0 6px 16px rgba(50,74,114,0.1);
  padding: 6px;
  z-index: 200;
  animation: dropIn 0.16s var(--ease-out);
}
@keyframes dropIn {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}
.user-dropdown-head {
  padding: 10px 12px 12px;
  border-bottom: 1px solid var(--border);
  margin-bottom: 6px;
}
.user-dropdown-name {
  font-family: var(--font-display);
  font-size: 14px;
  font-weight: 700;
  color: var(--text-0);
}
.user-dropdown-role {
  font-size: 11.5px;
  color: var(--text-3);
  font-family: var(--font-mono);
  margin-top: 3px;
}
.user-dropdown-item {
  display: flex; align-items: center; gap: 9px;
  width: 100%;
  padding: 8px 12px;
  background: none;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  font-family: inherit;
  color: var(--text-1);
  cursor: pointer;
  text-align: left;
  transition: background 0.15s;
}
.user-dropdown-item:hover { background: var(--bg-hover); }
.user-dropdown-item-danger { color: var(--error); }
.user-dropdown-item-danger:hover { background: var(--error-bg); }

/* Login button (logged-out state) */
.header-login {
  display: inline-flex; align-items: center; gap: 7px;
  padding: 8px 16px;
  background: linear-gradient(135deg, #C2F84E, #8FEF26);
  color: #0a0e1a;
  font-size: 13px;
  font-weight: 700;
  border-radius: 99px;
  text-decoration: none;
  box-shadow: 0 4px 14px rgba(143,239,38,0.3), inset 0 1px 0 rgba(255,255,255,0.3);
  transition: all 0.2s;
}
.header-login:hover {
  transform: translateY(-1px);
  box-shadow: 0 8px 20px rgba(143,239,38,0.45), inset 0 1px 0 rgba(255,255,255,0.4);
  filter: brightness(1.05);
}

/* Content */
.content { flex: 1; overflow: hidden; display: flex; flex-direction: column; }
</style>
