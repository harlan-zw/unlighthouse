// route.* handlers.

import type {
  CommandOutput,
  ExtractedMetrics,
  RouteAudits,
  RouteGet,
  RouteRescan,
  ScanId,
  ScanRoute,
} from '@unlighthouse/contracts'
import type { Handler, HandlerCtx } from './types'
import { Buffer } from 'node:buffer'
import { UnlighthouseError } from '@unlighthouse/contracts'

// Lighthouse's stable category ids → display titles. The reconciled contract
// blob keeps `categories` keyed by id and drops the LHR title string (it's
// the same for every route, no point persisting per-route). We reconstruct
// it here so the public API output matches what the dashboard renders.
// Unknown ids fall back to titlecasing the id — covers third-party LH
// plugins without us hardcoding them.
const CATEGORY_TITLES: Record<string, string> = {
  'performance': 'Performance',
  'accessibility': 'Accessibility',
  'seo': 'SEO',
  'best-practices': 'Best Practices',
  'pwa': 'PWA',
  'agentic-browsing': 'Agentic Browsing',
}

function titleForCategory(id: string): string {
  return CATEGORY_TITLES[id] ?? id.split('-').map(w => w[0]?.toUpperCase() + w.slice(1)).join(' ')
}

interface ContractBlob {
  categories: Record<string, { score: number | null, auditRefs: Array<{ id: string, weight: number }> }>
  audits: Record<string, {
    id: string
    score: number | null
    scoreDisplayMode: 'numeric' | 'binary' | 'informative' | 'manual' | 'notApplicable'
    displayValue: string | null
    title: string | null
    description: string | null
    severity: 'pass' | 'warn' | 'fail'
    metricSavings: { LCP?: number, FCP?: number, INP?: number, CLS?: number, TBT?: number } | null
    items: unknown[] | null
  }>
  provenance?: {
    lighthouseVersion: string
    userAgent: string | null
    capturedAt: string
    benchmarkIndex: number | null
    timingTotal: number | null
    warnings: string[]
    runtimeError: { code: string, message: string } | null
  }
  stackPacks?: Array<{ id: string, title: string, iconDataURL: string | null, descriptions: Record<string, string> }> | null
  entities?: Array<{ name: string, isFirstParty: boolean, origins: string[] }> | null
}

async function loadContract(ctx: HandlerCtx, route: ScanRoute): Promise<ContractBlob | null> {
  if (!route.reportBlobKey)
    return null
  const key = route.reportBlobKey.replace('.json', '.contract.json')
  const blob = await ctx.storage.blobs.get(key)
  if (!blob)
    return null
  try {
    return JSON.parse(Buffer.from(blob).toString('utf-8')) as ContractBlob
  }
  catch {
    return null
  }
}

function screenshotUrlFor(route: ScanRoute): string | null {
  if (!route.screenshotBlobKey)
    return null
  return `dashboard/screenshot/${route.scanId}/${encodeURIComponent(route.path)}`
}

async function findRoute(ctx: HandlerCtx, scanId: ScanId, url: string, device?: 'mobile' | 'desktop'): Promise<ScanRoute> {
  const scan = await ctx.storage.scans.get(scanId)
  if (!scan)
    throw new UnlighthouseError({ code: 'SCAN_NOT_FOUND', message: `scanId=${scanId}` })

  // Try the explicit device first, then the scan's primary, then the other —
  // dashboards often link to a route without knowing which device emulation
  // produced the row, especially after a CI import.
  const tryOrder: Array<'mobile' | 'desktop'> = device
    ? [device]
    : Array.from(new Set<'mobile' | 'desktop'>([scan.device, scan.device === 'mobile' ? 'desktop' : 'mobile']))
  for (const d of tryOrder) {
    const row = await ctx.storage.routes.get(scanId, url, d)
    if (row)
      return row
  }
  throw new UnlighthouseError({ code: 'ROUTE_NOT_FOUND', message: `${url} in scan ${scanId}` })
}

