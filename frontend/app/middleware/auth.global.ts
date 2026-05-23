import { getAuthToken } from '~/composables/useAuth'

const PUBLIC_PATHS = ['/', '/login', '/register']

export default defineNuxtRouteMiddleware((to) => {
  // SSR is disabled, so this only runs in client — but guard anyway
  if (import.meta.server) return

  // Public landing + auth pages: never gated
  if (PUBLIC_PATHS.includes(to.path)) return

  const token = getAuthToken()
  if (!token) {
    const redirect = encodeURIComponent(to.fullPath)
    return navigateTo(`/login?redirect=${redirect}`)
  }
})
