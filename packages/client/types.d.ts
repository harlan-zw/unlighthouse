import type { ClientOptionsPayload, ScanMeta } from '@unlighthouse/core'
import type { UnlighthouseRouteReport } from '@unlighthouse/core'

declare global {
  interface Window {
    /**
     * Are we running the app in a demo / offline mode.
     */
    __unlighthouse_static?: boolean
    /**
     * Data provided for offline / demo mode.
     */
    __unlighthouse_payload: { options: ClientOptionsPayload; scanMeta: ScanMeta; reports: UnlighthouseRouteReport[] }
  }
}
