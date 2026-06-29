interface WsEvent {
  event: string
  data: any
}

type WsListener = (data: any) => void

class WsBus {
  private ws: WebSocket | null = null
  private listeners = new Map<string, Set<WsListener>>()
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
          const msg: WsEvent = JSON.parse(e.data)
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

  on(event: string, fn: WsListener) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)!.add(fn)
  }

  off(event: string, fn: WsListener) {
    this.listeners.get(event)?.delete(fn)
  }

  dispose() {
    this.disposed = true
    this.ws?.close()
    this.listeners.clear()
  }
}

export default defineNuxtPlugin({ name: 'ws', setup() {
  const config = useRuntimeConfig()
  const bus = new WsBus(config.public.unlighthouseWsUrl as string)

  if (import.meta.client) {
    window.addEventListener('beforeunload', () => bus.dispose())
  }

  return { provide: { ws: bus } }
} })
