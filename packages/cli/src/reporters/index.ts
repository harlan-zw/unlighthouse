import { join } from 'node:path'
import { writeJson } from 'fs-extra'
import type { ResolvedUserConfig, UnlighthouseRouteReport } from '@unlighthouse/core'
import { reportJsonSimple } from './jsonSimple'
import { reportJsonExpanded } from './jsonExpanded'
import type { ReportJsonExpanded, ReportJsonSimple } from './types'

export function generateReportPayload(reporter: 'jsonExpanded', reports: UnlighthouseRouteReport[]): ReportJsonExpanded
export function generateReportPayload(reporter: 'jsonSimple', reports: UnlighthouseRouteReport[]): ReportJsonSimple
export function generateReportPayload(reporter: string, reports: UnlighthouseRouteReport[]): any {
  if (reporter.startsWith('json'))
    return reporter === 'jsonSimple' ? reportJsonSimple(reports) : reportJsonExpanded(reports)

  throw new Error(`Unsupported reporter: ${reporter}.`)
}

export async function outputReport(reporter: string, config: Partial<ResolvedUserConfig>, payload: any) {
  if (reporter.startsWith('json')) {
    const path = join(config.root, config.outputPath, 'ci-result.json')
    await writeJson(path, JSON.stringify(payload))
    return path
  }
  throw new Error(`Unsupported reporter: ${reporter}.`)
}
