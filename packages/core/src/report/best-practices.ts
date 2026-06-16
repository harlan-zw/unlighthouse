// @deprecated — dashboard aggregation tables removed. Use pack system.
import type { BestPracticesSummary, ProcessorParams } from './types'

export async function processBestPractices(_params: ProcessorParams): Promise<BestPracticesSummary> {
  return {
    consoleErrorCount: 0,
    deprecatedApiCount: 0,
    vulnerableLibCount: 0,
    securityIssueCount: 0,
    outdatedLibCount: 0,
  }
}
