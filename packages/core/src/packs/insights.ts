// `insights` pack — Lighthouse 13 performance insight audits cross-route analysis.
//
// Aggregates the 17 insight audits across all routes, computing total savings
// per metric, worst routes, and a prioritized fix order.

import type { InsightsReport, Pack, PackReconcileCtx } from '@unlighthouse/contracts/packs'
import type { ReconciledReport } from '@unlighthouse/contracts/types/atoms'
import { InsightsReportSchema } from '@unlighthouse/contracts/packs'
import { isAuditEligible, isAuditPassed } from '@unlighthouse/contracts/types/atoms'
import { resolveDistinctPackRoutes } from './reconcile-context'

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

const SAVINGS_METRICS = ['LCP', 'FCP', 'INP', 'CLS', 'TBT'] as const

export const insightsPack: Pack<InsightsReport> = {
  name: 'insights',
  description: 'Lighthouse performance insights with estimated savings and priority order for each metric. Timing and CLS savings retain their own units.',
  version: '2.0.0',
  reportSchema: InsightsReportSchema,
  ui: { tab: 'Insights', icon: 'ai' },

  async reconciler(ctx: PackReconcileCtx): Promise<InsightsReport> {
    const { scanId, routes } = ctx
    const distinctRoutes = resolveDistinctPackRoutes(routes)

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

    for (const route of distinctRoutes) {
      let reconciled: ReconciledReport | null = null
      if (ctx.getReconciled) {
        try {
          reconciled = await ctx.getReconciled(route.url, route.device)
        }
        catch (err) {
          ctx.logger?.debug?.(`insights pack: failed to load reconciled report for ${route.url} [${route.device}]`, err)
        }
      }
      if (!reconciled?.audits)
        continue

      for (const id of INSIGHT_AUDIT_IDS) {
        const audit = reconciled.audits[id]
        if (!audit || !isAuditEligible(audit) || isAuditPassed(audit) || audit.scoreDisplayMode === 'error')
          continue

        const entry = insightMap.get(id)!
        if (audit.title && (!entry.title || audit.title.localeCompare(entry.title) < 0))
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
        const worstRoutesByMetric = Object.fromEntries(SAVINGS_METRICS.map(metric => [metric, v.worstRoutes.flatMap(route => typeof route.savings[metric] === 'number' ? [{ url: route.url, savings: route.savings[metric]! }] : [])
          .sort((a, b) => b.savings - a.savings || a.url.localeCompare(b.url))
          .slice(0, 5)]))
        return {
          id,
          title: v.title,
          routeCount: v.routeCount,
          totalSavings: v.totalSavings,
          maxSingleRouteSavings: v.maxSingleRouteSavings,
          worstRoutesByMetric,
        }
      })

    insights.sort((a, b) => a.id.localeCompare(b.id))
    const priorityOrderByMetric = Object.fromEntries(SAVINGS_METRICS.map(metric => [metric, insights.filter(insight => (insight.totalSavings[metric] ?? 0) > 0)
      .sort((a, b) => (b.totalSavings[metric] ?? 0) - (a.totalSavings[metric] ?? 0) || a.id.localeCompare(b.id))
      .map(insight => insight.id)]))

    return {
      scanId,
      routesAnalysed: routes.length,
      insights,
      priorityOrderByMetric,
    }
  },
}
