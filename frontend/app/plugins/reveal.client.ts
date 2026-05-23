/**
 * v-reveal directive — fade + translateY when element enters viewport
 *
 * Usage:
 *   <div v-reveal>...</div>
 *   <div v-reveal="{ delay: 100 }">...</div>  (delay in ms)
 */
export default defineNuxtPlugin((nuxtApp) => {
  const observer = typeof IntersectionObserver !== 'undefined'
    ? new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              const el = entry.target as HTMLElement
              const delay = Number(el.dataset.revealDelay || 0)
              setTimeout(() => el.classList.add('is-revealed'), delay)
              observer!.unobserve(el)
            }
          })
        },
        { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
      )
    : null

  nuxtApp.vueApp.directive('reveal', {
    mounted(el: HTMLElement, binding) {
      el.classList.add('reveal-init')
      if (binding.value?.delay) el.dataset.revealDelay = String(binding.value.delay)
      observer?.observe(el)
    },
    unmounted(el: HTMLElement) {
      observer?.unobserve(el)
    },
  })
})
