import type { ResolvedUserConfig, RuntimeSettings } from '@unlighthouse/core'
import type { UnlighthouseRouteReport } from '@unlighthouse/core'

declare global {
  interface Window {
    /**
     * Lighthouse client runtime settings and resolved configurations.
     */
    __unlighthouse_options: ResolvedUserConfig & RuntimeSettings
    /**
     * Are we running the app in a demo / offline mode.
     */
    __unlighthouse_static?: boolean
    /**
     * Data provided for offline / demo mode.
     */
    __unlighthouse_data?: { scanMeta: ScanMeta; reports: UnlighthouseRouteReport[] }
  }
}
