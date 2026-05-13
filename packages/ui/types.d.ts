import type { ScanMeta, UnlighthouseRouteReport } from '@unlighthouse/contracts'
import type { UnlighthouseClient } from '@unlighthouse/core/api/client'
import type { ScanSingleton } from './composables/scan'
import type { TransportConnection } from './plugins/transport.client'
import type { UnlighthouseRuntimeConfig } from './plugins/unlighthouse-config.client'

declare module '#app' {
  interface NuxtApp {
    $uconfig: UnlighthouseRuntimeConfig
    $api: UnlighthouseClient
    $transport: TransportConnection
    $scan: ScanSingleton
  }
}

interface UnlighthousePayload {
  options: {
    site: string
    client: { columns: Record<string, any>, groupRoutesKey: string }
    websocketUrl: string
    apiUrl: string
    lighthouseOptions: Record<string, any>
    scanner: { dynamicSampling: boolean, throttle: boolean, device: string }
    routerPrefix: string
  }
  reports: UnlighthouseRouteReport[]
  scanMeta: ScanMeta
}

declare global {
  interface Window {
    __unlighthouse_payload?: UnlighthousePayload
    __unlighthouse_static?: boolean
  }

  const __UNLIGHTHOUSE_VERSION__: string
}

export {}
