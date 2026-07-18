import type { Assertion } from '@unlighthouse/contracts/types/atoms'

export type { ComparisonDiff, MetricDiff } from '../report/types'
export type AssertionType = Assertion['type']
export { evaluateAndStoreAssertions } from './assertions'
export { compareScans, formatComparisonMarkdown, getComparisonSummary } from './comparison'
export { evaluateAssertions } from './policy'
export type { CategoryDelta, CompareRoutesInput, CompareThresholds, DetailFilter, RouteComparison } from './policy'
export {
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  categoryDeltasFromSummaries,
  compareRoutes,
  DEFAULT_THRESHOLDS,
  resolveThresholds,
  selectDetailRows,
} from './policy'
export type { Assertion, AssertionResult } from '@unlighthouse/contracts/types/atoms'
