import { getAuthToken } from '~/composables/useAuth'

const PUBLIC_PATHS = ['/', '/login', '/register']
const ADMIN_PATHS = ['/settings']

export default defineNuxtRouteMiddleware((to) => {
  if (import.meta.server) return

  // Public landing + auth pages: never gated
  if (PUBLIC_PATHS.includes(to.path)) return

  const token = getAuthToken()
  if (!token) {
    const redirect = encodeURIComponent(to.fullPath)
    return navigateTo(`/login?redirect=${redirect}`)
  }

  // Admin-only routes
  if (ADMIN_PATHS.some(p => to.path === p || to.path.startsWith(p + '/'))) {
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem('clawdrama_user')
        const user = raw ? JSON.parse(raw) : null
        if (user?.role !== 'admin') {
          return navigateTo('/projects')
        }
      } catch {
        return navigateTo('/login')
      }
    }
  }
})
