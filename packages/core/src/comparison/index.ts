export type { Assertion, AssertionResult, AssertionType, ComparisonDiff, MetricDiff } from '../report/types'
export { evaluateAndStoreAssertions, evaluateAssertions } from './assertions'
export { compareScans, formatComparisonMarkdown, getComparisonSummary } from './comparison'
