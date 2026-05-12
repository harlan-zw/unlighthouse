export {
  compareScans,
  evaluateAndStoreAssertions,
  evaluateAssertions,
  getComparisonSummary,
} from '@unlighthouse/core/comparison'
export type {
  Assertion,
  AssertionResult,
  AssertionType,
  ComparisonDiff,
  MetricDiff,
} from '@unlighthouse/core/comparison'
// v0 re-export shim — canonical code lives in @unlighthouse/core/{report,comparison}.
export {
  decompressLhr,
  extractRouteData,
  getDashboardSummary,
  processScanData,
} from '@unlighthouse/core/report'
export type {
  AccessibilitySummary,
  BestPracticesSummary,
  ExtractedRoute,
  LighthouseAudit,
  LighthouseResult,
  PerformanceSummary,
  ProcessorParams,
  SeoSummary,
} from '@unlighthouse/core/report'
