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

import type { ScanEventPayloads, ScanLifecycleEventName } from '~/types/scan-events'

type Handler<K extends ScanLifecycleEventName> =
  | (() => void | Promise<void>)
  | ((data: ScanEventPayloads[K]) => void | Promise<void>)

type Handlers = Partial<{
  [K in ScanLifecycleEventName]: Handler<K>
}>

export function useScanWebsocket(handlers: Handlers) {
  const ws = useNuxtApp().$ws
  if (!ws)
    return

  const subscriptions = Object.entries(handlers).map(([event, fn]) => ({
    event: event as ScanLifecycleEventName,
    listener: ((data) => { void fn?.(data as never) }) as (data: ScanEventPayloads[ScanLifecycleEventName]) => void,
  }))

  onMounted(() => {
    for (const { event, listener } of subscriptions) ws.on(event, listener)
  })
  onUnmounted(() => {
    for (const { event, listener } of subscriptions) ws.off(event, listener)
  })
}
