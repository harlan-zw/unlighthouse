import type { RouterConfig } from '@nuxt/schema'

// https://router.vuejs.org/api/#routeroptions
export default <RouterConfig>{
  scrollBehavior(to, from, savedPosition) {
    const nuxtApp = useNuxtApp()

    // If history back
    if (savedPosition) {
      // Handle Suspense resolution
      return new Promise((resolve) => {
        nuxtApp.hooks.hookOnce('page:finish', () => {
          setTimeout(() => resolve(savedPosition), 50)
        })
      })
    }
    // Scroll to heading on click
    if (to.hash) {
      setTimeout(() => {
        const heading = document.querySelector(to.hash) as any

        return window.scrollTo({
          top: heading.offsetTop,
          behavior: 'smooth',
        })
      })
      return
    }

    // route change
    if (from.path !== to.path) {
      window.scrollTo({
        top: 0,
        behavior: 'smooth',
      })
      return
    }

    return { top: 0 }
  },
}
