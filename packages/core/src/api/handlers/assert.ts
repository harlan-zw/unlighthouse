// assert.evaluate handler — operates on Storage port routes.

import type {
  AssertEvaluate,
  CommandOutput,
} from '@unlighthouse/contracts/commands'
import type { Assertion, AssertionResult, Category, MetricName, ScanRoute } from '@unlighthouse/contracts/types/atoms'
import type { Handler } from './types'
import { parseUrl } from '@unlighthouse/contracts/types/atoms'
import { isRouteCategory, routeIdentityKey, routeMetricValue } from './route-metrics'
import { loadScanRoutes } from './scan-routes'

function evalAssertion(assertion: Assertion, routes: ScanRoute[], baseByKey: Map<string, ScanRoute>): AssertionResult {
  if (assertion.type === 'minScore') {
    const vals = routes.map(route => routeMetricValue(route, assertion.category)).filter((value): value is number => value != null)
    if (vals.length === 0)
      return { assertion, passed: true, actual: 0 }
    const min = Math.min(...vals)
    return { assertion, passed: min >= assertion.value, actual: min }
  }
  if (assertion.type === 'maxNumericValue') {
    const vals = routes.map(route => routeMetricValue(route, assertion.metric)).filter((value): value is number => value != null)
    if (vals.length === 0)
      return { assertion, passed: true, actual: 0 }
    const max = Math.max(...vals)
    return { assertion, passed: max <= assertion.value, actual: max }
  }
  // maxRegression
  const metric = assertion.metric as MetricName | Category
  const isScore = isRouteCategory(metric)
  let worstDelta = 0
  let worstUrl: string | undefined
  for (const current of routes) {
    const base = baseByKey.get(routeIdentityKey(current))
    if (!base)
      continue
    const cv = routeMetricValue(current, metric)
    const bv = routeMetricValue(base, metric)
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
    ...(worstUrl ? { url: parseUrl(worstUrl) } : {}),
  }
}

// INTERNAL: not used by the UI; CI bypasses this handler but kept for direct API users.
export const assertEvaluate: Handler<typeof AssertEvaluate> = {
  command: {} as typeof AssertEvaluate,
  async run(input, ctx) {
    const routes = await loadScanRoutes(ctx.storage, input.scanId)
    const baseRoutes = input.baselineScanId ? await loadScanRoutes(ctx.storage, input.baselineScanId) : []
    const baseByKey = new Map(baseRoutes.map(route => [routeIdentityKey(route), route]))
    const results = input.assertions.map(a => evalAssertion(a, routes, baseByKey))
    const hooks = ctx.core.hooks as { callHook: (event: string, payload: unknown) => Promise<void> } | undefined
    if (hooks) {
      for (const result of results) {
        await hooks.callHook(result.passed ? 'assert:passed' : 'assert:failed', { scanId: input.scanId, result })
      }
    }
    const passed = results.every(r => r.passed)
    return { scanId: input.scanId, passed, results } as CommandOutput<typeof AssertEvaluate>
  },
}
