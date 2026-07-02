// Auditor resolver — maps UnlighthouseConfig to a single Auditor port.
// v1.md Phase 3: pure switch + factory call, no new abstraction.

import type { Logger, UnlighthouseOptions } from '@unlighthouse/contracts'
import type { AuditorConfig, AuditorProvider, AuditorRouterConfig, AuditorRouterStrategy, UnlighthouseConfig } from '@unlighthouse/contracts/config'
import type { Auditor, NamedAuditor } from '@unlighthouse/contracts/ports'
import type { CategoryAssignments, PickFn } from '@unlighthouse/core/auditors/route'
import type { z } from 'zod'
import { createCdpConnectAuditor } from '@unlighthouse/core/auditors/cdp-connect'
import { createCruxAuditor } from '@unlighthouse/core/auditors/crux'
import { createDataForSeoAuditor } from '@unlighthouse/core/auditors/dataforseo'
import { createLocalAuditor } from '@unlighthouse/core/auditors/local'
import { createMockAuditor } from '@unlighthouse/core/auditors/mock'
import { createPsiAuditor } from '@unlighthouse/core/auditors/psi'
import {
  createUnstorageRateLimiter,
  fallbackAuditor,
  rateLimitedPick,
  roundRobinPick,
  routeAuditors,
  splitCategoriesAuditor,
  weightedPick,
} from '@unlighthouse/core/auditors/route'

type AuditorProviderConfig = z.infer<typeof AuditorProvider>
type AuditorRouterStrategyConfig = z.infer<typeof AuditorRouterStrategy>
type AuditorConfigValue = z.infer<typeof AuditorConfig>
type AuditorRouterConfigValue = z.infer<typeof AuditorRouterConfig>

export interface ResolveAuditorOptions {
  config: UnlighthouseConfig
  /** Optional logger for tagged sub-auditors. */
  logger?: Logger
}

function withTag(logger: Logger | undefined, tag: string): Logger | undefined {
  return logger?.withTag(tag) ?? logger
}

function resolveLighthouseFlags(value: unknown): UnlighthouseOptions['lighthouseFlags'] | undefined {
  return value && typeof value === 'object'
    ? value as UnlighthouseOptions['lighthouseFlags']
    : undefined
}

function resolveIndexedDbSeed(value: unknown): UnlighthouseOptions['indexedDb'] | undefined {
  return value && typeof value === 'object'
    ? value as UnlighthouseOptions['indexedDb']
    : undefined
}

function buildSingle(p: AuditorProviderConfig, opts: ResolveAuditorOptions): Auditor {
  const logger = withTag(opts.logger, `auditors/${p.name}`)
  switch (p.name) {
    case 'local': {
      // `lighthouseOptions` are Lighthouse `Flags` (e.g. onlyCategories, throttling).
      // Pass as `lighthouseFlags`; `createLocalProvider` builds the config via
      // `resolveLighthouseConfig` (extends `lighthouse:default`, supplies artifacts).
      const flags = resolveLighthouseFlags(p.lighthouseOptions ?? opts.config.lighthouseOptions)
      // Web-storage seeding (#292): pre-authenticate token/session-gated pages by
      // injecting localStorage/sessionStorage before each audited page loads.
      const localStorage = opts.config.localStorage
      const sessionStorage = opts.config.sessionStorage
      const indexedDb = resolveIndexedDbSeed(opts.config.indexedDb)
      const hasStorage = !!(localStorage && Object.keys(localStorage).length)
        || !!(sessionStorage && Object.keys(sessionStorage).length)
        || !!(indexedDb && Object.keys(indexedDb).length)
      return createLocalAuditor({
        defaults: (flags || hasStorage)
          ? {
              ...(flags ? { lighthouseFlags: flags } : {}),
              ...(localStorage ? { localStorage } : {}),
              ...(sessionStorage ? { sessionStorage } : {}),
              ...(indexedDb ? { indexedDb } : {}),
            }
          : undefined,
        logger,
      })
    }
    case 'psi':
      return createPsiAuditor({ apiKey: p.apiKey, logger })
    case 'crux':
      // Contract allows apiKey optional; createCruxAuditor requires it — coerce.
      return createCruxAuditor({ apiKey: (p.apiKey ?? '') as string, logger })
    case 'dataforseo':
      return createDataForSeoAuditor({ username: p.login, password: p.password, logger })
    case 'mock':
      return createMockAuditor({ logger })
    case 'cdp-connect':
      return createCdpConnectAuditor({ browserWSEndpoint: p.browserWSEndpoint, headers: p.headers, logger })
  }
}

// Strategy → PickFn. `weighted` and `rate-limited` read their per-provider
// knobs from `router.weights` / `router.rates`; unconfigured providers
// degrade to a permissive default (`weighted` falls through to the first
// auditor when all weights are 0; `rate-limited` always allows when no
// bucket is declared). `fallback` is NOT a PickFn — it needs to observe
// audit errors. Composed via `fallbackAuditor` in `resolveAuditor` instead.
function pickerFor(
  strategy: Exclude<AuditorRouterStrategyConfig, 'fallback'>,
  router: AuditorRouterConfigValue | undefined,
): PickFn {
  switch (strategy) {
    case 'round-robin':
      return roundRobinPick()
    case 'weighted':
      // Defaults to 1 per provider when no weights are declared so the
      // strategy degrades to round-robin-ish random — better than
      // collapsing to a single provider.
      return weightedPick(router?.weights ?? {})
    case 'rate-limited': {
      // One RateLimiter per resolver (shared across all audit calls in the
      // process). Providers without a `rates` entry stay permissive — the
      // limiter allows unknown bucket names.
      const limiter = createUnstorageRateLimiter({ rules: router?.rates ?? {} })
      return rateLimitedPick(limiter)
    }
  }
}

/**
 * Resolve an `Auditor` from `UnlighthouseConfig`. Single-provider configs map
 * 1:1 to a factory; router configs compose providers through `routeAuditors`
 * (or `fallbackAuditor` for the chain-on-error strategy).
 */
export function resolveAuditor(opts: ResolveAuditorOptions): Auditor {
  const cfg: AuditorConfigValue = opts.config.auditor ?? { name: 'local' }

  // Router / split forms — discriminated by presence of `strategy`.
  if ('strategy' in cfg) {
    // D-041: category-split distribution — assignments map, not a provider list.
    if (cfg.strategy === 'split') {
      const assignments: CategoryAssignments = {}
      for (const [category, provider] of Object.entries(cfg.assignments)) {
        assignments[category as keyof CategoryAssignments] = {
          name: provider.name,
          auditor: buildSingle(provider, opts),
        }
      }
      return splitCategoriesAuditor({ assignments })
    }
    const auditors: NamedAuditor[] = cfg.providers.map((p: AuditorProviderConfig) => ({
      name: p.name,
      auditor: buildSingle(p, opts),
    }))
    if (cfg.strategy === 'fallback')
      return fallbackAuditor(auditors)
    return routeAuditors({ auditors, pick: pickerFor(cfg.strategy, cfg.router) })
  }

  return buildSingle(cfg, opts)
}
