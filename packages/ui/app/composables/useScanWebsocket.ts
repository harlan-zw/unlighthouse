// Page-level wrapper around the WebSocket bus owned by the scan
// store. Pages that need to react to live scan events (refresh data
// on scan:complete, etc.) used to reach into $ws directly and wire
// onMounted/onUnmounted by hand:
//
//   const { $ws } = useNuxtApp()
//   const ws = $ws as any
//   onMounted(() => ws.on('scan:complete', refresh))
//   onUnmounted(() => ws.off('scan:complete', refresh))
//
// That pattern leaked into routes.vue and overview.vue and was a
// constant source of "did we remember to off()?" bugs. The
// composable owns the lifecycle: pass an event name + handler,
// subscription auto-disposes on unmount.
//
// Multi-event variant lets a single page subscribe to several scan
// events in one call:
//
//   useScanWebsocket({
//     'scan:complete': refresh,
//     'scan:cancelled': refresh,
//   })

interface WsBus {
  on: (event: string, fn: (data: unknown) => void) => void
  off: (event: string, fn: (data: unknown) => void) => void
}

type ScanEvent =
  | 'scan:created'
  | 'scan:started'
  | 'scan:discovering'
  | 'scan:scanning'
  | 'scan:progress'
  | 'scan:route-complete'
  | 'scan:route-failed'
  | 'scan:paused'
  | 'scan:resumed'
  | 'scan:complete'
  | 'scan:cancelled'
  | 'scan:error'

type Handlers = Partial<Record<ScanEvent, (data: any) => void>>

export function useScanWebsocket(handlers: Handlers) {
  const { $ws } = useNuxtApp()
  const ws = $ws as WsBus
  if (!ws) return

  const entries = Object.entries(handlers) as Array<[ScanEvent, (data: any) => void]>

  onMounted(() => {
    for (const [event, fn] of entries) ws.on(event, fn)
  })
  onUnmounted(() => {
    for (const [event, fn] of entries) ws.off(event, fn)
  })
}
