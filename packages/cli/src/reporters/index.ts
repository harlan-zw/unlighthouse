import { join } from 'node:path'
import fse from 'fs-extra'
import type { ResolvedUserConfig, UnlighthouseColumn, UnlighthouseRouteReport, UnlighthouseTabs } from '@unlighthouse/core'
import { reportJsonSimple } from './jsonSimple'
import { reportJsonExpanded } from './jsonExpanded'
import type { ReportJsonExpanded, ReportJsonSimple } from './types'
import { reportCSVSimple } from './csvSimple'
import { reportCSVExpanded } from './csvExpanded'

export function generateReportPayload(reporter: 'jsonExpanded', reports: UnlighthouseRouteReport[]): ReportJsonExpanded
export function generateReportPayload(reporter: 'jsonSimple' | 'json', reports: UnlighthouseRouteReport[]): ReportJsonSimple
export function generateReportPayload(reporter: 'csvSimple' | 'csv', reports: UnlighthouseRouteReport[]): string
export function generateReportPayload(reporter: 'csvExpanded', reports: UnlighthouseRouteReport[], columns?: Record<UnlighthouseTabs, UnlighthouseColumn[]>): string
export function generateReportPayload(reporter: string, reports: UnlighthouseRouteReport[], columns?: Record<UnlighthouseTabs, UnlighthouseColumn[]>): any {
  const sortedReporters = reports.sort((a, b) => a.route.path.localeCompare(b.route.path))
  if (reporter.startsWith('json')) {
    if (reporter === 'jsonSimple' || reporter === 'json')
      return reportJsonSimple(sortedReporters)
    if (reporter === 'jsonExpanded')
      return reportJsonExpanded(sortedReporters)
  }
  if (reporter.startsWith('csv')) {
    if (reporter === 'csvSimple' || reporter === 'csv')
      return reportCSVSimple(sortedReporters)
    if (reporter === 'csvExpanded')
      return reportCSVExpanded(sortedReporters, columns)
  }
  throw new Error(`Unsupported reporter: ${reporter}.`)
}

export async function outputReport(reporter: string, config: Partial<ResolvedUserConfig>, payload: any) {
  if (reporter.startsWith('json')) {
    const path = join(config.root, config.outputPath, 'ci-result.json')
    await fse.writeJson(path, payload, { spaces: 2 })
    return path
  }
  if (reporter.startsWith('csv')) {
    const path = join(config.root, config.outputPath, 'ci-result.csv')
    await fse.writeFile(path, payload)
    return path
  }
  throw new Error(`Unsupported reporter: ${reporter}.`)
}