export const routeGet: Handler<typeof RouteGet> = {
  command: {} as typeof RouteGet,
  async run(input, ctx) {
    const route = await findRoute(ctx, input.scanId, input.url, input.device)
    const contract = await loadContract(ctx, route)

    const categories: CommandOutput<typeof RouteGet>['categories'] = []
    if (contract) {
      for (const [id, cat] of Object.entries(contract.categories ?? {})) {
        let passing = 0
        let failing = 0
        for (const ref of cat.auditRefs ?? []) {
          const audit = contract.audits?.[ref.id]
          if (!audit)
            continue
          // Severity buckets the contract reconciler already computed.
          // "warn" counts as a fail for the dashboard's pass/fail badge so
          // users see anything below 0.9 as actionable.
          if (audit.severity === 'pass')
            passing++
          else
            failing++
        }
        categories.push({
          id,
          title: titleForCategory(id),
          score: cat.score,
          auditCount: (cat.auditRefs ?? []).length,
          passingCount: passing,
          failingCount: failing,
        })
      }
    }

    return {
      route,
      categories,
      audits: contract?.audits ?? {},
      provenance: contract?.provenance ?? {
        lighthouseVersion: 'unknown',
        userAgent: null,
        capturedAt: route.capturedAt ?? new Date().toISOString(),
        benchmarkIndex: null,
        timingTotal: null,
        warnings: [],
        runtimeError: null,
      },
      stackPacks: contract?.stackPacks ?? null,
      entities: contract?.entities ?? null,
      screenshotUrl: screenshotUrlFor(route),
    } as CommandOutput<typeof RouteGet>
  },
}

export const routeAudits: Handler<typeof RouteAudits> = {
  command: {} as typeof RouteAudits,
  async run(input, ctx) {
    const route = await findRoute(ctx, input.scanId, input.url, input.device)
    const contract = await loadContract(ctx, route)
    if (!contract)
      return { audits: [] } as CommandOutput<typeof RouteAudits>

    // When a category filter is set, restrict to that category's auditRefs so
    // the weight comes from the right place (a single audit can carry
    // different weights under different categories — rare in LH core but
    // possible with plugin categories).
    const targetCategory = input.category ? contract.categories?.[input.category] : null
    if (input.category && !targetCategory)
      return { audits: [] } as CommandOutput<typeof RouteAudits>

    const refs: Array<{ id: string, weight: number }> = targetCategory
      ? targetCategory.auditRefs ?? []
      // No filter → flatten across all categories, deduping by audit id and
      // keeping the highest weight encountered (so a "perf" audit re-used in
      // another category doesn't lose its perf weight).
      : Array.from(
        Object.values(contract.categories ?? {})
          .flatMap(c => c.auditRefs ?? [])
          .reduce((acc, r) => {
            const prev = acc.get(r.id)
            if (!prev || r.weight > prev.weight)
              acc.set(r.id, r)
            return acc
          }, new Map<string, { id: string, weight: number }>())
          .values(),
      )

    const audits = refs
      .map((ref) => {
        const a = contract.audits?.[ref.id]
        if (!a)
          return null
        return {
          id: a.id,
          title: a.title,
          description: a.description,
          score: a.score,
          severity: a.severity,
          displayValue: a.displayValue,
          weight: ref.weight,
          metricSavings: a.metricSavings,
          items: a.items,
        }
      })
      .filter((a): a is NonNullable<typeof a> => a !== null)

    return { audits } as CommandOutput<typeof RouteAudits>
  },
}

export const routeRescan: Handler<typeof RouteRescan> = {
  command: {} as typeof RouteRescan,
  async run(input, ctx) {
    const scan = await ctx.storage.scans.get(input.scanId)
    if (!scan)
      throw new UnlighthouseError({ code: 'SCAN_NOT_FOUND', message: `scanId=${input.scanId}` })
    // D-029: explicit device, then scan's primary. Auditor emulation profile
    // is threaded through opts.device so the re-audit produces numbers
    // consistent with the original device's row.
    const device = input.device ?? scan.device
    const report = await ctx.auditor.audit(input.url, undefined, { device })
    const extracted = (report as unknown as { extracted?: ExtractedMetrics }).extracted
    const metrics: ExtractedMetrics = extracted ?? {
      url: input.url,
      path: new URL(input.url).pathname,
      routeName: null,
      scorePerformance: null,
      scoreAccessibility: null,
      scoreSeo: null,
      scoreBestPractices: null,
      lcp: null,
      cls: null,
      inp: null,
      fcp: null,
      ttfb: null,
      tbt: null,
      si: null,
      lighthouseVersion: (report as { lighthouseVersion?: string }).lighthouseVersion ?? 'unknown',
      capturedAt: new Date().toISOString(),
    } as ExtractedMetrics
    await ctx.storage.routes.upsert(input.scanId, device, metrics)
    return { scanId: input.scanId, url: input.url, metrics } as CommandOutput<typeof RouteRescan>
  },
}
