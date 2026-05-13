import type { UnlighthouseConfig } from '../config/index'
import type { HookEvent, UnlighthouseHooks } from '../hooks/index'
// (UnlighthouseHooks now sourced from contracts/hooks, not the legacy types/index shim.)
import type { Auditor } from './auditor'
import type { Crawler } from './crawler'
import type { SeedSource } from './seed-source'
import type { ScanId, ScanStatus, ScanSummary, Storage } from './storage'

export type { HookEvent, UnlighthouseConfig }
// ConsolaInstance comes from `consola`; kept as unknown so the ports subpath
// has zero runtime deps. Presets pass a real ConsolaInstance.
export type Logger = unknown

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

export interface UnlighthouseCoreRunOptions {
  signal?: AbortSignal
}

export interface UnlighthouseCore {
  /** Single-session: throws ACTIVE_SCAN_CONFLICT if a session is already in flight. */
  run: (opts?: UnlighthouseCoreRunOptions) => CrawlSession
  session: () => CrawlSession | null
  // hooks: Hookable<UnlighthouseHooks> — typed in core once contracts/hooks lands.
  hooks: unknown
}

export type CreateUnlighthouseCore = (opts: UnlighthouseCoreOptions) => UnlighthouseCore
