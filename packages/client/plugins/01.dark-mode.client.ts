/**
 * Dark mode initialization plugin
 * Runs before the Vue app mounts to set dark mode based on user preference
 */
export default defineNuxtPlugin(() => {
  if (import.meta.client) {
    const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches
    const setting = localStorage.getItem('color-schema') || 'auto'
    if (setting === 'dark' || (prefersDark && setting !== 'light')) {
      document.documentElement.classList.add('dark')
    }
  }
})
