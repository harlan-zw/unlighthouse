// Server-side hook bus wiring. Extracted from `host.ts` so behavior wiring
// (auto-start on dashboard visit, etc.) can be unit-tested without spinning
// up the full host (sqlite, fs, drizzle).

import type { Logger } from '@unlighthouse/contracts'
import type { LegacyWorkerHooks } from '@unlighthouse/core/crawlers'
import type { Hookable } from 'hookable'
import { createHooks } from 'hookable'

export interface ServerHooksDeps {
  /** When true, the first `visited-client` event triggers `start()`. */
  autoStartOnVisit?: boolean
  /** Called once on the first `visited-client`. */
  start: () => Promise<unknown>
  logger?: Logger
}

/**
 * Build the server-side hook bus passed to `mountServer`. Subscribes to
 * `visited-client` when `autoStartOnVisit` is enabled — idempotent: a flood of
 * visit events from concurrent SPA loads only triggers `start()` once.
 */
export function createServerHooks(deps: ServerHooksDeps): Hookable<LegacyWorkerHooks> {
  const hooks = createHooks<LegacyWorkerHooks>()

  if (deps.autoStartOnVisit) {
    let started = false
    hooks.hook('visited-client', async () => {
      if (started)
        return
      started = true
      try {
        await deps.start()
      }
      catch (err) {
        deps.logger?.error?.('[unlighthouse] autoStartOnVisit failed', err)
      }
    })
  }

  return hooks
}
