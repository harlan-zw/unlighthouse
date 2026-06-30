// Sends a brand-new install (no sites AND no scans) to /onboarding.
// Applied only to `/` via definePageMeta — keeping it off the global
// middleware chain so it never fires on deep links into the scan tree.
export default defineNuxtRouteMiddleware(async () => {
  // SPA only (ssr: false); skip the server pass entirely.
  if (import.meta.server)
    return

  const api = useApi()
  try {
    const [sites, history] = await Promise.all([
      api['sites.list']({}),
      api['history.list']({ page: 1, pageSize: 1 }),
    ])
    if (sites.sites.length === 0 && history.total === 0)
      return navigateTo('/onboarding')
  }
  catch (_err) {
    // Backend unreachable — let `/` render and surface its own error state
    // rather than bouncing to onboarding on a transient failure.
  }
})
