import type { CwvFix, OverviewReport } from '@unlighthouse/contracts/packs'
import { CwvReportSchema } from '@unlighthouse/contracts/packs'

export function overviewDistributionRows(total: number, distribution: OverviewReport['distribution']) {
  const denominator = Math.max(1, total)
  const classified = distribution.passing + distribution.needsWork + distribution.poor
  return [
    { band: 'passing' as const, count: distribution.passing },
    { band: 'needsWork' as const, count: distribution.needsWork },
    { band: 'poor' as const, count: distribution.poor },
    { band: 'unscored' as const, count: Math.max(0, total - classified) },
  ].filter(row => row.count > 0).map(row => ({ ...row, pct: row.count / denominator * 100 }))
}

/** Match the persisted audited path, including hash-based SPA routes. */
export function overviewRoutePath(url: string): string {
  const parsed = new URL(url)
  return `${parsed.pathname}${parsed.hash.startsWith('#/') ? parsed.hash : ''}${parsed.search}`
}

export type OverviewFixes
  = | { _tag: 'Unavailable' }
    | { _tag: 'Invalid' }
    | { _tag: 'Ready', fixes: CwvFix[] }

/** Preserve the CWV pack's ranking and single-route estimates. */
export function parseOverviewFixes(report: unknown): OverviewFixes {
  if (report == null)
    return { _tag: 'Unavailable' }
  const parsed = CwvReportSchema.safeParse(report)
  if (!parsed.success)
    return { _tag: 'Invalid' }
  if (parsed.data.routesAnalysed === 0)
    return { _tag: 'Unavailable' }
  return { _tag: 'Ready', fixes: parsed.data.topFixes.slice(0, 3) }
}
