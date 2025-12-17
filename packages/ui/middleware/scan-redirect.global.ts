export default defineNuxtRouteMiddleware(async (to) => {
  // Skip on server
  if (import.meta.server) return

  // Skip if already navigating to the correct page or if static mode
  if (window.__unlighthouse_static) return

  // Only apply auto-routing on main pages
  if (to.path !== '/' && to.path !== '/scan') return

  // Fetch current scan status
  const apiUrl = window.__unlighthouse_payload?.options?.apiUrl || '/api'
  const status = await $fetch<{ status: string }>(`${apiUrl}/scan/status`).catch(() => null)

  if (!status) return

  const isScanning = ['starting', 'discovering', 'scanning'].includes(status.status)

  // If on results page but scan is in progress, redirect to scan page
  if (to.path === '/' && isScanning) {
    return navigateTo('/scan')
  }

  // If on scan page but scan is complete/idle, redirect to results
  if (to.path === '/scan' && !isScanning && status.status !== 'idle') {
    return navigateTo('/')
  }
})
