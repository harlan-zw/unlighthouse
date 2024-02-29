import { join } from 'node:path'
import fse from 'fs-extra'
import type { ResolvedUserConfig, UnlighthouseColumn, UnlighthouseRouteReport, UnlighthouseTabs } from '@unlighthouse/core'
import { reportJsonSimple } from './jsonSimple'
import { reportJsonExpanded } from './jsonExpanded'
import type { ReportJsonExpanded, ReportJsonSimple, ReporterConfig } from './types'
import { reportCSVSimple } from './csvSimple'
import { reportCSVExpanded } from './csvExpanded'
import { reportLighthouseServer } from './lighthouseServer'

export function generateReportPayload(reporter: 'lighthouseServer', reports: UnlighthouseRouteReport[], config?: ReporterConfig): Promise<void>
export function generateReportPayload(reporter: 'jsonExpanded', reports: UnlighthouseRouteReport[]): ReportJsonExpanded
export function generateReportPayload(reporter: 'jsonSimple' | 'json', reports: UnlighthouseRouteReport[]): ReportJsonSimple
export function generateReportPayload(reporter: 'csvSimple' | 'csv', reports: UnlighthouseRouteReport[]): string
export function generateReportPayload(reporter: 'csvExpanded', reports: UnlighthouseRouteReport[], config?: ReporterConfig): string
export function generateReportPayload(reporter: string, reports: UnlighthouseRouteReport[], config?: ReporterConfig): any {
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
      return reportCSVExpanded(sortedReporters, config)
  }
  if (reporter === 'lighthouseServer') {
    return reportLighthouseServer(sortedReporters, config)
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
