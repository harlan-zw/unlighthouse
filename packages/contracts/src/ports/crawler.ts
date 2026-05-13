import type { SeedSource } from './seed-source'

// @TODO: tighten when contracts/types Zod schemas land (ScanId, Url, NormalisedRoute).

export type CrawlerState = 'idle' | 'running' | 'paused'

export interface CrawlCtx {
  /** Stable scan identifier owned by core.run(); threaded through every event/storage write. */
  scanId: string
  /** AbortSignal mirrors the session controller; propagates to auditor.audit. */
  signal?: AbortSignal
  /** Optional adapter-private debug emitter; stable scan:* events live on the hook bus, not here. */
  debug?: (event: string, payload?: unknown) => void
}

export type CrawlEvent
  = | { type: 'url-discovered', url: string, from?: string }
    | { type: 'url-started', url: string }
    | { type: 'url-completed', url: string }
    | { type: 'url-failed', url: string, error: Error }
    | { type: 'idle' }

export interface CrawlerRunOptions {
  seeds: SeedSource
  /** Core wires this to the resolved Auditor. */
  audit: (url: string, ctx: CrawlCtx) => Promise<void>
  /** Inline Policy shape; defer the Policy port until a second adapter ships. */
  allows?: (url: string) => boolean
  crawlDelayMs?: number
  signal?: AbortSignal
}

export interface Crawler {
  run: (opts: CrawlerRunOptions) => AsyncIterable<CrawlEvent>

  // Pause/resume is an optional capability, not a contract: adapters like
  // cloudflare-crawl genuinely cannot pause. CrawlSession surfaces this via
  // `capabilities.pausable` so the UI can gate affordances.
  pause?: () => Promise<void>
  resume?: () => Promise<void>
  state?: () => CrawlerState
}
