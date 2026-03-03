export default defineNuxtRouteMiddleware(async (to) => {
  // Skip on server
  if (import.meta.server)
    return

  // Skip if static mode
  if (window.__unlighthouse_static)
    return

  // Allow all /results/[scanId] routes - they have their own scanId
  if (to.path.startsWith('/results/') && to.params.scanId)
    return

  // Allow history, onboarding, and home pages
  if (to.path === '/' || to.path === '/history' || to.path === '/onboarding')
    return
})
