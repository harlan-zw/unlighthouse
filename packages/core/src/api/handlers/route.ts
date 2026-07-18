// route.* handlers.

import type { CommandOutput } from '@unlighthouse/contracts/commands'
import type {
  ScanId,
  ScanRoute,
} from '@unlighthouse/contracts/types/atoms'
import type { EmitFn } from '../../scan/route-audit'
import type { Handler, HandlerCtx } from './types'
import { RouteAudits, RouteGet, RouteRescan } from '@unlighthouse/contracts/commands'
import { UnlighthouseError } from '@unlighthouse/contracts/errors'
import { loadRouteContract } from '../../report/route-contracts'
import { auditRoute } from '../../scan/route-audit'

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

function screenshotUrlFor(route: ScanRoute): string | null {
  if (!route.screenshotBlobKey)
    return null
  return `dashboard/screenshot/${route.scanId}/${encodeURIComponent(route.path)}`
}

async function findRoute(ctx: HandlerCtx, scanId: ScanId, url: string, device?: 'mobile' | 'desktop'): Promise<{ route: ScanRoute, availableDevices: Array<'mobile' | 'desktop'> }> {
  const scan = await ctx.storage.scans.get(scanId)
  if (!scan)
    throw new UnlighthouseError({ code: 'SCAN_NOT_FOUND', message: `scanId=${scanId}` })

  // Try the explicit device first, then the scan's primary, then the other —
  // dashboards often link to a route without knowing which device emulation
  // produced the row, especially after a CI import.
  const tryOrder: Array<'mobile' | 'desktop'> = device
    ? [device]
    : Array.from(new Set<'mobile' | 'desktop'>([scan.device, scan.device === 'mobile' ? 'desktop' : 'mobile']))

  // Walk every device once so we can emit `availableDevices` for the
  // UI's device toggle in the same round-trip — no second probe call.
  let route: ScanRoute | null = null
  const available: Array<'mobile' | 'desktop'> = []
  for (const d of (['mobile', 'desktop'] as const)) {
    const row = await ctx.storage.routes.get(scanId, url, d)
    if (row)
      available.push(d)
  }
  if (available.length === 0)
    throw new UnlighthouseError({ code: 'ROUTE_NOT_FOUND', message: `${url} in scan ${scanId}` })

  for (const d of tryOrder) {
    if (available.includes(d)) {
      route = await ctx.storage.routes.get(scanId, url, d)
      if (route)
        break
    }
  }
  // Caller asked for a device that isn't there — fall back to whatever
  // we found first. Same softer behaviour as the legacy dashboard
  // endpoint so existing deep links keep working.
  if (!route) {
    const fallbackDevice = available[0]
    if (!fallbackDevice)
      throw new UnlighthouseError({ code: 'ROUTE_NOT_FOUND', message: `${url} in scan ${scanId}` })
    route = await ctx.storage.routes.get(scanId, url, fallbackDevice)
    if (!route)
      throw new UnlighthouseError({ code: 'ROUTE_NOT_FOUND', message: `${url} in scan ${scanId}` })
  }
  return { route, availableDevices: available.sort() }
}

export const routeGet: Handler<typeof RouteGet> = {
  command: RouteGet,
  async run(input, ctx) {
    const { route, availableDevices } = await findRoute(ctx, input.scanId, input.url, input.device)
    const contract = await loadRouteContract(ctx.storage.blobs, route)

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
          if (audit.severity === 'pass' && audit.scoreDisplayMode !== 'notApplicable' && audit.scoreDisplayMode !== 'manual')
            passing++
          else if (audit.scoreDisplayMode !== 'notApplicable' && audit.scoreDisplayMode !== 'manual')
            failing++
        }
        categories.push({
          id,
          title: titleForCategory(id),
          score: cat.score,
          categoryScoreDisplayMode: cat.categoryScoreDisplayMode ?? 'gauge',
          auditCount: (cat.auditRefs ?? []).length,
          passingCount: passing,
          failingCount: failing,
          // Pass the raw auditRefs through so the UI can walk per-
          // category audits without a second `route.audits` call.
          // Weight comes from the LHR via the contract reconciler.
          auditRefs: cat.auditRefs ?? [],
        })
      }
    }

    return RouteGet.output.parse({
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
      availableDevices,
    })
  },
}

export const routeAudits: Handler<typeof RouteAudits> = {
  command: RouteAudits,
  async run(input, ctx) {
    const { route } = await findRoute(ctx, input.scanId, input.url, input.device)
    const contract = await loadRouteContract(ctx.storage.blobs, route)
    if (!contract)
      return RouteAudits.output.parse({ audits: [] })

    // When a category filter is set, restrict to that category's auditRefs so
    // the weight comes from the right place (a single audit can carry
    // different weights under different categories — rare in LH core but
    // possible with plugin categories).
    const targetCategory = input.category ? contract.categories?.[input.category] : null
    if (input.category && !targetCategory)
      return RouteAudits.output.parse({ audits: [] })

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

    return RouteAudits.output.parse({ audits })
  },
}

export const routeRescan: Handler<typeof RouteRescan> = {
  command: RouteRescan,
  async run(input, ctx) {
    // Resolve an existing row first. Besides selecting the requested/fallback
    // device, this prevents a "rescan" from appending an unrelated URL to a
    // completed scan.
    const { route } = await findRoute(ctx, input.scanId, input.url, input.device)
    // Reuse the same ingest path as a full scan so metrics, LHR, reconciled
    // contract, and screenshot are committed together instead of leaving
    // stale artifacts behind.
    const device = route.device
    const emit: EmitFn = ctx.core.hooks
      ? ctx.core.hooks.callHook.bind(ctx.core.hooks) as EmitFn
      : async () => {}
    const result = await auditRoute({
      auditor: ctx.auditor,
      storage: ctx.storage,
      config: ctx.config,
      emit,
    }, {
      scanId: input.scanId,
      url: input.url,
      device,
    })
    if (!result.ok) {
      throw new UnlighthouseError({
        code: result.error.code,
        message: result.error.message,
        ...(result.error.statusCode === undefined ? {} : { statusCode: result.error.statusCode }),
        ...(result.error.category === undefined ? {} : { category: result.error.category }),
        ...(result.error.retryable === undefined ? {} : { retryable: result.error.retryable }),
        ...(result.error.suggestion === undefined ? {} : { suggestion: result.error.suggestion }),
        ...(result.error.docsUrl === undefined ? {} : { docsUrl: result.error.docsUrl }),
        ...(result.error.details === undefined ? {} : { details: result.error.details }),
        cause: result.error.cause,
      })
    }
    return RouteRescan.output.parse({ scanId: input.scanId, url: input.url, metrics: result.metrics })
  },
}
