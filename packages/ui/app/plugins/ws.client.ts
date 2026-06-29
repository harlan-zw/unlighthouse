import type { ScanEventBus, ScanEventHandler, ScanEventName, WsEnvelope } from '~/types/scan-events'

type RawScanEventHandler = (data: unknown) => void

class BrowserWsBus implements ScanEventBus {
  private ws: WebSocket | null = null
  private listeners = new Map<string, Set<RawScanEventHandler>>()
  private url: string
  private retryDelay = 1000
  private maxRetryDelay = 30000
  private disposed = false

  constructor(url: string) {
    this.url = url
    // An empty URL disables the live-event socket entirely (e.g. the Cloudflare
    // deploy, which has no global WS bus — pages fall back to REST polling).
    // Without this the bus would spin forever retrying a bad/localhost URL.
    if (url)
      this.connect()
  }

  private connect() {
    if (this.disposed || !this.url)
      return

    try {
      this.ws = new WebSocket(this.url)

      this.ws.onopen = () => {
        this.retryDelay = 1000
      }

      this.ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data) as WsEnvelope
          const handlers = this.listeners.get(msg.event)
          if (handlers) {
            for (const fn of handlers) fn(msg.data)
          }
          const wildcardHandlers = this.listeners.get('*')
          if (wildcardHandlers) {
            for (const fn of wildcardHandlers) fn(msg)
          }
        }
        catch {}
      }

      this.ws.onclose = () => {
        if (this.disposed)
          return
        setTimeout(() => this.connect(), this.retryDelay)
        this.retryDelay = Math.min(this.retryDelay * 2, this.maxRetryDelay)
      }

      this.ws.onerror = () => {
        this.ws?.close()
      }
    }
    catch {
      setTimeout(() => this.connect(), this.retryDelay)
      this.retryDelay = Math.min(this.retryDelay * 2, this.maxRetryDelay)
    }
  }

  on<K extends ScanEventName>(event: K, fn: ScanEventHandler<K>) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)!.add(fn as RawScanEventHandler)
  }

  off<K extends ScanEventName>(event: K, fn: ScanEventHandler<K>) {
    this.listeners.get(event)?.delete(fn as RawScanEventHandler)
  }

  dispose() {
    this.disposed = true
    this.ws?.close()
    this.listeners.clear()
  }
}

export default defineNuxtPlugin({ name: 'ws', setup() {
  const config = useRuntimeConfig()
  const bus = new BrowserWsBus(config.public.unlighthouseWsUrl as string)

  if (import.meta.client) {
    window.addEventListener('beforeunload', () => bus.dispose())
  }

  return { provide: { ws: bus } }
} })
