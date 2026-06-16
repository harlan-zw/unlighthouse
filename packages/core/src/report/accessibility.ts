// @deprecated — dashboard aggregation tables removed. Use a11y-quick-wins pack.
import type { AccessibilitySummary, ProcessorParams } from './types'

export async function processAccessibility(_params: ProcessorParams): Promise<AccessibilitySummary> {
  return {
    criticalCount: 0,
    seriousCount: 0,
    moderateCount: 0,
    minorCount: 0,
    totalIssues: 0,
    totalInstances: 0,
    wcagLevelA: 0,
    wcagLevelAA: 0,
    missingAltCount: 0,
    contrastIssueCount: 0,
  }
}
