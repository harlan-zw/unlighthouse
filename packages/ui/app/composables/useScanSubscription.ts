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
// Refetch the queries that hold persisted scan data. Prefix match hits every
// active scanId's query.
function invalidateScanReads(): void {
  invalidateNuxtQueries('scan.summary')
  invalidateNuxtQueries('scan.results')
  invalidateNuxtQueries('scan.meta')
}

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
      // A socket reconnect means we may have missed events during the gap —
      // tell the bridge to run `onReconnect` and recover.
      const offReconnect = ws.onReconnect(() => ctx.resync())
      return () => {
        ws.off('*', handler)
        offReconnect()
      }
    },
    onMessage: (envelope) => {
      // A scan finishing (or being cancelled) makes its persisted results
      // available — refetch summary, per-route results, and meta (which now
      // carries the summary).
      if (envelope?.event === 'scan:complete' || envelope?.event === 'scan:cancelled' || envelope?.event === 'scan:error')
        invalidateScanReads()
    },
    // After a socket drop, conservatively refetch — a `scan:complete` that
    // fired while we were disconnected would otherwise be lost.
    onReconnect: invalidateScanReads,
  })
}
