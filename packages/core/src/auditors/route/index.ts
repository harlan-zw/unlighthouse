import type {
  AuditOpts,
  Auditor,
  AuditorCapabilities,
  Category,
  LighthouseReport,
  NamedAuditor,
  Page,
} from '@unlighthouse/contracts/ports'

export { createTokenBucket, type RateRule, type TokenBucket } from './token-bucket'

export type PickFn = (
  auditors: NamedAuditor[],
  ctx: { url: string },
) => Auditor | Promise<Auditor>

export interface RouteAuditorsOptions {
  auditors: NamedAuditor[]
  pick: PickFn
}

function deriveCapabilities(auditors: NamedAuditor[]): AuditorCapabilities {
  if (!auditors.length) {
    return {
      reliablePerfScores: false,
      reliableFieldData: false,
      supportsThrottling: false,
      categories: [],
    }
  }
  const caps = auditors.map(a => a.auditor.capabilities)
  const categorySet = new Set<Category>()
  for (const c of caps) {
    for (const cat of c.categories)
      categorySet.add(cat)
  }
  return {
    // AND across booleans — router is "most restrictive" since any pick may serve any URL.
    reliablePerfScores: caps.every(c => c.reliablePerfScores),
    reliableFieldData: caps.every(c => c.reliableFieldData),
    supportsThrottling: caps.every(c => c.supportsThrottling),
    categories: [...categorySet],
  }
}

/**
 * Composes multiple named auditors into a single Auditor whose `audit(url)` is
 * dispatched through `pick(auditors, { url })`. The composed Auditor *is* an
 * Auditor — callers cannot distinguish it from a concrete one.
 *
 * `merge` and `race` strategies are deferred (D-019b).
 */
export function routeAuditors(opts: RouteAuditorsOptions): Auditor {
  const capabilities = deriveCapabilities(opts.auditors)
  return {
    capabilities,
    async audit(url: string, page?: Page, auditOpts?: AuditOpts): Promise<LighthouseReport> {
      const picked = await opts.pick(opts.auditors, { url })
      return picked.audit(url, page, auditOpts)
    },
  }
}

// ----- Pick helpers -----

/** Round-robin across auditors via a counter closure. */
export function roundRobinPick(): PickFn {
  let i = 0
  return (auditors) => {
    if (!auditors.length)
      throw new Error('routeAuditors: no auditors configured')
    const picked = auditors[i % auditors.length]
    i++
    return picked.auditor
  }
}

/**
 * Weighted random selection by name. Providers absent from the weights map
 * fall back to weight 1 (equal share) rather than 0 — keeps the strategy
 * useful as a "round-robin-ish" default when no config is supplied.
 * Passing an explicit `0` for a name still excludes it.
 */
export function weightedPick(weights: Record<string, number>): PickFn {
  return (auditors) => {
    if (!auditors.length)
      throw new Error('routeAuditors: no auditors configured')
    const weightOf = (name: string) =>
      Object.prototype.hasOwnProperty.call(weights, name) ? weights[name]! : 1
    const total = auditors.reduce((sum, a) => sum + weightOf(a.name), 0)
    if (total <= 0)
      return auditors[0].auditor
    let target = Math.random() * total
    for (const a of auditors) {
      target -= weightOf(a.name)
      if (target <= 0)
        return a.auditor
    }
    return auditors[auditors.length - 1].auditor
  }
}

/**
 * Returns the first auditor whose `check(name)` resolves true. Use with a token
 * bucket / quota tracker. Throws if none pass — wrap with a fallback policy.
 */
export function rateLimitedPick(check: (name: string) => Promise<boolean>): PickFn {
  return async (auditors) => {
    for (const a of auditors) {
      if (await check(a.name))
        return a.auditor
    }
    throw new Error('rateLimitedPick: no auditor passed rate-limit check')
  }
}

/**
 * Composes auditors into a single Auditor that tries each in order; on error
 * advances to the next. Throws only if every auditor fails (aggregated).
 * Use this instead of `routeAuditors({ pick: fallbackPick() })` — fallback
 * semantics need to observe the audit error, which `PickFn` cannot.
 */
export function fallbackAuditor(auditors: NamedAuditor[]): Auditor {
  if (!auditors.length)
    throw new Error('fallbackAuditor: at least one auditor required')
  const capabilities = deriveCapabilities(auditors)
  return {
    capabilities,
    async audit(url: string, page?: Page, auditOpts?: AuditOpts): Promise<LighthouseReport> {
      const errors: unknown[] = []
      for (const a of auditors) {
        try {
          return await a.auditor.audit(url, page, auditOpts)
        }
        catch (err) {
          errors.push(err)
        }
      }
      throw new AggregateError(errors, `fallbackAuditor: all ${auditors.length} auditors failed for ${url}`)
    },
  }
}

/** Picks the auditor whose name matches `predicate(url)`. */
export function predicatePick(predicate: (url: string) => string): PickFn {
  return (auditors, { url }) => {
    const name = predicate(url)
    const match = auditors.find(a => a.name === name)
    if (!match)
      throw new Error(`predicatePick: no auditor named "${name}" for ${url}`)
    return match.auditor
  }
}
