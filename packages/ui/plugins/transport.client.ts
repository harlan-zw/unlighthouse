import type { UnlighthouseRuntimeConfig } from './unlighthouse-config.client'

export interface TransportConnection {
  connect: () => Promise<void>
  disconnect: () => void
  isOpen: () => boolean
}

const MAX_RECONNECT = 5

export default defineNuxtPlugin({
  name: 'unlighthouse-transport',
  dependsOn: ['unlighthouse-config'],
  setup(nuxtApp) {
    const config = nuxtApp.$uconfig as UnlighthouseRuntimeConfig

    let ws: WebSocket | null = null
    let reconnectAttempts = 0
    let manualDisconnect = false

    function open(): Promise<void> {
      return new Promise((resolve, reject) => {
        if (ws?.readyState === WebSocket.OPEN) {
          resolve()
          return
        }

        const url = config.websocketUrl.value
        if (!url) {
          reject(new Error('No WebSocket URL configured'))
          return
        }

        manualDisconnect = false
        ws = new WebSocket(url)

        ws.onopen = () => {
          reconnectAttempts = 0
          nuxtApp.callHook('transport:open' as any)
          resolve()
        }

        ws.onmessage = (event) => {
          const data = JSON.parse(event.data)
          if (data.event)
            nuxtApp.callHook(`transport:${data.event}` as any, data.payload ?? data.data)
        }

        ws.onclose = () => {
          nuxtApp.callHook('transport:close' as any)
          ws = null
          if (manualDisconnect)
            return
          if (reconnectAttempts < MAX_RECONNECT) {
            reconnectAttempts++
            setTimeout(() => { open().catch(() => {}) }, 1000 * reconnectAttempts)
          }
        }

        ws.onerror = () => {
          nuxtApp.callHook('transport:error' as any)
          reject(new Error('WebSocket connection failed'))
        }
      })
    }

    function close() {
      manualDisconnect = true
      if (ws) {
        ws.close()
        ws = null
      }
    }

    const transport: TransportConnection = {
      connect: open,
      disconnect: close,
      isOpen: () => ws?.readyState === WebSocket.OPEN,
    }

    return {
      provide: { transport },
    }
  },
})
