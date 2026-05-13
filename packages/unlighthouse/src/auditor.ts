// Auditor resolver — maps UnlighthouseConfig to a single Auditor port.
// v1.md Phase 3: pure switch + factory call, no new abstraction.

import type { AuditorConfig, AuditorProvider, AuditorRouterStrategy, UnlighthouseConfig } from '@unlighthouse/contracts'
import type { Auditor, NamedAuditor } from '@unlighthouse/contracts/ports'
import type { PickFn } from '@unlighthouse/core/auditors'
import type { z } from 'zod'
import {
  createCdpConnectAuditor,
  createCruxAuditor,
  createDataForSeoAuditor,
  createLocalAuditor,
  createMockAuditor,
  createPsiAuditor,
  fallbackAuditor,
  rateLimitedPick,
  roundRobinPick,
  routeAuditors,
  weightedPick,
} from '@unlighthouse/core/auditors'

type AuditorProviderConfig = z.infer<typeof AuditorProvider>
type AuditorRouterStrategyConfig = z.infer<typeof AuditorRouterStrategy>
type AuditorConfigValue = z.infer<typeof AuditorConfig>

export interface ResolveAuditorOptions {
  config: UnlighthouseConfig
  /** Optional logger for tagged sub-auditors. */
  logger?: unknown
}

// Tagged-logger shim — works with consola-like loggers without coupling to a concrete shape.
function withTag(l: unknown, t: string): unknown {
  return l && typeof (l as { withTag?: unknown }).withTag === 'function'
    ? (l as { withTag: (t: string) => unknown }).withTag(t)
    : l
}

function buildSingle(p: AuditorProviderConfig, opts: ResolveAuditorOptions): Auditor {
  const logger = withTag(opts.logger, `auditors/${p.name}`) as never
  switch (p.name) {
    case 'local': {
      // `lighthouseOptions` are Lighthouse `Flags` (e.g. onlyCategories, throttling).
      // Pass as `lighthouseFlags`; `createLocalProvider` builds the config via
      // `resolveLighthouseConfig` (extends `lighthouse:default`, supplies artifacts).
      const flags = p.lighthouseOptions ?? opts.config.lighthouseOptions
      return createLocalAuditor({
        defaults: flags ? { lighthouseFlags: flags as never } : undefined,
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

// Strategy → PickFn. Weighted/rate-limited need per-provider config we don't
// surface yet; degrade to permissive defaults so runtime never throws.
// `fallback` is NOT a PickFn — it needs to observe audit errors. Composed via
// `fallbackAuditor` in `resolveAuditor` instead.
// TODO(v7): extend AuditorConfig.router with `weights` / `rates` maps.
function pickerFor(strategy: Exclude<AuditorRouterStrategyConfig, 'fallback'>): PickFn {
  switch (strategy) {
    case 'round-robin':
      return roundRobinPick()
    case 'weighted':
      // TODO(v7): wire per-provider weights from config.
      return weightedPick({})
    case 'rate-limited':
      // TODO(v7): wire token-bucket from config; permissive check = always allow.
      return rateLimitedPick(async () => true)
  }
}

/**
 * Resolve an `Auditor` from `UnlighthouseConfig`. Single-provider configs map
 * 1:1 to a factory; router configs compose providers through `routeAuditors`
 * (or `fallbackAuditor` for the chain-on-error strategy).
 */
export function resolveAuditor(opts: ResolveAuditorOptions): Auditor {
  const cfg: AuditorConfigValue = opts.config.auditor ?? { name: 'local' }

  // Router form — discriminated by presence of `strategy`.
  if ('strategy' in cfg) {
    const auditors: NamedAuditor[] = cfg.providers.map((p: AuditorProviderConfig) => ({
      name: p.name,
      auditor: buildSingle(p, opts),
    }))
    if (cfg.strategy === 'fallback')
      return fallbackAuditor(auditors)
    return routeAuditors({ auditors, pick: pickerFor(cfg.strategy) })
  }

  return buildSingle(cfg, opts)
}
