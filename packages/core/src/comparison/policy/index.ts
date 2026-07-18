export { evaluateAssertions } from './assertions'
export type { CategoryDelta, CompareRoutesInput, CompareThresholds, DetailFilter, RouteComparison } from './compare'
export {
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  categoryDeltasFromSummaries,
  compareRoutes,
  DEFAULT_THRESHOLDS,
  resolveThresholds,
  selectDetailRows,
} from './compare'
export type { RouteMetric } from './route-values'
export {
  isRouteCategory,
  ROUTE_CATEGORY_SCORE_COLUMN,
  routeIdentityKey,
  routeMetricColumn,
  routeMetricValue,
  routeNumericValue,
} from './route-values'
