import type { UnlighthouseRouteReport } from '../types'
import { reportJsonSimple } from './jsonSimple'

/**
 * D-033: newline-delimited JSON of route results — one object per line, the
 * agent-friendly streaming shape. Reuses the `jsonSimple` per-route projection
 * (path, device, score, per-category scores).
 */
export function reportNdjson(reports: UnlighthouseRouteReport[]): string {
  return reportJsonSimple(reports)
    .map(row => JSON.stringify(row))
    .join('\n')
}
