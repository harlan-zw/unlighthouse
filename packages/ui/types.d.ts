import type { ScanMeta, UnlighthouseRouteReport } from '@unlighthouse/core'

interface UnlighthousePayload {
  options: {
    site: string
    client: { columns: Record<string, any>; groupRoutesKey: string }
    websocketUrl: string
    apiUrl: string
    lighthouseOptions: Record<string, any>
    scanner: { dynamicSampling: boolean; throttle: boolean; device: string }
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
