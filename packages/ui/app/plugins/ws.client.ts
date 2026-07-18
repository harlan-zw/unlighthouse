import type { HookName, HookPayload } from '@unlighthouse/contracts/hooks'
import type { ScanEventBus, ScanEventHookMap } from '~/types/scan-events'
import { parseHookEvent } from '@unlighthouse/contracts/hooks'
import { logOperationalWarn } from '@unlighthouse/contracts/logging'
import { createHooks } from 'hookable'

function createBrowserWsBus(url: string): ScanEventBus {
  let ws: WebSocket | null = null
  const hooks = createHooks<ScanEventHookMap>()
  const reconnectListeners = new Set<() => void>()
  let retryDelay = 1000
  const maxRetryDelay = 30000
  let disposed = false
  // The first `onopen` is the initial connect; every later one followed a drop,
  // so it's a reconnect — and events may have been missed in the gap.
  let connectedOnce = false
  type CallHook = <K extends HookName>(event: K, payload: HookPayload<K>) => Promise<unknown> | void
  // Hookable's Parameters<InferCallback<...>> loses the correlation when a
  // validated discriminated HookEvent union is dispatched dynamically.
  const callHook = hooks.callHook.bind(hooks) as CallHook

  function connect() {
    if (disposed || !url)
      return

    try {
      ws = new WebSocket(url)

      ws.onopen = () => {
        retryDelay = 1000
        if (connectedOnce) {
          for (const fn of reconnectListeners) fn()
        }
        else {
          connectedOnce = true
        }
      }

      ws.onmessage = async (e) => {
        try {
          if (typeof e.data !== 'string')
            throw new TypeError('Expected a text WebSocket frame.')
          const raw: unknown = JSON.parse(e.data)
          const msg = parseHookEvent(raw)
          await callHook(msg.event, msg.payload)
          await hooks.callHook('*', msg)
        }
        catch (err) {
          logOperationalWarn('ui.websocket_message_failed', err, undefined, console)
        }
      }

      ws.onclose = () => {
        if (disposed)
          return
        setTimeout(connect, retryDelay)
        retryDelay = Math.min(retryDelay * 2, maxRetryDelay)
      }

      ws.onerror = () => {
        ws?.close()
      }
    }
    catch (err) {
      logOperationalWarn('ui.websocket_connect_failed', err, undefined, console)
      setTimeout(connect, retryDelay)
      retryDelay = Math.min(retryDelay * 2, maxRetryDelay)
    }
  }

  // An empty URL disables the live-event socket entirely (e.g. the Cloudflare
  // deploy, which has no global WS bus — pages fall back to REST polling).
  // Without this the bus would spin forever retrying a bad/localhost URL.
  if (url)
    connect()

  return {
    on: hooks.hook.bind(hooks),
    off: hooks.removeHook.bind(hooks),
    onReconnect(fn: () => void) {
      reconnectListeners.add(fn)
      return () => reconnectListeners.delete(fn)
    },
    dispose() {
      disposed = true
      ws?.close()
      hooks.removeAllHooks()
      reconnectListeners.clear()
    },
  }
}

export default defineNuxtPlugin({ name: 'ws', setup() {
  const bus = createBrowserWsBus(getRuntimeWebsocketUrl())

  window.addEventListener('beforeunload', () => bus.dispose())

  return { provide: { ws: bus } }
} })
