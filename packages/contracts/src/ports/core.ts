import type { UnlighthouseConfig } from '../config/index'
import type { HookEvent, UnlighthouseHooks } from '../hooks/index'
// (UnlighthouseHooks now sourced from contracts/hooks, not the legacy types/index shim.)
import type { Auditor } from './auditor'
import type { Crawler } from './crawler'
import type { SeedSource } from './seed-source'
import type { ScanId, ScanStatus, ScanSummary, Storage } from './storage'

export type { HookEvent, UnlighthouseConfig }
// Structural shape matching ConsolaInstance's used surface. Type-only so
// the ports subpath has zero runtime deps. Presets pass a real ConsolaInstance.
export interface Logger {
  debug: (...args: any[]) => any
  info: (...args: any[]) => any
  warn: (...args: any[]) => any
  error: (...args: any[]) => any
  log: (...args: any[]) => any
  success: (...args: any[]) => any
  trace: (...args: any[]) => any
  withTag: (tag: string) => Logger
  level?: number
}

export interface UnlighthouseCoreOptions {
  /** Already-resolved by the host (c12/env merge + imperative rules); validated by Zod inside. */
  config: UnlighthouseConfig
  /** Single; may be an AuditorRouter — core never knows the difference. */
  auditor: Auditor
  /** Single; may be fuseSeeds([sitemap, manual, ...]). */
  seeds: SeedSource
  /** Single; parallel-map / crawlee / cloudflare-crawl / user-supplied. */
  crawler: Crawler
  storage: Storage
  /** Additive subscribers; merged into the hook bus. */
  hooks?: Partial<UnlighthouseHooks>
  /** Tagged loggers per adapter derived via logger.withTag(name). */
  logger?: Logger
}

export interface CrawlStats {
  discovered: number
  scanned: number
  failed: number
  total: number
}

export interface CrawlSession {
  scanId: ScanId
  /** Typed HookMap union; host fan-outs from here. */
  events: AsyncIterable<HookEvent>
  subscribe: (handler: (event: HookEvent) => void) => () => void
  /** Return the last `min(n, ring.length)` buffered events (in-memory ring, cap 10k). */
  replay: (n: number) => HookEvent[]
  /** Derived from whether the crawler implements pause/resume. */
  capabilities: { pausable: boolean }
  /** Delegates to crawler.pause(); throws NOT_SUPPORTED when absent. */
  pause: () => Promise<void>
  resume: () => Promise<void>
  /** Wired to AbortController; propagates to Auditor.audit({ signal }). */
  cancel: (reason?: string) => Promise<void>
  state: () => ScanStatus
  stats: () => CrawlStats
  done: Promise<{ scanId: ScanId, summary: ScanSummary }>
}

/**
 * Per-run config overrides. Merged on top of the host-supplied `config` for the
 * lifetime of a single session — lets API callers (`scan.start`) thread the
 * command input (site/device/categories/auditor/ciBuild) into the scan without
 * mutating shared `Core` state. The overrides do not persist beyond the session.
 */
export interface UnlighthouseCoreRunOverrides {
  site?: string
  device?: 'mobile' | 'desktop'
  /** Lighthouse categories — mapped onto `lighthouseOptions.onlyCategories`. */
  categories?: Array<'performance' | 'accessibility' | 'seo' | 'best-practices'>
  /** Sample count — mapped onto `scanner.samples`. */
  sampleSize?: number
  /** Auditor provider name — selects from `config.auditor` when it's a router. */
  auditor?: string
  /** CI metadata persisted on the scans row. */
  ciBuild?: {
    branch?: string
    hash?: string
    message?: string
  }
}

export interface UnlighthouseCoreRunOptions {
  signal?: AbortSignal
  overrides?: UnlighthouseCoreRunOverrides
}

export interface UnlighthouseCore {
  /** Single-session: throws ACTIVE_SCAN_CONFLICT if a session is already in flight. */
  run: (opts?: UnlighthouseCoreRunOptions) => CrawlSession
  session: () => CrawlSession | null
  // hooks: Hookable<UnlighthouseHooks> — typed in core once contracts/hooks lands.
  hooks: unknown
}

export type CreateUnlighthouseCore = (opts: UnlighthouseCoreOptions) => UnlighthouseCore
