// Transport-agnostic handler types — projected to HTTP / MCP / CLI.
// See v1-tasks.md §v2 and v1.md §"API extraction".

import type {
  Auditor,
  Command,
  CommandInput,
  CommandName,
  CommandOutput,
  CommandRegistry,
  Storage,
  UnlighthouseConfig,
  UnlighthouseCore,
} from '@unlighthouse/contracts'

export interface AuditorInfo {
  name: string
  ok?: boolean
}

export interface HandlerCtx {
  /** Core instance — projection layer calls `core.run()` / `core.session()`. */
  core: UnlighthouseCore
  /** Live auditor — used for single-URL rescans bypassing the crawler. */
  auditor: Auditor
  /** Storage adapter (drizzle / memory / d1+r2 / …). */
  storage: Storage
  /** Resolved + validated config. */
  config: UnlighthouseConfig
  /** Package version, surfaced by `manifest` + `health`. Host reads it from package.json once. */
  version: string
  /** Registry of mounted auditors (for `manifest` + `auditors.*`). */
  auditors?: {
    list: () => AuditorInfo[]
    test?: (name: string) => Promise<AuditorInfo>
  }
  /**
   * Per-request tenant identity. Set by multi-tenant hosts (cloud, SaaS deployments).
   * Hosts MUST construct a tenant-scoped `storage` for this ctx — handlers do not
   * filter by tenant themselves. Single-tenant hosts (CLI, default dashboard) leave
   * this undefined.
   */
  tenant?: {
    id: string
    [key: string]: unknown
  }
  /** Host-provided persistent sites registry. Optional; sites.* handlers throw NOT_SUPPORTED without it. */
  sites?: import('./sites').SitesStore
}

/**
 * A handler implements one command end-to-end. Non-streaming handlers return a
 * single output; streaming handlers (events.tail, events.subscribe) return an
 * AsyncIterable.
 */
export interface Handler<C extends Command = Command> {
  command: C
  run: (
    input: CommandInput<C>,
    ctx: HandlerCtx,
  ) => Promise<CommandOutput<C>> | AsyncIterable<CommandOutput<C>>
}

/** Map of command-name → handler. Output of `createHandlers()`. */
export type HandlerMap = {
  [K in CommandName]: Handler<CommandRegistry[K]>
}
