import { useIntervalFn } from '@vueuse/core'

// Owns the backend health-pulse that the sidebar chrome and the compare layout
// both render. Previously each component hand-wired its own `healthy` ref +
// `setInterval(checkHealth, 30000)` — and the compare layout never stored the
// handle, so its poll leaked on unmount. One composable, one poll, auto-cleaned
// on scope dispose via useIntervalFn.
const HEALTH_POLL_MS = 30_000

export function useBackendHealth() {
  const api = useApi()
  // null = not yet probed (callers hide the pulse until the first result).
  const healthy = ref<boolean | null>(null)

  async function check() {
    try {
      await api.health({})
      healthy.value = true
    }
    catch (_err) {
      // Health failures are represented by the returned reactive state.
      healthy.value = false
    }
  }

  useIntervalFn(check, HEALTH_POLL_MS, { immediateCallback: true })

  return { healthy }
}
