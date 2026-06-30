// `insights` pack — Lighthouse 13 performance insight audits cross-route analysis.
//
// Aggregates the 17 insight audits across all routes, computing total savings
// per metric, worst routes, and a prioritized fix order.

import type { InsightsReport, Pack, PackReconcileCtx } from '@unlighthouse/contracts/packs'
import type { ReconciledReport } from '@unlighthouse/contracts/types/atoms'
import { InsightsReportSchema } from '@unlighthouse/contracts/packs'

const INSIGHT_AUDIT_IDS = [
  'cache-insight',
  'cls-culprits-insight',
  'document-latency-insight',
  'dom-size-insight',
  'duplicated-javascript-insight',
  'font-display-insight',
  'forced-reflow-insight',
  'image-delivery-insight',
  'inp-breakdown-insight',
  'lcp-breakdown-insight',
  'lcp-discovery-insight',
  'legacy-javascript-insight',
  'modern-http-insight',
  'network-dependency-tree-insight',
  'render-blocking-insight',
  'third-parties-insight',
  'viewport-insight',
] as const

function mergeSavings(
  target: Record<string, number>,
  source: Record<string, number | undefined> | null | undefined,
): void {
  if (!source)
    return
  for (const [k, v] of Object.entries(source)) {
    if (typeof v === 'number')
      target[k] = (target[k] ?? 0) + v
  }
}

function maxSavings(
  current: Record<string, number>,
  source: Record<string, number | undefined> | null | undefined,
): void {
  if (!source)
    return
  for (const [k, v] of Object.entries(source)) {
    if (typeof v === 'number')
      current[k] = Math.max(current[k] ?? 0, v)
  }
}

function totalImpact(savings: Record<string, number | undefined>): number {
  return Object.values(savings).reduce<number>((a, b) => a + (b ?? 0), 0)
}

export const insightsPack: Pack<InsightsReport> = {
  name: 'insights',
  description: 'Lighthouse 13 performance insights: cross-route savings analysis with prioritized fix order.',
  version: '1.0.0',
  reportSchema: InsightsReportSchema,

  async reconciler(ctx: PackReconcileCtx): Promise<InsightsReport> {
    const { scanId, routes } = ctx
    const device = routes[0]?.device ?? 'mobile'

    const insightMap = new Map<string, {
      title: string | null
      routeCount: number
      totalSavings: Record<string, number>
      maxSingleRouteSavings: Record<string, number>
      worstRoutes: Array<{ url: string, savings: Record<string, number | undefined> }>
    }>()

    for (const id of INSIGHT_AUDIT_IDS) {
      insightMap.set(id, {
        title: null,
        routeCount: 0,
        totalSavings: {},
        maxSingleRouteSavings: {},
        worstRoutes: [],
      })
    }

    for (const route of routes) {
      let reconciled: ReconciledReport | null = null
      if (ctx.getReconciled) {
        try {
          reconciled = await ctx.getReconciled(route.url, device)
        }
        catch (err) {
          ctx.logger?.debug?.(`insights pack: failed to load reconciled report for ${route.url} [${device}]`, err)
        }
      }
      if (!reconciled?.audits)
        continue

      for (const id of INSIGHT_AUDIT_IDS) {
        const audit = reconciled.audits[id]
        if (!audit || audit.severity === 'pass')
          continue

        const entry = insightMap.get(id)!
        if (!entry.title && audit.title)
          entry.title = audit.title
        entry.routeCount++
        mergeSavings(entry.totalSavings, audit.metricSavings)
        maxSavings(entry.maxSingleRouteSavings, audit.metricSavings)
        entry.worstRoutes.push({
          url: route.url,
          savings: audit.metricSavings ?? {},
        })
      }
    }

    const insights = Array.from(insightMap.entries())
      .filter(([, v]) => v.routeCount > 0)
      .map(([id, v]) => {
        v.worstRoutes.sort((a, b) => totalImpact(b.savings) - totalImpact(a.savings))
        return {
          id,
          title: v.title,
          routeCount: v.routeCount,
          totalSavings: v.totalSavings,
          maxSingleRouteSavings: v.maxSingleRouteSavings,
          worstRoutes: v.worstRoutes.slice(0, 5),
        }
      })

    insights.sort((a, b) => totalImpact(b.totalSavings) - totalImpact(a.totalSavings))

    return {
      scanId: scanId as string,
      routesAnalysed: routes.length,
      insights,
      priorityOrder: insights.map(i => i.id),
    }
  },
}
