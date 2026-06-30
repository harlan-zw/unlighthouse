import type { ScanEventBus, ScanEventHandler, ScanEventName, WsEnvelope } from '~/types/scan-events'
import { logOperationalWarn } from '@unlighthouse/contracts/logging'

type RawScanEventHandler = (data: unknown) => void

function createBrowserWsBus(url: string): ScanEventBus {
  let ws: WebSocket | null = null
  const listeners = new Map<string, Set<RawScanEventHandler>>()
  const reconnectListeners = new Set<() => void>()
  let retryDelay = 1000
  const maxRetryDelay = 30000
  let disposed = false
  // The first `onopen` is the initial connect; every later one followed a drop,
  // so it's a reconnect — and events may have been missed in the gap.
  let connectedOnce = false

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

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data) as WsEnvelope
          const data = msg.data ?? msg.payload
          const handlers = listeners.get(msg.event)
          if (handlers) {
            for (const fn of handlers) fn(data)
          }
          const wildcardHandlers = listeners.get('*')
          if (wildcardHandlers) {
            for (const fn of wildcardHandlers) fn({ ...msg, data })
          }
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
    on<K extends ScanEventName>(event: K, fn: ScanEventHandler<K>) {
      if (!listeners.has(event)) {
        listeners.set(event, new Set())
      }
      listeners.get(event)!.add(fn as RawScanEventHandler)
    },
    off<K extends ScanEventName>(event: K, fn: ScanEventHandler<K>) {
      listeners.get(event)?.delete(fn as RawScanEventHandler)
    },
    onReconnect(fn: () => void) {
      reconnectListeners.add(fn)
      return () => reconnectListeners.delete(fn)
    },
    dispose() {
      disposed = true
      ws?.close()
      listeners.clear()
      reconnectListeners.clear()
    },
  }
}

export default defineNuxtPlugin({ name: 'ws', setup() {
  const config = useRuntimeConfig()
  const bus = createBrowserWsBus(config.public.unlighthouseWsUrl as string)

  window.addEventListener('beforeunload', () => bus.dispose())

  return { provide: { ws: bus } }
} })
