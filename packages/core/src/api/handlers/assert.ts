// assert.evaluate handler — operates on Storage port routes.

import type {
  AssertEvaluate,
  CommandOutput,
} from '@unlighthouse/contracts'
import type { ScanId, ScanRoute } from '@unlighthouse/contracts/ports'
import type { Assertion, AssertionResult, Category, MetricName } from '@unlighthouse/contracts/types/atoms'
import type { Handler, HandlerCtx } from './types'
import { UnlighthouseError } from '@unlighthouse/contracts'

const CATEGORY_COL: Record<Category, keyof ScanRoute> = {
  'performance': 'scorePerformance',
  'accessibility': 'scoreAccessibility',
  'seo': 'scoreSeo',
  'best-practices': 'scoreBestPractices',
}

function isCategory(value: string): value is Category {
  return value in CATEGORY_COL
}

function num(route: ScanRoute, key: string): number | null {
  return (route as unknown as Record<string, number | null>)[key] ?? null
}

async function loadRoutes(ctx: HandlerCtx, scanId: ScanId): Promise<ScanRoute[]> {
  const scan = await ctx.storage.scans.get(scanId)
  if (!scan)
    throw new UnlighthouseError({ code: 'SCAN_NOT_FOUND', message: `scanId=${scanId}` })
  const res = await ctx.storage.routes.listForScan(scanId, { page: 1, pageSize: 10_000 })
  return res.items
}

function evalAssertion(assertion: Assertion, routes: ScanRoute[], baseByUrl: Map<string, ScanRoute>): AssertionResult {
  if (assertion.type === 'minScore') {
    const col = CATEGORY_COL[assertion.category]
    const vals = routes.map(r => num(r, col)).filter((v): v is number => v != null)
    if (vals.length === 0)
      return { assertion, passed: true, actual: 0 }
    const min = Math.min(...vals)
    return { assertion, passed: min >= assertion.value, actual: min }
  }
  if (assertion.type === 'maxNumericValue') {
    const vals = routes.map(r => num(r, assertion.metric)).filter((v): v is number => v != null)
    if (vals.length === 0)
      return { assertion, passed: true, actual: 0 }
    const max = Math.max(...vals)
    return { assertion, passed: max <= assertion.value, actual: max }
  }
  // maxRegression
  const metric = assertion.metric as MetricName | Category
  const isScore = isCategory(metric)
  const col = isScore ? CATEGORY_COL[metric] : metric
  let worstDelta = 0
  let worstUrl: string | undefined
  for (const current of routes) {
    const base = baseByUrl.get(current.url)
    if (!base)
      continue
    const cv = num(current, col)
    const bv = num(base, col)
    if (cv == null || bv == null)
      continue
    const regression = isScore ? bv - cv : cv - bv
    if (regression > worstDelta) {
      worstDelta = regression
      worstUrl = current.url
    }
  }
  return {
    assertion,
    passed: worstDelta <= assertion.value,
    actual: worstDelta,
    url: worstUrl as never,
  }
}

export const assertEvaluate: Handler<typeof AssertEvaluate> = {
  command: {} as typeof AssertEvaluate,
  async run(input, ctx) {
    const routes = await loadRoutes(ctx, input.scanId)
    const baseRoutes = input.baselineScanId ? await loadRoutes(ctx, input.baselineScanId) : []
    const baseByUrl = new Map(baseRoutes.map(r => [r.url, r]))
    const results = input.assertions.map(a => evalAssertion(a, routes, baseByUrl))
    const passed = results.every(r => r.passed)
    return { scanId: input.scanId, passed, results } as CommandOutput<typeof AssertEvaluate>
  },
}
