import type { WsEnvelope } from '~/types/scan-events'

// Bridges the live scan WebSocket bus (`$ws`, owned by the ws.client plugin)
// into the query cache via nuxt-use-query's `useNuxtSubscription`. On a
// terminal scan event it invalidates the read queries that hold scan data, so
// every mounted `useApiQuery` for them refetches — replacing the per-page
// `useScanWebsocket({ 'scan:complete': refreshX })` manual-refresh wiring.
//
// Connection ownership stays with `$ws` (reconnect/backoff already live there);
// this standardises only the message -> data-freshness wiring, which is exactly
// the seam `useNuxtSubscription` covers. Mounted once in the scan layout, so it
// auto-disposes (and unhooks the `*` listener) when leaving the scan views.
//
// Gap (inherited, not introduced): events missed while the socket is down
// aren't replayed — `$ws` doesn't expose a reconnect signal to drive
// `ctx.resync()`, so `onReconnect` is omitted. `useApiQuery`'s refetch-on-mount
// / refetch-on-focus covers cold recovery.
export function useScanSubscription() {
  const nuxtApp = useNuxtApp()

  return useNuxtSubscription<WsEnvelope>({
    enabled: () => !!nuxtApp.$ws,
    source: (ctx) => {
      const ws = nuxtApp.$ws
      if (!ws)
        return
      const handler = (msg: WsEnvelope) => ctx.push(msg)
      ws.on('*', handler)
      return () => ws.off('*', handler)
    },
    onMessage: (envelope) => {
      // A scan finishing (or being cancelled) makes its persisted results
      // available — refetch summary, per-route results, and meta (which now
      // carries the summary). Prefix match hits every active scanId's query.
      if (envelope?.event === 'scan:complete' || envelope?.event === 'scan:cancelled') {
        invalidateNuxtQueries('scan.summary')
        invalidateNuxtQueries('scan.results')
        invalidateNuxtQueries('scan.meta')
      }
    },
  })
}
