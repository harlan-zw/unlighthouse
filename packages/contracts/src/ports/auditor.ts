// Concrete Page comes from puppeteer-core in auditors/local; ports stay puppeteer-free.
// LighthouseReport re-uses the type from contracts/types so adapters and the port agree.
import type { Category, Device } from '../types/atoms'
import type { LighthouseReport } from '../types/index'

export type { Category, Device, LighthouseReport }

export interface Page {
  url: () => string
}

export interface AuditorCapabilities {
  /** false for remote-CDP: network RTT contaminates LCP/TBT/SI. */
  reliablePerfScores: boolean
  /** true for CrUX (real field data); false for lab. */
  reliableFieldData: boolean
  /** false for fetch-based adapters (PSI, CrUX, dataforseo). */
  supportsThrottling: boolean
  categories: Category[]
}

export interface AuditOpts {
  signal?: AbortSignal
  /**
   * D-029: device form-factor for this audit. Adapters that run Lighthouse
   * pass it through as the emulation profile (`mobile` → moto-g4 + 4G,
   * `desktop` → 1366×768 + wired). Fetch-based aggregators ignore it; the
   * scan still records which device the URL was queried under.
   *
   * Defaults to `'mobile'` when omitted, matching Lighthouse's own default.
   */
  device?: Device
  /**
   * Lighthouse config passthrough for adapters that run Lighthouse (local, cdp-connect,
   * remote-lighthouse). Ignored by fetch-based aggregators (psi, crux, dataforseo).
   * Shape matches Lighthouse's `Config` type; kept loose here so contracts stays
   * lighthouse-free.
   */
  lighthouseConfig?: Record<string, unknown>
}

export interface Auditor {
  audit: (url: string, page?: Page, opts?: AuditOpts) => Promise<LighthouseReport>
  // Read at construction; router `pick` functions consult this for per-category routing.
  readonly capabilities: AuditorCapabilities
}

// Router is a composer that *is* an Auditor — core never knows it isn't concrete.
// Shape is here for type alignment; the implementation lives in @unlighthouse/core/auditors/route.
export interface NamedAuditor {
  name: string
  auditor: Auditor
}

export interface AuditorRouterOptions {
  auditors: NamedAuditor[]
  pick: (
    auditors: NamedAuditor[],
    ctx: { url: string },
  ) => Auditor | Promise<Auditor>
}
