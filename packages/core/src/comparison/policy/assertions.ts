import type { Assertion, AssertionResult, ScanRoute } from '@unlighthouse/contracts/types/atoms'
import { parseUrl } from '@unlighthouse/contracts/types/atoms'
import { isRouteCategory, routeIdentityKey, routeMetricValue } from './route-values'

function evaluateAssertion(assertion: Assertion, routes: ScanRoute[], baseByKey: Map<string, ScanRoute>): AssertionResult {
  if (assertion.type === 'minScore') {
    const values = routes
      .map(route => routeMetricValue(route, assertion.category))
      .filter((value): value is number => value != null)
    const actual = values.length ? Math.min(...values) : 0
    return { assertion, passed: values.length === 0 || actual >= assertion.value, actual }
  }

  if (assertion.type === 'maxNumericValue') {
    const values = routes
      .map(route => routeMetricValue(route, assertion.metric))
      .filter((value): value is number => value != null)
    const actual = values.length ? Math.max(...values) : 0
    return { assertion, passed: values.length === 0 || actual <= assertion.value, actual }
  }

  const isScore = isRouteCategory(assertion.metric)
  let worstRegression = 0
  let worstUrl: string | undefined
  for (const current of routes) {
    const base = baseByKey.get(routeIdentityKey(current))
    if (!base)
      continue
    const currentValue = routeMetricValue(current, assertion.metric)
    const baseValue = routeMetricValue(base, assertion.metric)
    if (currentValue == null || baseValue == null)
      continue
    const regression = isScore ? baseValue - currentValue : currentValue - baseValue
    if (regression > worstRegression) {
      worstRegression = regression
      worstUrl = current.url
    }
  }
  return {
    assertion,
    passed: worstRegression <= assertion.value,
    actual: worstRegression,
    ...(worstUrl ? { url: parseUrl(worstUrl) } : {}),
  }
}

/** Canonical assertion policy shared by handlers and persistence adapters. */
export function evaluateAssertions(
  routes: ScanRoute[],
  assertions: Assertion[],
  baseRoutes: ScanRoute[] = [],
): AssertionResult[] {
  const baseByKey = new Map(baseRoutes.map(route => [routeIdentityKey(route), route]))
  return assertions.map(assertion => evaluateAssertion(assertion, routes, baseByKey))
}
