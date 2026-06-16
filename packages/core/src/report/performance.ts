// @deprecated — dashboard aggregation tables removed. Use cwv/insights packs.
import type { PerformanceSummary, ProcessorParams } from './types'

export async function processPerformance(_params: ProcessorParams): Promise<PerformanceSummary> {
  return {
    avgLcp: null,
    avgCls: null,
    avgTbt: null,
    avgFcp: null,
    avgSi: null,
    avgTtfb: null,
    imageIssueCount: 0,
    thirdPartyCount: 0,
    totalWastedBytes: 0,
    totalWastedMs: 0,
  }
}
