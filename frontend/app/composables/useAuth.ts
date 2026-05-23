import { ref, computed, readonly } from 'vue'

export type AuthUser = {
  id: number
  username: string
  display_name: string | null
  email: string | null
  role: string
  credits?: number
}

const TOKEN_KEY = 'clawdrama_token'
const USER_KEY = 'clawdrama_user'

const tokenState = ref<string | null>(null)
const userState = ref<AuthUser | null>(null)
let initialized = false

function loadFromStorage() {
  if (typeof window === 'undefined') return
  if (initialized) return
  initialized = true
  try {
    tokenState.value = localStorage.getItem(TOKEN_KEY)
    const raw = localStorage.getItem(USER_KEY)
    userState.value = raw ? JSON.parse(raw) : null
  } catch {
    tokenState.value = null
    userState.value = null
  }
}

export function useAuth() {
  loadFromStorage()

  function setSession(token: string, user: AuthUser) {
    tokenState.value = token
    userState.value = user
    if (typeof window !== 'undefined') {
      localStorage.setItem(TOKEN_KEY, token)
      localStorage.setItem(USER_KEY, JSON.stringify(user))
    }
  }

  function clearSession() {
    tokenState.value = null
    userState.value = null
    if (typeof window !== 'undefined') {
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem(USER_KEY)
    }
  }

  function setCredits(credits: number) {
    if (!userState.value) return
    userState.value = { ...userState.value, credits }
    if (typeof window !== 'undefined') {
      localStorage.setItem(USER_KEY, JSON.stringify(userState.value))
    }
  }

  function logout() {
    clearSession()
    if (typeof window !== 'undefined') {
      window.location.href = '/login'
    }
  }

  return {
    token: readonly(tokenState),
    user: readonly(userState),
    isAuthenticated: computed(() => !!tokenState.value),
    isAdmin: computed(() => userState.value?.role === 'admin'),
    credits: computed(() => userState.value?.credits ?? 0),
    setSession,
    clearSession,
    setCredits,
    logout,
  }
}

export function getAuthToken(): string | null {
  loadFromStorage()
  return tokenState.value
}

export function clearAuthOnUnauthorized() {
  tokenState.value = null
  userState.value = null
  if (typeof window !== 'undefined') {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
  }
}
